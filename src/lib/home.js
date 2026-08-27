/* Everything the home screen reads, in one round trip.
 *
 * Home is a summary of six sections at once. Letting each panel fetch for
 * itself would mean seven waterfalls and seven loading states on the screen
 * you look at most; one loader means the readout appears all at once or not
 * at all. */

import { supabase } from './supabase'
import { todayKey } from './today'
import { addDays, clock } from './dates'
import { fetchEventRows, expand, asTask, byTime } from './events'
import { sortMeals, mealTotals } from './meals'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

/** A table that hasn't been created yet is a setup state, not a failure. */
const gone = (r) => !!(r?.error && MISSING_TABLE.has(r.error.code))
const rowsOf = (r) => (r?.error ? [] : r.data ?? [])

/** Two weeks is enough to answer "what's next" without paging the whole year. */
const HORIZON_DAYS = 13

export async function loadHome() {
  const today = todayKey()
  const horizon = addDays(today, HORIZON_DAYS)

  const [morning, night, todos, meals, sleep, recovery, cycles, briefing, events] = await Promise.all([
    supabase.from('morning_entries').select('*').eq('entry_date', today).maybeSingle(),
    supabase.from('night_entries').select('*').eq('entry_date', today).maybeSingle(),
    supabase.from('todos').select('*'),
    supabase.from('meals').select('*').eq('eaten_on', today),
    // Named columns rather than *: whoop_sleep.raw is a whole API response per
    // night, and the home screen has no use for it.
    supabase.from('whoop_sleep')
      .select('id,night_of,total_sleep_min,sleep_needed_min,performance_pct')
      .order('night_of', { ascending: false }).limit(7),
    supabase.from('whoop_recovery')
      .select('cycle_id,recorded_on,recovery_score,hrv_ms,rhr_bpm')
      .order('recorded_on', { ascending: false }).limit(7),
    supabase.from('whoop_cycles')
      .select('id,recorded_on,strain')
      .order('recorded_on', { ascending: false }).limit(7),
    supabase.from('market_briefings').select('*').order('briefing_date', { ascending: false })
      .limit(1).maybeSingle(),
    fetchEventRows(today, horizon),
  ])

  const missing = {
    journal: gone(morning) || gone(night),
    todos: gone(todos),
    nutrition: gone(meals),
    whoop: gone(sleep) || gone(recovery),
    // Strain arrived later than the rest of Whoop, so its table can be absent
    // while sleep and recovery are fine.
    strain: gone(cycles),
    market: gone(briefing),
    calendar: gone(events),
  }

  const taskRows = rowsOf(todos)
  const open = taskRows.filter((t) => !t.done)

  // Dated to-dos belong on the schedule the same way they do on the calendar —
  // read them here rather than duplicating them, so the list stays the source
  // of truth for whether a task is done.
  const dated = open.filter((t) => t.due_date && t.due_date >= today && t.due_date <= horizon)

  const items = [
    ...events.rows.flatMap((e) => expand(e, today, horizon)),
    ...dated.map(asTask),
  ]

  const byDay = {}
  for (const it of items) (byDay[it.date] ||= []).push(it)
  for (const key of Object.keys(byDay)) byDay[key].sort(byTime)

  const now = clock()
  const todayItems = byDay[today] ?? []

  // "Next up" must not point at this morning's 8am lift at 9pm. An untimed item
  // stays eligible all day — there's no clock to have passed.
  const upcoming = Object.keys(byDay)
    .sort()
    .flatMap((day) => byDay[day])
    .filter((it) => it.date > today || !it.time || it.time >= now)

  const mealRows = sortMeals(rowsOf(meals))

  return {
    today,
    missing,
    journal: { morning: morning.error ? null : morning.data, night: night.error ? null : night.data },
    // Counts are derived on the home screen instead of here: ticking a task off
    // has to move them, and a number computed once at load can't.
    tasks: { all: taskRows },
    schedule: { today: todayItems, upcoming, next: upcoming[0] ?? null },
    nutrition: { meals: mealRows, totals: mealTotals(mealRows) },
    whoop: { sleep: rowsOf(sleep), recovery: rowsOf(recovery), cycles: rowsOf(cycles) },
    briefing: briefing.error ? null : briefing.data,
  }
}
