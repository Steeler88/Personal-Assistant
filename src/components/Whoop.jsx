import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, Button, Badge } from '../design-kit'
import { prettyDate } from '../lib/dates'
import { todayKey } from '../lib/today'
import { recoveryTone, freshness, sleepTone, sleepPct } from '../lib/whoop'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

const num = (n) => (n === null || n === undefined ? '—' : Math.round(Number(n)))
const hhmm = (mins) => {
  if (mins === null || mins === undefined) return '—'
  const m = Math.round(Number(mins))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Ring-ish bar: recovery reads better as a proportion than a bare number. */
function Meter({ value, tone = 'ok' }) {
  const v = Math.max(0, Math.min(100, Number(value ?? 0)))
  return (
    <span className="pa-meter">
      <span className={`pa-meter__fill pa-meter__fill--${tone}`} style={{ width: `${v}%` }} />
    </span>
  )
}

export default function Whoop() {
  const [status, setStatus] = useState(null)
  const [sleep, setSleep] = useState([])
  const [recovery, setRecovery] = useState([])
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  // Strain needs read:cycles, which connections made before strain existed
  // never granted. Reconnecting is the only way to add it.
  const [strainBlocked, setStrainBlocked] = useState(false)

  async function loadStored() {
    const [s, r, c] = await Promise.all([
      supabase.from('whoop_sleep').select('*').order('night_of', { ascending: false }).limit(14),
      supabase.from('whoop_recovery').select('*').order('recorded_on', { ascending: false }).limit(14),
      supabase.from('whoop_cycles').select('*').order('recorded_on', { ascending: false }).limit(14),
    ])
    const err = s.error || r.error
    if (err) {
      setError(MISSING_TABLE.has(err.code) ? 'missing-table' : err.message)
      return
    }
    setSleep(s.data ?? [])
    setRecovery(r.data ?? [])
    // Strain came later than the rest of Whoop. Its table being absent is a
    // migration that hasn't been run, not a reason to fail the whole screen.
    setCycles(c.error ? [] : c.data ?? [])
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const res = await fetch('/api/whoop/status')
        const body = await res.json()
        if (!cancelled) setStatus(body)
      } catch {
        if (!cancelled) setStatus({ connected: false })
      }
      if (!cancelled) await loadStored()
      if (!cancelled) setLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [])

  async function sync() {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/whoop/sync', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        if (body.error === 'not-connected') setNotice('Whoop isn’t connected yet.')
        else if (body.error === 'reconnect') setNotice('The Whoop connection expired. Connect again.')
        else setError(body.error || `Sync failed (${res.status})`)
      } else {
        const parts = [`${body.sleep} nights`, `${body.recovery} recovery scores`]
        if (body.cycles) parts.push(`${body.cycles} days of strain`)
        setNotice(`Synced ${parts.join(', ')}.`)
        setStrainBlocked(body.cycle_error === 'reconnect-for-strain')
        await loadStored()
      }
    } catch (err) {
      setError(String(err?.message ?? err))
    }
    setSyncing(false)
  }

  if (error === 'missing-table') {
    return (
      <Card>
        <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
          The Whoop tables don’t exist yet. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>SCHEMA-whoop.sql</code> in the
          Supabase SQL editor, then reload.
        </p>
      </Card>
    )
  }

  const latestSleep = sleep[0] ?? null
  const latestRecovery = recovery[0] ?? null
  const latestStrain = cycles[0] ?? null
  const connected = status?.connected
  const fresh = freshness(latestSleep?.night_of, todayKey())
  const strainOf = (day) => cycles.find((c) => c.recorded_on === day)?.strain

  return (
    <Card>
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>}
      {notice && <p className="pa-brief__notice">{notice}</p>}
      {strainBlocked && (
        <p className="pa-brief__notice">
          Strain needs a Whoop permission your connection predates. Reconnecting adds it
          — sleep and recovery keep working either way.{' '}
          <a className="pa-brief__link" href="/api/whoop/authorize">Reconnect Whoop</a>
        </p>
      )}

      {loading ? (
        <p className="pa-empty">Loading…</p>
      ) : !connected ? (
        <>
          <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: '0 0 var(--space-5)' }}>
            Connect your Whoop account to pull sleep and recovery. You’ll approve the
            connection on Whoop’s own site — this app never sees your Whoop password.
          </p>
          <a className="dk-btn dk-btn--primary" href="/api/whoop/authorize">Connect Whoop</a>
        </>
      ) : (
        <>
          <div className="pa-whoop__top">
            {latestRecovery && (
              <div className="pa-whoop__stat">
                <span className="pa-whoop__k">Recovery</span>
                <span className="pa-whoop__v">{num(latestRecovery.recovery_score)}%</span>
                <Meter value={latestRecovery.recovery_score} tone={recoveryTone(latestRecovery.recovery_score)} />
                <span className="pa-whoop__sub">
                  HRV {num(latestRecovery.hrv_ms)}ms · RHR {num(latestRecovery.rhr_bpm)}bpm
                </span>
              </div>
            )}
            {latestSleep && (
              <div className="pa-whoop__stat">
                <span className="pa-whoop__k">Last night</span>
                <span className="pa-whoop__v">{hhmm(latestSleep.total_sleep_min)}</span>
                <Meter
                  value={latestSleep.sleep_needed_min
                    ? (latestSleep.total_sleep_min / latestSleep.sleep_needed_min) * 100
                    : latestSleep.performance_pct}
                  tone={sleepTone(latestSleep.total_sleep_min, latestSleep.sleep_needed_min)}
                />
                <span className="pa-whoop__sub">
                  {latestSleep.sleep_needed_min
                    ? `${sleepPct(latestSleep.total_sleep_min, latestSleep.sleep_needed_min)}% of the ${hhmm(latestSleep.sleep_needed_min)} Whoop wanted`
                    : `${num(latestSleep.performance_pct)}% performance`} · {prettyDate(latestSleep.night_of)}
                </span>
              </div>
            )}
            {latestStrain?.strain !== null && latestStrain?.strain !== undefined && (
              <div className="pa-whoop__stat">
                <span className="pa-whoop__k">Strain</span>
                <span className="pa-whoop__v">{Number(latestStrain.strain).toFixed(1)}</span>
                <Meter value={(Number(latestStrain.strain) / 21) * 100} tone="idle" />
                <span className="pa-whoop__sub">
                  of 21 · what drove last night&rsquo;s sleep need
                </span>
              </div>
            )}
          </div>

          {sleep.length > 1 && (
            <>
              <span className="pa-field__label" style={{ display: 'block', margin: 'var(--space-5) 0 var(--space-2)' }}>
                Recent nights
              </span>
              <ul className="pa-whoop__list">
                {sleep.slice(0, 7).map((s) => {
                  const rec = recovery.find((r) => r.recorded_on === s.night_of)
                  const strain = strainOf(s.night_of)
                  return (
                    <li key={s.id} className="pa-whoop__row">
                      <span className="pa-whoop__date">{prettyDate(s.night_of)}</span>
                      <span className={`pa-whoop__cell pa-whoop__cell--${sleepTone(s.total_sleep_min, s.sleep_needed_min)}`}>
                        {hhmm(s.total_sleep_min)}
                      </span>
                      <span className={`pa-whoop__cell pa-whoop__cell--${sleepTone(s.total_sleep_min, s.sleep_needed_min)}`}>
                        {s.sleep_needed_min ? `${sleepPct(s.total_sleep_min, s.sleep_needed_min)}% need` : '—'}
                      </span>
                      <span className="pa-whoop__cell">
                        {strain === undefined || strain === null ? '—' : `${Number(strain).toFixed(1)} str`}
                      </span>
                      <span className={`pa-whoop__cell pa-whoop__cell--${rec ? recoveryTone(rec.recovery_score) : 'idle'}`}>
                        {rec ? `${num(rec.recovery_score)}% rec` : '—'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {sleep.length === 0 && <p className="pa-empty">Connected. Sync to pull your data.</p>}

          <div className="pa-actions" style={{ marginTop: 'var(--space-5)' }}>
            <Button variant={fresh.tone === 'ok' ? 'ghost' : 'primary'} onClick={sync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Whoop'}
            </Button>
            <span className={`pa-chip${fresh.tone === 'ok' ? '' : ` pa-chip--${fresh.tone}`}`}>{fresh.label}</span>
            <Badge tone="accent" dot>connected</Badge>
          </div>
        </>
      )}
    </Card>
  )
}
