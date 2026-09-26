import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, CheckCircle, Clock, AlertTriangle, Wrench, FileSearch, ChevronRight, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { listCaptures, adaptBackendCapture } from '../lib/api'

// Status machine for IR workflow
const STATUS_FLOW = {
  ESCALATED:          { label: 'Escalated by SOC',       color: 'bg-crit/10 text-crit border-crit/30',   next: 'IR_INVESTIGATING', nextLabel: 'Start Investigation' },
  IR_INVESTIGATING:   { label: 'Under Investigation',    color: 'bg-warn/10 text-warn border-warn/30',   next: 'CONTAINED',        nextLabel: 'Mark Contained'       },
  CONTAINED:          { label: 'Threat Contained',       color: 'bg-med/10 text-med border-med/30',      next: 'REMEDIATED',       nextLabel: 'Mark Remediated'      },
  REMEDIATED:         { label: 'Remediated',             color: 'bg-ok/10 text-ok border-ok/30',         next: 'AWAITING_AUDIT',   nextLabel: 'Submit for Audit'     },
  AWAITING_AUDIT:     { label: 'Awaiting Audit Review',  color: 'bg-accent/10 text-accent border-accent/30', next: null,           nextLabel: null                   },
  VERIFIED:           { label: 'Verified & Closed',      color: 'bg-ok/10 text-ok border-ok/30',         next: null,             nextLabel: null                   },
  REJECTED:           { label: 'Rejected — Redo Fix',    color: 'bg-crit/10 text-crit border-crit/30',   next: 'IR_INVESTIGATING', nextLabel: 'Restart Investigation' },
}

// We persist statuses per finding in localStorage for the demo
function getStatuses() {
  try { return JSON.parse(localStorage.getItem('sms-ir-statuses') || '{}') } catch { return {} }
}
function saveStatuses(s) {
  try { localStorage.setItem('sms-ir-statuses', JSON.stringify(s)) } catch {}
}

export default function IRDashboard() {
  const [captures, setCaptures] = useState([])
  const [loading, setLoading]   = useState(true)
  const [statuses, setStatuses] = useState(getStatuses)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    listCaptures()
      .then(list => {
        const adapted = list
          .filter(c => c.status === 'COMPLETED')
          .map(c => adaptBackendCapture(c))
        setCaptures(adapted)
      })
      .catch(() => setCaptures([]))
      .finally(() => setLoading(false))
  }, [])

  // All sessions across all captures that have findings
  const incidents = captures.flatMap(cap =>
    (cap.report?.sessions || [])
      .filter(s => (s.findings || []).some(f => ['critical','high'].includes(f.severity)))
      .map(s => ({
        captureId:   cap.id,
        captureFile: cap.report?.capture?.filename || 'Unknown',
        stream:      s.tcp_stream,
        server:      s.server?.ip || s.server,
        protocol:    s.protocol,
        findings:    (s.findings || []).filter(f => ['critical','high'].includes(f.severity)),
        grade:       s.grade?.letter || s.grade,
        aiScore:     s.ai_score,
        key:         `${cap.id}-${s.tcp_stream}`,
      }))
  )

  function advanceStatus(key, nextStatus) {
    const updated = { ...statuses, [key]: nextStatus }
    setStatuses(updated)
    saveStatuses(updated)
  }

  const getStatus = (key) => statuses[key] || 'ESCALATED'

  const grouped = {
    active:   incidents.filter(i => !['VERIFIED','AWAITING_AUDIT'].includes(getStatus(i.key))),
    awaiting: incidents.filter(i => getStatus(i.key) === 'AWAITING_AUDIT'),
    closed:   incidents.filter(i => getStatus(i.key) === 'VERIFIED'),
  }

  if (loading) return (
    <div className="py-32 flex items-center justify-center">
      <p className="text-ink-3 animate-pulse">Loading incidents…</p>
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">IR / Digital Forensics Dashboard</h1>
          <p className="text-ink-3 text-sm mt-1">Investigate escalated incidents · Contain · Remediate · Submit for audit</p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="px-3 py-1 rounded-full bg-crit/10 text-crit border border-crit/20 font-medium">{grouped.active.length} Active</span>
          <span className="px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium">{grouped.awaiting.length} Awaiting Audit</span>
          <span className="px-3 py-1 rounded-full bg-ok/10 text-ok border border-ok/20 font-medium">{grouped.closed.length} Closed</span>
        </div>
      </div>

      {/* Status Machine Reference */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <p className="text-xs font-mono text-ink-3 mb-3 uppercase tracking-wider">CERT-In Incident Response Status Machine</p>
        <div className="flex items-center gap-1 flex-wrap">
          {['ESCALATED','IR_INVESTIGATING','CONTAINED','REMEDIATED','AWAITING_AUDIT','VERIFIED'].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span className={`text-xs px-2 py-0.5 rounded border font-medium ${STATUS_FLOW[s].color}`}>{STATUS_FLOW[s].label}</span>
              {i < arr.length - 1 && <ChevronRight size={12} className="text-ink-3 shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Active Incidents */}
      <section>
        <h2 className="font-display font-semibold text-lg text-ink mb-3 flex items-center gap-2">
          <ShieldAlert size={18} className="text-crit" /> Active Incidents
        </h2>
        {grouped.active.length === 0 ? (
          <div className="bg-surface border border-line rounded-xl p-8 text-center text-ink-3">No active incidents. All clear!</div>
        ) : (
          <div className="space-y-3">
            {grouped.active.map(inc => {
              const status = getStatus(inc.key)
              const flow   = STATUS_FLOW[status]
              const expanded = expandedId === inc.key
              return (
                <motion.div key={inc.key} layout className="bg-surface border border-line rounded-xl overflow-hidden">
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-surface-2 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : inc.key)}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldAlert size={16} className="text-crit shrink-0" />
                      <div>
                        <p className="font-medium text-ink text-sm">{inc.server || 'Unknown Server'} · {inc.protocol}</p>
                        <p className="text-xs text-ink-3">{inc.captureFile} · Stream #{inc.stream} · {inc.findings.length} finding(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${flow.color}`}>{flow.label}</span>
                      {inc.aiScore !== undefined && (
                        <span className="text-xs font-mono text-ink-3">AI: {Number(inc.aiScore).toFixed(2)}</span>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-line p-4 space-y-4 bg-paper">
                      {/* Findings */}
                      <div>
                        <p className="text-xs font-mono text-ink-3 uppercase mb-2">Active Findings</p>
                        <div className="space-y-2">
                          {inc.findings.map((f, i) => (
                            <div key={i} className="bg-surface border border-line rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${f.severity === 'critical' ? 'bg-crit/10 text-crit' : 'bg-warn/10 text-warn'}`}>
                                  {f.severity?.toUpperCase()}
                                </span>
                                <span className="text-sm font-medium text-ink">{f.title || f.rule_id}</span>
                              </div>
                              {f.detail && <p className="text-xs text-ink-3">{f.detail}</p>}
                              {f.recommendation && (
                                <div className="mt-2 bg-ok/5 border border-ok/20 rounded p-2">
                                  <p className="text-xs font-medium text-ok mb-0.5">AI Remediation Guidance:</p>
                                  <p className="text-xs text-ink-2">{f.recommendation}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Evidence Link */}
                      <Link
                        to={`/report/${inc.captureId}/sessions/${inc.stream}`}
                        className="flex items-center gap-2 text-accent text-sm hover:underline w-fit"
                      >
                        <FileSearch size={14} /> View Full Packet Evidence & Hex Dump
                      </Link>

                      {/* Status Advance Button */}
                      {flow.next && (
                        <button
                          onClick={() => advanceStatus(inc.key, flow.next)}
                          className="flex items-center gap-2 bg-accent text-surface px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                        >
                          <Wrench size={14} /> {flow.nextLabel}
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </section>

      {/* Awaiting Audit */}
      {grouped.awaiting.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-lg text-ink mb-3 flex items-center gap-2">
            <Clock size={18} className="text-accent" /> Submitted for Audit Verification
          </h2>
          <div className="space-y-2">
            {grouped.awaiting.map(inc => (
              <div key={inc.key} className="bg-surface border border-accent/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-ink">{inc.server} · {inc.protocol}</p>
                  <p className="text-xs text-ink-3">{inc.captureFile} · Awaiting Auditor verification</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded border bg-accent/10 text-accent border-accent/30 font-medium">Awaiting Audit</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Closed / Verified */}
      {grouped.closed.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-lg text-ink mb-3 flex items-center gap-2">
            <CheckCircle size={18} className="text-ok" /> Verified & Closed
          </h2>
          <div className="space-y-2">
            {grouped.closed.map(inc => (
              <div key={inc.key} className="bg-surface border border-ok/20 rounded-xl p-4 flex items-center justify-between opacity-70">
                <div>
                  <p className="font-medium text-sm text-ink">{inc.server} · {inc.protocol}</p>
                  <p className="text-xs text-ink-3">{inc.captureFile} · Closed by Auditor</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded border bg-ok/10 text-ok border-ok/30 font-medium">✓ Verified</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
