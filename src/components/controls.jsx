/* Small form controls built on the design kit's tokens. */

export function Field({ label, children }) {
  return (
    <div className="pa-field">
      <span className="pa-field__label">{label}</span>
      {children}
    </div>
  )
}

/** 1-10 rating. `value` is null until the user picks one. */
export function Scale({ label, value, onChange, max = 10 }) {
  return (
    <Field label={label}>
      <div className="pa-scale" role="group" aria-label={label}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className="pa-scale__btn"
            aria-pressed={value === n}
            // Clicking the active value clears it, so a mis-tap is recoverable
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </Field>
  )
}

/** Segmented choice. options: [{ value, label, warn? }] */
export function Choice({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <div className="pa-choice" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            className={`pa-choice__btn${opt.warn ? ' pa-choice__btn--warn' : ''}`}
            aria-pressed={value === opt.value}
            onClick={() => onChange(value === opt.value ? null : opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </Field>
  )
}

/** Checkbox styled to the kit. */
export function Check({ checked, onChange, label }) {
  return (
    <span className="pa-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="pa-check__box" aria-hidden="true">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    </span>
  )
}
