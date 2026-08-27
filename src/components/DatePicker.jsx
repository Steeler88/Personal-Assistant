import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toKey, parseKey, daysInMonth, firstWeekday, prettyDate, MONTHS, WEEKDAYS } from '../lib/dates'
import { todayKey } from '../lib/today'

/**
 * Click-only date picker. No typing — the trigger opens a month grid.
 * `value` is a 'YYYY-MM-DD' string, or '' for unset.
 */
export default function DatePicker({ label, value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const wrapRef = useRef(null)
  const calRef = useRef(null)
  const triggerRef = useRef(null)

  const today = todayKey()
  const selected = parseKey(value)
  const todayParts = parseKey(today)

  // Open on the selected month, else the current one
  const [view, setView] = useState(() => {
    const base = selected ?? todayParts
    return { y: base.y, m: base.m }
  })

  // Re-centre when the value changes from outside (e.g. form reset after add)
  useEffect(() => {
    const base = parseKey(value) ?? parseKey(todayKey())
    setView({ y: base.y, m: base.m })
  }, [value])

  useEffect(() => {
    if (!open) return

    function onDocClick(e) {
      const inTrigger = wrapRef.current?.contains(e.target)
      const inCalendar = calRef.current?.contains(e.target)
      if (!inTrigger && !inCalendar) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }

    function place() {
      const t = triggerRef.current?.getBoundingClientRect()
      if (!t) return
      const h = calRef.current?.offsetHeight ?? 340
      const w = calRef.current?.offsetWidth ?? 252
      const gap = 6

      // Flip above the trigger when there isn't room below and there is above
      const roomBelow = window.innerHeight - t.bottom - gap
      const roomAbove = t.top - gap
      const above = roomBelow < h && roomAbove > roomBelow

      let top = above ? t.top - h - gap : t.bottom + gap
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8))

      let left = Math.min(t.left, window.innerWidth - w - 8)
      left = Math.max(8, left)

      setPos({ top, left })
    }

    place()
    // capture:true so scrolling any ancestor keeps the popover anchored
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  function step(delta) {
    setView((v) => {
      const m = v.m + delta
      if (m < 0) return { y: v.y - 1, m: 11 }
      if (m > 11) return { y: v.y + 1, m: 0 }
      return { y: v.y, m }
    })
  }

  function pick(day) {
    onChange(toKey(view.y, view.m, day))
    setOpen(false)
  }

  const total = daysInMonth(view.y, view.m)
  const offset = firstWeekday(view.y, view.m)

  return (
    <div className="pa-field" ref={wrapRef} style={{ position: 'relative', flex: '0 0 auto' }}>
      {label && <span className="pa-field__label">{label}</span>}

      <button
        ref={triggerRef}
        type="button"
        className="pa-datebtn"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className={value ? '' : 'pa-datebtn--empty'}>{value ? prettyDate(value) : 'Pick a date'}</span>
      </button>

      {open && createPortal(
        <div
          className="pa-cal"
          ref={calRef}
          role="dialog"
          aria-label="Choose a date"
          style={{
            top: pos ? `${pos.top}px` : 0,
            left: pos ? `${pos.left}px` : 0,
            // Hide for the first paint, before we've measured where it goes
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <div className="pa-cal__head">
            <button type="button" className="pa-cal__nav" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
            <span className="pa-cal__month">{MONTHS[view.m]} {view.y}</span>
            <button type="button" className="pa-cal__nav" aria-label="Next month" onClick={() => step(1)}>›</button>
          </div>

          <div className="pa-cal__grid">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="pa-cal__dow">{w}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => <span key={`pad-${i}`} />)}
            {Array.from({ length: total }, (_, i) => i + 1).map((day) => {
              const key = toKey(view.y, view.m, day)
              return (
                <button
                  key={day}
                  type="button"
                  className="pa-cal__day"
                  aria-pressed={key === value}
                  data-today={key === today ? 'true' : undefined}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="pa-cal__foot">
            <button type="button" className="pa-cal__action" onClick={() => { onChange(today); setOpen(false) }}>
              Today
            </button>
            {value && (
              <button type="button" className="pa-cal__action" onClick={() => { onChange(''); setOpen(false) }}>
                Clear
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
