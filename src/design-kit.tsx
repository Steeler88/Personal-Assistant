/* ============================================================
 * DESIGN KIT — single-file edition.
 *
 * Everything in one file: design tokens + all 8 components.
 * The CSS auto-injects on import, so there is nothing else to
 * wire up. Dark, editorial, mint-accented.
 *
 * USE IT:
 *   1. Copy this file into your React project (e.g. src/design-kit.tsx)
 *   2. import { Button, Card, Ring, Badge, Ticker, Input, Textarea,
 *               PageShell, PosterGrid } from './design-kit'
 *   3. Render. That's it — no CSS imports, no config, no deps but React.
 *
 * FONTS (optional): the kit ships system fallbacks. For the intended
 * look, define --font-inter / --font-newsreader / --font-jetbrains on
 * :root (any loader works), or override --font-sans/serif/mono directly.
 * ============================================================ */

import React, { useRef } from 'react'

/* ------------------------------------------------------------
 * 1. STYLES — injected once, the first time this module loads.
 * ---------------------------------------------------------- */
const CSS = `
:root{
  --bg:#000;--bg-elevated:#0a0a0a;--fg:#fff;
  --accent:#6EE7B7;--accent-hover:#5dd6a6;--accent-deep:#1f4d3d;--accent-glow:rgba(110,231,183,.4);
  --amber:#F59E0B;--amber-warm:#d97706;--wine:#7c2d12;--red:#EF4444;
  --muted:rgba(255,255,255,.5);--muted-strong:rgba(255,255,255,.7);
  --border:rgba(255,255,255,.08);--border-strong:rgba(255,255,255,.16);
  --card:rgba(255,255,255,.02);--card-elevated:rgba(255,255,255,.04);
  --space-1:.25rem;--space-2:.5rem;--space-3:.75rem;--space-4:1rem;--space-5:1.25rem;--space-6:1.5rem;--space-8:2rem;--space-10:2.5rem;--space-12:3rem;--space-16:4rem;
  --radius-sm:6px;--radius-md:8px;--radius-lg:12px;--radius-pill:999px;
  --text-xs:.75rem;--text-sm:.875rem;--text-base:1rem;--text-lg:1.125rem;--text-xl:1.375rem;--text-2xl:1.75rem;--text-3xl:2.5rem;
  --font-sans:var(--font-inter),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --font-serif:var(--font-newsreader),'Times New Roman',Georgia,serif;
  --font-mono:var(--font-jetbrains),ui-monospace,'SFMono-Regular',Menlo,monospace;
  --ease:cubic-bezier(.2,.8,.2,1);--ease-premium:cubic-bezier(.16,1,.3,1);--ease-out-soft:cubic-bezier(.32,.72,0,1);
  --duration-fast:120ms;--duration:180ms;--duration-lift:480ms;
}
.dk-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);padding:.6875rem var(--space-4);border:1px solid transparent;border-radius:var(--radius-md);font-family:var(--font-sans);font-size:var(--text-sm);font-weight:600;line-height:1;white-space:nowrap;cursor:pointer;transition:background var(--duration) var(--ease),border-color var(--duration) var(--ease),color var(--duration) var(--ease),transform var(--duration-fast) var(--ease)}
.dk-btn:disabled{opacity:.5;cursor:not-allowed}
.dk-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.dk-btn--block{width:100%}
.dk-btn--primary{background:var(--accent);color:#000}
.dk-btn--primary:hover:not(:disabled){background:var(--accent-hover)}
.dk-btn--primary:active:not(:disabled){transform:translateY(1px)}
.dk-btn--ghost{background:transparent;color:var(--fg);border-color:var(--border)}
.dk-btn--ghost:hover:not(:disabled){border-color:var(--border-strong);background:var(--card)}
.dk-btn--pill{background:var(--card);color:var(--accent);border:1px solid var(--border-strong);border-radius:var(--radius-pill);font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.12em;text-transform:uppercase;padding:.5rem var(--space-4)}
.dk-btn--pill:hover:not(:disabled){border-color:var(--accent);background:var(--card-elevated)}
.dk-btn--link{background:transparent;color:var(--muted-strong);padding:var(--space-2) var(--space-3);font-weight:500}
.dk-btn--link:hover:not(:disabled){color:var(--fg)}
.dk-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--space-6);transition:border-color var(--duration) var(--ease)}
.dk-card--elevated{background:var(--card-elevated)}
.dk-card--interactive{cursor:pointer}
.dk-card--interactive:hover{border-color:rgba(110,231,183,.35);box-shadow:0 0 40px rgba(110,231,183,.08)}
.dk-card__header{margin-bottom:var(--space-4)}
.dk-card__title{font-family:var(--font-serif);font-style:italic;font-size:var(--text-xl);letter-spacing:-.015em}
.dk-card__eyebrow{font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:var(--space-2)}
.dk-field{display:flex;flex-direction:column;gap:var(--space-2)}
.dk-field__label{font-family:var(--font-sans);font-size:var(--text-xs);font-weight:500;color:var(--muted-strong);letter-spacing:.02em;text-transform:uppercase}
.dk-input,.dk-textarea{background:var(--card);border:1px solid var(--border);color:var(--fg);font-family:var(--font-sans);font-size:var(--text-sm);padding:.6875rem var(--space-3);border-radius:var(--radius-sm);outline:none;width:100%;transition:border-color var(--duration) var(--ease),background var(--duration) var(--ease)}
.dk-textarea{resize:vertical;min-height:88px;line-height:1.5}
.dk-input::placeholder,.dk-textarea::placeholder{color:var(--muted)}
.dk-input:hover,.dk-textarea:hover{border-color:var(--border-strong)}
.dk-input:focus,.dk-textarea:focus{border-color:var(--accent);background:rgba(110,231,183,.04)}
.dk-field__error{color:var(--red);font-size:var(--text-sm)}
.dk-badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:var(--radius-pill);border:1px solid transparent}
.dk-badge__dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.dk-badge--accent{color:var(--accent);background:rgba(110,231,183,.1);border-color:rgba(110,231,183,.28)}
.dk-badge--amber{color:var(--amber);background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.28)}
.dk-badge--red{color:var(--red);background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.28)}
.dk-badge--neutral{color:var(--muted-strong);background:rgba(255,255,255,.04);border-color:var(--border)}
.dk-ring{position:relative;display:inline-flex}
.dk-ring svg{transform:rotate(-90deg);overflow:visible}
.dk-ring__track{stroke:rgba(255,255,255,.08)}
.dk-ring__fill{stroke:var(--accent);filter:drop-shadow(0 0 10px var(--accent-glow));transition:stroke-dashoffset var(--duration-lift) var(--ease-premium)}
.dk-ring__center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.dk-ring__num{font-family:var(--font-serif);font-style:italic;font-weight:500;color:var(--accent);line-height:1}
.dk-ring__label{font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-top:var(--space-2)}
.dk-ticker{border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;background:var(--card)}
.dk-ticker__track{display:flex;white-space:nowrap;width:max-content;animation:dk-scroll 30s linear infinite}
.dk-ticker:hover .dk-ticker__track{animation-play-state:paused}
.dk-ticker__item{display:inline-flex;align-items:center;gap:9px;font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:var(--space-4) 0}
.dk-ticker__item b{color:var(--fg);font-weight:600;letter-spacing:.04em}
.dk-ticker__item--live b{color:var(--accent)}
.dk-ticker__sep{color:var(--muted);opacity:.5;margin:0 26px}
.dk-ticker__pip{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 9px var(--accent-glow);animation:dk-pulse 1.7s ease-in-out infinite}
@keyframes dk-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes dk-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.dk-shell{position:relative;min-height:100vh;background:var(--bg);color:var(--fg);padding:var(--space-10) var(--space-6) var(--space-16);overflow:hidden}
.dk-shell::before{content:'';position:absolute;inset:-10% -5%;z-index:0;pointer-events:none;background:radial-gradient(ellipse 50% 35% at 70% 20%,rgba(110,231,183,.06),transparent 65%),radial-gradient(ellipse 40% 30% at 20% 80%,rgba(110,231,183,.04),transparent 70%);animation:dk-drift 60s ease-in-out infinite alternate}
.dk-shell__inner{position:relative;z-index:1;max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:var(--space-10)}
@keyframes dk-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(-2%,1%,0)}}
.dk-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,minmax(180px,auto));gap:var(--space-4)}
@media(max-width:980px){.dk-grid{grid-template-columns:repeat(2,1fr);grid-template-rows:none;grid-auto-rows:minmax(160px,auto)}}
@media(max-width:560px){.dk-grid{grid-template-columns:1fr;grid-auto-rows:minmax(140px,auto);gap:var(--space-3)}}
.dk-poster{position:relative;overflow:hidden;border-radius:18px;border:1px solid var(--border);background:var(--card);cursor:pointer;isolation:isolate;display:block;width:100%;text-align:left;color:inherit;font:inherit;opacity:0;transform:translateY(12px) scale(.97);animation:dk-posterIn 800ms var(--ease-premium) forwards;transition:transform var(--duration-lift) var(--ease-premium),border-color var(--duration) var(--ease);will-change:transform}
@keyframes dk-posterIn{to{opacity:1;transform:translateY(0) scale(1)}}
.dk-poster:hover{border-color:var(--border-strong)}
.dk-poster--active:hover{border-color:rgba(110,231,183,.35);box-shadow:0 0 40px rgba(110,231,183,.08)}
.dk-poster__art{position:absolute;inset:-10%;pointer-events:none;transition:transform 240ms var(--ease-out-soft);will-change:transform}
.dk-poster__index{position:absolute;top:var(--space-4);left:var(--space-4);z-index:2;font-family:var(--font-serif);font-style:italic;font-size:var(--text-sm);color:rgba(255,255,255,.45);letter-spacing:-.01em}
.dk-poster__label{position:absolute;bottom:var(--space-4);left:var(--space-4);z-index:2;font-family:var(--font-serif);font-style:italic;font-size:var(--text-xl);color:rgba(255,255,255,.9);letter-spacing:-.015em;line-height:1;transition:color var(--duration) var(--ease)}
.dk-poster--active:hover .dk-poster__label{color:var(--accent)}
.dk-poster__arrow{position:absolute;bottom:var(--space-4);right:var(--space-4);z-index:2;font-family:var(--font-serif);font-style:italic;font-size:var(--text-xl);color:rgba(255,255,255,.5);transition:color var(--duration) var(--ease),transform var(--duration) var(--ease)}
.dk-poster--active:hover .dk-poster__arrow{color:var(--accent);transform:translateX(3px)}
.dk-poster__teaser{position:absolute;bottom:var(--space-4);right:var(--space-4);z-index:2;font-family:var(--font-serif);font-style:italic;font-size:var(--text-sm);color:rgba(255,255,255,.7);opacity:0;transform:translateY(4px);transition:opacity var(--duration) var(--ease),transform var(--duration) var(--ease)}
.dk-poster:hover .dk-poster__teaser{opacity:1;transform:translateY(0)}
.dk-poster--hero{grid-column:span 2;grid-row:span 2}
.dk-poster--wideTop{grid-column:span 2;grid-row:span 1}
.dk-poster--tall{grid-column:span 1;grid-row:span 2}
.dk-poster--square{grid-column:span 1;grid-row:span 1}
.dk-poster--wideBot{grid-column:span 2;grid-row:span 1}
@media(max-width:980px){.dk-poster--hero,.dk-poster--wideTop,.dk-poster--tall,.dk-poster--square,.dk-poster--wideBot{grid-column:span 1;grid-row:span 1}.dk-poster--hero{grid-column:span 2}}
@media(max-width:560px){.dk-poster--hero,.dk-poster--wideTop,.dk-poster--tall,.dk-poster--square,.dk-poster--wideBot{grid-column:span 1;grid-row:span 1}}
.dk-poster:nth-child(1){animation-delay:120ms}.dk-poster:nth-child(2){animation-delay:200ms}.dk-poster:nth-child(3){animation-delay:280ms}.dk-poster:nth-child(4){animation-delay:360ms}.dk-poster:nth-child(5){animation-delay:440ms}.dk-poster:nth-child(6){animation-delay:520ms}
.dk-art--aurora{background:radial-gradient(ellipse 65% 50% at 30% 35%,rgba(110,231,183,.55),transparent 60%),radial-gradient(ellipse 70% 55% at 75% 70%,rgba(31,77,61,.85),transparent 65%),radial-gradient(ellipse 40% 40% at 60% 30%,rgba(245,158,11,.1),transparent 70%),linear-gradient(180deg,#052e22,#000);filter:saturate(1.1);animation:dk-auroraDrift 28s ease-in-out infinite alternate}
@keyframes dk-auroraDrift{0%{transform:scale(1) rotate(0)}100%{transform:scale(1.08) rotate(8deg)}}
.dk-art--grid{background:repeating-linear-gradient(45deg,transparent 0 22px,rgba(110,231,183,.05) 22px 23px),repeating-linear-gradient(-45deg,transparent 0 22px,rgba(255,255,255,.025) 22px 23px),linear-gradient(135deg,#050a08,#000);animation:dk-gridDrift 40s linear infinite}
@keyframes dk-gridDrift{from{background-position:0 0,0 0,0 0}to{background-position:220px 0,-220px 0,0 0}}
.dk-art--dots{background:radial-gradient(circle,rgba(110,231,183,.45) 1px,transparent 1.5px),radial-gradient(ellipse 60% 80% at 50% 50%,rgba(110,231,183,.08),transparent 65%),linear-gradient(180deg,#04130d,#000);background-size:16px 16px,100% 100%,100% 100%;animation:dk-dotsRotate 120s linear infinite}
@keyframes dk-dotsRotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.dk-art--duotone{background:radial-gradient(ellipse 80% 60% at 30% 30%,rgba(245,158,11,.35),transparent 65%),linear-gradient(135deg,var(--amber-warm),var(--wine) 65%,#1a0808);animation:dk-duotoneShift 22s ease-in-out infinite alternate}
@keyframes dk-duotoneShift{0%{filter:saturate(.95) hue-rotate(0)}100%{filter:saturate(1.05) hue-rotate(-6deg)}}
.dk-art--frosted{background:radial-gradient(ellipse 60% 50% at 30% 30%,rgba(110,231,183,.5),transparent 65%),radial-gradient(ellipse 70% 60% at 75% 70%,rgba(67,56,202,.45),transparent 65%),linear-gradient(180deg,#0a0a1e,#02020a);filter:saturate(1.2)}
.dk-art--frosted::after{content:'';position:absolute;width:70%;height:70%;top:15%;left:15%;border-radius:50%;background:rgba(255,255,255,.04);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.06);animation:dk-frostedBob 16s ease-in-out infinite alternate}
@keyframes dk-frostedBob{0%{transform:translate(0,0) scale(1)}100%{transform:translate(4%,-3%) scale(1.04)}}
@media(prefers-reduced-motion:reduce){.dk-poster,.dk-art--aurora,.dk-art--grid,.dk-art--dots,.dk-art--duotone,.dk-art--frosted::after,.dk-ticker__track,.dk-ticker__pip,.dk-shell::before{animation:none!important}.dk-poster{opacity:1;transform:none}}
`

if (typeof document !== 'undefined' && !document.getElementById('design-kit-styles')) {
  const tag = document.createElement('style')
  tag.id = 'design-kit-styles'
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/* ------------------------------------------------------------
 * 2. TOKENS — same values in JS, for charts / inline styles.
 * ---------------------------------------------------------- */
export const tokens = {
  color: {
    bg: '#000000', fg: '#ffffff', accent: '#6EE7B7', accentHover: '#5dd6a6',
    amber: '#F59E0B', red: '#EF4444',
    muted: 'rgba(255,255,255,0.5)', mutedStrong: 'rgba(255,255,255,0.7)',
    border: 'rgba(255,255,255,0.08)', card: 'rgba(255,255,255,0.02)',
  },
  radius: { sm: '6px', md: '8px', lg: '12px', pill: '999px' },
  motion: { ease: 'cubic-bezier(0.2,0.8,0.2,1)', easePremium: 'cubic-bezier(0.16,1,0.3,1)' },
}

/* ------------------------------------------------------------
 * 3. COMPONENTS
 * ---------------------------------------------------------- */

// ----- Button -----
export type ButtonVariant = 'primary' | 'ghost' | 'pill' | 'link'
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  block?: boolean
}
export function Button({ variant = 'primary', block = false, className = '', children, ...rest }: ButtonProps) {
  const cls = ['dk-btn', `dk-btn--${variant}`, block ? 'dk-btn--block' : '', className].filter(Boolean).join(' ')
  return <button className={cls} {...rest}>{children}</button>
}

// ----- Card -----
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean
  interactive?: boolean
  eyebrow?: string
  title?: string
}
export function Card({ elevated, interactive, eyebrow, title, className = '', children, ...rest }: CardProps) {
  const cls = ['dk-card', elevated ? 'dk-card--elevated' : '', interactive ? 'dk-card--interactive' : '', className].filter(Boolean).join(' ')
  return (
    <div className={cls} {...rest}>
      {(eyebrow || title) && (
        <div className="dk-card__header">
          {eyebrow && <div className="dk-card__eyebrow">{eyebrow}</div>}
          {title && <div className="dk-card__title">{title}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// ----- Input + Textarea -----
interface BaseField { label?: string; error?: string }
export interface InputProps extends BaseField, React.InputHTMLAttributes<HTMLInputElement> {}
export function Input({ label, error, className = '', id, ...rest }: InputProps) {
  const fieldId = id || rest.name
  return (
    <div className="dk-field">
      {label && <label className="dk-field__label" htmlFor={fieldId}>{label}</label>}
      <input id={fieldId} className={`dk-input ${className}`} {...rest} />
      {error && <span className="dk-field__error">{error}</span>}
    </div>
  )
}
export interface TextareaProps extends BaseField, React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export function Textarea({ label, error, className = '', id, ...rest }: TextareaProps) {
  const fieldId = id || rest.name
  return (
    <div className="dk-field">
      {label && <label className="dk-field__label" htmlFor={fieldId}>{label}</label>}
      <textarea id={fieldId} className={`dk-textarea ${className}`} {...rest} />
      {error && <span className="dk-field__error">{error}</span>}
    </div>
  )
}

// ----- Badge -----
export type BadgeTone = 'accent' | 'amber' | 'red' | 'neutral'
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> { tone?: BadgeTone; dot?: boolean }
export function Badge({ tone = 'accent', dot, className = '', children, ...rest }: BadgeProps) {
  return (
    <span className={`dk-badge dk-badge--${tone} ${className}`} {...rest}>
      {dot && <span className="dk-badge__dot" />}
      {children}
    </span>
  )
}

// ----- Ring -----
export interface RingProps {
  value: number
  size?: number
  stroke?: number
  label?: string
  display?: React.ReactNode
}
export function Ring({ value, size = 188, stroke = 8, label, display }: RingProps) {
  const v = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const cx = size / 2
  const circ = 2 * Math.PI * r
  return (
    <div className="dk-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="dk-ring__track" cx={cx} cy={cx} r={r} fill="none" strokeWidth={stroke} />
        <circle className="dk-ring__fill" cx={cx} cy={cx} r={r} fill="none" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - v / 100)} />
      </svg>
      <div className="dk-ring__center">
        <span className="dk-ring__num" style={{ fontSize: Math.round(size * 0.33) }}>{display ?? Math.round(v)}</span>
        {label && <span className="dk-ring__label">{label}</span>}
      </div>
    </div>
  )
}

// ----- Ticker -----
export interface TickerItem { label: string; value: string; live?: boolean }
export interface TickerProps { items: TickerItem[]; showLive?: boolean }
export function Ticker({ items, showLive = true }: TickerProps) {
  const row = (
    <>
      {showLive && (
        <span className="dk-ticker__item dk-ticker__item--live">
          <span className="dk-ticker__pip" /><b>Live</b><span className="dk-ticker__sep">/</span>
        </span>
      )}
      {items.map((it, i) => (
        <span key={i} className={`dk-ticker__item ${it.live ? 'dk-ticker__item--live' : ''}`}>
          {it.label} <b>{it.value}</b><span className="dk-ticker__sep">/</span>
        </span>
      ))}
    </>
  )
  return <div className="dk-ticker"><div className="dk-ticker__track">{row}{row}</div></div>
}

// ----- PageShell -----
export interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> { maxWidth?: number }
export function PageShell({ maxWidth = 1180, className = '', children, ...rest }: PageShellProps) {
  return (
    <div className={`dk-shell ${className}`} {...rest}>
      <div className="dk-shell__inner" style={{ maxWidth }}>{children}</div>
    </div>
  )
}

// ----- PosterGrid -----
export type PosterArt = 'aurora' | 'grid' | 'dots' | 'duotone' | 'frosted'
export type PosterSlot = 'hero' | 'wideTop' | 'tall' | 'square' | 'wideBot'
export interface PosterConfig { art: PosterArt; slot: PosterSlot; label?: string; id?: string; active?: boolean }
export interface PosterGridProps { posters: PosterConfig[]; onSelect?: (id: string, index: number) => void }
const ART: Record<PosterArt, string> = { aurora: 'dk-art--aurora', grid: 'dk-art--grid', dots: 'dk-art--dots', duotone: 'dk-art--duotone', frosted: 'dk-art--frosted' }
const SLOT: Record<PosterSlot, string> = { hero: 'dk-poster--hero', wideTop: 'dk-poster--wideTop', tall: 'dk-poster--tall', square: 'dk-poster--square', wideBot: 'dk-poster--wideBot' }
export function PosterGrid({ posters, onSelect }: PosterGridProps) {
  const artRefs = useRef<Array<HTMLDivElement | null>>([])
  const onMove = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget, art = artRefs.current[i]
    if (!art) return
    const r = el.getBoundingClientRect()
    const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2)
    const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2)
    art.style.transform = `translate3d(${dx * 8}px,${dy * 8}px,0)`
  }
  const onLeave = (i: number) => () => { const a = artRefs.current[i]; if (a) a.style.transform = 'translate3d(0,0,0)' }
  return (
    <div className="dk-grid">
      {posters.map((p, i) => (
        <button key={i} type="button"
          className={['dk-poster', SLOT[p.slot], p.active ? 'dk-poster--active' : ''].filter(Boolean).join(' ')}
          onPointerMove={onMove(i)} onPointerLeave={onLeave(i)} onClick={() => onSelect?.(p.id ?? String(i), i)}>
          <div ref={el => { artRefs.current[i] = el }} className={`dk-poster__art ${ART[p.art]}`} />
          <span className="dk-poster__index">{`·${String(i + 1).padStart(2, '0')}`}</span>
          {p.label && <span className="dk-poster__label">{p.label}</span>}
          {p.active ? <span className="dk-poster__arrow">→</span> : <span className="dk-poster__teaser">soon</span>}
        </button>
      ))}
    </div>
  )
}
