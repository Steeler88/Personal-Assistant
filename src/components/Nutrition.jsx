import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import { addDays, longDateOf, prettyDate } from '../lib/dates'
import { Card, Button, Input } from '../design-kit'
import { Choice } from './controls'
import { MEALS, sortMeals, mealTotals, estimateMacros } from '../lib/meals'
import { TARGETS, dayTone, pctOf } from '../lib/targets'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

const num = (n) => (n === null || n === undefined ? '—' : Math.round(Number(n)))

/** Two weeks back from the day you're looking at, which is enough to see a shape. */
const WINDOW = 13

/** A total measured against a target it is meant to sit near. */
function Target({ label, value, target, unit, tone }) {
  return (
    <div className="pa-stat">
      <span className="pa-stat__k">{label}</span>
      <span className={`pa-stat__v${tone ? ` pa-stat__v--${tone}` : ''}`}>
        {num(value)} <span className="pa-target__of">/ {target}{unit}</span>
      </span>
      <span className="pa-stat__bar">
        <i
          className={tone === 'warn' ? 'is-warn' : tone === 'bad' ? 'is-bad' : tone === 'idle' ? 'is-idle' : ''}
          style={{ width: `${pctOf(value, target)}%` }}
        />
      </span>
    </div>
  )
}

export default function Nutrition({ onChange }) {
  const today = todayKey()
  const [date, setDate] = useState(today)

  // Every meal in the window, so the day and the fortnight come from one read
  const [rows, setRows] = useState([])
  const [meal, setMeal] = useState(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [estimatingId, setEstimatingId] = useState(null)
  const [error, setError] = useState(null)

  // Anchored to today, not to the day you're looking at. Anchoring it to the
  // selection made the list shrink as you stepped back through it, hiding the
  // days you'd just come from. It only reaches further back if you navigate
  // past its edge.
  const recent = addDays(today, -WINDOW)
  const from = date < recent ? date : recent
  const to = today

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function load() {
      const { data, error } = await supabase
        .from('meals').select('*').gte('eaten_on', from).lte('eaten_on', to)
      if (cancelled) return
      if (error) setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
      else { setError(null); setRows(data) }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [from, to])

  async function estimate(row) {
    setEstimatingId(row.id)
    setError(null)
    const { patch, error } = await estimateMacros(row)
    if (error) setError(error)
    else {
      setRows((list) => list.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))
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
      .from('meals').insert({ eaten_on: date, meal, description: text }).select().single()

    if (error) {
      setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
      setAdding(false)
      return
    }

    setRows((list) => [...list, data])
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
    if (error) { setError(error.message); setRows(prev) }
    else onChange?.()
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

  const isToday = date === today
  const dayMeals = sortMeals(rows.filter((r) => r.eaten_on === date))
  const totals = mealTotals(dayMeals)

  // Newest first, and only days you actually ate — a run of zeroes is not a record
  const byDay = {}
  for (const r of rows) (byDay[r.eaten_on] ||= []).push(r)
  const days = Object.keys(byDay).sort().reverse()

  return (
    <Card>
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>}

      <div className="pa-daynav">
        <button type="button" className="pa-cal__nav" aria-label="Previous day"
                onClick={() => setDate((d) => addDays(d, -1))}>‹</button>
        <span className="pa-daynav__label">{longDateOf(date)}</span>
        <button type="button" className="pa-cal__nav" aria-label="Next day" disabled={isToday}
                onClick={() => setDate((d) => addDays(d, 1))}>›</button>
        {isToday
          ? <span className="pa-daynav__today">Today</span>
          : <button type="button" className="pa-quick__btn" onClick={() => setDate(today)}>Today</button>}
      </div>

      <div className="pa-nutri">
        <div className="pa-nutri__day">
          <Target label="Calories" value={totals.calories} target={TARGETS.calories} unit=""
                  tone={dayTone(totals.calories, TARGETS.calories, isToday)} />
          <Target label="Protein" value={totals.protein} target={TARGETS.protein} unit="g"
                  tone={dayTone(totals.protein, TARGETS.protein, isToday)} />
          <div className="pa-stat">
            <span className="pa-stat__k">Fat / carbs</span>
            <span className="pa-stat__v">{num(totals.fat)}g · {num(totals.carbs)}g</span>
          </div>
          {totals.pending > 0 && (
            <p className="pa-mini__note pa-mini__note--dim">
              {totals.pending} not yet estimated
            </p>
          )}
          {isToday && (
            <p className="pa-mini__note pa-mini__note--dim">Still eating — judged at the end of the day</p>
          )}
        </div>

        <div className="pa-nutri__meals">
          {loading ? (
            <p className="pa-empty">Loading…</p>
          ) : dayMeals.length === 0 ? (
            <p className="pa-empty">Nothing logged{isToday ? ' today' : ' that day'}.</p>
          ) : (
            <ul className="pa-meals">
              {dayMeals.map((r) => (
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
                  <button type="button" className="pa-todo__del" aria-label={`Delete "${r.description}"`}
                          onClick={() => remove(r)}>×</button>
                </li>
              ))}
            </ul>
          )}

          <form className="pa-day__add" onSubmit={add}>
            <Input
              name="meal-description"
              label={isToday ? 'What did you eat?' : `What did you eat on ${prettyDate(date)}?`}
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
        </div>
      </div>

      {days.length > 1 && (
        <>
          <span className="pa-field__label" style={{ display: 'block', margin: 'var(--space-6) 0 var(--space-2)' }}>
            The fortnight
          </span>
          <ul className="pa-week">
            {days.map((d) => {
              const t = mealTotals(byDay[d])
              const isDay = d === date
              return (
                <li key={d}>
                  <button
                    type="button"
                    className="pa-week__row"
                    aria-current={isDay ? 'true' : undefined}
                    aria-label={`${prettyDate(d)}: ${num(t.calories)} kcal, ${num(t.protein)}g protein`}
                    onClick={() => setDate(d)}
                  >
                    <span className="pa-week__date">{prettyDate(d)}</span>
                    <span className={`pa-week__v pa-stat__v--${dayTone(t.calories, TARGETS.calories, d === today)}`}>
                      {num(t.calories)}
                    </span>
                    <span className={`pa-week__v pa-stat__v--${dayTone(t.protein, TARGETS.protein, d === today)}`}>
                      {num(t.protein)}g
                    </span>
                    <span className="pa-week__meals">{byDay[d].length} meal{byDay[d].length > 1 ? 's' : ''}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}
