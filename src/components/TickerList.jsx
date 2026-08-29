import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { postJson } from '../lib/api'
import Spark from './Spark'
import { PricePanel, MonthBars, DrawdownChart } from './TickerCharts'
import {
  RANGES, sliceRange, trailingReturn, ytdReturn, monthlyReturns,
  volatility, drawdown, beta, range52w, volumeStats, rsi, sma,
} from '../lib/series'

const BENCHMARK = 'VOO'

const money = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2))
const pct = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}%`
const compact = (n) =>
  n === null || n === undefined ? '—' :
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` :
  n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n))

const tone = (n) => (n === null || n === undefined ? '' : n >= 0 ? ' pa-num--up' : ' pa-num--down')

/** A labelled block of figures. Several of these fill the panel across, rather
 *  than one long column with the right-hand two thirds empty. */
function Facts({ label, rows }) {
  return (
    <div className="pa-facts">
      <span className="pa-facts__k">{label}</span>
      <dl className="pa-facts__list">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="pa-facts__row">
            <dt>{k}</dt>
            <dd className={cls ?? ''}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function TickerList({ quotes, pending }) {
  const [names, setNames] = useState({})
  const [open, setOpen] = useState(null)
  const [range, setRange] = useState('1Y')
  const [bars, setBars] = useState({})
  const [divs, setDivs] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('tickers').select('symbol,name').then(({ data, error }) => {
      if (cancelled || error) return
      setNames(Object.fromEntries((data ?? []).map((t) => [t.symbol, t.name])))
    })
    return () => { cancelled = true }
  }, [])

  /** Bars come from Postgres, never the API — expanding a ticker costs nothing. */
  async function loadStored(symbol) {
    const wanted = symbol === BENCHMARK ? [symbol] : [symbol, BENCHMARK]
    const missing = wanted.filter((s) => !bars[s])
    if (missing.length) {
      const { data, error: failed } = await supabase
        .from('eod_bars').select('*').in('symbol', missing).order('bar_date', { ascending: true })
      if (failed) { setError(failed.message); return }
      const grouped = {}
      for (const row of data ?? []) (grouped[row.symbol] ||= []).push(row)
      setBars((b) => ({ ...b, ...Object.fromEntries(missing.map((s) => [s, grouped[s] ?? []])) }))
    }
    if (!divs[symbol]) {
      const { data } = await supabase
        .from('dividends').select('*').eq('symbol', symbol).order('ex_date', { ascending: false }).limit(12)
      setDivs((d) => ({ ...d, [symbol]: data ?? [] }))
    }
  }

  async function toggle(symbol) {
    if (open === symbol) { setOpen(null); return }
    setOpen(symbol)
    setError(null)
    await loadStored(symbol)
  }

  /** The only call here: one a day appends the newest bars. */
  async function sync(symbol) {
    setBusy(symbol)
    setError(null)
    const { ok, body, error: failed } = await postJson('/api/ticker-history', { symbol })
    if (!ok) setError(failed)
    else {
      setBars((b) => ({ ...b, [symbol]: undefined, [BENCHMARK]: undefined }))
      setDivs((d) => ({ ...d, [symbol]: undefined }))
      if (body.reference?.name) setNames((n) => ({ ...n, [symbol]: body.reference.name }))
      await loadStored(symbol)
    }
    setBusy(null)
  }

  const rows = [
    ...(quotes ?? []).map((q) => ({ ...q, priced: true })),
    ...(pending ?? []).map((symbol) => ({ symbol, priced: false })),
  ]

  return (
    <>
      {error && <p className="pa-brief__notice">{error}</p>}

      <ul className="pa-tick">
        {rows.map((q) => {
          const up = (q.change_p ?? 0) >= 0
          const isOpen = open === q.symbol
          const all = bars[q.symbol]
          const view = all ? sliceRange(all, range) : null
          const bench = bars[BENCHMARK]

          return (
            <li key={q.symbol} className={`pa-tick__item${isOpen ? ' pa-tick__item--open' : ''}`}>
              <button
                type="button"
                className="pa-tick__head"
                aria-expanded={isOpen}
                onClick={() => toggle(q.symbol)}
              >
                <span className="pa-tick__id">
                  <span className="pa-tick__sym">{q.symbol}</span>
                  <span className="pa-tick__name">{names[q.symbol] ?? ' '}</span>
                </span>

                {q.priced ? (
                  <>
                    <span className="pa-tick__price">{money(q.live?.price ?? q.close)}</span>
                    <span className={`pa-tick__chg${tone(q.change_p)}`}>
                      {up ? '▲' : '▼'} {pct(q.change_p)}
                    </span>
                    <span className="pa-tick__spark">
                      <Spark points={q.spark} up={up} w={190} h={46} />
                    </span>
                  </>
                ) : (
                  <span className="pa-tick__waiting">not priced yet — refresh to include it</span>
                )}

                <span className="pa-tick__mark" aria-hidden="true">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="pa-tick__body">
                  {!all ? (
                    <p className="pa-mini__note pa-mini__note--dim">Reading stored history…</p>
                  ) : all.length < 2 ? (
                    <div className="pa-tick__empty">
                      <p className="pa-mini__note">
                        No history stored for {q.symbol} yet. One call fetches a year of daily bars and
                        everything below is computed from them — after that it grows by a bar a day.
                      </p>
                      <button type="button" className="pa-quick__btn" disabled={busy === q.symbol}
                              onClick={() => sync(q.symbol)}>
                        {busy === q.symbol ? 'fetching…' : `Fetch history for ${q.symbol}`}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="pa-tick__ranges">
                        {RANGES.map((r) => (
                          <button key={r.id} type="button" className="pa-range"
                                  aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                            {r.label}
                          </button>
                        ))}
                        <span className="pa-tick__stored">{all.length} bars stored</span>
                        <button type="button" className="pa-quick__btn" disabled={busy === q.symbol}
                                onClick={() => sync(q.symbol)}>
                          {busy === q.symbol ? 'updating…' : 'Update'}
                        </button>
                      </div>

                      <PricePanel all={all} count={view.length} />

                      {(() => {
                        const dd = drawdown(view)
                        const r52 = range52w(all)
                        const vol = volumeStats(all)
                        const b = beta(all, bench)
                        const rs = rsi(all, 14)
                        const ma50 = sma(all, 50)
                        const ma200 = sma(all, 200)
                        const last = all.length - 1
                        const price = Number(all[last].close)
                        const dividend = divs[q.symbol] ?? []
                        const ttm = dividend
                          .filter((d) => d.ex_date >= new Date(Date.now() - 366 * 864e5).toISOString().slice(0, 10))
                          .reduce((s, d) => s + Number(d.amount ?? 0), 0)

                        return (
                          <div className="pa-tick__facts">
                            <Facts label="Returns" rows={[
                              ['1 week', pct(trailingReturn(all, 5)), tone(trailingReturn(all, 5))],
                              ['1 month', pct(trailingReturn(all, 21)), tone(trailingReturn(all, 21))],
                              ['3 months', pct(trailingReturn(all, 63)), tone(trailingReturn(all, 63))],
                              ['Year to date', pct(ytdReturn(all)), tone(ytdReturn(all))],
                              ['1 year', pct(trailingReturn(all, 252)), tone(trailingReturn(all, 252))],
                            ]} />

                            <Facts label="Range" rows={[
                              ['52w high', money(r52?.high)],
                              ['52w low', money(r52?.low)],
                              ['Position', r52 ? `${r52.position.toFixed(0)}% of range` : '—'],
                              ['From high', r52 ? pct(((price - r52.high) / r52.high) * 100) : '—',
                                tone(r52 ? price - r52.high : null)],
                              ['Bars stored', String(all.length)],
                            ]} />

                            <Facts label="Momentum" rows={[
                              ['RSI (14)', rs[last] === null ? '—' : rs[last].toFixed(0)],
                              ['50-day', ma50[last] === null ? '—' : money(ma50[last])],
                              ['vs 50-day', ma50[last] === null ? '—' : (price >= ma50[last] ? 'above' : 'below'),
                                ma50[last] === null ? '' : tone(price - ma50[last])],
                              ['200-day', ma200[last] === null ? 'not enough bars' : money(ma200[last])],
                              ['vs 200-day', ma200[last] === null ? '—' : (price >= ma200[last] ? 'above' : 'below'),
                                ma200[last] === null ? '' : tone(price - ma200[last])],
                            ]} />

                            <Facts label="Risk" rows={[
                              ['Volatility', vol === null ? '—' : `${volatility(all)?.toFixed(0)}% a year`],
                              ['Beta vs VOO', b === null ? '—' : b.toFixed(2)],
                              ['Drawdown now', pct(dd.current, 1), tone(dd.current)],
                              ['Worst drawdown', pct(dd.worst, 1), tone(dd.worst)],
                              ['Up days', `${Math.round(
                                (all.slice(1).filter((x, i) => Number(x.close) >= Number(all[i].close)).length /
                                  (all.length - 1)) * 100
                              )}%`],
                            ]} />

                            <Facts label="Volume" rows={[
                              ['Latest', compact(vol?.latest)],
                              ['60-day average', compact(vol?.avg)],
                              ['Relative', vol?.ratio ? `${vol.ratio.toFixed(2)}×` : '—'],
                            ]} />

                            <Facts label="Dividend" rows={
                              dividend.length === 0
                                ? [['Paid', 'none on record']]
                                : [
                                    ['Trailing 12m', ttm ? `$${ttm.toFixed(2)}` : '—'],
                                    ['Yield', ttm && price ? `${((ttm / price) * 100).toFixed(2)}%` : '—'],
                                    ['Last ex-date', dividend[0].ex_date],
                                    ['Last amount', `$${Number(dividend[0].amount).toFixed(4)}`],
                                  ]
                            } />
                          </div>
                        )
                      })()}

                      <div className="pa-tick__extra">
                        <div>
                          <span className="pa-facts__k">Month by month</span>
                          <MonthBars months={monthlyReturns(all)} />
                        </div>
                        <div>
                          <span className="pa-facts__k">Drawdown from peak</span>
                          <DrawdownChart bars={view} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
