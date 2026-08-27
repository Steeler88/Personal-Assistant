import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import { Card, Button, Badge } from '../design-kit'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

const pct = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`)
const money = (n) => (n === null || n === undefined ? '—' : n.toFixed(2))

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

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/market-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send our local date; the server runs UTC and would misfile evening briefings
        body: JSON.stringify({ date: todayKey() }),
      })
      const body = await res.json()
      if (!res.ok) setError(body.error || `Request failed (${res.status})`)
      else setBriefing(body)
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

      {loading ? (
        <p className="pa-empty">Loading…</p>
      ) : !briefing ? (
        <p className="pa-empty">No briefing yet. Generate one below.</p>
      ) : (
        <>
          <div className="pa-brief__head">
            <span className="pa-brief__stamp">{when(briefing.generated_at)}</span>
            {briefing.insight ? null : <Badge tone="neutral">quotes only</Badge>}
          </div>

          {briefing.insight && <p className="pa-brief__insight">{briefing.insight}</p>}

          <ul className="pa-quotes">
            {(briefing.quotes ?? []).map((q) => {
              const up = (q.change_p ?? 0) >= 0
              return (
                <li key={q.symbol} className="pa-quote">
                  <span className="pa-quote__sym">{q.symbol}</span>
                  <span className="pa-quote__price">{money(q.close)}</span>
                  <span className={`pa-quote__chg${up ? '' : ' pa-quote__chg--down'}`}>
                    {up ? '▲' : '▼'} {pct(q.change_p)}
                  </span>
                </li>
              )
            })}
          </ul>

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
        <Button variant="primary" onClick={generate} disabled={generating}>
          {generating ? 'Fetching…' : briefing ? 'Refresh briefing' : 'Generate briefing'}
        </Button>
        <span className="pa-brief__note">calls the market API</span>
      </div>
    </Card>
  )
}
