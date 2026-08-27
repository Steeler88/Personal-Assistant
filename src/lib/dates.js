// Local-date helpers. Everything here stays in local time on purpose:
// new Date('2026-08-25') parses as UTC and can land on the wrong day.

export function toKey(y, m, d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

export function parseKey(key) {
  if (!key) return null
  const [y, m, d] = key.split('-').map(Number)
  return { y, m: m - 1, d }
}

export function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate()
}

/** Weekday index (0=Sun) of the 1st of the month. */
export function firstWeekday(y, m) {
  return new Date(y, m, 1).getDay()
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** "Aug 25" / "Aug 25, 2027" when the year differs from the current one. */
export function prettyDate(key) {
  const p = parseKey(key)
  if (!p) return null
  const now = new Date()
  const short = MONTHS[p.m].slice(0, 3)
  return p.y === now.getFullYear() ? `${short} ${p.d}` : `${short} ${p.d}, ${p.y}`
}

/** '19:00:00' or '19:00' -> '7:00 PM'. Returns null for all-day events. */
export function prettyTime(t) {
  if (!t) return null
  const [hRaw, m] = t.split(':')
  const h = Number(hRaw)
  const suffix = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${m} ${suffix}`
}

/** Selectable times in 15-minute steps, so a time is picked rather than typed. */
export function timeOptions() {
  const out = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      out.push({ value, label: prettyTime(value) })
    }
  }
  return out
}

/** First and last day of a month as YYYY-MM-DD, for range queries. */
export function monthBounds(y, m) {
  return { from: toKey(y, m, 1), to: toKey(y, m, daysInMonth(y, m)) }
}
