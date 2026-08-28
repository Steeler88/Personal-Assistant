/* Identity colours for recurring events.
 *
 * A different job from the measurement palette: these say *which class*, not
 * how good something is. They deliberately avoid all five reserved hues —
 * green, yellow and red (measurements), orange (needs you) and blue (live) —
 * so a class can never be mistaken for a reading.
 *
 * Validated as a categorical set against the panel surface: lightness band,
 * chroma floor, CVD separation, normal-vision separation and contrast all
 * pass. Tritan separation on the pink/cyan pair sits at 6.3, inside the band
 * that is only legal alongside secondary encoding — which holds here, because
 * the event's title is always shown as text beside its colour. Never assign a
 * colour without the name next to it.
 */

export const SERIES_PALETTE = [
  '#8b5cf6', // violet
  '#0891b2', // cyan
  '#ec4899', // pink
  '#6366f1', // indigo
  '#0d9488', // teal
]

/**
 * Colour follows the class, not the row — the same class logged twice must not
 * come out two colours — and the order is by when each series was first
 * created, so adding a class next semester appends rather than repainting the
 * ones already on the calendar.
 *
 * Past the palette, series fold into neutral rather than getting a generated
 * hue, which is how a categorical scale stays readable.
 */
export function seriesColors(rows) {
  const firstSeen = new Map()
  for (const r of rows ?? []) {
    if (!r.repeat_weekdays?.length) continue
    const seen = firstSeen.get(r.title)
    if (!seen || (r.created_at ?? '') < seen) firstSeen.set(r.title, r.created_at ?? '')
  }

  const ordered = [...firstSeen.entries()]
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1))
    .map(([title]) => title)

  const map = new Map()
  ordered.forEach((title, i) => {
    if (i < SERIES_PALETTE.length) map.set(title, SERIES_PALETTE[i])
  })
  return map
}

/** The colour for one occurrence, or null for a one-off and for the overflow. */
export const colorOf = (colors, item) =>
  (item?.repeats && colors?.get(item.title)) || null
