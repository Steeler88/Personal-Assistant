import { useState } from 'react'

/* A month of one measurement over time.
 *
 * Three of these rather than one chart with three lines: recovery is a
 * percentage, strain is out of 21, and sleep is a ratio — putting them on one
 * pair of axes would mean two y-scales, which makes the crossings meaningless.
 *
 * The line is neutral and carries the shape; the dots are banded and carry the
 * reading, so a run of red mornings is visible without decoding a legend. One
 * series per chart, so the title names it and no legend is needed.
 */

const W = 320
const H = 132
const PAD = { top: 10, right: 6, bottom: 18, left: 6 }

const TONE = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', idle: 'var(--muted-strong)' }

export default function TrendChart({ title, points, min = 0, max, unit = '', guides = [] }) {
  const [hover, setHover] = useState(null)

  const usable = (points ?? []).filter((p) => p.value !== null && p.value !== undefined)
  if (usable.length < 2) {
    return (
      <figure className="pa-chart">
        <figcaption className="pa-chart__title">{title}</figcaption>
        <p className="pa-mini__note pa-mini__note--dim">Not enough history yet.</p>
      </figure>
    )
  }

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i) => PAD.left + (i / (usable.length - 1)) * plotW
  const span = max - min
  const y = (v) => PAD.top + plotH - ((Math.max(min, Math.min(max, v)) - min) / span) * plotH

  const line = usable.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(usable.length - 1).toFixed(1)},${PAD.top + plotH} L${PAD.left},${PAD.top + plotH} Z`

  const active = hover === null ? null : usable[hover]

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const i = Math.round(ratio * (usable.length - 1))
    setHover(Math.max(0, Math.min(usable.length - 1, i)))
  }

  return (
    <figure className="pa-chart">
      <figcaption className="pa-chart__title">
        {title}
        <span className="pa-chart__read">
          {active ? `${active.label} · ${active.value}${unit}` : `last ${usable.length} days`}
        </span>
      </figcaption>

      <svg
        className="pa-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}, ${usable.length} days`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {guides.map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)}
                  stroke="var(--border)" strokeWidth="1" strokeDasharray="2 3" />
            <text x={W - PAD.right} y={y(g) - 3} textAnchor="end"
                  fill="var(--muted)" fontSize="9" fontFamily="var(--font-mono)">{g}{unit}</text>
          </g>
        ))}

        <path d={area} fill="var(--ui-wash)" stroke="none" />
        <path d={line} fill="none" stroke="var(--muted-strong)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {usable.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 4.5 : 3}
                  fill={TONE[p.tone] ?? TONE.idle} stroke="var(--card)" strokeWidth="1.5" />
        ))}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH}
                stroke="var(--border-strong)" strokeWidth="1" />
        )}
      </svg>

      <div className="pa-chart__axis">
        <span>{usable[0].label}</span>
        <span>{usable[usable.length - 1].label}</span>
      </div>
    </figure>
  )
}
