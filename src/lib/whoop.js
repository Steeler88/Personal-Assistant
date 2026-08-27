import { daysBetween } from './dates'

/* Whoop's own recovery banding: green at 67 and above, yellow at 34 and above,
 * red below. Shared so the home panel and the recovery screen can't disagree
 * about whether an 11% morning was a good one. */

export function recoveryTone(score) {
  if (score === null || score === undefined) return 'idle'
  if (score >= 67) return 'ok'
  if (score >= 34) return 'warn'
  return 'bad'
}

/**
 * How far behind the stored data is. The sync is a button on purpose, so the
 * app's job is to make it obvious when pressing it is overdue rather than to
 * press it for you.
 *
 * Whoop closes a night each morning, so the newest night_of being today is
 * normal and current; anything older means the button hasn't been pressed.
 */
export function freshness(newestNight, today) {
  if (!newestNight) return { days: null, tone: 'idle', label: 'never synced' }

  const days = daysBetween(newestNight, today)
  if (days === null) return { days: null, tone: 'idle', label: 'unknown' }
  if (days <= 0) return { days: 0, tone: 'ok', label: 'up to date' }
  if (days === 1) return { days, tone: 'ok', label: 'through yesterday' }
  if (days <= 3) return { days, tone: 'warn', label: `${days} days behind` }
  return { days, tone: 'bad', label: `${days} days behind` }
}

/**
 * Sleep against what Whoop said you needed that night. Not Whoop's own
 * performance percentage, which comes out of a model and does not equal this
 * division — see api/whoop/sync.js.
 */
export function sleepTone(asleepMin, neededMin) {
  if (!asleepMin || !neededMin) return 'idle'
  const ratio = Number(asleepMin) / Number(neededMin)
  if (ratio >= 0.95) return 'ok'
  if (ratio >= 0.85) return 'warn'
  return 'bad'
}

/**
 * Sleep as a percentage of what Whoop asked for. Over 100 is normal and good —
 * it means you slept longer than you needed, so this is not clamped.
 *
 * This is our own division and will not match the percentage Whoop's app shows,
 * which comes out of their model. See api/whoop/sync.js.
 */
export function sleepPct(asleepMin, neededMin) {
  if (!asleepMin || !neededMin) return null
  return Math.round((Number(asleepMin) / Number(neededMin)) * 100)
}
