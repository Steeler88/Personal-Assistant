/**
 * Metrics derived from an EOD bar series.
 *
 * EODHD's /technical endpoint is 403 on the free plan, but RSI and moving
 * averages are arithmetic over closes we already fetched — no reason to pay
 * for them. One EOD call per symbol yields every number below.
 */

const pct = (from, to) => (from ? ((to - from) / from) * 100 : null)

/** Close `n` trading days back (bars, not calendar days — skips weekends/holidays). */
function closeNBarsAgo(bars, n) {
  const i = bars.length - 1 - n
  return i >= 0 ? bars[i].close : null
}

/** Wilder's RSI. Needs period+1 bars; returns null when there's too little history. */
export function rsi(bars, period = 14) {
  if (bars.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const diff = bars[i].close - bars[i - 1].close
    if (diff >= 0) gain += diff
    else loss -= diff
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  // Wilder smoothing across the remaining bars
  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/** Simple moving average of the last `n` closes; null if history is short. */
export function sma(bars, n) {
  if (bars.length < n) return null
  const slice = bars.slice(-n)
  return slice.reduce((sum, b) => sum + b.close, 0) / n
}

const round = (v, dp = 2) => (v === null || v === undefined ? null : Number(v.toFixed(dp)))

/** Turn a raw EOD series into everything the briefing card renders. */
export function summarise(symbol, bars) {
  const sorted = [...bars]
    .filter((b) => b && typeof b.close === 'number' && b.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  if (sorted.length === 0) return null

  const last = sorted[sorted.length - 1]
  const prev = closeNBarsAgo(sorted, 1)

  // YTD baseline: the last close of the previous year, so January isn't null
  const year = last.date.slice(0, 4)
  const firstOfYearIdx = sorted.findIndex((b) => b.date.slice(0, 4) === year)
  const ytdBase =
    firstOfYearIdx > 0 ? sorted[firstOfYearIdx - 1].close : sorted[firstOfYearIdx]?.close ?? null

  return {
    symbol: symbol.replace('.US', ''),
    as_of: last.date,
    close: round(last.close),
    previous_close: round(prev),
    change: round(prev === null ? null : last.close - prev),
    change_p: round(pct(prev, last.close)),
    perf: {
      d1: round(pct(prev, last.close)),
      w1: round(pct(closeNBarsAgo(sorted, 5), last.close)),   // ~1 week of trading
      m1: round(pct(closeNBarsAgo(sorted, 21), last.close)),  // ~1 month
      ytd: round(pct(ytdBase, last.close)),
    },
    // 30 closes is enough shape for a sparkline without bloating the row
    spark: sorted.slice(-30).map((b) => round(b.close)),
    rsi14: round(rsi(sorted, 14), 1),
    sma50: round(sma(sorted, 50)),
    sma200: round(sma(sorted, 200)),
  }
}
