import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldAlert, FileLock2, FileSearch, CheckCircle, XCircle, Clock,
  Fingerprint, ClipboardList, BookOpen, AlertTriangle,
} from 'lucide-react'
import DualTrackStepper from './DualTrackStepper'
import CertInTimer from './CertInTimer'
import { getCapture, adaptBackendCapture, getCustodyLog, logCustodyAction, triageIncident, advanceIrTrack, advanceDfTrack, submitAuditVerdict } from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * The expanded incident panel shared by every tab of the command center.
 *
 * Renders what one incident is made of — findings, immutable hashes, the
 * dual-track stepper — and, for the role that owns the current stage, the
 * action surface for that stage: triage, track advancement, or the audit
 * verdict. Other roles see the same data read-only.
 */
export default function IncidentDetail({ incident, onChanged }) {
  const { role, token } = useAuth()
  const [report, setReport] = useState(null)
  const [custody, setCustody] = useState([])
  const [notes, setNotes] = useState('')
  const [dfReport, setDfReport] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [dismissReason, setDismissReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const st = incident.irTrack?.irStatus
  const df = incident.dfTrack?.dfStatus
  const parent = incident.status

  // The escalated incident's session findings, straight from the stored report.
  useEffect(() => {
    let cancelled = false
    setReport(null)
    getCapture(incident.captureId)
      .then((detail) => {
        if (cancelled) return
        const adapted = detail.report
          ? { ...detail.report }
          : adaptBackendCapture(detail)
        setReport(adapted)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [incident.captureId])

  useEffect(() => {
    let cancelled = false
    getCustodyLog(incident.captureId, incident.streamId)
      .then((log) => { if (!cancelled) setCustody(log || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [incident.captureId, incident.streamId])

  const session = (report?.sessions || []).find(
    (s) => String(s.tcp_stream) === String(incident.streamId),
  )
  const findings = (session?.findings || []).filter((f) => f.severity !== 'info')

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setNotes(''); setDfReport(''); setRejectionReason(''); setDismissReason('')
      await onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const onTriage = (decision) =>
    run(() => triageIncident(incident.id, decision, dismissReason))
  const onIr = (target) => run(() => advanceIrTrack(incident.id, target, notes))
  const onDf = (target) => run(() => advanceDfTrack(incident.id, target, dfReport))
  const onAudit = (verdict) => run(() => submitAuditVerdict(incident.id, verdict, rejectionReason))

  const canTriage = role === 'ROLE_SOC_ANALYST' || role === 'ROLE_ADMIN'
  const canWorkIr = role === 'ROLE_INCIDENT_RESPONDER' || role === 'ROLE_ADMIN'
  const canWorkDf = role === 'ROLE_FORENSICS_ANALYST' || role === 'ROLE_ADMIN'
  const canAudit = role === 'ROLE_AUDITOR' || role === 'ROLE_ADMIN'

  const lastReview = incident.auditHistory?.length
    ? incident.auditHistory[incident.auditHistory.length - 1]
    : null

  return (
    <div className="border-t border-line bg-paper p-5 space-y-5">
      {/* Findings + evidence identity */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-mono text-ink-3 uppercase mb-2">Findings Driving This Incident</p>
          {findings.length === 0 && (
            <div className="text-xs text-ink-3 italic bg-surface border border-line rounded-lg p-3">
              {report ? 'No critical/high findings on this session.' : 'Loading findings…'}
            </div>
          )}
          {findings.map((f, i) => (
            <div key={i} className="bg-surface border border-line rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  f.severity === 'critical' ? 'bg-crit/10 text-crit' : 'bg-warn/10 text-warn'
                }`}>{f.severity?.toUpperCase()}</span>
                <span className="text-sm font-medium text-ink">{f.title || f.rule_id}</span>
              </div>
              {f.detail && <p className="text-xs text-ink-3">{f.detail}</p>}
              {f.remediation && (
                <p className="text-xs text-ok mt-1"><span className="font-medium">Fix: </span>{f.remediation}</p>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono text-ink-3 uppercase mb-2">Evidence Integrity</p>
          <HashRow icon={Fingerprint} k="Snapshot hash" v={incident.snapshotHash} />
          <HashRow icon={FileLock2} k="Evidence lock" v={incident.dfTrack?.evidenceLockHash} />
          <HashRow icon={BookOpen} k="Capture SHA-256" v={incident.captureSummary?.sha256} />
          {incident.certInClockDeadline && (parent === 'ESCALATED' || parent === 'AWAITING_AUDIT') && (
            <div className="pt-1"><CertInTimer deadline={incident.certInClockDeadline} /></div>
          )}
        </div>
      </div>

      {/* Auditor rejection banner: the returned track knows why */}
      {parent === 'ESCALATED' && lastReview && lastReview.verdict !== 'APPROVED' && (
        <div className="bg-crit/5 border border-crit/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-crit mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-ink">
              Returned by audit — {lastReview.verdict === 'REJECTED_IR' ? 'Incident Response' : 'Forensics'} must rework
            </p>
            <p className="text-ink-2 text-xs mt-1">{lastReview.rejectionReason}</p>
          </div>
        </div>
      )}

      {/* The map: both tracks and the gate */}
      <DualTrackStepper irStatus={st} dfStatus={df} incidentStatus={parent} />

      {/* ── Stage actions ── */}
      {parent === 'DETECTED' && (
        <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
            <ShieldAlert size={14} className="text-crit" /> SOC Triage Decision
          </p>
          {canTriage ? (
            <>
              <textarea
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="Dismissal reason (required when dismissing)…"
                rows={2}
                className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
              />
              <div className="flex gap-3">
                <button
                  disabled={busy || !dismissReason.trim()}
                  onClick={() => onTriage('ESCALATE')}
                  className="bg-crit text-surface px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40"
                >
                  Escalate — Start 6h CERT-In Clock
                </button>
                <button
                  disabled={busy || !dismissReason.trim()}
                  onClick={() => onTriage('DISMISS')}
                  className="border border-line text-ink-2 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-surface-2 disabled:opacity-40"
                >
                  Dismiss
                </button>
              </div>
              <p className="text-[11px] text-ink-3">Escalation opens both tracks in parallel and starts the CERT-In clock.</p>
            </>
          ) : (
            <p className="text-sm text-ink-3 italic">Awaiting SOC triage…</p>
          )}
        </div>
      )}

      {parent === 'ESCALATED' && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* IR action surface */}
          <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
              <ClipboardList size={14} className="text-warn" /> Incident Response
            </p>
            {canWorkIr ? (
              <>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Remediation notes (required on final step)…"
                  rows={3}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
                />
                {st === 'INVESTIGATING' && <ActionBtn onClick={() => onIr('CONTAINED')} disabled={busy}>Mark Contained</ActionBtn>}
                {st === 'CONTAINED' && <ActionBtn onClick={() => onIr('REMEDIATED')} disabled={busy}>Mark Remediated</ActionBtn>}
                {st === 'REMEDIATED' && (
                  <ActionBtn onClick={() => onIr('RECOVERED')} disabled={busy || !notes.trim()}>
                    Mark Recovered
                  </ActionBtn>
                )}
                {st === 'RECOVERED' && <p className="text-xs text-ok flex items-center gap-1"><CheckCircle size={13} /> IR complete — recovery achieved.</p>}
              </>
            ) : (
              <p className="text-sm text-ink-3 italic">IR track in progress: {st}</p>
            )}
          </div>

          {/* DF action surface */}
          <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
              <FileLock2 size={14} className="text-accent" /> Digital Forensics
            </p>
            {canWorkDf ? (
              <>
                <Link
                  to={`/report/${incident.captureId}/sessions/${incident.streamId}`}
                  onClick={() => logCustodyAction(incident.captureId, incident.streamId, 'HEX_DUMP_ACCESSED',
                    `Forensics opened raw packet evidence for incident ${incident.id}`)}
                  className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 text-accent px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors"
                >
                  <FileSearch size={14} /> Open Packet Evidence (forensics only)
                </Link>
                <textarea
                  value={dfReport}
                  onChange={(e) => setDfReport(e.target.value)}
                  placeholder="Forensic report (required to submit)…"
                  rows={3}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
                />
                {df === 'EVIDENCE_LOCKED' && <ActionBtn onClick={() => onDf('ANALYZING')} disabled={busy}>Begin Forensic Analysis</ActionBtn>}
                {df === 'ANALYZING' && <ActionBtn onClick={() => onDf('REPORT_GENERATED')} disabled={busy}>Mark Report Generated</ActionBtn>}
                {df === 'REPORT_GENERATED' && (
                  <ActionBtn onClick={() => onDf('REPORT_SUBMITTED')} disabled={busy || !dfReport.trim()}>
                    Submit Forensic Report
                  </ActionBtn>
                )}
                {df === 'REPORT_SUBMITTED' && <p className="text-xs text-ok flex items-center gap-1"><CheckCircle size={13} /> Report submitted — evidence stays locked.</p>}
              </>
            ) : (
              <p className="text-sm text-ink-3 italic">DF track in progress: {df}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Audit gate ── */}
      {parent === 'AWAITING_AUDIT' && (
        <div className="bg-surface border border-accent/30 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2">
            <ClipboardList size={14} /> Compliance Auditor Review
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="bg-surface-2 border border-line rounded-lg p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-1">IR remediation record</p>
              <p className="text-ink-2 whitespace-pre-wrap">{incident.irTrack?.remediationNotes || <span className="italic text-ink-3">No notes recorded.</span>}</p>
            </div>
            <div className="bg-surface-2 border border-line rounded-lg p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-1">Forensic report</p>
              <p className="text-ink-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{incident.dfTrack?.forensicReport || <span className="italic text-ink-3">No report attached.</span>}</p>
            </div>
          </div>
          {canAudit ? (
            <>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Feedback (required for either rejection path)…"
                rows={2}
                className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
              />
              <div className="flex gap-3 flex-wrap">
                <button
                  disabled={busy}
                  onClick={() => onAudit('APPROVED')}
                  className="flex items-center gap-1.5 bg-ok text-surface px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40"
                >
                  <CheckCircle size={14} /> Approve & Close
                </button>
                <button
                  disabled={busy || !rejectionReason.trim()}
                  onClick={() => onAudit('REJECTED_IR')}
                  className="flex items-center gap-1.5 border border-crit/30 text-crit px-4 py-2 rounded-lg text-sm font-medium hover:bg-crit/10 disabled:opacity-40"
                >
                  <XCircle size={14} /> Reject → Return to IR
                </button>
                <button
                  disabled={busy || !rejectionReason.trim()}
                  onClick={() => onAudit('REJECTED_FORENSICS')}
                  className="flex items-center gap-1.5 border border-crit/30 text-crit px-4 py-2 rounded-lg text-sm font-medium hover:bg-crit/10 disabled:opacity-40"
                >
                  <XCircle size={14} /> Reject → Return to Forensics
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-3 italic">Awaiting compliance auditor…</p>
          )}
        </div>
      )}

      {parent === 'VERIFIED_CLOSED' && (
        <div className="bg-ok/5 border border-ok/20 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={18} className="text-ok" />
          <p className="text-sm text-ink font-medium">Verified & closed by compliance audit.</p>
        </div>
      )}

      {parent === 'DISMISSED' && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <p className="text-sm text-ink-2">
            <span className="font-medium text-ink">Dismissed by {incident.dismissedBy}</span> — {incident.dismissalReason}
          </p>
        </div>
      )}

      {error && (
        <div className="bg-crit/10 border border-crit/30 text-crit px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Chain of custody */}
      <div>
        <p className="text-xs font-mono text-ink-3 uppercase mb-2 flex items-center gap-1">
          <Clock size={12} /> Chain-of-Custody Ledger (ISO/IEC 27037)
        </p>
        {custody.length === 0 ? (
          <p className="text-xs text-ink-3 italic">No custody entries yet.</p>
        ) : (
          <div className="divide-y divide-line border border-line rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            {custody.map((entry, i) => (
              <div key={i} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                <span className="font-mono text-ink-2 w-56 shrink-0 truncate">{entry.action}</span>
                <span className="text-ink-3 flex-1 truncate">{entry.performedBy}</span>
                <span className="text-ink-3 font-mono shrink-0">{new Date(entry.performedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-accent text-surface px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 self-start"
    >
      {children}
    </button>
  )
}

function HashRow({ icon: Icon, k, v }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface border border-line rounded-lg px-3 py-2">
      <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-3 shrink-0">
        <Icon size={12} /> {k}
      </span>
      <span className="font-mono text-[11px] text-ink-2 truncate" title={v || ''}>
        {v ? `${v.slice(0, 12)}…${v.slice(-8)}` : '—'}
      </span>
    </div>
  )
}
