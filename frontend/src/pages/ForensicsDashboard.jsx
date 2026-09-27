import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, FileSearch, Clock, CheckCircle, FileLock2, BookOpen, ChevronRight, Download } from 'lucide-react'
import { motion } from 'framer-motion'
import { listCaptures, adaptBackendCapture, getAllFindingsStatuses, updateFindingStatus, logCustodyAction, getCustodyLog } from '../lib/api'
import { useAuth } from '../lib/auth'

const STATUS_LABEL = {
  REMEDIATED:        { label: 'Awaiting Forensic Analysis', color: 'bg-warn/10 text-warn border-warn/30' },
  FORENSIC_ANALYSIS: { label: 'Under Forensic Analysis',   color: 'bg-accent/10 text-accent border-accent/30' },
  AWAITING_AUDIT:    { label: 'Submitted for Audit',        color: 'bg-ok/10 text-ok border-ok/30' },
  VERIFIED:          { label: 'Verified & Closed',          color: 'bg-ok/10 text-ok border-ok/30' },
}

export default function ForensicsDashboard() {
  const { role } = useAuth()
  const [captures, setCaptures]     = useState([])
  const [statuses, setStatuses]     = useState({})   // key: `${captureId}-${streamId}` → status obj
  const [custodyLogs, setCustodyLogs] = useState({})
  const [loading, setLoading]       = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const { token } = useAuth()

  // Derive username from JWT
  const username = (() => {
    try { return JSON.parse(atob(token.split('.')[1])).sub } catch { return 'forensics' }
  })()

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

      // Build statuses map
      const map = {}
      allStatuses.forEach(s => { map[`${s.captureId}-${s.streamId}`] = s })
      setStatuses(map)
      setLoading(false)
    }
    load()
  }, [])

  // Incidents in REMEDIATED or FORENSIC_ANALYSIS states
  const forensicIncidents = captures.flatMap(cap =>
    (cap.report?.sessions || [])
      .filter(s => {
        const key = `${cap.id}-${s.tcp_stream}`
        const st  = statuses[key]?.status
        return ['REMEDIATED', 'FORENSIC_ANALYSIS', 'AWAITING_AUDIT'].includes(st)
      })
      .map(s => ({
        captureId:   cap.id,
        captureFile: cap.report?.capture?.filename || 'Unknown',
        stream:      s.tcp_stream,
        server:      s.server?.ip || s.server,
        protocol:    s.protocol,
        findings:    (s.findings || []).filter(f => ['critical','high'].includes(f.severity)),
        grade:       s.grade?.letter || s.grade,
        key:         `${cap.id}-${s.tcp_stream}`,
        statusObj:   statuses[`${cap.id}-${s.tcp_stream}`],
      }))
  )

  async function advanceStatus(inc, nextStatus) {
    const updated = await updateFindingStatus(inc.captureId, inc.stream, nextStatus)
    setStatuses(prev => ({ ...prev, [inc.key]: updated }))
  }

  async function loadCustodyLog(inc) {
    const log = await getCustodyLog(inc.captureId, inc.stream)
    setCustodyLogs(prev => ({ ...prev, [inc.key]: log }))
  }

  async function handleExpand(inc) {
    const isExpanding = expandedId !== inc.key
    setExpandedId(isExpanding ? inc.key : null)
    if (isExpanding) {
      // Log evidence access for chain-of-custody
      await logCustodyAction(inc.captureId, inc.stream, 'EVIDENCE_VIEWED',
        `Forensics Analyst ${username} opened session evidence`)
      await loadCustodyLog(inc)
    }
  }

  if (loading) return (
    <div className="py-32 flex items-center justify-center">
      <p className="text-ink-3 animate-pulse">Loading forensic evidence queue…</p>
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Digital Forensics Analyst Workstation</h1>
          <p className="text-ink-3 text-sm mt-1">
            ISO/IEC 27037 — Immutable evidence acquisition · Chain-of-custody logging · Post-incident analysis
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="px-3 py-1 rounded-full bg-warn/10 text-warn border border-warn/20 font-medium">
            {forensicIncidents.filter(i => i.statusObj?.status === 'REMEDIATED').length} Awaiting Analysis
          </span>
          <span className="px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium">
            {forensicIncidents.filter(i => i.statusObj?.status === 'FORENSIC_ANALYSIS').length} In Analysis
          </span>
        </div>
      </div>

      {/* ISO 27037 Notice */}
      <div className="bg-surface border border-accent/20 rounded-xl p-4 flex items-start gap-3">
        <FileLock2 size={18} className="text-accent mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-ink">Evidence Isolation Active</p>
          <p className="text-ink-3 text-xs mt-0.5">
            All evidence access is automatically logged to the chain-of-custody ledger per ISO/IEC 27037:2012.
            Incident Responders do not have access to this partition.
          </p>
        </div>
      </div>

      {/* Evidence Queue */}
      {forensicIncidents.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-12 text-center text-ink-3">
          No incidents ready for forensic analysis. IR team must mark incidents as Remediated first.
        </div>
      ) : (
        <div className="space-y-3">
          {forensicIncidents.map(inc => {
            const st      = inc.statusObj?.status || 'REMEDIATED'
            const stInfo  = STATUS_LABEL[st] || STATUS_LABEL['REMEDIATED']
            const expanded = expandedId === inc.key
            const log      = custodyLogs[inc.key] || []

            return (
              <motion.div key={inc.key} layout className="bg-surface border border-line rounded-xl overflow-hidden">
                {/* Incident header row */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-surface-2 transition-colors"
                  onClick={() => handleExpand(inc)}
                >
                  <div className="flex items-center gap-3">
                    <FileLock2 size={16} className="text-accent shrink-0" />
                    <div>
                      <p className="font-medium text-ink text-sm">{inc.server || 'Unknown Server'} · {inc.protocol}</p>
                      <p className="text-xs text-ink-3">{inc.captureFile} · Stream #{inc.stream} · {inc.findings.length} finding(s)</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${stInfo.color}`}>{stInfo.label}</span>
                </div>

                {/* Expanded forensic panel */}
                {expanded && (
                  <div className="border-t border-line p-5 space-y-5 bg-paper">

                    {/* Findings summary */}
                    <div>
                      <p className="text-xs font-mono text-ink-3 uppercase mb-2">Cryptographic Findings</p>
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
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Deep evidence access — FORENSICS ONLY */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        to={`/report/${inc.captureId}/sessions/${inc.stream}`}
                        onClick={() => logCustodyAction(inc.captureId, inc.stream, 'HEX_DUMP_ACCESSED',
                          `Forensics Analyst ${username} opened raw hex dump`)}
                        className="flex items-center gap-2 bg-accent/10 border border-accent/20 text-accent px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors"
                      >
                        <FileSearch size={14} /> Open Hex Dump & Packet Evidence
                      </Link>
                      <Link
                        to={`/report/${inc.captureId}/export`}
                        onClick={() => logCustodyAction(inc.captureId, inc.stream, 'REPORT_EXPORTED',
                          `Forensics Analyst ${username} triggered forensic report export`)}
                        className="flex items-center gap-2 border border-line text-ink-2 px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors"
                      >
                        <Download size={14} /> Export Forensic Report (PDF/JSON/HTML)
                      </Link>
                    </div>

                    {/* Status advance buttons */}
                    <div className="flex items-center gap-3">
                      {st === 'REMEDIATED' && (
                        <button
                          onClick={() => advanceStatus(inc, 'FORENSIC_ANALYSIS')}
                          className="bg-accent text-surface px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
                        >
                          Begin Forensic Analysis
                        </button>
                      )}
                      {st === 'FORENSIC_ANALYSIS' && (
                        <button
                          onClick={() => advanceStatus(inc, 'AWAITING_AUDIT')}
                          className="bg-ok text-surface px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
                        >
                          Submit Forensic Report for Audit
                        </button>
                      )}
                      {st === 'AWAITING_AUDIT' && (
                        <span className="text-sm text-ink-3 italic">Awaiting Auditor verification…</span>
                      )}
                    </div>

                    {/* Chain-of-Custody Log */}
                    <div>
                      <p className="text-xs font-mono text-ink-3 uppercase mb-2 flex items-center gap-1">
                        <BookOpen size={12} /> Chain-of-Custody Ledger (ISO/IEC 27037)
                      </p>
                      {log.length === 0 ? (
                        <p className="text-xs text-ink-3 italic">No custody entries yet.</p>
                      ) : (
                        <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
                          {log.map((entry, i) => (
                            <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                              <span className="font-mono text-ink-2">{entry.action}</span>
                              <span className="text-ink-3">{entry.performedBy}</span>
                              <span className="text-ink-3 font-mono">
                                {new Date(entry.performedAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
