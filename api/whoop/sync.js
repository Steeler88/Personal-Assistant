import { getAccessToken, whoopGet } from '../_whoop.js'

/**
 * Pulls recent sleep, recovery and cycles from Whoop v2 and stores them.
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

/**
 * Whoop's recommendation for the night: a baseline, plus what sleep debt and
 * recent strain added, minus what a nap already covered. The nap component
 * arrives already negative, so this is a straight sum.
 *
 * Note this is NOT sleep_performance_percentage's denominator — Whoop's own
 * percentage comes out of a model, and dividing sleep by need does not
 * reproduce it. Kept separate deliberately; don't "reconcile" them.
 */
function sleepNeededMin(score) {
  const need = score?.sleep_needed
  if (!need) return null
  const total = ['baseline_milli', 'need_from_sleep_debt_milli',
                 'need_from_recent_strain_milli', 'need_from_recent_nap_milli']
    .reduce((sum, k) => sum + Number(need[k] ?? 0), 0)
  return Number.isFinite(total) ? Math.round(total / 60000) : null
}

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

    // Cycles need a scope (read:cycles) that tokens issued before strain existed
    // were never granted. Sleep and recovery must not stop working because of
    // it, so a failure here degrades to "no strain" rather than failing the sync.
    let cycleError = null
    const [sleepRes, recoveryRes, cycleRes] = await Promise.all([
      whoopGet(`/v2/activity/sleep${query}`, token),
      whoopGet(`/v2/recovery${query}`, token),
      whoopGet(`/v2/cycle${query}`, token).catch((err) => {
        cycleError = /401/.test(String(err?.message ?? err)) ? 'reconnect-for-strain' : String(err?.message ?? err)
        return { records: [] }
      }),
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
          sleep_needed_min: sleepNeededMin(s.score),
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

    // Day strain, on Whoop's own 0-21 scale. A cycle is their physiological
    // day, which does not start at midnight, so it is dated by when it began.
    const cycleRows = (cycleRes.records ?? [])
      .map((c) => ({
        id: String(c.id),
        recorded_on: dateOf(c.start),
        strain: c.score?.strain ?? null,
        avg_hr_bpm: c.score?.average_heart_rate ?? null,
        max_hr_bpm: c.score?.max_heart_rate ?? null,
        kilojoule: c.score?.kilojoule ?? null,
        start_at: c.start ?? null,
        end_at: c.end ?? null,
        raw: c,
        synced_at: new Date().toISOString(),
      }))
      .filter((r) => r.recorded_on)

    const [sleepCount, recoveryCount, cycleCount] = await Promise.all([
      upsert('whoop_sleep', sleepRows, 'id'),
      upsert('whoop_recovery', recoveryRows, 'cycle_id'),
      upsert('whoop_cycles', cycleRows, 'id'),
    ])

    return res.status(200).json({
      sleep: sleepCount,
      recovery: recoveryCount,
      cycles: cycleCount,
      cycle_error: cycleError,
      since: dateOf(start),
    })
  } catch (err) {
    const message = String(err?.message ?? err)
    if (/reconnect Whoop/i.test(message)) return res.status(409).json({ error: 'reconnect' })
    return res.status(502).json({ error: message })
  }
}
