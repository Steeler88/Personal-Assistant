import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import { Card, Button, Input } from '../design-kit'
import { Choice } from './controls'
import { MEALS, sortMeals, mealTotals, estimateMacros } from '../lib/meals'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

const num = (n) => (n === null || n === undefined ? '—' : Math.round(Number(n)))

export default function Nutrition({ onChange }) {
  const date = todayKey()
  const [rows, setRows] = useState([])
  const [meal, setMeal] = useState(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [estimatingId, setEstimatingId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.from('meals').select('*').eq('eaten_on', date)
      if (cancelled) return
      if (error) setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
      else setRows(sortMeals(data))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [date])

  /** Estimate macros for a saved meal and write them back. */
  async function estimate(row) {
    setEstimatingId(row.id)
    setError(null)
    const { patch, error } = await estimateMacros(row)
    if (error) {
      setError(error)
    } else {
      setRows((list) => sortMeals(list.map((r) => (r.id === row.id ? { ...r, ...patch } : r))))
      onChange?.()
    }
    setEstimatingId(null)
  }

  async function add(e) {
    e?.preventDefault()
    const text = description.trim()
    if (!text || !meal) return

    setAdding(true)
    setError(null)

    // Save first, estimate second: a failed estimate must not lose the entry.
    const { data, error } = await supabase
      .from('meals')
      .insert({ eaten_on: date, meal, description: text })
      .select()
      .single()

    if (error) {
      setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
      setAdding(false)
      return
    }

    setRows((list) => sortMeals([...list, data]))
    setDescription('')
    setMeal(null)
    setAdding(false)
    onChange?.()
    estimate(data)
  }

  async function remove(row) {
    const prev = rows
    setRows((list) => list.filter((r) => r.id !== row.id))
    const { error } = await supabase.from('meals').delete().eq('id', row.id)
    if (error) {
      setError(error.message)
      setRows(prev)
    } else onChange?.()
  }

  if (error === 'missing-table') {
    return (
      <Card>
        <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
          The <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>meals</code> table doesn’t exist
          yet. Run <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>SCHEMA-nutrition.sql</code>{' '}
          in the Supabase SQL editor, then reload.
        </p>
      </Card>
    )
  }

  const totals = mealTotals(rows)
  const pending = totals.pending

  return (
    <Card>
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>}

      {rows.length > 0 && (
        <div className="pa-totals">
          <span className="pa-totals__cell">
            <span className="pa-totals__v">{num(totals.calories)}</span>
            <span className="pa-totals__k">kcal</span>
          </span>
          <span className="pa-totals__cell">
            <span className="pa-totals__v">{num(totals.protein)}g</span>
            <span className="pa-totals__k">protein</span>
          </span>
          <span className="pa-totals__cell">
            <span className="pa-totals__v">{num(totals.fat)}g</span>
            <span className="pa-totals__k">fat</span>
          </span>
          <span className="pa-totals__cell">
            <span className="pa-totals__v">{num(totals.carbs)}g</span>
            <span className="pa-totals__k">carbs</span>
          </span>
          {pending > 0 && (
            <span className="pa-totals__pending">{pending} not yet estimated</span>
          )}
        </div>
      )}

      {loading ? (
        <p className="pa-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="pa-empty">Nothing logged today.</p>
      ) : (
        <ul className="pa-meals">
          {rows.map((r) => (
            <li key={r.id} className="pa-meal">
              <span className="pa-meal__type">{r.meal}</span>
              <span className="pa-meal__body">
                <span className="pa-meal__desc">{r.description}</span>
                {r.estimated_at ? (
                  <>
                    <span className="pa-meal__macros">
                      {num(r.calories)} kcal · {num(r.protein_g)}p · {num(r.fat_g)}f · {num(r.carbs_g)}c
                    </span>
                    {r.estimate_note && <span className="pa-meal__note">{r.estimate_note}</span>}
                  </>
                ) : estimatingId === r.id ? (
                  <span className="pa-meal__macros">Estimating…</span>
                ) : (
                  <button type="button" className="pa-brief__link" onClick={() => estimate(r)}>
                    Estimate macros
                  </button>
                )}
              </span>
              <button
                type="button"
                className="pa-todo__del"
                aria-label={`Delete "${r.description}"`}
                onClick={() => remove(r)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="pa-day__add" onSubmit={add}>
        <Input
          name="meal-description"
          label="What did you eat?"
          placeholder="Ribeye, three eggs, butter"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div style={{ flexBasis: '100%' }}>
          <Choice label="Meal" value={meal} onChange={setMeal} options={MEALS} />
        </div>
        <Button type="submit" variant="primary" disabled={adding || !description.trim() || !meal}>
          {adding ? 'Saving…' : 'Log meal'}
        </Button>
        <span className="pa-brief__note">macros estimated automatically</span>
      </form>
    </Card>
  )
}
