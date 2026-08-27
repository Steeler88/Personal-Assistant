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

/** Weekday index (0=Sun) for a 'YYYY-MM-DD' key, in local time. */
export function weekdayOf(key) {
  const p = parseKey(key)
  return new Date(p.y, p.m, p.d).getDay()
}

/** Every date key from `from` to `to` inclusive. */
export function eachDay(from, to) {
  const out = []
  const a = parseKey(from)
  const cursor = new Date(a.y, a.m, a.d)
  while (true) {
    const key = toKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    if (key > to) break
    out.push(key)
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** `n` days after a 'YYYY-MM-DD' key, in local time. */
export function addDays(key, n) {
  const p = parseKey(key)
  const d = new Date(p.y, p.m, p.d + n)
  return toKey(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Morning / afternoon / evening / night, for a dashboard whose whole
 *  subject is the current moment. */
export function timeOfDay(d = new Date()) {
  const h = d.getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

/** 'HH:MM' on a 24-hour clock — the readout is an instrument, not a letter. */
export function clock(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 'YYYY-MM-DD' -> 'Thursday, August 27'. */
export function longDateOf(key) {
  const p = parseKey(key)
  if (!p) return ''
  return new Date(p.y, p.m, p.d).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

/** Whole days from `a` to `b`, both 'YYYY-MM-DD'. Negative if b is earlier. */
export function daysBetween(a, b) {
  const pa = parseKey(a)
  const pb = parseKey(b)
  if (!pa || !pb) return null
  const ms = new Date(pb.y, pb.m, pb.d) - new Date(pa.y, pa.m, pa.d)
  return Math.round(ms / 86400000)
}
