import { useState } from 'react'
import { sma, rsi, drawdown } from '../lib/series'

/* Charts for one ticker, all drawn from stored bars.
 *
 * Price and volume are stacked panels sharing an x-axis rather than one chart
 * with two y-scales — dollars and share counts on the same axis would make
 * their crossings look meaningful when they are not.
 *
 * RSI has no strip of its own: the figure for the hovered day is in the readout
 * above the chart and the latest sits in the Momentum block, which is as much
 * as a number bounded 0-100 needs.
 *
 * Candles rather than a close-only line: the plan allows no interval finer
 * than a day, so open, high and low are the only intraday detail obtainable —
 * and they were already being stored and thrown away.
 *
 * A candle is green when it closed above its own open, which is what a candle
 * has always meant. That can disagree with the percentage beside it, which is
 * measured against the PREVIOUS close: a stock that gaps up and then sells off
 * shows a red candle on a green day. The disagreement is information.
 *
 * Moving averages stay grey — they are reference lines, not readings, and
 * colouring them would imply a verdict.
 *
 * Averages and RSI are computed over the WHOLE stored series and only then cut
 * to the visible window. Computing them on the window instead meant a 50-day
 * average had nothing to average over a one-month range and simply vanished —
 * the line was missing exactly when it was being asked for.
 */

const W = 720
const PAD = { l: 4, r: 46, t: 8, b: 4 }

const fmt = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toFixed(d)

const scaleX = (i, n, w) => PAD.l + (n < 2 ? 0 : (i / (n - 1)) * (w - PAD.l - PAD.r))

function path(values, h, lo, hi, w) {
  const span = hi - lo || 1
  return values
    .map((v, i) =>
      v === null || v === undefined
        ? null
        : `${scaleX(i, values.length, w)},${(PAD.t + (h - PAD.t - PAD.b) * (1 - (v - lo) / span)).toFixed(1)}`
    )
    .reduce((d, pt) => (pt === null ? d : `${d}${d ? ' L' : 'M'}${pt}`), '')
}

/** Price with moving-average overlays, volume and RSI beneath it. */
export function PricePanel({ all, count }) {
  const [hover, setHover] = useState(null)
  if (!all || all.length < 2) return <p className="pa-mini__note pa-mini__note--dim">Not enough history yet.</p>

  const start = Math.max(0, all.length - count)
  const bars = all.slice(start)
  const ma50 = sma(all, 50).slice(start)
  const ma200 = sma(all, 200).slice(start)
  const rsiVals = rsi(all, 14).slice(start)
  const vols = bars.map((b) => Number(b.volume ?? 0))

  // Up or down day, taken against the bar before it — which for the first
  // visible bar is the one just outside the window, not itself.
  const dayUp = bars.map((b) => Number(b.close) >= Number(b.open ?? b.close))

  // Scaled to the price alone. Including the averages meant a 200-day sitting
  // well below a one-month window stretched the axis by a third and flattened
  // every candle to pay for it. An average outside the price range is clipped
  // instead — where it sits is already stated in the Momentum block.
  const lows = bars.map((b) => Number(b.low ?? b.close))
  const highs = bars.map((b) => Number(b.high ?? b.close))
  const rawLo = Math.min(...lows)
  const rawHi = Math.max(...highs)
  // Just enough headroom to keep the tallest wick off the frame. Anything
  // more is axis spent on emptiness, and every candle pays for it.
  const pad = (rawHi - rawLo || rawHi * 0.02) * 0.02
  const lo = rawLo - pad
  const hi = rawHi + pad

  // Candle height is bounded by the price range, which is the data's to decide.
  // The one honest way to make a day's body read at a glance is to give the
  // panel more room.
  const H_PRICE = 320
  const H_VOL = 54
  const maxVol = Math.max(...vols, 1)

  const at = hover === null ? bars.length - 1 : hover
  const cursorX = scaleX(at, bars.length, W)

  /* The plot is inset from the SVG by the axis gutter, so a cursor position
     read against the full width drifts from the line it is meant to follow —
     by the width of the right-hand labels at the far edge. Convert into
     viewBox units first, then into the plot's own span. */
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const xView = ((e.clientX - r.left) / r.width) * W
    const span = W - PAD.l - PAD.r
    const i = Math.round(((xView - PAD.l) / span) * (bars.length - 1))
    setHover(Math.max(0, Math.min(bars.length - 1, i)))
  }

  const gridY = (h, frac) => PAD.t + (h - PAD.t - PAD.b) * frac

  return (
    <div className="pa-tchart" onMouseLeave={() => setHover(null)}>
      <div className="pa-tchart__read">
        <span className="pa-tchart__date">{bars[at].bar_date}</span>
        <span>O {fmt(bars[at].open)}</span>
        <span>H {fmt(bars[at].high)}</span>
        <span>L {fmt(bars[at].low)}</span>
        <span className="pa-tchart__close">C {fmt(bars[at].close)}</span>
        <span>RSI {fmt(rsiVals[at], 0)}</span>
      </div>

      <svg className="pa-tchart__svg" viewBox={`0 0 ${W} ${H_PRICE}`} preserveAspectRatio="none"
           onMouseMove={onMove} role="img" aria-label="Price with 50 and 200 day moving averages">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={gridY(H_PRICE, f)} y2={gridY(H_PRICE, f)}
                stroke="var(--border)" strokeWidth="1" />
        ))}
        {bars.map((b, i) => {
          const cx = scaleX(i, bars.length, W)
          const w = Math.max(1.2, (W - PAD.l - PAD.r) / bars.length - 1.2)
          const yOf = (v) => PAD.t + (H_PRICE - PAD.t - PAD.b) * (1 - (Number(v) - lo) / ((hi - lo) || 1))
          const o = yOf(b.open ?? b.close)
          const c = yOf(b.close)
          const colour = dayUp[i] ? 'var(--ok)' : 'var(--bad)'
          return (
            <g key={b.bar_date}>
              <line x1={cx} x2={cx} y1={yOf(b.high ?? b.close)} y2={yOf(b.low ?? b.close)}
                    stroke={colour} strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <rect x={cx - w / 2} y={Math.min(o, c)} width={w}
                    height={Math.max(Math.abs(c - o), 0.6)} fill={colour} />
            </g>
          )
        })}
        <clipPath id={`plot-${bars[0].bar_date}-${bars.length}`}>
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H_PRICE - PAD.t - PAD.b} />
        </clipPath>
        <g clipPath={`url(#plot-${bars[0].bar_date}-${bars.length})`}>
          <path d={path(ma200, H_PRICE, lo, hi, W)} fill="none" stroke="var(--muted)" strokeWidth="1.5"
                vectorEffect="non-scaling-stroke" />
          <path d={path(ma50, H_PRICE, lo, hi, W)} fill="none" stroke="var(--muted-strong)" strokeWidth="1.5"
                strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
        </g>
        <line x1={cursorX} x2={cursorX} y1={PAD.t} y2={H_PRICE - PAD.b}
              stroke="var(--border-strong)" strokeWidth="1" />
        <text x={W - PAD.r + 6} y={12} fill="var(--muted)" fontSize="11" fontFamily="var(--font-mono)">{fmt(rawHi)}</text>
        <text x={W - PAD.r + 6} y={H_PRICE - 6} fill="var(--muted)" fontSize="11" fontFamily="var(--font-mono)">{fmt(rawLo)}</text>
      </svg>

      <svg className="pa-tchart__svg pa-tchart__svg--short" viewBox={`0 0 ${W} ${H_VOL}`} preserveAspectRatio="none"
           onMouseMove={onMove} role="img" aria-label="Volume">
        {vols.map((v, i) => {
          const h = (v / maxVol) * (H_VOL - PAD.t - PAD.b)
          const w = Math.max(0.8, (W - PAD.l - PAD.r) / vols.length - 0.4)
          return <rect key={i} x={scaleX(i, vols.length, W) - w / 2} y={H_VOL - PAD.b - h}
                       width={w} height={h}
                       fill={dayUp[i] ? 'var(--ok)' : 'var(--bad)'} fillOpacity="0.75" />
        })}
        <line x1={cursorX} x2={cursorX} y1={PAD.t} y2={H_VOL - PAD.b} stroke="var(--border-strong)" strokeWidth="1" />
        <text x={W - PAD.r + 6} y={14} fill="var(--muted)" fontSize="11" fontFamily="var(--font-mono)">vol</text>
      </svg>

      <div className="pa-tchart__axis">
        <span>{bars[0].bar_date}</span>
        <span className="pa-tchart__legend">
          <i className="pa-tchart__key pa-tchart__key--50" /> 50d
          <i className="pa-tchart__key pa-tchart__key--200" /> 200d
          {ma200.every((v) => v === null) && <span className="pa-tchart__note">200d needs 200 bars</span>}
        </span>
        <span>{bars[bars.length - 1].bar_date}</span>
      </div>
    </div>
  )
}

/** A bar per calendar month. Grows into a proper heatmap once more than a
 *  year is stored, which is the point of keeping the bars. */
export function MonthBars({ months }) {
  if (!months?.length) return null
  const peak = Math.max(...months.map((m) => Math.abs(m.pct ?? 0)), 1)
  return (
    <div className="pa-months">
      {months.map((m) => {
        const pct = m.pct ?? 0
        const tone = pct >= 0 ? 'var(--ok)' : 'var(--bad)'
        return (
          <div key={m.month} className="pa-months__col" title={`${m.month}  ${fmt(pct, 1)}%`}>
            <div className="pa-months__plot">
              <span
                className="pa-months__bar"
                style={{
                  height: `${(Math.abs(pct) / peak) * 44}%`,
                  background: tone,
                  [pct >= 0 ? 'bottom' : 'top']: '50%',
                }}
              />
              <span className="pa-months__zero" />
            </div>
            <span className="pa-months__label">{m.month.slice(5)}</span>
            <span className="pa-months__pct" style={{ color: tone }}>{fmt(pct, 0)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Depth below the running peak. Always negative, so it fills downward.
 *
 * Carries its own cursor rather than sharing the price chart's: the two are
 * read one at a time, and a line that moved in a chart you were not pointing
 * at would look like a glitch rather than a link. */
export function DrawdownChart({ bars }) {
  const [hover, setHover] = useState(null)
  const { series, worst } = drawdown(bars)
  if (series.length < 2) return null

  const H = 96
  const values = series.map((d) => d.pct)
  const lo = Math.min(worst, -1)
  const d = path(values, H, lo, 0, W)

  const at = hover === null ? series.length - 1 : hover
  const cursorX = scaleX(at, series.length, W)
  const cursorY = PAD.t + (H - PAD.t - PAD.b) * (1 - (values[at] - lo) / ((0 - lo) || 1))

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const xView = ((e.clientX - r.left) / r.width) * W
    const span = W - PAD.l - PAD.r
    const i = Math.round(((xView - PAD.l) / span) * (series.length - 1))
    setHover(Math.max(0, Math.min(series.length - 1, i)))
  }

  return (
    <div className="pa-tchart" onMouseLeave={() => setHover(null)}>
      <div className="pa-tchart__read">
        <span className="pa-tchart__date">{series[at].bar_date}</span>
        <span className="pa-tchart__close">{fmt(series[at].pct, 1)}% from peak</span>
        <span>worst {fmt(worst, 1)}%</span>
      </div>

      <svg className="pa-tchart__svg pa-tchart__svg--short" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
           onMouseMove={onMove} role="img" aria-label="Drawdown from peak">
        <path d={`${d} L${W - PAD.r},${PAD.t} L${PAD.l},${PAD.t} Z`} fill="var(--bad)" fillOpacity="0.12" />
        <path d={d} fill="none" stroke="var(--bad)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1={cursorX} x2={cursorX} y1={PAD.t} y2={H - PAD.b}
              stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <circle cx={cursorX} cy={cursorY} r="3" fill="var(--bad)" stroke="var(--card)" strokeWidth="1.5" />
        <text x={W - PAD.r + 6} y={H - 6} fill="var(--muted)" fontSize="11" fontFamily="var(--font-mono)">
          {fmt(worst, 0)}%
        </text>
      </svg>
    </div>
  )
}
