/* Everything the expanded ticker view shows, derived from stored bars.
 *
 * None of this touches the API. One EOD call a day appends the newest bar and
 * every figure below falls out of the series already in Postgres, which is why
 * adding another chart costs nothing.
 *
 * Bars arrive oldest-first. `adjusted` is used for anything comparing two
 * dates — returns, moving averages, volatility — because a split moves the raw
 * close without anything having happened to the money. `close` is what gets
 * displayed, because that is the number the market quoted.
 */

const val = (b) => Number(b.adjusted ?? b.close)

export const RANGES = [
  { id: '1M', label: '1M', days: 31 },
  { id: '3M', label: '3M', days: 92 },
  { id: 'YTD', label: 'YTD', days: null },
  { id: '1Y', label: '1Y', days: 366 },
]

export function sliceRange(bars, rangeId) {
  if (!bars?.length) return []
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[3]
  if (range.id === 'YTD') {
    const year = bars[bars.length - 1].bar_date.slice(0, 4)
    return bars.filter((b) => b.bar_date >= `${year}-01-01`)
  }
  return bars.slice(Math.max(0, bars.length - range.days))
}

/* ---------- moving averages ---------- */

export function sma(bars, period) {
  const out = new Array(bars.length).fill(null)
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += val(bars[i])
    if (i >= period) sum -= val(bars[i - period])
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/* ---------- momentum ---------- */

/** Wilder's smoothing, the same method the paid /technical endpoint uses. */
export function rsi(bars, period = 14) {
  const out = new Array(bars.length).fill(null)
  if (bars.length <= period) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = val(bars[i]) - val(bars[i - 1])
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)

  for (let i = period + 1; i < bars.length; i++) {
    const d = val(bars[i]) - val(bars[i - 1])
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

/* ---------- returns ---------- */

const pctBetween = (a, b) => (a && b ? ((b - a) / a) * 100 : null)

/** Trailing return over roughly `days` trading sessions back. */
export function trailingReturn(bars, days) {
  if (!bars?.length) return null
  const end = bars[bars.length - 1]
  const start = bars[Math.max(0, bars.length - 1 - days)]
  return start === end ? null : pctBetween(val(start), val(end))
}

export function ytdReturn(bars) {
  if (!bars?.length) return null
  const year = bars[bars.length - 1].bar_date.slice(0, 4)
  const first = bars.find((b) => b.bar_date >= `${year}-01-01`)
  return first ? pctBetween(val(first), val(bars[bars.length - 1])) : null
}

/** One entry per calendar month, oldest first — the strip that grows into a
 *  heatmap once there is more than a year stored. */
export function monthlyReturns(bars) {
  if (!bars?.length) return []
  const byMonth = new Map()
  for (const b of bars) {
    const key = b.bar_date.slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, { first: b, last: b })
    else byMonth.get(key).last = b
  }
  return [...byMonth.entries()].map(([month, { first, last }]) => ({
    month,
    pct: pctBetween(val(first), val(last)),
  }))
}

/* ---------- risk ---------- */

export function dailyReturns(bars) {
  const out = []
  for (let i = 1; i < bars.length; i++) out.push(val(bars[i]) / val(bars[i - 1]) - 1)
  return out
}

/** Annualised, from daily closes. 252 sessions in a trading year. */
export function volatility(bars) {
  const r = dailyReturns(bars)
  if (r.length < 20) return null
  const mean = r.reduce((a, b) => a + b, 0) / r.length
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252) * 100
}

/** Drawdown from the running peak, as a series and as its worst point. */
export function drawdown(bars) {
  let peak = -Infinity
  const series = bars.map((b) => {
    peak = Math.max(peak, val(b))
    return { bar_date: b.bar_date, pct: ((val(b) - peak) / peak) * 100 }
  })
  const worst = series.reduce((lo, d) => (d.pct < lo ? d.pct : lo), 0)
  return { series, worst, current: series.length ? series[series.length - 1].pct : null }
}

/** Beta against a benchmark you already hold. Dates are aligned first, since
 *  a missing bar on either side would otherwise shift every pair after it. */
export function beta(bars, benchmarkBars) {
  if (!bars?.length || !benchmarkBars?.length) return null
  const bench = new Map(benchmarkBars.map((b) => [b.bar_date, val(b)]))
  const pairs = []
  let prevA = null
  let prevB = null
  for (const b of bars) {
    const other = bench.get(b.bar_date)
    if (other === undefined) continue
    if (prevA !== null) pairs.push([val(b) / prevA - 1, other / prevB - 1])
    prevA = val(b)
    prevB = other
  }
  if (pairs.length < 30) return null
  const meanA = pairs.reduce((s, p) => s + p[0], 0) / pairs.length
  const meanB = pairs.reduce((s, p) => s + p[1], 0) / pairs.length
  let cov = 0
  let varB = 0
  for (const [a, b] of pairs) {
    cov += (a - meanA) * (b - meanB)
    varB += (b - meanB) ** 2
  }
  return varB === 0 ? null : cov / varB
}

/* ---------- range ---------- */

export function range52w(bars) {
  const window = bars.slice(Math.max(0, bars.length - 252))
  if (!window.length) return null
  const highs = window.map((b) => Number(b.high ?? b.close))
  const lows = window.map((b) => Number(b.low ?? b.close))
  const high = Math.max(...highs)
  const low = Math.min(...lows)
  const last = Number(window[window.length - 1].close)
  return { high, low, last, position: high === low ? 100 : ((last - low) / (high - low)) * 100 }
}

export function volumeStats(bars) {
  const window = bars.slice(Math.max(0, bars.length - 60))
  if (!window.length) return null
  const vols = window.map((b) => Number(b.volume ?? 0))
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length
  const latest = vols[vols.length - 1]
  return { latest, avg, ratio: avg ? latest / avg : null }
}
