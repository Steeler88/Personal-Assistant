/* Whoop's own recovery banding: green at 67 and above, yellow at 34 and above,
 * red below. Shared so the home panel and the recovery screen can't disagree
 * about whether an 11% morning was a good one. */

export function recoveryTone(score) {
  if (score === null || score === undefined) return 'idle'
  if (score >= 67) return 'ok'
  if (score >= 34) return 'warn'
  return 'bad'
}
