import { daysBetween } from './dates'
import { thirds, atLeast } from './bands'

/* Recovery is a score out of 100, so it bands in thirds — which is also
 * exactly where Whoop puts its own green/yellow/red. Shared so the home
 * panel and the recovery screen cannot disagree about an 11% morning. */
export const recoveryTone = (score) => thirds(score, 100)

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
export const sleepTone = atLeast


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
