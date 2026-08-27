import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import { prettyTime, prettyDate } from '../lib/dates'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

/**
 * Compact overview across every section. `version` bumps whenever another
 * card writes, so the strip can't sit here claiming nothing is logged
 * moments after you logged something.
 */
export default function Summary({ version = 0 }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const today = todayKey()

      const [morning, night, todos, events] = await Promise.all([
        supabase.from('morning_entries').select('entry_date').eq('entry_date', today).maybeSingle(),
        supabase.from('night_entries').select('entry_date').eq('entry_date', today).maybeSingle(),
        supabase.from('todos').select('task,due_date,done').eq('done', false),
        supabase
          .from('calendar_events')
          .select('event_date,start_time,title')
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .order('start_time', { ascending: true, nullsFirst: true })
          .limit(1),
      ])

      if (cancelled) return

      // A missing table is a setup state, not an error worth shouting about
      const anyMissing = [morning, night, todos, events].some(
        (r) => r.error && MISSING_TABLE.has(r.error.code)
      )
      if (anyMissing) {
        setData({ unavailable: true })
        return
      }

      const open = todos.data ?? []

      // Dated to-dos show on the calendar, so "next up" has to consider them
      // too, or it will happily skip past a task due sooner than any event.
      const nextEvent = events.data?.[0] ?? null
      const nextTask = open
        .filter((t) => t.due_date && t.due_date >= today)
        .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0] ?? null

      let next = null
      if (nextEvent && nextTask) {
        // Same day: the undated task sorts first, matching the calendar's order
        next = nextTask.due_date <= nextEvent.event_date
          ? { kind: 'todo', date: nextTask.due_date, title: nextTask.task }
          : { kind: 'event', date: nextEvent.event_date, time: nextEvent.start_time, title: nextEvent.title }
      } else if (nextTask) {
        next = { kind: 'todo', date: nextTask.due_date, title: nextTask.task }
      } else if (nextEvent) {
        next = { kind: 'event', date: nextEvent.event_date, time: nextEvent.start_time, title: nextEvent.title }
      }

      setData({
        morningLogged: !!morning.data,
        nightLogged: !!night.data,
        openCount: open.length,
        overdueCount: open.filter((t) => t.due_date && t.due_date < today).length,
        next,
      })
    }

    load()
    return () => { cancelled = true }
  }, [version])

  if (!data || data.unavailable) return null

  const journalText = data.morningLogged && data.nightLogged
    ? 'Both logged'
    : data.morningLogged
      ? 'Morning logged'
      : data.nightLogged
        ? 'Night logged'
        : 'Not logged yet'

  const journalDone = data.morningLogged || data.nightLogged

  return (
    <div className="pa-summary">
      <div className="pa-summary__item">
        <span className="pa-summary__label">Journal</span>
        <span className={`pa-summary__value${journalDone ? ' pa-summary__value--on' : ''}`}>
          {journalText}
        </span>
        <span className="pa-summary__sub">
          {data.morningLogged ? '● morning' : '○ morning'}{'  '}
          {data.nightLogged ? '● night' : '○ night'}
        </span>
      </div>

      <div className="pa-summary__item">
        <span className="pa-summary__label">Tasks</span>
        <span className="pa-summary__value">{data.openCount} open</span>
        <span className={`pa-summary__sub${data.overdueCount ? ' pa-summary__sub--warn' : ''}`}>
          {data.overdueCount} overdue
        </span>
      </div>

      <div className="pa-summary__item">
        <span className="pa-summary__label">Next up</span>
        {data.next ? (
          <>
            <span className="pa-summary__value">{data.next.title}</span>
            <span className="pa-summary__sub">
              {prettyDate(data.next.date)}
              {data.next.kind === 'todo'
                ? ' · task due'
                : data.next.time
                  ? ` · ${prettyTime(data.next.time)}`
                  : ' · all day'}
            </span>
          </>
        ) : (
          <>
            <span className="pa-summary__value pa-summary__value--muted">Nothing scheduled</span>
            <span className="pa-summary__sub">&nbsp;</span>
          </>
        )}
      </div>
    </div>
  )
}
