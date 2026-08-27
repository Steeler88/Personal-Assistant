import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import { Card, Button, Input, Badge } from '../design-kit'
import { Choice, Check } from './controls'
import DatePicker from './DatePicker'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

const PRIORITIES = [
  { value: 'high', label: 'High', warn: true },
  { value: 'medium', label: 'Med' },
  { value: 'low', label: 'Low' },
]

const PRIORITY_TONE = { high: 'red', medium: 'amber', low: 'neutral' }

// Open tasks first; within each group, soonest due first with undated last.
function sortTodos(rows) {
  return [...rows].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date < b.due_date ? -1 : 1
    }
    return a.created_at < b.created_at ? -1 : 1
  })
}

function dueLabel(due, done) {
  if (!due) return null
  const today = todayKey()
  if (done) return { text: due, tone: 'neutral' }
  if (due < today) return { text: 'Overdue', tone: 'red' }
  if (due === today) return { text: 'Today', tone: 'amber' }
  return { text: due, tone: 'neutral' }
}

export default function Todos() {
  const [rows, setRows] = useState([])
  const [task, setTask] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.from('todos').select('*')
      if (cancelled) return
      if (error) {
        setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
      } else {
        setRows(sortTodos(data))
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function add(e) {
    e?.preventDefault()
    const text = task.trim()
    if (!text) return

    setAdding(true)
    setError(null)
    const { data, error } = await supabase
      .from('todos')
      .insert({ task: text, due_date: due || null, priority })
      .select()
      .single()

    if (error) {
      setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
    } else {
      setRows((r) => sortTodos([...r, data]))
      setTask('')
      setDue('')
      setPriority(null)
    }
    setAdding(false)
  }

  async function toggle(row, done) {
    // Optimistic: the checkbox should feel instant, and we roll back on failure.
    setRows((r) => sortTodos(r.map((x) => (x.id === row.id ? { ...x, done } : x))))
    const { error } = await supabase.from('todos').update({ done }).eq('id', row.id)
    if (error) {
      setError(error.message)
      setRows((r) => sortTodos(r.map((x) => (x.id === row.id ? { ...x, done: !done } : x))))
    }
  }

  async function remove(row) {
    const prev = rows
    setRows((r) => r.filter((x) => x.id !== row.id))
    const { error } = await supabase.from('todos').delete().eq('id', row.id)
    if (error) {
      setError(error.message)
      setRows(prev)
    }
  }

  if (error === 'missing-table') {
    return (
      <Card eyebrow="Tasks" title="To-Do">
        <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
          The <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>todos</code> table doesn’t exist
          yet. Run <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>SCHEMA-todos.sql</code> in
          the Supabase SQL editor, then reload.
        </p>
      </Card>
    )
  }

  const open = rows.filter((r) => !r.done).length

  return (
    <Card eyebrow="Tasks" title="To-Do">
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>}

      <form className="pa-todo__add" onSubmit={add}>
        <Input
          name="task"
          label="Task"
          placeholder="What needs doing?"
          value={task}
          disabled={loading}
          onChange={(e) => setTask(e.target.value)}
        />

        <DatePicker label="Due (optional)" value={due} onChange={setDue} disabled={loading} />

        <div style={{ flex: '0 0 auto' }}>
          <Choice label="Priority (optional)" value={priority} onChange={setPriority} options={PRIORITIES} />
        </div>

        <Button type="submit" variant="primary" disabled={loading || adding || !task.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </form>

      {loading ? (
        <p className="pa-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="pa-empty">Nothing yet. Add your first task above.</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row) => {
              const badge = dueLabel(row.due_date, row.done)
              return (
                <li key={row.id} className={`pa-todo${row.done ? ' pa-todo--done' : ''}`}>
                  <Check checked={row.done} onChange={(v) => toggle(row, v)} label={`Mark "${row.task}" done`} />
                  <span className="pa-todo__task" onClick={() => toggle(row, !row.done)}>{row.task}</span>
                  {row.priority && !row.done && (
                    <Badge tone={PRIORITY_TONE[row.priority]}>
                      {PRIORITIES.find((p) => p.value === row.priority).label}
                    </Badge>
                  )}
                  {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
                  <button
                    type="button"
                    className="pa-todo__del"
                    aria-label={`Delete "${row.task}"`}
                    onClick={() => remove(row)}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', marginTop: 'var(--space-4)' }}>
            {open} open · {rows.length - open} done
          </p>
        </>
      )}
    </Card>
  )
}
