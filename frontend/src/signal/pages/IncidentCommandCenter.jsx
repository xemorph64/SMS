import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, X, ArrowUpRight } from 'lucide-react'
import { listIncidents, getCapture, adaptBackendSession } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import IncidentDetail from '../components/IncidentDetail'
import CertInTimer from '../components/CertInTimer'
import { useHeat } from '../components/SignalField'
import { IR_STEPS, DF_STEPS, laneProgress } from '../components/DualTrack'
import { Decode, Empty, Loading, Notice, PageHeader, Severity, Stat, Tabs, Tag } from '../ui'

// Same tabs, role visibility and status filters as the classic command center.
const TABS = [
  { id: 'soc', label: 'SOC triage', roles: ['ROLE_SOC_ANALYST', 'ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_INCIDENT_RESPONDER', 'ROLE_FORENSICS_ANALYST'] },
  { id: 'ir', label: 'IR track', roles: ['ROLE_INCIDENT_RESPONDER', 'ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_SOC_ANALYST', 'ROLE_FORENSICS_ANALYST'] },
  { id: 'forensics', label: 'Forensics', roles: ['ROLE_FORENSICS_ANALYST', 'ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_SOC_ANALYST', 'ROLE_INCIDENT_RESPONDER'] },
  { id: 'audit', label: 'Audit queue', roles: ['ROLE_AUDITOR', 'ROLE_ADMIN', 'ROLE_SOC_ANALYST', 'ROLE_INCIDENT_RESPONDER', 'ROLE_FORENSICS_ANALYST'] },
  { id: 'admin', label: 'All', roles: ['ROLE_ADMIN'] },
]

const TAB_FILTERS = {
  soc: ['DETECTED'],
  ir: ['ESCALATED', 'AWAITING_AUDIT', 'VERIFIED_CLOSED'],
  forensics: ['ESCALATED', 'AWAITING_AUDIT', 'VERIFIED_CLOSED'],
  audit: ['AWAITING_AUDIT', 'VERIFIED_CLOSED'],
  admin: ['DETECTED', 'DISMISSED', 'ESCALATED', 'AWAITING_AUDIT', 'VERIFIED_CLOSED'],
}

const EMPTY_TEXT = {
  soc: ['Nothing to triage', 'Escalations appear here when an analysis finds critical or high issues.'],
  ir: ['No incidents in response', 'Incidents land here once SOC escalates them.'],
  forensics: ['No incidents in forensics', 'Evidence is locked for you the moment SOC escalates.'],
  audit: ['Audit queue is clear', 'An incident arrives here only after IR and Forensics both finish.'],
  admin: ['No incidents yet', 'Run an analysis to generate detections.'],
}

const STATUS = {
  DETECTED: { label: 'Needs triage', tone: 'danger' },
  DISMISSED: { label: 'Dismissed', tone: 'muted' },
  ESCALATED: { label: 'In response', tone: 'warning' },
  AWAITING_AUDIT: { label: 'Audit gate', tone: 'signal' },
  VERIFIED_CLOSED: { label: 'Closed', tone: 'go' },
}

/**
 * Crypto context for each incident row, fetched once per capture and cached
 * for the life of the page. The incident API carries only the filename; the
 * session's protocol, endpoints, TLS and cipher come from the capture detail
 * the UI already has access to.
 */
function useCryptoContext(incidents) {
  const [ctx, setCtx] = useState({})
  const captureIds = useMemo(
    () => [...new Set(incidents.map((i) => i.captureId).filter(Boolean))],
    [incidents],
  )
  useEffect(() => {
    let alive = true
    captureIds.forEach((id) => {
      getCapture(id)
        .then((detail) => {
          if (!alive) return
          const sessions = detail.sessions || detail.report?.sessions || []
          const byStream = {}
          sessions.forEach((s) => {
            // Engine-shape sessions are reused as-is; the backend's flattened
            // camelCase shape is mapped onto it (client as "ip:port", etc.).
            const v = s.tls_version !== undefined ? s : adaptBackendSession(s)
            byStream[String(v.tcp_stream)] = v
          })
          setCtx((prev) => ({ ...prev, [id]: byStream }))
        })
        .catch(() => {})
    })
    return () => { alive = false }
  }, [captureIds])
  return ctx
}

/** Short human label for the worst finding on a session. */
function topFinding(session) {
  const bad = (session?.findings || []).filter((f) => f.severity !== 'info')
  if (!bad.length) return null
  const order = { critical: 0, high: 1, medium: 2, low: 3 }
  return bad.slice().sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))[0]
}

const ease = [0.16, 1, 0.3, 1]

export default function IncidentCommandCenter() {
  const { role } = useAuth()
  const [tab, setTab] = useState(() => {
    switch (role) {
      case 'ROLE_SOC_ANALYST': return 'soc'
      case 'ROLE_INCIDENT_RESPONDER': return 'ir'
      case 'ROLE_FORENSICS_ANALYST': return 'forensics'
      case 'ROLE_AUDITOR': return 'audit'
      default: return 'admin'
    }
  })
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setIncidents(await listIncidents())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const slaBreached = (i) =>
    i.certInClockDeadline && new Date(i.certInClockDeadline).getTime() < Date.now() &&
    (i.status === 'ESCALATED' || i.status === 'AWAITING_AUDIT')

  const counts = useMemo(() => ({
    detected: incidents.filter((i) => i.status === 'DETECTED').length,
    escalated: incidents.filter((i) => i.status === 'ESCALATED').length,
    gate: incidents.filter((i) => i.status === 'AWAITING_AUDIT').length,
    breached: incidents.filter(slaBreached).length,
  }), [incidents])

  useHeat(counts.breached ? 0.85 : counts.detected ? 0.4 : 0.1)

  const visibleTabs = TABS.filter((t) => t.roles.includes(role)).map((t) => ({
    ...t,
    count: incidents.filter((i) => TAB_FILTERS[t.id].includes(i.status)).length,
  }))
  const visible = incidents.filter((i) => TAB_FILTERS[tab].includes(i.status))
  const open = incidents.find((i) => i.id === openId)
  const crypto = useCryptoContext(incidents)

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <div>
      <PageHeader
        kicker="Case board"
        title="Incidents"
        term="separation"
        purpose="Every escalation from detection to verified closure. Open a case to see its evidence and take your next step."
        actions={
          <button onClick={refresh} className="sg-btn-ghost" disabled={refreshing}>
            <RefreshCw size={14} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="mb-10 grid grid-cols-2 border-y border-hair md:grid-cols-4">
        {[
          ['Awaiting triage', counts.detected, counts.detected ? 'danger' : 'default', 'triage',
            counts.detected ? 'Open a case to triage it' : 'Nothing waiting on you'],
          ['In response', counts.escalated, counts.escalated ? 'warning' : 'default', 'irTrack',
            counts.escalated ? 'IR and Forensics tracks are open' : 'No active response work'],
          ['At audit gate', counts.gate, 'default', 'dualGate',
            counts.gate ? 'Waiting on the auditor’s verdict' : 'Audit queue is clear'],
          ['SLA breached', counts.breached, counts.breached ? 'danger' : 'safe', 'certIn',
            counts.breached ? 'CERT-In 6-hour clock has run out' : 'All reporting clocks on track'],
        ].map(([label, value, tone, term, hint], i) => (
          <div key={label} className={`px-5 py-6 ${i % 2 ? 'border-l border-hair' : ''} ${i >= 2 ? 'border-t border-hair md:border-t-0' : ''} ${i === 2 ? 'md:border-l' : ''}`}>
            <Stat label={label} value={value} tone={tone} term={term} hint={hint} />
          </div>
        ))}
      </div>

      <div className="mb-6">
        <Tabs tabs={visibleTabs} value={tab} onChange={(id) => setTab(id)} />
      </div>

      {error && <Notice tone="crit" title="Could not load incidents" className="mb-5">{error}</Notice>}

      {loading ? (
        <Loading rows={4} label="Pulling case files" />
      ) : visible.length === 0 ? (
        <div className="border border-dashed border-hair-2">
          <Empty title={EMPTY_TEXT[tab][0]}>{EMPTY_TEXT[tab][1]}</Empty>
        </div>
      ) : (
        <ul className="border-t border-hair">
          {visible.map((inc, idx) => (
            <CaseStrip key={inc.id} inc={inc} idx={idx} breached={slaBreached(inc)} session={(crypto[inc.captureId] || {})[String(inc.streamId)]} onOpen={() => setOpenId(inc.id)} />
          ))}
        </ul>
      )}

      {createPortal(
        <AnimatePresence>
          {open && (
            <CaseFile
              key={open.id}
              inc={open}
              onClose={() => setOpenId(null)}
              onChanged={async () => { await load() }}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

function CaseStrip({ inc, idx, breached, session, onOpen }) {
  const s = STATUS[inc.status] || { label: inc.status, tone: 'muted' }
  const ir = laneProgress(IR_STEPS, inc.irTrack?.irStatus, inc.status)
  const df = laneProgress(DF_STEPS, inc.dfTrack?.dfStatus, inc.status)
  const tracked = inc.status !== 'DETECTED' && inc.status !== 'DISMISSED'
  const finding = topFinding(session)
  const filename = inc.captureSummary?.filename || `Capture #${inc.captureId}`
  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: Math.min(idx, 10) * 0.035, ease }}
      className="border-b border-hair"
    >
      <button
        type="button"
        onClick={onOpen}
        className={`group relative grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-4 py-4 pl-2 pr-3 text-left transition-colors hover:bg-carbon-3/60 md:grid-cols-[52px_minmax(0,1.4fr)_minmax(0,1.2fr)_auto] ${breached ? 'bg-signal/[0.06]' : ''}`}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 bg-signal transition-transform duration-300 group-hover:scale-y-100" />
        <span className={`text-[24px] font-bold leading-none tabular ${breached ? 'text-signal' : 'text-smoke group-hover:text-bone'} transition-colors`}>
          {String(inc.id).padStart(2, '0')}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            {finding && <Severity severity={finding.severity} />}
            <span className="truncate text-[15px] font-semibold text-bone">
              {session ? `${(session.protocol || '').toUpperCase()} · ${session.client?.ip} → ${session.server_name || session.server?.ip}` : filename}
            </span>
          </span>
          <span className="mt-1 block truncate text-[12.5px] text-smoke">
            {session
              ? [session.tls_version ? `TLS ${session.tls_version}` : 'No encryption', session.cipher_suite, `Evidence: ${filename} · stream ${inc.streamId}`].filter(Boolean).join(' · ')
              : `Evidence: ${filename} · stream ${inc.streamId}`}
          </span>
        </span>
        <span className="hidden min-w-0 md:block">
          {tracked ? (
            <span className="block space-y-1.5">
              <MiniLane label="IR" done={ir} total={IR_STEPS.length} />
              <MiniLane label="Forensics" done={df} total={DF_STEPS.length} />
            </span>
          ) : (
            <span className="text-[12.5px] text-smoke">
              {inc.status === 'DETECTED' ? <><span className="sg-blink text-signal">●</span> Waiting for SOC triage</> : 'No tracks opened'}
            </span>
          )}
        </span>
        <span className="flex items-center gap-4">
          {inc.status === 'ESCALATED' && inc.certInClockDeadline && <CertInTimer deadline={inc.certInClockDeadline} />}
          <Tag tone={s.tone}>{s.label}</Tag>
          <ArrowUpRight size={18} strokeWidth={1.5} className="text-smoke transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-signal" />
        </span>
      </button>
    </motion.li>
  )
}

function MiniLane({ label, done, total }) {
  return (
    <span className="flex items-center gap-3">
      <span className="w-6 font-code text-[11px] text-smoke">{label}</span>
      <span className="grid flex-1 grid-cols-4 gap-1" aria-label={`${label} ${done} of ${total} steps done`}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`h-[3px] rounded-full ${i < done ? 'bg-ice' : i === done ? 'bg-signal' : 'bg-hair-2'}`} />
        ))}
      </span>
      <span className="w-8 text-right font-code text-[11px] text-smoke tabular">{done}/{total}</span>
    </span>
  )
}

/** Full-screen case file. Esc or the close button returns to the board. */
function CaseFile({ inc, onClose, onChanged }) {
  const s = STATUS[inc.status] || { label: inc.status, tone: 'muted' }
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <motion.div
      className="fixed inset-0 z-[55]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Case ${inc.id}`}
    >
      <button className="absolute inset-0 bg-carbon/80 backdrop-blur-md" aria-label="Close case" onClick={onClose} />
      <motion.div
        initial={{ clipPath: 'inset(0 0 100% 0)' }}
        animate={{ clipPath: 'inset(0 0 0% 0)' }}
        exit={{ clipPath: 'inset(0 0 100% 0)' }}
        transition={{ duration: 0.55, ease: [0.7, 0, 0.2, 1] }}
        className="absolute inset-x-0 bottom-0 top-0 overflow-y-auto border-t-2 border-signal bg-carbon sm:inset-x-6 sm:top-6 lg:inset-x-16 lg:top-10"
        data-lenis-prevent
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-hair bg-carbon/90 px-5 py-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <span className="text-[34px] font-bold leading-none text-signal tabular">{String(inc.id).padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="sg-kicker">Case file · stream {inc.streamId}</div>
              <div className="truncate text-[18px] font-bold text-bone">
                <Decode text={inc.captureSummary?.filename || `Capture #${inc.captureId}`} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Tag tone={s.tone}>{s.label}</Tag>
            <button onClick={onClose} className="sg-btn-ghost sg-btn-sm w-8 px-0" aria-label="Close case">
              <X size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <IncidentDetail incident={inc} onChanged={onChanged} />
      </motion.div>
    </motion.div>
  )
}
