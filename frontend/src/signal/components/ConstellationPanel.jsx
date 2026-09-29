import React, { lazy, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, KeyRound, ShieldOff, Sparkles } from 'lucide-react'

import Scene3D from '../three/Scene3D'
import { Grade, gradeColor, Panel, Readout, Tag } from '../ui'
import { sessionKind } from '../../lib/format'

const ConstellationScene = lazy(() => import('../three/ConstellationScene'))

// Grade buckets used by the filter chips (A+ joins A, E joins F).
const BUCKETS = [
  { id: 'A', label: 'A', match: ['A+', 'A'] },
  { id: 'B', label: 'B', match: ['B'] },
  { id: 'C', label: 'C', match: ['C'] },
  { id: 'D', label: 'D', match: ['D'] },
  { id: 'F', label: 'E–F', match: ['E', 'F'] },
]
const bucketOf = (letter) => BUCKETS.find((b) => b.match.includes(letter))?.id ?? null

/**
 * The capture as a 3D constellation, with grade / anomaly filters and a live
 * inspector for whichever star is under the pointer.
 */
export default function ConstellationPanel({ sessions, onSelect, canOpen }) {
  const [off, setOff] = useState(() => new Set()) // hidden grade buckets
  const [anomaliesOnly, setAnomaliesOnly] = useState(false)
  const [hover, setHover] = useState(null)

  const counts = useMemo(() => {
    const out = Object.fromEntries(BUCKETS.map((b) => [b.id, 0]))
    sessions.forEach((s) => { const b = bucketOf(s.grade?.letter); if (b) out[b] += 1 })
    return out
  }, [sessions])
  const anomalies = sessions.filter((s) => s.ml?.anomaly).length
  const cleartext = sessions.filter((s) => !s.tls_version).length

  const active = useMemo(
    () => sessions.map((s) => {
      if (anomaliesOnly && !s.ml?.anomaly) return false
      const b = bucketOf(s.grade?.letter)
      return !(b && off.has(b))
    }),
    [sessions, off, anomaliesOnly],
  )
  const shown = active.filter(Boolean).length

  const toggle = (id) => setOff((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const focused = hover != null ? sessions[hover] : null

  return (
    <Panel className="relative overflow-hidden">
      <Scene3D
        className="h-[460px] w-full lg:h-[540px]"
        camera={{ position: [0, 0.6, 12], fov: 45 }}
        fallback={<div className="flex h-full items-center justify-center text-[13px] text-smoke">3D view unavailable on this device. Use the List view.</div>}
      >
        <ConstellationScene sessions={sessions} active={active} onSelect={canOpen ? onSelect : undefined} onHover={setHover} />
      </Scene3D>

      {/* filters */}
      <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-1.5 sm:left-5 sm:top-5">
        {BUCKETS.map((b) => {
          const on = !off.has(b.id)
          const color = gradeColor(b.match[0])
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => toggle(b.id)}
              aria-pressed={on}
              disabled={counts[b.id] === 0}
              className={`inline-flex h-7 items-center gap-1.5 border px-2.5 font-code text-[11px] uppercase tracking-[0.08em] backdrop-blur-md transition-all disabled:cursor-not-allowed disabled:opacity-30 ${on ? 'border-hair-2 bg-carbon-3/70 text-bone' : 'border-hair bg-carbon/40 text-smoke line-through'}`}
            >
              <span className="h-2 w-2 rounded-full transition-opacity" style={{ background: color, boxShadow: on ? `0 0 10px ${color}` : 'none', opacity: on ? 1 : 0.35 }} />
              {b.label}
              <span className="tabular text-smoke">{counts[b.id]}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setAnomaliesOnly((v) => !v)}
          aria-pressed={anomaliesOnly}
          disabled={anomalies === 0}
          className={`inline-flex h-7 items-center gap-1.5 border px-2.5 font-code text-[11px] uppercase tracking-[0.08em] backdrop-blur-md transition-all disabled:cursor-not-allowed disabled:opacity-30 ${anomaliesOnly ? 'border-heat/70 bg-heat/15 text-heat' : 'border-hair-2 bg-carbon-3/70 text-ash hover:text-bone'}`}
        >
          <Sparkles size={12} strokeWidth={1.8} /> Anomalies only
          <span className="tabular opacity-70">{anomalies}</span>
        </button>
      </div>

      {/* inspector */}
      <div className="pointer-events-none absolute right-4 top-16 z-10 w-[260px] sm:right-5 sm:top-5">
        <AnimatePresence mode="wait" initial={false}>
          {focused ? (
            <motion.div
              key={focused.tcp_stream}
              initial={{ opacity: 0, x: 14, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="sg-panel p-4"
            >
              <div className="flex items-start gap-3">
                <Grade grade={focused.grade?.letter} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-code text-[10.5px] uppercase tracking-[0.12em] text-smoke">Stream #{focused.tcp_stream}</div>
                  <div className="mt-0.5 truncate text-[14px] font-medium text-bone">{sessionKind(focused)}</div>
                </div>
              </div>
              <div className="mt-3 truncate font-code text-[11.5px] text-ash">
                {focused.client?.ip} → {focused.server?.ip}:{focused.server?.port}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Tag tone={focused.tls_version ? 'cipher' : 'danger'}>{focused.tls_version ? `TLS ${focused.tls_version}` : 'No encryption'}</Tag>
                {focused.capability_mangled && <Tag tone="danger"><ShieldOff size={11} strokeWidth={2} /> downgrade</Tag>}
                {focused.cleartext_auth && <Tag tone="danger"><KeyRound size={11} strokeWidth={2} /> creds exposed</Tag>}
                {focused.ml?.anomaly && <Tag tone="warning"><Sparkles size={11} strokeWidth={2} /> anomaly</Tag>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hair pt-3">
                <Metric label="AI risk" value={typeof focused.ml?.risk_score === 'number' ? Math.round(focused.ml.risk_score * 100) : null} suffix="%" />
                <Metric label="Findings" value={(focused.findings || []).filter((f) => f.severity !== 'info').length} />
              </div>
              {canOpen && (
                <div className="mt-3 inline-flex items-center gap-1 font-code text-[10.5px] uppercase tracking-[0.12em] text-signal">
                  Click to open <ArrowUpRight size={12} strokeWidth={2} />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden border border-hair bg-carbon/55 p-4 backdrop-blur-md sm:block"
            >
              <div className="font-code text-[10.5px] uppercase tracking-[0.12em] text-smoke">In view</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Metric label="Sessions" value={shown} />
                <Metric label="Anomaly" value={anomalies} tone="text-heat" />
                <Metric label="Cleartext" value={cleartext} tone={cleartext ? 'text-signal' : undefined} />
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-smoke">Hover a star to inspect it. Drag to rotate.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* legend */}
      <div className="pointer-events-none absolute bottom-4 left-5 right-5 z-10 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-smoke">
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-go/70" /> healthy core</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-signal/70" /> failing band</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-heat" /> anomaly</span>
        </div>
        <div className="max-w-[420px] text-right text-[11.5px] text-smoke">
          Healthy sessions sit in the core, risky ones drift out. Bigger = higher AI risk. Pulses show traffic, faster for worse grades.{canOpen ? ' Click a star to open it.' : ''}
        </div>
      </div>
    </Panel>
  )
}

function Metric({ label, value, suffix = '', tone = 'text-bone' }) {
  return (
    <div>
      <div className={`text-[22px] ${tone}`}>
        {value == null ? <span className="font-dot font-bold">–</span> : <Readout value={value} suffix={suffix || undefined} />}
      </div>
      <div className="mt-1 font-code text-[10px] uppercase tracking-[0.1em] text-smoke">{label}</div>
    </div>
  )
}
