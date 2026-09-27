import React, { useEffect, useState, useRef } from 'react'
import { ShieldAlert, CheckCircle, Clock, AlertTriangle, Wrench, RotateCcw, Timer } from 'lucide-react'
import { motion } from 'framer-motion'
import { listCaptures, adaptBackendCapture, getAllFindingsStatuses, updateFindingStatus } from '../lib/api'
import { useAuth } from '../lib/auth'

// Status machine for IR workflow (REMEDIATED and beyond hand off to Forensics)
const STATUS_FLOW = {
  ESCALATED:        { label: 'Escalated by SOC',      color: 'bg-crit/10 text-crit border-crit/30',       next: 'IR_INVESTIGATING', nextLabel: 'Start Investigation'   },
  IR_INVESTIGATING: { label: 'Under Investigation',   color: 'bg-warn/10 text-warn border-warn/30',       next: 'CONTAINED',        nextLabel: 'Mark Contained'        },
  CONTAINED:        { label: 'Threat Contained',      color: 'bg-med/10 text-med border-med/30',          next: 'REMEDIATED',       nextLabel: 'Mark Remediated'       },
  REMEDIATED:       { label: 'Awaiting Forensics',    color: 'bg-ok/10 text-ok border-ok/30',             next: null,               nextLabel: null                    },
  FORENSIC_ANALYSIS:{ label: 'Under Forensic Analysis',color:'bg-accent/10 text-accent border-accent/30', next: null,               nextLabel: null                    },
  AWAITING_AUDIT:   { label: 'Awaiting Audit',        color: 'bg-accent/10 text-accent border-accent/30', next: null,               nextLabel: null                    },
  VERIFIED:         { label: 'Verified & Closed',     color: 'bg-ok/10 text-ok border-ok/30',             next: null,               nextLabel: null                    },
  REJECTED:         { label: 'Rejected — Redo Fix',   color: 'bg-crit/10 text-crit border-crit/30',       next: 'IR_INVESTIGATING', nextLabel: 'Restart Investigation'  },
}

// CERT-In 6-hour countdown timer component
function CertInTimer({ escalatedAt }) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!escalatedAt) return
    const tick = () => {
      const elapsed = (Date.now() - new Date(escalatedAt).getTime()) / 1000
      const rem = Math.max(0, 6 * 3600 - elapsed)
      setRemaining(rem)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [escalatedAt])

  if (remaining === null) return null

  const hours   = Math.floor(remaining / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)
  const seconds = Math.floor(remaining % 60)
  const pct     = (remaining / (6 * 3600)) * 100

  const urgency = remaining > 4 * 3600
    ? { ring: 'border-ok',   text: 'text-ok',   bg: 'bg-ok',   label: 'CERT-In 6-Hr Timer' }
    : remaining > 2 * 3600
    ? { ring: 'border-warn', text: 'text-warn', bg: 'bg-warn', label: '⚠ CERT-In Timer — Urgent' }
    : { ring: 'border-crit', text: 'text-crit', bg: 'bg-crit', label: '🚨 CERT-In Timer — CRITICAL' }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${urgency.ring} bg-surface text-xs font-mono`}>
      <Timer size={13} className={urgency.text} />
      <span className={`font-bold ${urgency.text}`}>{urgency.label}</span>
      <span className={`${urgency.text} font-mono`}>
        {String(hours).padStart(2,'0')}:{String(minutes).padStart(2,'0')}:{String(seconds).padStart(2,'0')}
      </span>
      {remaining === 0 && (
        <span className="text-crit font-bold animate-pulse">OVERDUE — FILE NOW</span>
      )}
    </div>
  )
}

export default function IRDashboard() {
  const { token } = useAuth()
  const [captures, setCaptures]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [statuses, setStatuses]   = useState({})   // key: `${captureId}-${streamId}` → status object
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function load() {
      const [capList, allStatuses] = await Promise.all([
        listCaptures().catch(() => []),
        getAllFindingsStatuses().catch(() => []),
      ])
      const adapted = capList
        .filter(c => c.status === 'COMPLETED')
        .map(c => adaptBackendCapture(c))
      setCaptures(adapted)

      const map = {}
      allStatuses.forEach(s => { map[`${s.captureId}-${s.streamId}`] = s })
      setStatuses(map)
      setLoading(false)
    }
    load()
  }, [])

  // All sessions with critical/high findings that are still IR's responsibility
  const incidents = captures.flatMap(cap =>
    (cap.report?.sessions || [])
      .filter(s => (s.findings || []).some(f => ['critical','high'].includes(f.severity)))
      .map(s => {
        const key = `${cap.id}-${s.tcp_stream}`
        return {
          captureId:   cap.id,
          captureFile: cap.report?.capture?.filename || 'Unknown',
          stream:      s.tcp_stream,
          server:      s.server?.ip || s.server,
          protocol:    s.protocol,
          findings:    (s.findings || []).filter(f => ['critical','high'].includes(f.severity)),
          grade:       s.grade?.letter || s.grade,
          aiScore:     s.ai_score,
          key,
          statusObj:   statuses[key],
        }
      })
  )

  async function advanceStatus(inc, nextStatus) {
    const updated = await updateFindingStatus(inc.captureId, inc.stream, nextStatus)
    setStatuses(prev => ({ ...prev, [inc.key]: updated }))
  }

  const getStatus = (inc) => inc.statusObj?.status || 'ESCALATED'

  // IR only sees incidents NOT yet handed to Forensics/Audit
  const irIncidents = incidents.filter(i =>
    !['FORENSIC_ANALYSIS','AWAITING_AUDIT','VERIFIED'].includes(getStatus(i))
  )
  const handedOff = incidents.filter(i =>
    ['FORENSIC_ANALYSIS','AWAITING_AUDIT','VERIFIED'].includes(getStatus(i))
  )

  if (loading) return (
    <div className="py-32 flex items-center justify-center">
      <p className="text-ink-3 animate-pulse">Loading incident queue…</p>
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Incident Responder War Room</h1>
          <p className="text-ink-3 text-sm mt-1">
            CERT-In Direction No. 70(1)/2022 — Containment only · No forensic evidence access
          </p>
        </div>
        <div className="flex gap-3 text-sm flex-wrap">
          <span className="px-3 py-1 rounded-full bg-crit/10 text-crit border border-crit/20 font-medium">
            {irIncidents.filter(i => ['ESCALATED','REJECTED'].includes(getStatus(i))).length} Needs Action
          </span>
          <span className="px-3 py-1 rounded-full bg-warn/10 text-warn border border-warn/20 font-medium">
            {irIncidents.filter(i => ['IR_INVESTIGATING','CONTAINED'].includes(getStatus(i))).length} In Progress
          </span>
          <span className="px-3 py-1 rounded-full bg-ok/10 text-ok border border-ok/20 font-medium">
            {handedOff.length} Handed to Forensics
          </span>
        </div>
      </div>

      {/* Separation of duties notice */}
      <div className="bg-surface border border-crit/20 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert size={18} className="text-crit mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-ink">Separation of Duties Enforced (NIST AC-5)</p>
          <p className="text-ink-3 text-xs mt-0.5">
            You do <strong>not</strong> have access to raw packet evidence or hex dumps.
            Once you mark an incident as Remediated, it transfers to the Digital Forensics Analyst.
          </p>
        </div>
      </div>

      {/* Active IR Incidents */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide">Active Incidents</h2>

        {irIncidents.length === 0 ? (
          <div className="bg-surface border border-line rounded-xl p-10 text-center text-ink-3">
            No active incidents. SOC Analyst must escalate findings first.
          </div>
        ) : (
          irIncidents.map(inc => {
            const st      = getStatus(inc)
            const stInfo  = STATUS_FLOW[st] || STATUS_FLOW['ESCALATED']
            const expanded = expandedId === inc.key
            const isEscalated = st === 'ESCALATED' || st === 'REJECTED'

            return (
              <motion.div key={inc.key} layout className="bg-surface border border-line rounded-xl overflow-hidden">
                {/* Row */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-surface-2 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : inc.key)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ShieldAlert size={16} className="text-crit shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-ink text-sm truncate">
                        {inc.server || 'Unknown'} · {inc.protocol}
                        {inc.aiScore != null && (
                          <span className="ml-2 text-xs text-ink-3 font-mono">AI: {inc.aiScore.toFixed(2)}</span>
                        )}
                      </p>
                      <p className="text-xs text-ink-3 truncate">{inc.captureFile} · Stream #{inc.stream}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* CERT-In timer for escalated incidents */}
                    {isEscalated && inc.statusObj?.escalatedAt && (
                      <CertInTimer escalatedAt={inc.statusObj.escalatedAt} />
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${stInfo.color}`}>
                      {stInfo.label}
                    </span>
                  </div>
                </div>

                {/* Expanded */}
                {expanded && (
                  <div className="border-t border-line p-5 space-y-4 bg-paper">
                    {/* Findings */}
                    <div className="space-y-2">
                      {inc.findings.map((f, i) => (
                        <div key={i} className="bg-surface border border-line rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              f.severity === 'critical' ? 'bg-crit/10 text-crit' : 'bg-warn/10 text-warn'
                            }`}>{f.severity?.toUpperCase()}</span>
                            <span className="text-sm font-medium text-ink">{f.title || f.rule_id}</span>
                          </div>
                          {f.detail && <p className="text-xs text-ink-3">{f.detail}</p>}
                          {f.recommendation && (
                            <p className="text-xs text-ok mt-1">
                              <span className="font-medium">Remediation: </span>{f.recommendation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* NOTE: IR does NOT get hex dump access */}
                    <div className="text-xs text-ink-3 italic border border-line rounded-lg px-3 py-2">
                      🔒 Raw packet evidence & hex dumps are accessible only to the Digital Forensics Analyst
                      (ISO/IEC 27037 chain-of-custody).
                    </div>

                    {/* Advance status button */}
                    {stInfo.next && (
                      <button
                        onClick={() => advanceStatus(inc, stInfo.next)}
                        className="bg-accent text-surface px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                      >
                        {stInfo.nextLabel}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })
        )}
      </div>

      {/* Handed off to Forensics */}
      {handedOff.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide">
            Handed to Forensics / Audit ({handedOff.length})
          </h2>
          {handedOff.map(inc => {
            const st     = getStatus(inc)
            const stInfo = STATUS_FLOW[st] || {}
            return (
              <div key={inc.key} className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between opacity-70">
                <div>
                  <p className="text-sm font-medium text-ink">{inc.server} · {inc.protocol}</p>
                  <p className="text-xs text-ink-3">{inc.captureFile} · Stream #{inc.stream}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${stInfo.color}`}>
                  {stInfo.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
