// Local calendar date as YYYY-MM-DD. Deliberately not toISOString(),
// which converts to UTC and rolls the date over late at night.
export function todayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function longDate(d = new Date()) {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}
