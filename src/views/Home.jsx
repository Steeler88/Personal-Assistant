/* The home screen: every section at a glance, plus the handful of actions
 * worth doing without leaving it — tick a task, log a meal, open the journal.
 * Anything more involved lives on that section's own screen. */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadHome } from '../lib/home'
import { go } from '../lib/router'
import { prettyDate, prettyTime, timeOfDay } from '../lib/dates'
import { MEALS, mealForNow, sortMeals, mealTotals, estimateMacros } from '../lib/meals'
import { recoveryTone, freshness, sleepTone } from '../lib/whoop'
import { Check } from '../components/controls'
import Spark from '../components/Spark'

const num = (n) => (n === null || n === undefined ? '—' : Math.round(Number(n)))
const money = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2))
const pct = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(2)}%`)

function hhmm(mins) {
  if (mins === null || mins === undefined) return '—'
  const m = Math.round(Number(mins))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/* Colour carries state in this design, so a 1-10 score has to be read, not just
   measured. Soreness runs the other way — a 2 is a good morning, not a bad one. */
const scoreTone = (v) =>
  v === null || v === undefined ? 'idle' : v >= 7 ? 'ok' : v >= 4 ? 'warn' : 'bad'
const inverseTone = (v) =>
  v === null || v === undefined ? 'idle' : v <= 3 ? 'ok' : v <= 6 ? 'warn' : 'bad'

function Panel({ name, meta, to, state = 'idle', wide, children }) {
  const cls = [
    'pa-panel',
    state !== 'idle' ? `pa-panel--${state}` : '',
    wide ? 'pa-home__wide' : '',
  ].filter(Boolean).join(' ')

  return (
    <section className={cls}>
      <header className="pa-panel__head">
        <span className="pa-panel__name">{name}</span>
        {to ? (
          <button type="button" className="pa-panel__link" onClick={() => go(to)}>
            {meta ? `${meta} ` : ''}{'›'}
          </button>
        ) : meta ? (
          <span>{meta}</span>
        ) : null}
      </header>
      <div className="pa-panel__body">{children}</div>
    </section>
  )
}

function Stat({ k, v, tone, bar }) {
  return (
    <div className="pa-stat">
      <span className="pa-stat__k">{k}</span>
      <span className={`pa-stat__v${tone ? ` pa-stat__v--${tone}` : ''}`}>{v}</span>
      {bar !== null && bar !== undefined && (
        <span className="pa-stat__bar">
          <i
            className={tone === 'warn' ? 'is-warn' : tone === 'bad' ? 'is-bad' : ''}
            style={{ width: `${Math.max(0, Math.min(100, Number(bar)))}%` }}
          />
        </span>
      )}
    </div>
  )
}

/* The panels the home screen carries, in the order it reads them. The loaded
   view writes each one out by hand — they differ too much to generate — so this
   list exists only for the waiting state. Add a panel there, add it here. */
const PANELS = [
  { name: 'Schedule', to: 'calendar' },
  { name: 'Tasks', to: 'todos' },
  { name: 'Recovery', to: 'whoop' },
  { name: 'Nutrition', to: 'nutrition' },
  { name: 'Journal', to: 'journal' },
  { name: 'Market', to: 'market', wide: true },
]

/* An instrument whose panel disappears while it reads is a broken instrument.
   The frame is there from the first paint; only the needles are pending. */
function Waiting() {
  return (
    <>
      <div className="pa-readout">
        {['Journal', 'Tasks', 'Recovery', 'Next up'].map((k) => (
          <div className="pa-readout__cell" key={k}>
            <span className="pa-readout__k">{k}</span>
            <span className="pa-readout__v pa-readout__v--idle">—</span>
            <span className="pa-readout__s">reading…</span>
          </div>
        ))}
      </div>
      <div className="pa-home">
        {PANELS.map((p) => (
          <Panel key={p.name} name={p.name} to={p.to} wide={p.wide}>
            <p className="pa-mini__note pa-mini__note--dim">reading…</p>
          </Panel>
        ))}
      </div>
    </>
  )
}

/* Last good readout, kept for the life of the page. Coming back from a section
   should show yesterday's-second-ago numbers immediately and correct them a
   moment later, not blank the screen and start again. */
let snapshot = null

const Setup = ({ file }) => (
  <p className="pa-mini__note">
    Not set up yet. Run <code>{file}</code> in the Supabase SQL editor.
  </p>
)

/* Ticking a task off has to move it everywhere it appears, or the agenda keeps
   showing as outstanding something the list already calls done. */
function applyTaskDone(d, id, done) {
  const patchItems = (items) =>
    items.map((it) =>
      it.kind === 'todo' && it.id === id ? { ...it, done, raw: { ...it.raw, done } } : it
    )
  return {
    ...d,
    tasks: { all: d.tasks.all.map((t) => (t.id === id ? { ...t, done } : t)) },
    schedule: {
      ...d.schedule,
      today: patchItems(d.schedule.today),
      upcoming: patchItems(d.schedule.upcoming),
    },
  }
}

const withMeals = (d, meals) => ({ ...d, nutrition: { meals, totals: mealTotals(meals) } })

export default function Home() {
  const [data, setData] = useState(snapshot)
  const [error, setError] = useState(null)

  const [newTask, setNewTask] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  const [mealText, setMealText] = useState('')
  const [mealKind, setMealKind] = useState(mealForNow)
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadHome()
      .then((d) => { snapshot = d; if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)) })
    return () => { cancelled = true }
  }, [])

  async function toggleTask(row, done) {
    // Optimistic: a checkbox that waits on the network doesn't feel like a checkbox
    setData((d) => applyTaskDone(d, row.id, done))
    const { error } = await supabase.from('todos').update({ done }).eq('id', row.id)
    if (error) {
      setError(error.message)
      setData((d) => applyTaskDone(d, row.id, !done))
    }
  }

  async function addTask(e) {
    e.preventDefault()
    const text = newTask.trim()
    if (!text) return

    setAddingTask(true)
    setError(null)
    const { data: row, error } = await supabase
      .from('todos').insert({ task: text }).select().single()

    if (error) setError(error.message)
    else {
      setData((d) => ({ ...d, tasks: { all: [...d.tasks.all, row] } }))
      setNewTask('')
    }
    setAddingTask(false)
  }

  async function logMeal(e) {
    e.preventDefault()
    const text = mealText.trim()
    if (!text) return

    setLogging(true)
    setError(null)

    // Save first, estimate second: a failed estimate must not lose the entry.
    const { data: row, error } = await supabase
      .from('meals')
      .insert({ eaten_on: data.today, meal: mealKind, description: text })
      .select().single()

    if (error) {
      setError(error.message)
      setLogging(false)
      return
    }

    setData((d) => withMeals(d, sortMeals([...d.nutrition.meals, row])))
    setMealText('')
    setLogging(false)

    const { patch, error: estError } = await estimateMacros(row)
    if (estError) setError(estError)
    else setData((d) => withMeals(d, d.nutrition.meals.map((m) => (m.id === row.id ? { ...m, ...patch } : m))))
  }

  if (error && !data) return <p className="pa-empty">{error}</p>
  if (!data) return <Waiting />

  const { missing, journal, schedule, nutrition, whoop, briefing, today } = data

  const open = data.tasks.all.filter((t) => !t.done)
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length
  const morningLogged = !!journal.morning
  const nightLogged = !!journal.night

  const journalText = morningLogged && nightLogged
    ? 'Both logged'
    : morningLogged ? 'Morning logged'
    : nightLogged ? 'Night logged'
    : 'Not logged'

  const latestRecovery = whoop.recovery[0] ?? null
  const latestSleep = whoop.sleep[0] ?? null
  const latestStrain = whoop.cycles?.[0] ?? null
  const recTone = recoveryTone(latestRecovery?.recovery_score)
  const fresh = freshness(latestSleep?.night_of, today)

  const next = schedule.next
  const totals = nutrition.totals

  return (
    <>
      {error && <p className="pa-mini__note" style={{ color: 'var(--red)' }}>{error}</p>}

      <div className="pa-readout">
        <div className="pa-readout__cell">
          <span className="pa-readout__k">Journal</span>
          <span className={`pa-readout__v${morningLogged || nightLogged ? ' pa-readout__v--ok' : ' pa-readout__v--idle'}`}>
            {journalText}
          </span>
          <span className="pa-readout__s">
            {morningLogged ? '●' : '○'} morning &nbsp; {nightLogged ? '●' : '○'} night
          </span>
        </div>

        <div className="pa-readout__cell">
          <span className="pa-readout__k">Tasks</span>
          <span className="pa-readout__v">{open.length} open</span>
          <span className={`pa-readout__s${overdue ? ' pa-readout__v--warn' : ''}`}>
            {overdue} overdue
          </span>
        </div>

        <div className="pa-readout__cell">
          <span className="pa-readout__k">Recovery</span>
          <span className={`pa-readout__v pa-readout__v--${recTone}`}>
            {latestRecovery ? `${num(latestRecovery.recovery_score)}%` : '—'}
          </span>
          <span className="pa-readout__s">
            {latestSleep ? `${hhmm(latestSleep.total_sleep_min)} slept` : 'no sync yet'}
          </span>
        </div>

        <div className="pa-readout__cell">
          <span className="pa-readout__k">Next up</span>
          <span className={`pa-readout__v${next ? '' : ' pa-readout__v--idle'}`}>
            {next ? next.title : 'Nothing scheduled'}
          </span>
          <span className="pa-readout__s">
            {next
              ? `${prettyDate(next.date)} · ${next.kind === 'todo' ? 'task due' : prettyTime(next.time) ?? 'all day'}`
              : `${timeOfDay()} · nothing on`}
          </span>
        </div>
      </div>

      <div className="pa-home">
        {/* ---------------- Schedule ---------------- */}
        <Panel name="Schedule" to="calendar" meta={prettyDate(today)}>
          {missing.calendar ? (
            <Setup file="SCHEMA-calendar.sql" />
          ) : schedule.today.length === 0 && schedule.upcoming.length === 0 ? (
            <p className="pa-mini__note">Nothing scheduled in the next two weeks.</p>
          ) : (
            <ul className="pa-mini">
              {(schedule.today.length ? schedule.today : schedule.upcoming.slice(0, 5)).map((it) => (
                <li key={`${it.kind}-${it.id}-${it.date}`} className="pa-mini__row">
                  <span className={`pa-mini__when${it.kind === 'todo' ? ' pa-mini__when--task' : ''}`}>
                    {it.kind === 'todo' ? 'Due' : prettyTime(it.time) ?? 'All day'}
                  </span>
                  <span className="pa-mini__title">{it.title}</span>
                  {schedule.today.length === 0 && (
                    <span className="pa-mini__tag">{prettyDate(it.date)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ---------------- Tasks ---------------- */}
        <Panel
          name="Tasks"
          to="todos"
          meta={`${open.length} open`}
          state={overdue ? 'bad' : open.length ? 'warn' : 'ok'}
        >
          {missing.todos ? (
            <Setup file="SCHEMA-todos.sql" />
          ) : open.length === 0 ? (
            <p className="pa-mini__note">Nothing outstanding.</p>
          ) : (
            <ul className="pa-mini">
              {open.slice(0, 6).map((t) => (
                <li key={t.id} className="pa-mini__row pa-mini__row--task">
                  <Check checked={!!t.done} onChange={(v) => toggleTask(t, v)} label={`Mark "${t.task}" done`} />
                  <span className="pa-mini__task" onClick={() => toggleTask(t, true)}>{t.task}</span>
                  {t.due_date && (
                    <span className={`pa-mini__tag${t.due_date < today ? ' pa-mini__tag--overdue' : ''}`}>
                      {t.due_date < today ? 'overdue' : prettyDate(t.due_date)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!missing.todos && (
            <form className="pa-quick" onSubmit={addTask}>
              <input
                className="pa-quick__input"
                placeholder="Add a task"
                aria-label="Add a task"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />
              <button className="pa-quick__btn" type="submit" disabled={addingTask || !newTask.trim()}>
                {addingTask ? '…' : 'Add'}
              </button>
            </form>
          )}
        </Panel>

        {/* ---------------- Recovery ---------------- */}
        <Panel
          name="Recovery"
          to="whoop"
          meta={fresh.label}
          /* Stale data makes the recovery number stale too, so lateness outranks
             it: an 89% from four days ago should not read as a green morning. */
          state={fresh.tone === 'ok' ? recTone : fresh.tone}
        >
          {missing.whoop ? (
            <Setup file="SCHEMA-whoop.sql" />
          ) : !latestRecovery && !latestSleep ? (
            <p className="pa-mini__note">No Whoop data yet. Connect and sync on the recovery screen.</p>
          ) : (
            <>
              {latestRecovery && (
                <Stat
                  k="Recovery"
                  v={`${num(latestRecovery.recovery_score)}%`}
                  tone={recTone}
                  bar={latestRecovery.recovery_score}
                />
              )}
              {latestSleep && (
                <Stat
                  k="Slept"
                  v={latestSleep.sleep_needed_min
                    ? `${hhmm(latestSleep.total_sleep_min)} / ${hhmm(latestSleep.sleep_needed_min)}`
                    : hhmm(latestSleep.total_sleep_min)}
                  tone={sleepTone(latestSleep.total_sleep_min, latestSleep.sleep_needed_min)}
                  bar={latestSleep.sleep_needed_min
                    ? (latestSleep.total_sleep_min / latestSleep.sleep_needed_min) * 100
                    : latestSleep.performance_pct}
                />
              )}
              {/* Strain is a magnitude, not a verdict — there is no good or bad
                  14.2 — so it gets a neutral bar and no banding. */}
              {latestStrain?.strain !== null && latestStrain?.strain !== undefined && (
                <Stat
                  k="Strain"
                  v={Number(latestStrain.strain).toFixed(1)}
                  tone="idle"
                  bar={(Number(latestStrain.strain) / 21) * 100}
                />
              )}
              {latestRecovery && (
                <>
                  <Stat k="HRV" v={`${num(latestRecovery.hrv_ms)} ms`} />
                  <Stat k="Resting HR" v={`${num(latestRecovery.rhr_bpm)} bpm`} />
                </>
              )}
              {fresh.tone !== 'ok' && (
                <p className="pa-mini__note pa-mini__note--dim">Sync on the recovery screen to catch up.</p>
              )}
            </>
          )}
        </Panel>

        {/* ---------------- Nutrition ---------------- */}
        <Panel
          name="Nutrition"
          to="nutrition"
          meta={nutrition.meals.length ? `${nutrition.meals.length} logged` : null}
          state={nutrition.meals.length ? 'ok' : 'idle'}
        >
          {missing.nutrition ? (
            <Setup file="SCHEMA-nutrition.sql" />
          ) : (
            <>
              <div className="pa-macros">
                <div className="pa-macro pa-macro--lead">
                  <span className="pa-macro__v">{num(totals.calories)}</span>
                  <span className="pa-macro__k">kcal</span>
                </div>
                <div className="pa-macro pa-macro--lead">
                  <span className="pa-macro__v">{num(totals.protein)}</span>
                  <span className="pa-macro__k">prot g</span>
                </div>
                <div className="pa-macro">
                  <span className="pa-macro__v">{num(totals.fat)}</span>
                  <span className="pa-macro__k">fat g</span>
                </div>
                <div className="pa-macro">
                  <span className="pa-macro__v">{num(totals.carbs)}</span>
                  <span className="pa-macro__k">carb g</span>
                </div>
              </div>

              {totals.pending > 0 && (
                <p className="pa-mini__note" style={{ fontSize: 'var(--text-xs)' }}>
                  {totals.pending} meal{totals.pending > 1 ? 's' : ''} not yet estimated
                </p>
              )}

              {nutrition.meals.length > 0 && (
                <ul className="pa-mini">
                  {nutrition.meals.map((m) => (
                    <li key={m.id} className="pa-mini__row">
                      <span className="pa-mini__when">{m.meal}</span>
                      <span className="pa-mini__title">{m.description}</span>
                    </li>
                  ))}
                </ul>
              )}

              <form className="pa-quick" onSubmit={logMeal}>
                <input
                  className="pa-quick__input"
                  placeholder="Log a meal"
                  aria-label="Log a meal"
                  value={mealText}
                  onChange={(e) => setMealText(e.target.value)}
                />
                <select
                  className="pa-quick__select"
                  aria-label="Which meal"
                  value={mealKind}
                  onChange={(e) => setMealKind(e.target.value)}
                >
                  {MEALS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <button className="pa-quick__btn" type="submit" disabled={logging || !mealText.trim()}>
                  {logging ? '…' : 'Log'}
                </button>
              </form>
            </>
          )}
        </Panel>

        {/* ---------------- Journal ---------------- */}
        <Panel
          name="Journal"
          to="journal"
          meta={timeOfDay()}
          state={morningLogged || nightLogged ? 'ok' : 'idle'}
        >
          {missing.journal ? (
            <Setup file="SCHEMA-journal.sql" />
          ) : (
            <>
              <Stat
                k="Morning"
                v={morningLogged ? 'Logged' : 'Open'}
                tone={morningLogged ? 'ok' : 'idle'}
              />
              {morningLogged && (
                <>
                  <Stat
                    k="Sleep quality"
                    v={`${journal.morning.sleep_quality ?? '—'} / 10`}
                    tone={scoreTone(journal.morning.sleep_quality)}
                    bar={(journal.morning.sleep_quality ?? 0) * 10}
                  />
                  <Stat
                    k="Soreness"
                    v={`${journal.morning.soreness ?? '—'} / 10`}
                    tone={inverseTone(journal.morning.soreness)}
                    bar={(journal.morning.soreness ?? 0) * 10}
                  />
                </>
              )}
              <Stat
                k="Night"
                v={nightLogged ? 'Logged' : 'Open'}
                tone={nightLogged ? 'ok' : 'idle'}
              />
              {nightLogged && (
                <Stat
                  k="Productivity"
                  v={`${journal.night.productivity ?? '—'} / 10`}
                  tone={scoreTone(journal.night.productivity)}
                  bar={(journal.night.productivity ?? 0) * 10}
                />
              )}

              {(journal.morning?.notes || journal.night?.notes) && (
                <p className="pa-mini__note">{journal.night?.notes || journal.morning?.notes}</p>
              )}

              <div className="pa-quick">
                <button type="button" className="pa-quick__btn" style={{ flex: 1 }} onClick={() => go('journal')}>
                  {morningLogged && nightLogged ? 'Open journal' : `Log ${morningLogged ? 'night' : timeOfDay() === 'morning' ? 'morning' : 'night'}`}
                </button>
              </div>
            </>
          )}
        </Panel>

        {/* ---------------- Market ---------------- */}
        <Panel
          name="Market"
          to="market"
          meta={briefing ? prettyDate(briefing.briefing_date) : null}
          wide
        >
          {missing.market ? (
            <Setup file="SCHEMA-market.sql" />
          ) : !briefing ? (
            <p className="pa-mini__note">No briefing yet. Generate one on the market screen.</p>
          ) : (
            <>
              <div className="pa-market">
                {briefing.insight && <p className="pa-mini__note">{briefing.insight}</p>}
                <ul className="pa-mini">
                  {(briefing.quotes ?? []).map((q) => {
                    const up = (q.change_p ?? 0) >= 0
                    return (
                      <li key={q.symbol} className="pa-mini__row">
                        <span className="pa-mini__when">{q.symbol}</span>
                        <Spark points={q.spark} up={up} />
                        <span className="pa-mini__title pa-mini__num">
                          {money(q.live?.price ?? q.close)}
                        </span>
                        <span className={`pa-mini__tag${up ? ' pa-mini__tag--up' : ' pa-mini__tag--down'}`}>
                          {pct(q.change_p)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          )}
        </Panel>
      </div>
    </>
  )
}
