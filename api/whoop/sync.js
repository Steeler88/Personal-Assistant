import { getAccessToken, whoopGet } from '../_whoop.js'

/**
 * Pulls recent sleep and recovery from Whoop v2 and stores them.
 * POST only: syncing is deliberate, not a side effect of loading a page.
 */

const DAYS = 30

function supabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
}

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return 0
  const { url, headers } = supabase()
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Saving ${table} failed (${res.status}): ${(await res.text()).slice(0, 160)}`)
  return rows.length
}

/** Local calendar date of a timestamp, so a night lands on the day you'd call it. */
const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : null)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use POST.' })
  }

  try {
    const token = await getAccessToken()
    if (!token) return res.status(409).json({ error: 'not-connected' })

    const start = new Date(Date.now() - DAYS * 86400000).toISOString()
    const query = `?start=${encodeURIComponent(start)}&limit=25`

    const [sleepRes, recoveryRes] = await Promise.all([
      whoopGet(`/v2/activity/sleep${query}`, token),
      whoopGet(`/v2/recovery${query}`, token),
    ])

    const sleepRows = (sleepRes.records ?? [])
      // A nap is not the night's sleep; counting it would distort the trend.
      .filter((s) => !s.nap)
      .map((s) => {
        const stage = s.score?.stage_summary ?? {}
        const inBed = Number(stage.total_in_bed_time_milli ?? 0)
        const awake = Number(stage.total_awake_time_milli ?? 0)
        const asleep = Math.max(inBed - awake, 0)
        return {
          id: String(s.id),
          night_of: dateOf(s.end),
          start_at: s.start ?? null,
          end_at: s.end ?? null,
          performance_pct: s.score?.sleep_performance_percentage ?? null,
          total_sleep_min: asleep ? Math.round(asleep / 60000) : null,
          efficiency_pct: s.score?.sleep_efficiency_percentage ?? null,
          raw: s,
          synced_at: new Date().toISOString(),
        }
      })
      .filter((r) => r.night_of)

    const recoveryRows = (recoveryRes.records ?? [])
      .map((r) => ({
        cycle_id: String(r.cycle_id),
        recorded_on: dateOf(r.created_at),
        recovery_score: r.score?.recovery_score ?? null,
        hrv_ms: r.score?.hrv_rmssd_milli ?? null,
        rhr_bpm: r.score?.resting_heart_rate ?? null,
        raw: r,
        synced_at: new Date().toISOString(),
      }))
      .filter((r) => r.recorded_on)

    const [sleepCount, recoveryCount] = await Promise.all([
      upsert('whoop_sleep', sleepRows, 'id'),
      upsert('whoop_recovery', recoveryRows, 'cycle_id'),
    ])

    return res.status(200).json({
      sleep: sleepCount,
      recovery: recoveryCount,
      since: dateOf(start),
    })
  } catch (err) {
    const message = String(err?.message ?? err)
    if (/reconnect Whoop/i.test(message)) return res.status(409).json({ error: 'reconnect' })
    return res.status(502).json({ error: message })
  }
}
