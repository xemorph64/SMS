import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import NumberFlow from '@number-flow/react'
import { ArrowLeft } from 'lucide-react'
import { GLOSSARY } from './lib/glossary'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ------------------------------------------------------------------ decode

const GLYPHS = '▚▞▙▟░▒▓01ABCDEFX/<>#*'

/**
 * Text that decodes from noise into the final string once, left to right.
 * Writes to the DOM directly (no React re-render per frame).
 */
export function Decode({ text, className = '', delay = 0, speed = 1 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof text !== 'string') return undefined
    if (reduced()) { el.textContent = text; return undefined }
    let raf
    const start = performance.now() + delay
    const dur = Math.min(900, 220 + text.length * 22) / speed
    const tick = (now) => {
      const t = Math.max(0, (now - start) / dur)
      const settled = Math.floor(t * text.length)
      let out = ''
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        out += i < settled || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]
      }
      el.textContent = out
      if (t < 1) raf = requestAnimationFrame(tick)
      else el.textContent = text
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, delay, speed])
  if (typeof text !== 'string') return <span className={className}>{text}</span>
  return <span ref={ref} className={className} aria-label={text}>{text}</span>
}

// ----------------------------------------------------------------- readout

/** Dot-matrix numeral that rolls when its value changes. */
export function Readout({ value, className = '', suffix }) {
  const numeric = typeof value === 'number' && Number.isFinite(value)
  return (
    <span className={`font-dot font-bold leading-none tabular ${className}`}>
      {numeric ? <NumberFlow value={value} willChange /> : value}
      {suffix && <span className="ml-0.5 text-[0.5em] text-smoke">{suffix}</span>}
    </span>
  )
}

// ---------------------------------------------------------------- magnetic

/** Wraps a control so it leans toward the cursor. Motion values only, no re-renders. */
export function Magnetic({ children, strength = 0.25, className = '' }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 220, damping: 18 })
  const sy = useSpring(y, { stiffness: 220, damping: 18 })
  return (
    <motion.span
      className={`inline-flex ${className}`}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (reduced()) return
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * strength)
        y.set((e.clientY - r.top - r.height / 2) * strength)
      }}
      onPointerLeave={() => { x.set(0); y.set(0) }}
    >
      {children}
    </motion.span>
  )
}

// ------------------------------------------------------------------ explain

/**
 * A small ⓘ that explains a term in one line, on hover, focus or tap.
 * Portalled with fixed positioning so scroll containers never clip it.
 */
export function Explain({ term, text, className = '' }) {
  const id = useId()
  const btn = useRef(null)
  const [pos, setPos] = useState(null)
  const body = text || GLOSSARY[term]
  if (!body) return null

  const show = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const width = 270
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12)
    const below = r.bottom + 8
    const above = window.innerHeight - below < 120
    setPos({ left, top: above ? undefined : below, bottom: above ? window.innerHeight - r.top + 8 : undefined, width })
  }
  const hide = () => setPos(null)

  return (
    <span className={`inline-flex align-middle normal-case tracking-normal ${className}`} style={{ fontVariationSettings: "'wdth' 100" }}>
      <button
        ref={btn}
        type="button"
        aria-describedby={pos ? id : undefined}
        aria-label="What is this?"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); pos ? hide() : show() }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-hair-2 font-code text-[9px] font-medium leading-none text-smoke transition-colors hover:border-signal hover:text-signal"
      >
        i
      </button>
      {pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, fontVariationSettings: "'wdth' 100" }}
            className="z-[90] border border-hair-2 border-l-2 border-l-signal bg-carbon-3 px-3 py-2.5 text-left text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-bone shadow-2xl"
          >
            {body}
          </span>,
          document.body,
        )}
    </span>
  )
}

// ------------------------------------------------------------------- layout

export function Panel({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`sg-panel ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function PageHeader({ title, purpose, term, actions, back, kicker }) {
  return (
    <header className="mb-10">
      {back && (
        <Link to={back.to} className="mb-6 inline-flex items-center gap-2 font-code text-[11.5px] uppercase tracking-[0.12em] text-ash transition-colors hover:text-signal">
          <ArrowLeft size={14} strokeWidth={1.75} /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {kicker && <div className="sg-kicker mb-3">{kicker}</div>}
          <h1 className="sg-display flex items-center gap-3 text-[30px] font-semibold leading-[1.02] text-bone md:text-[44px]">
            <span className="min-w-0 break-words"><Decode text={title} /></span>
            {term && <Explain term={term} />}
          </h1>
          {purpose && <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ash">{purpose}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function SectionTitle({ title, term, hint, right, className = '', index }) {
  return (
    <div className={`mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-hair pb-3 ${className}`}>
      <div>
        <h2 className="sg-display flex items-center gap-2.5 text-[17px] font-semibold text-bone">
          {index && <span className="font-code text-[11px] font-normal text-signal">{index}</span>}
          {title}
          {term && <Explain term={term} />}
        </h2>
        {hint && <p className="mt-1.5 text-[13px] text-smoke">{hint}</p>}
      </div>
      {right}
    </div>
  )
}

// ------------------------------------------------------------------- grades

export function gradeColor(letter) {
  if (['A+', 'A'].includes(letter)) return 'rgb(var(--s-go))'
  if (letter === 'B') return 'rgb(var(--s-ice))'
  if (letter === 'C') return 'rgb(var(--s-mid))'
  if (letter === 'D') return 'rgb(var(--s-heat))'
  if (['E', 'F'].includes(letter)) return 'rgb(var(--s-signal))'
  return 'rgb(var(--s-smoke))'
}

/** Grade as a dot-matrix readout in a bracketed cell. */
export function Grade({ grade, size = 'md', className = '' }) {
  const letter = grade || '–'
  const color = gradeColor(letter)
  const dims = {
    xs: 'h-6 min-w-6 px-1 text-[15px]',
    sm: 'h-9 min-w-9 px-1.5 text-[22px]',
    md: 'h-12 min-w-12 px-2 text-[32px]',
    lg: 'h-24 min-w-24 px-3 text-[72px]',
    xl: 'h-40 min-w-36 px-4 text-[132px]',
  }[size]
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center border font-dot font-black leading-none ${dims} ${className}`}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 7%, transparent)` }}
      aria-label={`Grade ${letter}`}
      title={`Grade ${letter}`}
    >
      {letter}
    </span>
  )
}

// ---------------------------------------------------------------- severity

const SEV = {
  critical: ['signal', 'CRIT'],
  high: ['heat', 'HIGH'],
  medium: ['mid', 'MED'],
  low: ['ash', 'LOW'],
  info: ['ice', 'INFO'],
  warn: ['heat', 'WARN'],
}

export function Severity({ severity, className = '' }) {
  const key = String(severity || 'info').toLowerCase()
  const [tone, label] = SEV[key] || SEV.info
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-code text-[10.5px] font-medium uppercase tracking-[0.1em] ${className}`}
      style={{ color: `rgb(var(--s-${tone}))` }}
    >
      <span className="h-1.5 w-1.5" style={{ background: `rgb(var(--s-${tone}))` }} />
      {label}
    </span>
  )
}

const TAG = {
  muted: 'text-ash border-hair-2',
  gold: 'text-signal border-signal/50',
  signal: 'text-signal border-signal/50',
  cipher: 'text-ice border-ice/40',
  ice: 'text-ice border-ice/40',
  safe: 'text-go border-go/40',
  go: 'text-go border-go/40',
  warning: 'text-heat border-heat/40',
  danger: 'text-carbon border-signal bg-signal',
  caution: 'text-mid border-mid/40',
}

export function Tag({ tone = 'muted', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] font-code text-[10.5px] font-medium uppercase tracking-[0.08em] ${TAG[tone] || TAG.muted} ${className}`}>
      {children}
    </span>
  )
}

// ------------------------------------------------------------------- stats

const STAT_TONE = {
  default: 'text-bone',
  gold: 'text-signal',
  danger: 'text-signal',
  warning: 'text-heat',
  caution: 'text-mid',
  safe: 'text-go',
  cipher: 'text-ice',
}

export function Stat({ label, value, tone = 'default', term, hint }) {
  return (
    <div className="min-w-0">
      <Readout value={value} className={`text-[44px] ${STAT_TONE[tone]}`} />
      <div className="mt-2 flex items-center gap-1.5 font-code text-[10.5px] uppercase tracking-[0.12em] text-ash">
        {label}
        {term && <Explain term={term} />}
      </div>
      {hint && <div className="mt-1 text-[11.5px] text-smoke">{hint}</div>}
    </div>
  )
}

// ----------------------------------------------------------------- notices

const NOTICE = {
  warn: ['heat', 'Attention'],
  crit: ['signal', 'Alert'],
  ok: ['go', 'Confirmed'],
  info: ['ice', 'Note'],
}

export function Notice({ tone = 'info', title, children, className = '' }) {
  const [c, label] = NOTICE[tone] || NOTICE.info
  return (
    <div
      className={`relative border border-hair bg-carbon-2/80 py-3.5 pl-5 pr-4 backdrop-blur ${className}`}
      role={tone === 'crit' ? 'alert' : undefined}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `rgb(var(--s-${c}))` }} />
      <div className="font-code text-[10.5px] uppercase tracking-[0.14em]" style={{ color: `rgb(var(--s-${c}))` }}>{label}</div>
      {title && <div className="mt-1 text-[14px] font-medium text-bone">{title}</div>}
      {children && <div className="mt-1 text-[13.5px] leading-relaxed text-ash">{children}</div>}
    </div>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 font-dot text-[34px] font-bold leading-none text-hair-2" aria-hidden>- - -</div>
      <h3 className="sg-display text-[15px] font-semibold text-bone">{title}</h3>
      {children && <div className="mt-2 max-w-md text-[13.5px] leading-relaxed text-smoke">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function Loading({ rows = 3, label = 'Loading' }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      <div className="mb-4 font-code text-[11px] uppercase tracking-[0.16em] text-smoke">
        <span className="sg-blink text-signal">■</span> {label}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sg-skeleton h-16" style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  )
}

// --------------------------------------------------------------- key/value

export function KV({ k, v, bad = false, mono = false, term }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="flex shrink-0 items-center gap-1.5 font-code text-[11px] uppercase tracking-[0.1em] text-smoke">
        {k}
        {term && <Explain term={term} />}
      </span>
      <span className={`min-w-0 break-all text-right text-[13.5px] ${mono ? 'font-code text-[12.5px]' : ''} ${bad ? 'font-medium text-signal' : 'text-bone'}`}>
        {v}
      </span>
    </div>
  )
}

export function HashText({ value, head = 12, tail = 8, className = '' }) {
  if (!value) return <span className="text-smoke">–</span>
  const short = value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value
  return (
    <span className={`font-code text-[12px] text-ash ${className}`} title={value}>
      {short}
    </span>
  )
}

// ---------------------------------------------------------- SHAP diverging

export function ShapBars({ contributions = [], max = 8 }) {
  const rows = contributions.slice(0, max)
  if (!rows.length) return null
  const peak = Math.max(...rows.map((c) => Math.abs(c.contribution)), 0.0001)
  return (
    <figure className="m-0">
      <figcaption className="mb-4 flex flex-wrap gap-x-5 gap-y-1 font-code text-[11px] uppercase tracking-[0.1em] text-smoke">
        <span className="flex items-center gap-2"><span className="h-2 w-4 bg-signal" /> Raises risk</span>
        <span className="flex items-center gap-2"><span className="h-2 w-4 bg-ice" /> Lowers risk</span>
      </figcaption>
      <div className="space-y-2">
        {rows.map((c, i) => {
          const up = c.contribution > 0
          const w = (Math.abs(c.contribution) / peak) * 50
          return (
            <div
              key={c.feature}
              className="grid grid-cols-[minmax(0,200px)_1fr_64px] items-center gap-3"
              title={`${c.feature} = ${c.value} contributes ${up ? '+' : ''}${c.contribution}`}
            >
              <div className="truncate font-code text-[12px] text-ash">
                {c.feature} <span className="text-smoke">= {fmtFeature(c.value)}</span>
              </div>
              <div className="relative h-3">
                <span className="absolute inset-y-[-3px] left-1/2 w-px bg-hair-2" />
                <motion.span
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className={`absolute top-0 h-3 ${up ? 'left-1/2 origin-left bg-signal' : 'right-1/2 origin-right bg-ice'}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <div className={`text-right font-code text-[12px] tabular ${up ? 'text-signal' : 'text-ice'}`}>
                {up ? '+' : ''}
                {Number(c.contribution).toFixed(3)}
              </div>
            </div>
          )
        })}
      </div>
    </figure>
  )
}

function fmtFeature(v) {
  if (v === -1) return 'n/a'
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(2)
  return String(v)
}

// ------------------------------------------------------------------- tabs

export function Tabs({ tabs, value, onChange }) {
  const group = useId()
  return (
    <div role="tablist" className="flex max-w-full gap-0 overflow-x-auto border-b border-hair [scrollbar-width:none]">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 font-code text-[11.5px] uppercase tracking-[0.12em] transition-colors ${
              active ? 'text-bone' : 'text-smoke hover:text-ash'
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`font-dot text-[15px] font-bold leading-none ${active ? 'text-signal' : 'text-smoke'}`}>{t.count}</span>
            )}
            {active && (
              <motion.span layoutId={`tab-${group}`} className="absolute inset-x-0 -bottom-px h-[2px] bg-signal" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
