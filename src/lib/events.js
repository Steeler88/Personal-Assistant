/* Calendar item shaping and recurrence expansion.
 *
 * This lives here rather than inside Calendar.jsx because the home summary has
 * to read occurrences exactly the way the month grid does. One rule, one place:
 * a class that repeats Mon/Thu must show up in "next up" the same way it shows
 * up on the grid. */

import { supabase } from './supabase'
import { eachDay, weekdayOf } from './dates'

export const asEvent = (e, date = e.event_date) => ({
  kind: 'event', id: e.id, date, time: e.start_time,
  title: e.title, note: e.note, sort: e.created_at,
  repeats: !!e.repeat_weekdays?.length, raw: e,
})

export const asTask = (t) => ({
  kind: 'todo', id: t.id, date: t.due_date, time: null,
  title: t.task, note: null, done: t.done, sort: t.task, raw: t,
})

/** One row + its rule -> the occurrences that fall inside [from, to]. */
export function expand(e, from, to) {
  if (!e.repeat_weekdays?.length) {
    return e.event_date >= from && e.event_date <= to ? [asEvent(e)] : []
  }
  // Never start before the series does, nor run past its end date
  const start = e.event_date > from ? e.event_date : from
  const end = e.repeat_until && e.repeat_until < to ? e.repeat_until : to
  if (start > end) return []
  const wanted = new Set(e.repeat_weekdays)
  return eachDay(start, end)
    .filter((day) => wanted.has(weekdayOf(day)))
    .map((day) => asEvent(e, day))
}

/** Untimed items (all-day events, then to-dos) sort above timed ones, and
 *  timed items sort by clock time. */
export function byTime(a, b) {
  if (!a.time && !b.time) {
    if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1
    return (a.sort ?? '') < (b.sort ?? '') ? -1 : 1
  }
  if (!a.time) return -1
  if (!b.time) return 1
  return a.time < b.time ? -1 : 1
}

/* Two queries, because a series' single row lives on its START date. A plain
 * range filter drops a class begun in August the moment you look at September,
 * even though it still runs every week. */
export async function fetchEventRows(from, to) {
  const [oneOff, series] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .is('repeat_weekdays', null)
      .gte('event_date', from)
      .lte('event_date', to),
    supabase
      .from('calendar_events')
      .select('*')
      .not('repeat_weekdays', 'is', null)
      .lte('event_date', to)
      .or(`repeat_until.is.null,repeat_until.gte.${from}`),
  ])

  const error = oneOff.error || series.error
  if (error) return { rows: [], error }
  return { rows: [...oneOff.data, ...series.data], error: null }
}

/**
 * Every recurring series, regardless of the window being shown. Colour has to
 * be the same on the calendar and on the home summary, and those two read
 * different date ranges — deriving the map from whatever happened to be
 * fetched would give a class one colour on one screen and another elsewhere.
 */
export async function fetchSeries() {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id,title,created_at,repeat_weekdays')
    .not('repeat_weekdays', 'is', null)
  return { rows: error ? [] : data ?? [], error: error ?? null }
}
