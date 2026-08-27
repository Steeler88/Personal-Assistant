import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import {
  toKey, parseKey, daysInMonth, firstWeekday, monthBounds,
  prettyTime, timeOptions, MONTHS, WEEKDAYS,
} from '../lib/dates'
import { Card, Button, Input, Textarea } from '../design-kit'
import { Field } from './controls'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])
const TIMES = timeOptions()

// Untimed items (all-day events, then to-dos) sort above timed ones,
// and timed items sort by clock time.
function byTime(a, b) {
  if (!a.time && !b.time) {
    if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1
    return (a.sort ?? '') < (b.sort ?? '') ? -1 : 1
  }
  if (!a.time) return -1
  if (!b.time) return 1
  return a.time < b.time ? -1 : 1
}

const asEvent = (e) => ({
  kind: 'event', id: e.id, date: e.event_date, time: e.start_time,
  title: e.title, note: e.note, sort: e.created_at, raw: e,
})

const asTask = (t) => ({
  kind: 'todo', id: t.id, date: t.due_date, time: null,
  title: t.task, note: null, done: t.done, sort: t.task, raw: t,
})

export default function Calendar({ onChange, refreshKey = 0 }) {
  const today = todayKey()
  const todayParts = parseKey(today)

  const [view, setView] = useState({ y: todayParts.y, m: todayParts.m })
  const [selected, setSelected] = useState(today)
  const [events, setEvents] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)

  // Refetch whenever the visible month changes
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { from, to } = monthBounds(view.y, view.m)

      // Dated to-dos appear on the calendar too. Read them rather than copying
      // them in, so the to-do list stays the single source of truth.
      const [ev, td] = await Promise.all([
        supabase.from('calendar_events').select('*').gte('event_date', from).lte('event_date', to),
        supabase
          .from('todos')
          .select('id,task,due_date,priority,done')
          .not('due_date', 'is', null)
          .gte('due_date', from)
          .lte('due_date', to),
      ])

      if (cancelled) return
      if (ev.error) {
        setError(MISSING_TABLE.has(ev.error.code) ? 'missing-table' : ev.error.message)
      } else {
        setError(null)
        setEvents(ev.data)
        // A missing todos table is a setup state, not a calendar failure
        setTasks(td.error ? [] : td.data)
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [view.y, view.m, refreshKey])

  function step(delta) {
    setView((v) => {
      const m = v.m + delta
      if (m < 0) return { y: v.y - 1, m: 11 }
      if (m > 11) return { y: v.y + 1, m: 0 }
      return { y: v.y, m }
    })
  }

  async function add(e) {
    e?.preventDefault()
    const text = title.trim()
    if (!text) return

    setAdding(true)
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        event_date: selected,
        start_time: time || null,
        title: text,
        note: note.trim() || null,
      })
      .select()
      .single()

    if (error) {
      setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
    } else {
      setEvents((list) => [...list, data])
      onChange?.()
      setTitle('')
      setTime('')
      setNote('')
    }
    setAdding(false)
  }

  async function remove(row) {
    const prev = events
    setEvents((list) => list.filter((x) => x.id !== row.id))
    const { error } = await supabase.from('calendar_events').delete().eq('id', row.id)
    onChange?.()
    if (error) {
      setError(error.message)
      setEvents(prev)
    }
  }

  if (error === 'missing-table') {
    return (
      <Card eyebrow="Schedule" title="Calendar">
        <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
          The <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>calendar_events</code> table
          doesn’t exist yet. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>SCHEMA-calendar.sql</code> in the
          Supabase SQL editor, then reload.
        </p>
      </Card>
    )
  }

  const total = daysInMonth(view.y, view.m)
  const offset = firstWeekday(view.y, view.m)

  const items = [...events.map(asEvent), ...tasks.map(asTask)]
  const byDay = {}
  for (const it of items) (byDay[it.date] ||= []).push(it)

  const dayEvents = (byDay[selected] || []).slice().sort(byTime)
  const selectedParts = parseKey(selected)
  const selectedLabel = selectedParts
    ? `${MONTHS[selectedParts.m]} ${selectedParts.d}, ${selectedParts.y}`
    : ''

  return (
    <Card eyebrow="Schedule" title="Calendar">
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>}

      <div className="pa-month__head">
        <button type="button" className="pa-cal__nav" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
        <span className="pa-month__title">{MONTHS[view.m]} {view.y}</span>
        <button type="button" className="pa-cal__nav" aria-label="Next month" onClick={() => step(1)}>›</button>
      </div>

      <div className="pa-month__grid">
        {WEEKDAYS.map((w, i) => <span key={i} className="pa-month__dow">{w}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`pad-${i}`} />)}
        {Array.from({ length: total }, (_, i) => i + 1).map((day) => {
          const key = toKey(view.y, view.m, day)
          const count = (byDay[key] || []).length
          return (
            <button
              key={day}
              type="button"
              className="pa-month__day"
              aria-pressed={key === selected}
              data-today={key === today ? 'true' : undefined}
              aria-label={`${MONTHS[view.m]} ${day}${count ? `, ${count} item${count > 1 ? 's' : ''}` : ''}`}
              onClick={() => setSelected(key)}
            >
              <span className="pa-month__num">{day}</span>
              <span className="pa-month__dots">
                {(byDay[key] || []).slice(0, 3).map((it, i) => (
                  <span
                    key={i}
                    className={`pa-month__dot${it.kind === 'todo' ? ' pa-month__dot--task' : ''}${it.done ? ' pa-month__dot--done' : ''}`}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="pa-day">
        <div className="pa-day__head">
          <span className="pa-day__title">{selectedLabel}</span>
          {selected === today && <span className="pa-day__today">Today</span>}
        </div>

        {loading ? (
          <p className="pa-empty">Loading…</p>
        ) : dayEvents.length === 0 ? (
          <p className="pa-empty">Nothing scheduled.</p>
        ) : (
          <ul className="pa-events">
            {dayEvents.map((it) => (
              <li key={`${it.kind}-${it.id}`} className={`pa-event${it.done ? ' pa-event--done' : ''}`}>
                <span className={`pa-event__time${it.kind === 'todo' ? ' pa-event__time--task' : ''}`}>
                  {it.kind === 'todo' ? 'Due' : prettyTime(it.time) || 'All day'}
                </span>
                <span className="pa-event__body">
                  <span className="pa-event__title">{it.title}</span>
                  {it.note && <span className="pa-event__note">{it.note}</span>}
                  {it.kind === 'todo' && (
                    <span className="pa-event__tag">
                      task{it.done ? ' · done' : ''}
                      {it.raw.priority && !it.done ? ` · ${it.raw.priority}` : ''}
                    </span>
                  )}
                </span>
                {it.kind === 'event' && (
                  <button
                    type="button"
                    className="pa-todo__del"
                    aria-label={`Delete "${it.title}"`}
                    onClick={() => remove(it.raw)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="pa-day__add" onSubmit={add}>
          <Input
            name="event-title"
            label={`Add to ${selectedLabel}`}
            placeholder="What's happening?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Field label="Time (optional)">
            <select className="pa-select" value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="">All day</option>
              {TIMES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          <div style={{ flexBasis: '100%' }}>
            <Field label="Note (optional)">
              <Textarea
                name="event-note"
                value={note}
                placeholder="Anything worth remembering"
                style={{ minHeight: 60 }}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>

          <Button type="submit" variant="primary" disabled={adding || !title.trim()}>
            {adding ? 'Adding…' : 'Add event'}
          </Button>
        </form>
      </div>
    </Card>
  )
}
