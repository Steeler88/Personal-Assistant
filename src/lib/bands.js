/* The colour vocabulary, in one place.
 *
 * Green, yellow and red state a measurement and nothing else — never that
 * something is selected, focused, primary or merely present. Interface colour
 * is monochrome; see --ui in index.css.
 *
 * Three shapes cover everything this app measures. Which one applies is a
 * property of the number, not a style choice:
 *
 *   thirds     a score on a fixed scale. Bottom third red, middle yellow, top
 *              green. Recovery out of 100, a journal rating out of 10.
 *
 *   proximity  a value that should sit near a target. Thirds would call 2000
 *              of a 3000 kcal target green, so nearness governs instead — and
 *              overshooting misses exactly as undershooting does, because
 *              "around 3000" is missed by 4000 too.
 *
 *   atLeast    a target to meet or beat. One-sided, because sleeping longer
 *              than Whoop asked for is not a failure.
 */

export function thirds(value, max) {
  if (value === null || value === undefined || !max) return 'idle'
  const ratio = Number(value) / Number(max)
  if (ratio >= 2 / 3) return 'ok'
  if (ratio >= 1 / 3) return 'warn'
  return 'bad'
}

/** For scores where low is the good end — soreness, not sleep quality. */
export function invertedThirds(value, max) {
  const tone = thirds(value, max)
  return tone === 'ok' ? 'bad' : tone === 'bad' ? 'ok' : tone
}

export function proximity(value, target) {
  if (value === null || value === undefined || !target) return 'idle'
  const off = Math.abs(Number(value) - target) / Number(target)
  if (off <= 0.1) return 'ok'
  if (off <= 0.25) return 'warn'
  return 'bad'
}

export function atLeast(value, target) {
  if (!value || !target) return 'idle'
  const ratio = Number(value) / Number(target)
  if (ratio >= 0.95) return 'ok'
  if (ratio >= 0.85) return 'warn'
  return 'bad'
}
