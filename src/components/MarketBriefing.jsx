import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import { Card, Button, Badge } from '../design-kit'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

const pct = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`)
const sign = (n) => (n === null || n === undefined ? '' : n >= 0 ? '' : ' pa-perf__v--down')

/** Inline sparkline. Normalised to its own range, so shape is what reads. */
function Spark({ points, up }) {
  if (!points || points.length < 2) return null
  const w = 64
  const h = 18
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - ((v - lo) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="pa-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke={up ? 'var(--accent)' : 'var(--red)'} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
const money = (n) => (n === null || n === undefined ? '—' : n.toFixed(2))

/** "2 min ago" for a live tick; the exact clock time once it's older. */
function ago(ts) {
  if (!ts) return null
  const mins = Math.max(0, Math.round((Date.now() - ts * 1000) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function MarketBriefing() {
  const [briefing, setBriefing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Read the last saved briefing. Deliberately does NOT touch EODHD — opening
  // the dashboard must never spend quota.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('market_briefings')
        .select('*')
        .order('briefing_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (error) setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
      else setBriefing(data)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function generate(force = false) {
    setGenerating(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/market-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send our local date; the server runs UTC and would misfile evening briefings
        body: JSON.stringify({ date: todayKey(), force }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || `Request failed (${res.status})`)
      } else {
        setBriefing(body)
        // Say so explicitly: identical numbers otherwise look like a broken button
        if (body.unchanged) setNotice(body.message ?? 'No new market close yet.')
      }
    } catch (err) {
      setError(String(err?.message ?? err))
    }
    setGenerating(false)
  }

  if (error === 'missing-table') {
    return (
      <Card eyebrow="Finances" title="Market Briefing">
        <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
          The <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>market_briefings</code> table
          doesn’t exist yet. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>SCHEMA-market.sql</code> in the
          Supabase SQL editor, then reload.
        </p>
      </Card>
    )
  }

  return (
    <Card eyebrow="Finances" title="Market Briefing">
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>}
      {notice && (
        <p className="pa-brief__notice">
          {notice}{' '}
          <button type="button" className="pa-brief__link" onClick={() => generate(true)}>
            Fetch anyway
          </button>
        </p>
      )}

      {loading ? (
        <p className="pa-empty">Loading…</p>
      ) : !briefing ? (
        <p className="pa-empty">No briefing yet. Generate one below.</p>
      ) : (
        <>
          <div className="pa-brief__head">
            <span className="pa-brief__stamp">
              {(() => {
                const tick = briefing.quotes?.find((q) => q.live?.timestamp)?.live?.timestamp
                return tick
                  ? `Live · quoted ${ago(tick)}`
                  : `${when(briefing.generated_at)} · closes ${briefing.quotes?.[0]?.as_of ?? '—'}`
              })()}
            </span>
            {briefing.insight ? null : <Badge tone="neutral">quotes only</Badge>}
          </div>

          {briefing.insight && <p className="pa-brief__insight">{briefing.insight}</p>}

          <ul className="pa-quotes">
            {(briefing.quotes ?? []).map((q) => {
              const up = (q.change_p ?? 0) >= 0
              const p = q.perf ?? {}
              return (
                <li key={q.symbol} className="pa-quote">
                  <div className="pa-quote__top">
                    <span className="pa-quote__sym">{q.symbol}</span>
                    <Spark points={q.spark} up={up} />
                    <span className="pa-quote__price">
                      {money(q.live?.price ?? q.close)}
                      {q.live && <span className="pa-quote__dot" title="live price" />}
                    </span>
                    <span className={`pa-quote__chg${up ? '' : ' pa-quote__chg--down'}`}>
                      {up ? '▲' : '▼'} {pct(q.change_p)}
                    </span>
                  </div>

                  {(p.w1 !== undefined || q.rsi14 !== null) && (
                    <div className="pa-perf">
                      {q.live && q.close !== null && q.close !== undefined && (
                        <span className="pa-perf__cell">
                          <span className="pa-perf__k">prev</span>
                          <span className="pa-perf__v pa-perf__v--plain">{money(q.close)}</span>
                        </span>
                      )}
                      {[['1W', p.w1], ['1M', p.m1], ['YTD', p.ytd]].map(([label, v]) => (
                        <span className="pa-perf__cell" key={label}>
                          <span className="pa-perf__k">{label}</span>
                          <span className={`pa-perf__v${sign(v)}`}>{pct(v)}</span>
                        </span>
                      ))}
                      {q.rsi14 !== null && q.rsi14 !== undefined && (
                        <span className="pa-perf__cell">
                          <span className="pa-perf__k">RSI</span>
                          <span className="pa-perf__v">{q.rsi14.toFixed(0)}</span>
                        </span>
                      )}
                      {q.sma50 && q.close && (
                        <span className="pa-perf__cell">
                          <span className="pa-perf__k">50d</span>
                          <span className={`pa-perf__v${q.close >= q.sma50 ? '' : ' pa-perf__v--down'}`}>
                            {q.close >= q.sma50 ? 'above' : 'below'}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {(briefing.skipped ?? []).length > 0 && (
            <p className="pa-brief__note" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
              No data for {briefing.skipped.join(', ')}
            </p>
          )}

          {(briefing.headlines ?? []).length > 0 && (
            <>
              <span className="pa-field__label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                Headlines
              </span>
              <ul className="pa-heads">
                {briefing.headlines.map((h, i) => (
                  <li key={i} className="pa-head">
                    {h.link
                      ? <a href={h.link} target="_blank" rel="noopener noreferrer">{h.title}</a>
                      : h.title}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="pa-actions" style={{ marginTop: 'var(--space-5)' }}>
        <Button variant="primary" onClick={() => generate(false)} disabled={generating}>
          {generating ? 'Fetching…' : briefing ? 'Refresh briefing' : 'Generate briefing'}
        </Button>
        <span className="pa-brief__note">calls the market API</span>
      </div>
    </Card>
  )
}
