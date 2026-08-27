import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/today'
import { Card, Button, Textarea, Badge } from '../design-kit'
import { Scale, Choice, Field } from './controls'

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

const EMPTY_MORNING = { sleep_quality: null, soreness: null, notes: '' }
const EMPTY_NIGHT = {
  productivity: null,
  finances: null,
  nutrition_ok: null,
  nutrition_issue: '',
  fitness_ok: null,
  fitness_issue: '',
  social: null,
  notes: '',
}

const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : null)
const yesNo = (v) => (v === null || v === undefined ? null : v ? 'Yes' : 'No')

function morningRecap(v) {
  return [
    ['Sleep quality', v.sleep_quality],
    ['Soreness', v.soreness],
    ['Notes', v.notes],
  ]
}

function nightRecap(v) {
  const rows = [
    ['Productivity', v.productivity],
    ['Finances', cap(v.finances)],
    ['Stuck to carnivore', yesNo(v.nutrition_ok)],
  ]
  if (v.nutrition_ok === false) rows.push(['What went wrong', v.nutrition_issue])
  rows.push(['Worked out', yesNo(v.fitness_ok)])
  if (v.fitness_ok === false) rows.push(['What went wrong', v.fitness_issue])
  rows.push(['Social life', v.social])
  rows.push(['Notes', v.notes])
  return rows
}

function Recap({ rows, onEdit }) {
  return (
    <div className="pa-recap">
      <dl className="pa-recap__list">
        {rows.map(([label, value], i) => (
          <div className="pa-recap__row" key={i}>
            <dt className="pa-recap__label">{label}</dt>
            <dd className={`pa-recap__value${value === null || value === undefined || value === '' ? ' pa-recap__value--empty' : ''}`}>
              {value === null || value === undefined || value === '' ? '—' : value}
            </dd>
          </div>
        ))}
      </dl>
      <Button variant="ghost" onClick={onEdit}>Edit</Button>
    </div>
  )
}

// Compare only the fields we own, so server columns (timestamps) don't read as edits
const same = (a, b) => Object.keys(a).every((k) => (a[k] ?? '') === (b[k] ?? ''))

export default function JournalToday({ onChange }) {
  const date = todayKey()

  // Default to whichever half you're actually likely to fill in right now.
  // Both stay reachable via the toggle; only one renders at a time.
  const [section, setSection] = useState(() => (new Date().getHours() >= 17 ? 'night' : 'morning'))

  const [morning, setMorning] = useState(EMPTY_MORNING)
  const [night, setNight] = useState(EMPTY_NIGHT)
  const [savedMorning, setSavedMorning] = useState(EMPTY_MORNING)
  const [savedNight, setSavedNight] = useState(EMPTY_NIGHT)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [editing, setEditing] = useState({ morning: false, night: false })
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [m, n] = await Promise.all([
        supabase.from('morning_entries').select('*').eq('entry_date', date).maybeSingle(),
        supabase.from('night_entries').select('*').eq('entry_date', date).maybeSingle(),
      ])

      if (cancelled) return

      const err = m.error || n.error
      if (err) {
        setError(MISSING_TABLE.has(err.code) ? 'missing-table' : err.message)
        setLoading(false)
        return
      }

      // Keep only our own keys; drop entry_date/created_at/updated_at
      const pick = (row, shape) => {
        if (!row) return shape
        const out = { ...shape }
        for (const k of Object.keys(shape)) out[k] = row[k] ?? shape[k]
        return out
      }

      const mv = pick(m.data, EMPTY_MORNING)
      const nv = pick(n.data, EMPTY_NIGHT)
      setMorning(mv)
      setSavedMorning(mv)
      setNight(nv)
      setSavedNight(nv)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [date])

  async function save(which) {
    setSaving(which)
    setError(null)

    const table = which === 'morning' ? 'morning_entries' : 'night_entries'
    const values = which === 'morning' ? morning : night

    // Blank out follow-ups that no longer apply, so a stale "what went wrong"
    // can't survive after the answer flips back to yes
    const payload = { ...values, entry_date: date }
    if (which === 'night') {
      if (payload.nutrition_ok !== false) payload.nutrition_issue = ''
      if (payload.fitness_ok !== false) payload.fitness_issue = ''
    }

    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'entry_date' })

    if (error) {
      setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
    } else if (which === 'morning') {
      setMorning(payload)
      setSavedMorning(payload)
      setEditing((e) => ({ ...e, morning: false }))
      onChange?.()
    } else {
      setNight(payload)
      setSavedNight(payload)
      setEditing((e) => ({ ...e, night: false }))
      onChange?.()
    }
    setSaving(null)
  }

  function cancelEdit(which) {
    // Drop anything typed since the last save, then collapse
    if (which === 'morning') setMorning(savedMorning)
    else setNight(savedNight)
    setEditing((e) => ({ ...e, [which]: false }))
  }

  if (error === 'missing-table') {
    return (
      <Card>
        <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
          The journal tables don’t exist yet. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>SCHEMA-journal.sql</code> in the
          Supabase SQL editor, then reload.
        </p>
      </Card>
    )
  }

  const morningChanged = !same(morning, savedMorning)
  const nightChanged = !same(night, savedNight)
  const morningSaved = !same(EMPTY_MORNING, savedMorning)
  const nightSaved = !same(EMPTY_NIGHT, savedNight)

  // Collapse to a recap once saved, unless you've asked to edit it
  const showMorningForm = !morningSaved || editing.morning
  const showNightForm = !nightSaved || editing.night

  const set = (setter) => (key) => (val) => setter((s) => ({ ...s, [key]: val }))
  const setM = set(setMorning)
  const setN = set(setNight)

  return (
    <Card>
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>}

      <div className="pa-tabs" role="tablist" aria-label="Journal section">
        {[
          { key: 'morning', label: 'Morning', saved: morningSaved, dirty: morningChanged },
          { key: 'night', label: 'Night', saved: nightSaved, dirty: nightChanged },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={section === t.key}
            className="pa-tabs__btn"
            onClick={() => setSection(t.key)}
          >
            {t.label}
            {t.dirty && <span className="pa-tabs__dot pa-tabs__dot--warn" aria-label="unsaved" />}
            {!t.dirty && t.saved && <span className="pa-tabs__dot" aria-label="saved" />}
          </button>
        ))}
      </div>

      {/* ---------------- Morning ---------------- */}
      <section className="pa-section" hidden={section !== 'morning'}>
        <div className="pa-section__head">
          {morningSaved && !morningChanged && <Badge tone="accent" dot>Saved</Badge>}
          {morningChanged && <Badge tone="amber" dot>Unsaved</Badge>}
        </div>

        {!showMorningForm && (
          <Recap rows={morningRecap(savedMorning)} onEdit={() => setEditing((e) => ({ ...e, morning: true }))} />
        )}

        <div className="pa-fields" hidden={!showMorningForm}>
          <Scale label="Sleep quality" value={morning.sleep_quality} onChange={setM('sleep_quality')} />
          <Scale label="Soreness" value={morning.soreness} onChange={setM('soreness')} />

          <Field label="Notes (optional)">
            <Textarea
              name="morning-notes"
              value={morning.notes}
              placeholder={loading ? 'Loading…' : 'Anything a number doesn’t capture'}
              disabled={loading}
              onChange={(e) => setM('notes')(e.target.value)}
            />
          </Field>

          <div className="pa-actions">
            <Button variant="ghost" disabled={loading || !morningChanged || saving === 'morning'}
              onClick={() => save('morning')}>
              {saving === 'morning' ? 'Saving…' : 'Save morning'}
            </Button>
            {morningSaved && editing.morning && (
              <Button variant="link" onClick={() => cancelEdit('morning')}>Cancel</Button>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Night ---------------- */}
      <section className="pa-section" hidden={section !== 'night'}>
        <div className="pa-section__head">
          {nightSaved && !nightChanged && <Badge tone="accent" dot>Saved</Badge>}
          {nightChanged && <Badge tone="amber" dot>Unsaved</Badge>}
        </div>

        {!showNightForm && (
          <Recap rows={nightRecap(savedNight)} onEdit={() => setEditing((e) => ({ ...e, night: true }))} />
        )}

        <div className="pa-fields" hidden={!showNightForm}>
          <Scale label="Productivity" value={night.productivity} onChange={setN('productivity')} />

          <Choice
            label="Finances"
            value={night.finances}
            onChange={setN('finances')}
            options={[
              { value: 'positive', label: 'Positive' },
              { value: 'negative', label: 'Negative', warn: true },
            ]}
          />

          <Choice
            label="Stuck to carnivore"
            value={night.nutrition_ok}
            onChange={setN('nutrition_ok')}
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No', warn: true },
            ]}
          />
          {night.nutrition_ok === false && (
            <Field label="What went wrong?">
              <Textarea
                name="nutrition-issue"
                value={night.nutrition_issue}
                onChange={(e) => setN('nutrition_issue')(e.target.value)}
              />
            </Field>
          )}

          <Choice
            label="Worked out"
            value={night.fitness_ok}
            onChange={setN('fitness_ok')}
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No', warn: true },
            ]}
          />
          {night.fitness_ok === false && (
            <Field label="What went wrong?">
              <Textarea
                name="fitness-issue"
                value={night.fitness_issue}
                onChange={(e) => setN('fitness_issue')(e.target.value)}
              />
            </Field>
          )}

          <Scale label="Social life" value={night.social} onChange={setN('social')} />

          <Field label="Notes (optional)">
            <Textarea
              name="night-notes"
              value={night.notes}
              placeholder={loading ? 'Loading…' : 'Anything a number doesn’t capture'}
              disabled={loading}
              onChange={(e) => setN('notes')(e.target.value)}
            />
          </Field>

          <div className="pa-actions">
            <Button variant="ghost" disabled={loading || !nightChanged || saving === 'night'}
              onClick={() => save('night')}>
              {saving === 'night' ? 'Saving…' : 'Save night'}
            </Button>
            {nightSaved && editing.night && (
              <Button variant="link" onClick={() => cancelEdit('night')}>Cancel</Button>
            )}
          </div>
        </div>
      </section>
    </Card>
  )
}
