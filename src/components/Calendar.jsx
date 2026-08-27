import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import {
  toKey, parseKey, daysInMonth, firstWeekday, monthBounds,
  prettyTime, MONTHS, WEEKDAYS, WEEKDAY_NAMES,
} from '../lib/dates'
import { expand, asTask, byTime, fetchEventRows } from '../lib/events'
import { Card, Button, Input, Textarea } from '../design-kit'
import { Field } from './controls'
import DatePicker from './DatePicker'
import TimePicker from './TimePicker'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

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
  const [repeatDays, setRepeatDays] = useState([])
  const [repeatUntil, setRepeatUntil] = useState('')

  // Refetch whenever the visible month changes
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { from, to } = monthBounds(view.y, view.m)

      // Dated to-dos appear on the calendar too. Read them rather than copying
      // them in, so the to-do list stays the single source of truth.
      const [ev, td] = await Promise.all([
        fetchEventRows(from, to),
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
        setEvents(ev.rows)
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
        repeat_weekdays: repeatDays.length ? [...repeatDays].sort((a, b) => a - b) : null,
        repeat_until: repeatDays.length && repeatUntil ? repeatUntil : null,
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
      setRepeatDays([])
      setRepeatUntil('')
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
      <Card>
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

  const { from: mFrom, to: mTo } = monthBounds(view.y, view.m)
  const items = [...events.flatMap((e) => expand(e, mFrom, mTo)), ...tasks.map(asTask)]
  const byDay = {}
  for (const it of items) (byDay[it.date] ||= []).push(it)

  const dayEvents = (byDay[selected] || []).slice().sort(byTime)
  const selectedParts = parseKey(selected)
  const selectedLabel = selectedParts
    ? `${MONTHS[selectedParts.m]} ${selectedParts.d}, ${selectedParts.y}`
    : ''

  return (
    <Card>
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>}

      <div className="pa-cal2">
        <div className="pa-cal2__month">
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
                <li key={`${it.kind}-${it.id}-${it.date}`} className={`pa-event${it.done ? ' pa-event--done' : ''}`}>
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
                    {it.kind === 'event' && it.repeats && (
                      <span className="pa-event__tag">
                        repeats {it.raw.repeat_weekdays.slice().sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]).join(', ')}
                      </span>
                    )}
                  </span>
                  {it.kind === 'event' && (
                    <button
                      type="button"
                      className="pa-todo__del"
                      aria-label={it.repeats ? `Delete the whole "${it.title}" series` : `Delete "${it.title}"`}
                      title={it.repeats ? 'Deletes every occurrence in this series' : 'Delete'}
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

            <TimePicker label="Time (optional)" value={time} onChange={setTime} />

            <div style={{ flexBasis: '100%' }}>
              <Field label="Repeats (optional)">
                <div className="pa-repeat">
                  {WEEKDAYS.map((w, i) => (
                    <button
                      key={i}
                      type="button"
                      className="pa-repeat__day"
                      aria-pressed={repeatDays.includes(i)}
                      aria-label={WEEKDAY_NAMES[i]}
                      onClick={() =>
                        setRepeatDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))
                      }
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {repeatDays.length > 0 && (
              <>
                <DatePicker label="Repeat until (optional)" value={repeatUntil} onChange={setRepeatUntil} />
                <p className="pa-repeat__hint">
                  Every {repeatDays.slice().sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]).join(', ')} from{' '}
                  {selectedLabel}
                  {repeatUntil ? ' until the date above' : ' onwards'}
                </p>
              </>
            )}

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
      </div>
    </Card>
  )
}
