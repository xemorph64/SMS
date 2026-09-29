import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Wrench, FileLock2, ClipboardCheck, Settings2, RefreshCw } from 'lucide-react'
import { listIncidents } from '../lib/api'
import { useAuth } from '../lib/auth'
import IncidentDetail from '../components/IncidentDetail'
import CertInTimer from '../components/CertInTimer'

/**
 * The one incident surface, tabbed by workflow seat: SOC triage, the two
 * tracks, the audit queue, and an admin oversight view. Every role opens the
 * same page; what differs is which tabs offer actions and which render
 * read-only — the backend decides that per endpoint, the tabs only reflect it.
 */

const TABS = [
  { id: 'soc',       label: 'SOC Triage',    icon: ShieldAlert,    roles: ['ROLE_SOC_ANALYST', 'ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_INCIDENT_RESPONDER', 'ROLE_FORENSICS_ANALYST'] },
  { id: 'ir',        label: 'IR Track',      icon: Wrench,         roles: ['ROLE_INCIDENT_RESPONDER', 'ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_SOC_ANALYST', 'ROLE_FORENSICS_ANALYST'] },
  { id: 'forensics', label: 'Forensics',     icon: FileLock2,      roles: ['ROLE_FORENSICS_ANALYST', 'ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_SOC_ANALYST', 'ROLE_INCIDENT_RESPONDER'] },
  { id: 'audit',     label: 'Audit Queue',   icon: ClipboardCheck, roles: ['ROLE_AUDITOR', 'ROLE_ADMIN', 'ROLE_SOC_ANALYST', 'ROLE_INCIDENT_RESPONDER', 'ROLE_FORENSICS_ANALYST'] },
  { id: 'admin',     label: 'Platform Admin',icon: Settings2,      roles: ['ROLE_ADMIN'] },
]

// Per tab: which parent statuses belong here, and in which order.
const TAB_FILTERS = {
  soc:       ['DETECTED'],
  ir:        ['ESCALATED', 'AWAITING_AUDIT', 'VERIFIED_CLOSED'],
  forensics: ['ESCALATED', 'AWAITING_AUDIT', 'VERIFIED_CLOSED'],
  audit:     ['AWAITING_AUDIT', 'VERIFIED_CLOSED'],
  admin:     ['DETECTED', 'DISMISSED', 'ESCALATED', 'AWAITING_AUDIT', 'VERIFIED_CLOSED'],
}

export default function IncidentCommandCenter() {
  const { role } = useAuth()
  const [tab, setTab] = useState(() => {
    switch (role) {
      case 'ROLE_SOC_ANALYST':         return 'soc'
      case 'ROLE_INCIDENT_RESPONDER':  return 'ir'
      case 'ROLE_FORENSICS_ANALYST':   return 'forensics'
      case 'ROLE_AUDITOR':             return 'audit'
      default:                         return 'admin'
    }
  })
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setIncidents(await listIncidents())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const visible = useMemo(
    () => incidents.filter((i) => TAB_FILTERS[tab].includes(i.status)),
    [incidents, tab],
  )

  const slaBreached = (i) =>
    i.certInClockDeadline && new Date(i.certInClockDeadline).getTime() < Date.now() &&
    (i.status === 'ESCALATED' || i.status === 'AWAITING_AUDIT')

  const counts = useMemo(() => ({
    detected: incidents.filter(i => i.status === 'DETECTED').length,
    escalated: incidents.filter(i => i.status === 'ESCALATED').length,
    gate: incidents.filter(i => i.status === 'AWAITING_AUDIT').length,
    breached: incidents.filter(slaBreached).length,
  }), [incidents])

  if (loading) return (
    <div className="py-32 flex items-center justify-center">
      <p className="text-ink-3 animate-pulse">Loading incident queue…</p>
    </div>
  )

  const visibleTabs = TABS.filter(t => t.roles.includes(role))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with live SLA posture */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Incident Command Center</h1>
          <p className="text-ink-3 text-sm mt-1">
            Dual-track response — parallel Incident Response & Digital Forensics, converged by compliance audit.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="px-3 py-1 rounded-full bg-crit/10 text-crit border border-crit/20 font-medium">
            {counts.detected} Awaiting Triage
          </span>
          <span className="px-3 py-1 rounded-full bg-warn/10 text-warn border border-warn/20 font-medium">
            {counts.escalated} In Response
          </span>
          <span className="px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium">
            {counts.gate} At Audit Gate
          </span>
          {counts.breached > 0 && (
            <span className="px-3 py-1 rounded-full bg-crit text-surface border border-crit font-bold animate-pulse">
              {counts.breached} SLA BREACHED
            </span>
          )}
          <button
            onClick={() => load()}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-line bg-surface hover:bg-surface-2 text-ink-2"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Role-scoped tab filters */}
      <div className="flex border-b border-line overflow-x-auto custom-scrollbar">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setExpanded(null) }}
            className={`px-4 py-3 text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 ${
              tab === t.id ? 'text-accent border-accent' : 'text-ink-2 border-transparent hover:text-ink hover:border-line'
            }`}
          >
            <div className="flex items-center gap-2"><t.icon size={16} /> {t.label}</div>
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-crit/10 border border-crit/30 text-crit px-4 py-2 rounded-lg text-sm">{error}</div>
      )}

      {/* Incident rows */}
      {visible.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-12 text-center text-ink-3">
          {tab === 'soc' && 'No incidents awaiting triage. Escalations will appear here as analyses detect critical or high findings.'}
          {tab === 'ir' && 'No incidents in the response track.'}
          {tab === 'forensics' && 'No incidents in the forensics track.'}
          {tab === 'audit' && 'No incidents awaiting audit verification.'}
          {tab === 'admin' && 'No incidents recorded yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((inc) => {
            const open = expanded === inc.id
            return (
              <div key={inc.id} className={`bg-surface border rounded-xl overflow-hidden ${slaBreached(inc) ? 'border-crit/40' : 'border-line'}`}>
                <div
                  className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-2 transition-colors"
                  onClick={() => setExpanded(open ? null : inc.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusDot status={inc.status} />
                    <div className="min-w-0">
                      <p className="font-medium text-ink text-sm truncate">
                        {inc.captureSummary?.filename || `Capture #${inc.captureId}`} · Stream #{inc.streamId}
                      </p>
                      <p className="text-xs text-ink-3 font-mono truncate">
                        {inc.status}
                        {inc.irTrack && ` · IR: ${inc.irTrack.irStatus}`}
                        {inc.dfTrack && ` · DF: ${inc.dfTrack.dfStatus}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {inc.status === 'ESCALATED' && inc.certInClockDeadline && (
                      <CertInTimer deadline={inc.certInClockDeadline} />
                    )}
                    <StatusBadge status={inc.status} />
                  </div>
                </div>
                {open && (
                  <IncidentDetail
                    incident={inc}
                    onChanged={async () => { await load(); setExpanded(inc.id) }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }) {
  const color = {
    DETECTED: 'bg-crit', DISMISSED: 'bg-line-2', ESCALATED: 'bg-warn',
    AWAITING_AUDIT: 'bg-accent', VERIFIED_CLOSED: 'bg-ok',
  }[status] || 'bg-line-2'
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
}

function StatusBadge({ status }) {
  const map = {
    DETECTED:       { label: 'Detected',          cls: 'bg-crit/10 text-crit border-crit/30' },
    DISMISSED:      { label: 'Dismissed',         cls: 'bg-surface-2 text-ink-3 border-line' },
    ESCALATED:      { label: 'In Response',       cls: 'bg-warn/10 text-warn border-warn/30' },
    AWAITING_AUDIT: { label: 'Awaiting Audit',    cls: 'bg-accent/10 text-accent border-accent/30' },
    VERIFIED_CLOSED:{ label: 'Verified & Closed', cls: 'bg-ok/10 text-ok border-ok/30' },
  }
  const s = map[status] || { label: status, cls: 'bg-surface-2 text-ink-3 border-line' }
  return <span className={`text-xs px-2 py-0.5 rounded border font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>
}
