/* Inline sparkline. Normalised to its own range, so shape is what reads —
 * an area fill and an emphasised endpoint make the direction legible at
 * 64x18, which a bare polyline does not. */

export default function Spark({ points, up, w = 64, h = 18 }) {
  if (!points || points.length < 2) return null

  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1

  const coords = points.map((v, i) => [
    (i / (points.length - 1)) * w,
    h - ((v - lo) / span) * h,
  ])

  const line = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')

  const [lastX, lastY] = coords[coords.length - 1]
  // Same token for line and fill, so the two can't drift apart on a palette change
  const stroke = up ? 'var(--ok)' : 'var(--bad)'

  return (
    <svg className="pa-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={stroke} fillOpacity="0.12" stroke="none" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.3"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="1.7" fill={stroke} />
    </svg>
  )
}
