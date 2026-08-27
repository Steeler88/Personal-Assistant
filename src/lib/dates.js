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
