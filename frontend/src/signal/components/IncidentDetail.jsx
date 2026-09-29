import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileSearch, Fingerprint, FileLock2, BookOpen, CornerDownLeft } from 'lucide-react'
import DualTrack from './DualTrack'
import CertInTimer from './CertInTimer'
import CustodyLedger from './CustodyLedger'
import { Explain, HashText, Notice, Severity } from '../ui'
import {
  getCapture, adaptBackendCapture, getCustodyLog, logCustodyAction,
  triageIncident, advanceIrTrack, advanceDfTrack, submitAuditVerdict,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { toast } from 'sonner'

/*
 * The expanded incident: why it exists, the evidence seal, the dual-track
 * map, and (for whoever owns the current stage) the one action that moves it
 * forward. Every API call, guard and required-field rule is identical to the
 * classic IncidentDetail.
 */
export default function IncidentDetail({ incident, onChanged }) {
  const { role } = useAuth()
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

  useEffect(() => {
    let cancelled = false
    setReport(null)
    getCapture(incident.captureId)
      .then((detail) => {
        if (cancelled) return
        setReport(detail.report ? { ...detail.report } : adaptBackendCapture(detail))
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

  const session = (report?.sessions || []).find((s) => String(s.tcp_stream) === String(incident.streamId))
  const findings = (session?.findings || []).filter((f) => f.severity !== 'info')

  async function run(fn, done) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (done) toast(done[0], { description: done[1] })
      setNotes(''); setDfReport(''); setRejectionReason(''); setDismissReason('')
      await onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const onTriage = (decision) => run(() => triageIncident(incident.id, decision, dismissReason),
    decision === 'ESCALATE' ? ['Escalated', 'Both tracks opened. CERT-In 6-hour clock is running.'] : ['Dismissed', 'Reason recorded in the ledger.'])
  const onIr = (target) => run(() => advanceIrTrack(incident.id, target, notes), ['IR track advanced', `Now ${target.toLowerCase()}.`])
  const onDf = (target) => run(() => advanceDfTrack(incident.id, target, dfReport), ['Forensics track advanced', `Now ${target.toLowerCase().replaceAll('_', ' ')}.`])
  const onAudit = (verdict) => run(() => submitAuditVerdict(incident.id, verdict, rejectionReason),
    verdict === 'APPROVED' ? ['Verified and closed', 'The incident is complete.'] : ['Returned for rework', verdict === 'REJECTED_IR' ? 'Sent back to Incident Response.' : 'Sent back to Forensics.'])

  const canTriage = role === 'ROLE_SOC_ANALYST' || role === 'ROLE_ADMIN'
  const canWorkIr = role === 'ROLE_INCIDENT_RESPONDER' || role === 'ROLE_ADMIN'
  const canWorkDf = role === 'ROLE_FORENSICS_ANALYST' || role === 'ROLE_ADMIN'
  const canAudit = role === 'ROLE_AUDITOR' || role === 'ROLE_ADMIN'

  const lastReview = incident.auditHistory?.length ? incident.auditHistory[incident.auditHistory.length - 1] : null
  const clockLive = incident.certInClockDeadline && (parent === 'ESCALATED' || parent === 'AWAITING_AUDIT')

  return (
    <div className="space-y-10 p-5 sm:p-8">
      {/* why + seal */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <Label n="01">Why this is an incident</Label>
          {findings.length === 0 ? (
            <p className="text-[13px] text-smoke">{report ? 'No critical or high findings on this session.' : 'Loading findings…'}</p>
          ) : (
            <ul className="space-y-2">
              {findings.map((f, i) => (
                <li key={i} className="sg-panel px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Severity severity={f.severity} />
                    <span className="text-[13.5px] font-medium text-bone">{f.title || f.rule_id}</span>
                  </div>
                  {f.detail && <p className="mt-1.5 text-[12.5px] leading-relaxed text-smoke">{f.detail}</p>}
                  {f.remediation && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ash">
                      <span className="text-signal">Fix · </span>{f.remediation}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <Label n="02">Evidence seal</Label>
            <dl className="sg-panel divide-y divide-hair px-4">
              <SealRow icon={Fingerprint} k="Snapshot" term="snapshotHash" v={incident.snapshotHash} />
              <SealRow icon={FileLock2} k="Evidence lock" term="evidenceLock" v={incident.dfTrack?.evidenceLockHash} />
              <SealRow icon={BookOpen} k="Capture SHA-256" term="sha256" v={incident.captureSummary?.sha256} />
            </dl>
          </div>
          {clockLive && <CertInTimer deadline={incident.certInClockDeadline} size="lg" />}
        </div>
      </div>

      {parent === 'ESCALATED' && lastReview && lastReview.verdict !== 'APPROVED' && (
        <Notice tone="crit" title={`Returned by audit: ${lastReview.verdict === 'REJECTED_IR' ? 'Incident Response' : 'Forensics'} must rework`}>
          {lastReview.rejectionReason}
        </Notice>
      )}

      <div>
        <Label n="03">Twin tracks</Label>
        <div className="sg-panel p-5 sm:p-6">
        <DualTrack irStatus={st} dfStatus={df} incidentStatus={parent} />
        </div>
      </div>

      {/* ---- stage actions ---- */}
      {parent === 'DETECTED' && (
        <ActionCard title="SOC triage" term="triage">
          {canTriage ? (
            <>
              <Field
                id={`triage-${incident.id}`}
                label="Triage note"
                helper="Required. Say why you are escalating or dismissing."
                value={dismissReason}
                onChange={setDismissReason}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <button disabled={busy || !dismissReason.trim()} onClick={() => onTriage('ESCALATE')} className="sg-btn-primary">
                  Escalate and start 6h clock
                </button>
                <button disabled={busy || !dismissReason.trim()} onClick={() => onTriage('DISMISS')} className="sg-btn-ghost">
                  Dismiss
                </button>
              </div>
              <p className="text-[12px] text-smoke">Escalating opens both tracks in parallel and starts the CERT-In clock.</p>
            </>
          ) : (
            <Waiting>Waiting for SOC triage.</Waiting>
          )}
        </ActionCard>
      )}

      {parent === 'ESCALATED' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ActionCard title="Incident Response" term="irTrack">
            {canWorkIr ? (
              <>
                <Field
                  id={`ir-${incident.id}`}
                  label="Remediation notes"
                  helper="Required before marking recovered."
                  value={notes}
                  onChange={setNotes}
                  rows={3}
                />
                {st === 'INVESTIGATING' && <button className="sg-btn-primary self-start" onClick={() => onIr('CONTAINED')} disabled={busy}>Mark contained</button>}
                {st === 'CONTAINED' && <button className="sg-btn-primary self-start" onClick={() => onIr('REMEDIATED')} disabled={busy}>Mark remediated</button>}
                {st === 'REMEDIATED' && (
                  <button className="sg-btn-primary self-start" onClick={() => onIr('RECOVERED')} disabled={busy || !notes.trim()}>Mark recovered</button>
                )}
                {st === 'RECOVERED' && <Done>IR complete. Recovery achieved.</Done>}
              </>
            ) : (
              <Waiting>IR track in progress: {humanize(st)}</Waiting>
            )}
          </ActionCard>

          <ActionCard title="Digital Forensics" term="dfTrack">
            {canWorkDf ? (
              <>
                <Link
                  to={`/report/${incident.captureId}/sessions/${incident.streamId}`}
                  onClick={() => logCustodyAction(incident.captureId, incident.streamId, 'HEX_DUMP_ACCESSED',
                    `Forensics opened raw packet evidence for incident ${incident.id}`)}
                  className="sg-btn-ghost self-start"
                >
                  <FileSearch size={15} strokeWidth={1.75} className="text-signal" /> Open packet evidence
                </Link>
                <Field
                  id={`df-${incident.id}`}
                  label="Forensic report"
                  helper="Required to submit."
                  value={dfReport}
                  onChange={setDfReport}
                  rows={3}
                />
                {df === 'EVIDENCE_LOCKED' && <button className="sg-btn-primary self-start" onClick={() => onDf('ANALYZING')} disabled={busy}>Begin analysis</button>}
                {df === 'ANALYZING' && <button className="sg-btn-primary self-start" onClick={() => onDf('REPORT_GENERATED')} disabled={busy}>Mark report written</button>}
                {df === 'REPORT_GENERATED' && (
                  <button className="sg-btn-primary self-start" onClick={() => onDf('REPORT_SUBMITTED')} disabled={busy || !dfReport.trim()}>Submit forensic report</button>
                )}
                {df === 'REPORT_SUBMITTED' && <Done>Report submitted. Evidence stays locked.</Done>}
              </>
            ) : (
              <Waiting>Forensics track in progress: {humanize(df)}</Waiting>
            )}
          </ActionCard>
        </div>
      )}

      {parent === 'AWAITING_AUDIT' && (
        <ActionCard title="Audit review" term="audit" highlight>
          <div className="grid gap-3 md:grid-cols-2">
            <Record title="IR remediation record" body={incident.irTrack?.remediationNotes} empty="No notes recorded." />
            <Record title="Forensic report" body={incident.dfTrack?.forensicReport} empty="No report attached." />
          </div>
          {canAudit ? (
            <>
              <Field
                id={`audit-${incident.id}`}
                label="Feedback"
                helper="Required when returning the incident to a track."
                value={rejectionReason}
                onChange={setRejectionReason}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => onAudit('APPROVED')} className="sg-btn-primary">
                  <CheckCircle2 size={15} strokeWidth={2} /> Approve and close
                </button>
                <button disabled={busy || !rejectionReason.trim()} onClick={() => onAudit('REJECTED_IR')} className="sg-btn-danger">
                  <CornerDownLeft size={15} strokeWidth={1.75} /> Return to IR
                </button>
                <button disabled={busy || !rejectionReason.trim()} onClick={() => onAudit('REJECTED_FORENSICS')} className="sg-btn-danger">
                  <CornerDownLeft size={15} strokeWidth={1.75} /> Return to Forensics
                </button>
              </div>
            </>
          ) : (
            <Waiting>Waiting for the auditor.</Waiting>
          )}
        </ActionCard>
      )}

      {parent === 'VERIFIED_CLOSED' && <Notice tone="ok" title="Verified and closed by audit." />}

      {parent === 'DISMISSED' && (
        <Notice tone="info" title={`Dismissed by ${incident.dismissedBy}`}>{incident.dismissalReason}</Notice>
      )}

      {error && (
        <Notice tone="crit" title="That action did not go through">
          {error}
        </Notice>
      )}

      <div>
        <Label n="05">Custody</Label>
        <CustodyLedger entries={custody} />
      </div>
    </div>
  )
}

function Label({ n, children }) {
  return (
    <div className="mb-3 flex items-center gap-2 font-code text-[11px] uppercase tracking-[0.14em] text-ash">
      <span className="text-signal">{n}</span> {children}
    </div>
  )
}

function humanize(s) {
  return s ? String(s).toLowerCase().replaceAll('_', ' ') : 'not started'
}

function SealRow({ icon: Icon, k, term, v }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="flex shrink-0 items-center gap-2 text-[12.5px] text-smoke">
        <Icon size={14} strokeWidth={1.75} /> {k} <Explain term={term} />
      </dt>
      <dd className="min-w-0 truncate"><HashText value={v} /></dd>
    </div>
  )
}

function ActionCard({ title, term, highlight, children }) {
  return (
    <div className="sg-panel flex flex-col gap-4 p-5 sm:p-6" data-active={highlight ? 'true' : undefined}>
      <div className="sg-display flex items-center gap-2 text-[14px] font-semibold text-bone">
        <span className="font-code text-[11px] font-normal text-signal">04</span>
        {title} <Explain term={term} />
      </div>
      {children}
    </div>
  )
}

function Field({ id, label, helper, value, onChange, rows }) {
  return (
    <div>
      <label htmlFor={id} className="sg-label">{label}</label>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="sg-input resize-y" />
      {helper && <p className="mt-1.5 text-[12px] text-smoke">{helper}</p>}
    </div>
  )
}

function Record({ title, body, empty }) {
  return (
    <div className=" border border-hair bg-carbon-3 p-3.5">
      <div className="mb-1 text-[12px] font-medium text-smoke">{title}</div>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ash">
        {body || <span className="text-smoke">{empty}</span>}
      </p>
    </div>
  )
}

const Waiting = ({ children }) => <p className="text-[13px] text-smoke">{children}</p>
const Done = ({ children }) => (
  <p className="flex items-center gap-1.5 text-[13px] text-go">
    <CheckCircle2 size={15} strokeWidth={1.75} /> {children}
  </p>
)
