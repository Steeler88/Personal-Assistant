import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayKey, longDate } from '../lib/today'
import { Card, Button, Textarea, Badge } from '../design-kit'

const KINDS = [
  { key: 'wake', label: 'Wake-up', placeholder: 'How did you sleep? What matters today?' },
  { key: 'bed', label: 'Bedtime', placeholder: 'How did today go? What are you carrying into tomorrow?' },
]

// Postgres/PostgREST codes meaning "the table isn't there yet"
const MISSING_TABLE = new Set(['PGRST205', '42P01'])

export default function JournalToday() {
  const date = todayKey()
  const [bodies, setBodies] = useState({ wake: '', bed: '' })
  const [saved, setSaved] = useState({ wake: null, bed: null })
  const [savingKind, setSavingKind] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('kind, body')
        .eq('entry_date', date)

      if (cancelled) return

      if (error) {
        setError(
          MISSING_TABLE.has(error.code)
            ? 'missing-table'
            : error.message
        )
        setLoading(false)
        return
      }

      const next = { wake: '', bed: '' }
      for (const row of data) next[row.kind] = row.body ?? ''
      setBodies(next)
      setSaved(next)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [date])

  async function save(kind) {
    setSavingKind(kind)
    setError(null)

    const { error } = await supabase.from('journal_entries').upsert(
      { entry_date: date, kind, body: bodies[kind], updated_at: new Date().toISOString() },
      { onConflict: 'entry_date,kind' }
    )

    if (error) {
      setError(MISSING_TABLE.has(error.code) ? 'missing-table' : error.message)
    } else {
      setSaved((s) => ({ ...s, [kind]: bodies[kind] }))
    }
    setSavingKind(null)
  }

  if (error === 'missing-table') {
    return (
      <Card eyebrow="Today" title={longDate()}>
        <p style={{ color: 'var(--muted-strong)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
          The <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>journal_entries</code> table
          doesn’t exist yet. Run <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>SCHEMA-step2.sql</code>{' '}
          in the Supabase SQL editor, then reload.
        </p>
      </Card>
    )
  }

  return (
    <Card eyebrow="Today" title={longDate()}>
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 'var(--text-sm)', marginTop: 0 }}>{error}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {KINDS.map(({ key, label, placeholder }) => {
          const dirty = bodies[key] !== (saved[key] ?? '')
          const hasEntry = (saved[key] ?? '') !== ''

          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '.18em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                  }}
                >
                  {label}
                </span>
                {hasEntry && !dirty && <Badge tone="accent" dot>Saved</Badge>}
                {dirty && <Badge tone="amber" dot>Unsaved</Badge>}
              </div>

              <Textarea
                name={`journal-${key}`}
                value={bodies[key]}
                placeholder={loading ? 'Loading…' : placeholder}
                disabled={loading}
                onChange={(e) => setBodies((b) => ({ ...b, [key]: e.target.value }))}
              />

              <div>
                <Button
                  variant="ghost"
                  disabled={loading || !dirty || savingKind === key}
                  onClick={() => save(key)}
                >
                  {savingKind === key ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
