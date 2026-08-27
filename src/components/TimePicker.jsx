import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { prettyTime } from '../lib/dates'

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = ['00', '15', '30', '45']

function split(value) {
  if (!value) return { hour: null, minute: '00', meridiem: 'AM' }
  const [hRaw, m] = value.split(':')
  const h = Number(hRaw)
  return {
    hour: h % 12 === 0 ? 12 : h % 12,
    minute: m,
    meridiem: h < 12 ? 'AM' : 'PM',
  }
}

function join(hour, minute, meridiem) {
  if (hour === null) return ''
  let h = hour % 12
  if (meridiem === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${minute}`
}

/**
 * Click-only time picker: pick an hour, a minute, and AM/PM.
 * Three small grids beat scrolling a 96-item dropdown.
 */
export default function TimePicker({ label, value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const wrapRef = useRef(null)
  const popRef = useRef(null)
  const triggerRef = useRef(null)

  const parts = split(value)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) setOpen(false)
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

  // Same portal + flip logic as the date picker: .dk-shell clips overflow
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    function place() {
      const t = triggerRef.current?.getBoundingClientRect()
      if (!t) return
      const h = popRef.current?.offsetHeight ?? 280
      const w = popRef.current?.offsetWidth ?? 236
      const gap = 6
      const roomBelow = window.innerHeight - t.bottom - gap
      const above = roomBelow < h && t.top - gap > roomBelow
      let top = above ? t.top - h - gap : t.bottom + gap
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8))
      let left = Math.min(t.left, window.innerWidth - w - 8)
      left = Math.max(8, left)
      setPos({ top, left })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  function set(next) {
    const { hour, minute, meridiem } = { ...parts, ...next }
    // Choosing a minute or AM/PM before an hour shouldn't invent 12:00
    if (hour === null) return
    onChange(join(hour, minute, meridiem))
  }

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
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span className={value ? '' : 'pa-datebtn--empty'}>{value ? prettyTime(value) : 'All day'}</span>
      </button>

      {open && createPortal(
        <div
          className="pa-time"
          ref={popRef}
          role="dialog"
          aria-label="Choose a time"
          style={{
            top: pos ? `${pos.top}px` : 0,
            left: pos ? `${pos.left}px` : 0,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <span className="pa-time__label">Hour</span>
          <div className="pa-time__hours">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                className="pa-time__btn"
                aria-pressed={parts.hour === h}
                onClick={() => onChange(join(h, parts.minute, parts.meridiem))}
              >
                {h}
              </button>
            ))}
          </div>

          <span className="pa-time__label">Minute</span>
          <div className="pa-time__row">
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                className="pa-time__btn"
                aria-pressed={parts.minute === m && !!value}
                onClick={() => set({ minute: m })}
              >
                :{m}
              </button>
            ))}
          </div>

          <span className="pa-time__label">AM / PM</span>
          <div className="pa-time__row">
            {['AM', 'PM'].map((mer) => (
              <button
                key={mer}
                type="button"
                className="pa-time__btn"
                aria-pressed={parts.meridiem === mer && !!value}
                onClick={() => set({ meridiem: mer })}
              >
                {mer}
              </button>
            ))}
          </div>

          <div className="pa-cal__foot">
            <button type="button" className="pa-cal__action" onClick={() => { onChange(''); setOpen(false) }}>
              All day
            </button>
            <button type="button" className="pa-cal__action" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
