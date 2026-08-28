import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { postJson } from '../lib/api'
import Spark from './Spark'
import { todayKey } from '../lib/today'
import { Card, Button, Badge } from '../design-kit'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

/** A missing insight shouldn't read as a broken feature. */
function insightMessage(code) {
  if (code === 'no-key') return 'Quotes updated. No Anthropic key configured, so there is no written read.'
  if (code === 'bad-key') return 'Quotes updated, but the Anthropic key was rejected.'
  if (code === 'rate-limited') return 'Quotes updated. The Anthropic API is rate-limited right now, so the written read was skipped.'
  if (code === 'refused') return 'Quotes updated. The written read was declined this time.'
  return `Quotes updated, but the written read failed (${code}).`
}

const pct = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`)
const sign = (n) => (n === null || n === undefined ? '' : n >= 0 ? '' : ' pa-perf__v--down')

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
  const [watch, setWatch] = useState(null)      // null until loaded; [] is a real empty list
  const [showWatch, setShowWatch] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [checking, setChecking] = useState(false)
  const [watchError, setWatchError] = useState(null)
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

  useEffect(() => {
    let cancelled = false
    supabase.from('watchlist').select('symbol').order('added_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        // A missing table is a migration not yet run, not a failure worth shouting about
        setWatch(error ? null : (data ?? []).map((r) => r.symbol))
      })
    return () => { cancelled = true }
  }, [])

  async function addSymbol(e) {
    e?.preventDefault()
    const symbol = newSymbol.trim().toUpperCase()
    if (!symbol) return

    if (watch?.includes(symbol)) {
      setWatchError(`${symbol} is already on the list.`)
      return
    }

    setChecking(true)
    setWatchError(null)
    // Prove EODHD can price it before it goes in, or the briefing will just
    // skip it every day with no explanation.
    const checked = await postJson('/api/check-symbol', { symbol })
    if (!checked.ok) {
      setWatchError(checked.error)
      setChecking(false)
      return
    }

    const { error } = await supabase.from('watchlist').insert({ symbol })
    if (error) setWatchError(error.message)
    else {
      setWatch((list) => [...(list ?? []), symbol])
      setNewSymbol('')
      setNotice(`${symbol} added. Refresh the briefing to price it.`)
    }
    setChecking(false)
  }

  async function removeSymbol(symbol) {
    const prev = watch
    setWatch((list) => (list ?? []).filter((s) => s !== symbol))
    const { error } = await supabase.from('watchlist').delete().eq('symbol', symbol)
    if (error) {
      setWatchError(error.message)
      setWatch(prev)
    }
  }

  async function generate(force = false) {
    setGenerating(true)
    setError(null)
    setNotice(null)
    {
      // Send our local date; the server runs UTC and would misfile evening briefings
      const { ok, body, error: failed } = await postJson('/api/market-briefing', {
        date: todayKey(),
        force,
      })
      if (!ok) {
        setError(failed)
      } else {
        setBriefing(body)
        // Say so explicitly: identical numbers otherwise look like a broken button
        if (body.unchanged) setNotice(body.message ?? 'No new market close yet.')
        else if (body.insight_error) setNotice(insightMessage(body.insight_error))
      }
    }
    setGenerating(false)
  }

  if (error === 'missing-table') {
    return (
      <Card>
        <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
          The <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>market_briefings</code> table
          doesn’t exist yet. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>SCHEMA-market.sql</code> in the
          Supabase SQL editor, then reload.
        </p>
      </Card>
    )
  }

  // A ticker added since the last briefing has no quote yet. Adding does not
  // refresh on its own — that spends a call per ticker against a 20-a-day
  // allowance — so the row has to say it is waiting rather than just be absent.
  const priced = new Set((briefing?.quotes ?? []).map((q) => q.symbol))
  const pending = (watch ?? []).filter((sym) => !priced.has(sym))

  return (
    <Card>
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
            {briefing.insight && <Badge tone="accent" dot>read</Badge>}
          </div>

          {briefing.insight && <p className="pa-brief__insight">{briefing.insight}</p>}

          <ul className="pa-quotes">
            {(briefing.quotes ?? [])
              .filter((q) => !watch || watch.length === 0 || watch.includes(q.symbol))
              .map((q) => {
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

            {pending.map((sym) => (
              <li key={sym} className="pa-quote pa-quote--pending">
                <div className="pa-quote__top">
                  <span className="pa-quote__sym">{sym}</span>
                  <span className="pa-quote__waiting">not priced yet — refresh to include it</span>
                </div>
              </li>
            ))}
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

      <button
        type="button"
        className="pa-disclose"
        aria-expanded={showWatch}
        onClick={() => setShowWatch((v) => !v)}
      >
        <span className="pa-disclose__mark" aria-hidden="true">{showWatch ? '−' : '+'}</span>
        Watchlist
        <span className="pa-disclose__count">
          {watch === null ? 'unavailable' : `${watch.length} tickers`}
        </span>
      </button>

      <div hidden={!showWatch}>
        {watch === null ? (
          <p className="pa-mini__note">
            The <code>watchlist</code> table doesn’t exist yet. Re-run{' '}
            <code>SCHEMA-market.sql</code> in the Supabase SQL editor, then reload.
          </p>
        ) : (
          <>
            {watchError && <p className="pa-brief__notice">{watchError}</p>}

            <ul className="pa-tickers">
              {watch.map((sym) => (
                <li key={sym} className="pa-ticker">
                  {sym}
                  <button
                    type="button"
                    className="pa-ticker__del"
                    aria-label={`Remove ${sym} from the watchlist`}
                    onClick={() => removeSymbol(sym)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <form className="pa-quick" onSubmit={addSymbol}>
              <input
                className="pa-quick__input"
                placeholder="Add a ticker, e.g. MSFT"
                aria-label="Add a ticker"
                value={newSymbol}
                maxLength={12}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              />
              <button className="pa-quick__btn" type="submit" disabled={checking || !newSymbol.trim()}>
                {checking ? 'checking…' : 'Add'}
              </button>
            </form>

            {/* The allowance is 20 calls a day, so the size of this list is a
                real cost rather than a preference. */}
            <p className="pa-mini__note pa-mini__note--dim">
              {watch.length} tickers · about {watch.length} calls per refresh,
              {' '}{watch.length * 2} on the day’s first. Checking a new ticker costs one more.
            </p>
          </>
        )}
      </div>

      <div className="pa-actions" style={{ marginTop: 'var(--space-5)' }}>
        <Button variant="primary" onClick={() => generate(false)} disabled={generating}>
          {generating ? 'Fetching…' : briefing ? 'Refresh briefing' : 'Generate briefing'}
        </Button>
        {pending.length > 0 && !generating && (
          <span className="pa-fill pa-fill--attn">
            {pending.length} not priced
          </span>
        )}
        <span className="pa-brief__note">calls the market API</span>
      </div>
    </Card>
  )
}
