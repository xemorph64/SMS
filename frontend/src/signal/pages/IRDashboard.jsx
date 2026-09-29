import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Lock, Inbox } from 'lucide-react'
import { listCaptures, getCapture, adaptBackendCapture, getAllFindingsStatuses, updateFindingStatus } from '../../lib/api'
import CertInTimer from '../components/CertInTimer'
import { Empty, Loading, Notice, PageHeader, Panel, Severity, Stat, Tag } from '../ui'

// Legacy per-finding IR workflow (same state machine and API as the classic page).
const STATUS_FLOW = {
  ESCALATED: { label: 'Noticed / escalated', tone: 'danger', next: 'IR_INVESTIGATING', nextLabel: 'Start investigation' },
  IR_INVESTIGATING: { label: 'Under investigation', tone: 'warning', next: 'CONTAINED', nextLabel: 'Mark contained' },
  CONTAINED: { label: 'Threat contained', tone: 'caution', next: 'REMEDIATED', nextLabel: 'Mark remediated' },
  REMEDIATED: { label: 'Awaiting audit', tone: 'safe', next: null },
  FORENSIC_ANALYSIS: { label: 'Under forensic analysis', tone: 'gold', next: null },
  AWAITING_AUDIT: { label: 'Awaiting audit', tone: 'gold', next: null },
  VERIFIED: { label: 'Verified and closed', tone: 'safe', next: null },
  REJECTED: { label: 'Rejected, redo fix', tone: 'danger', next: 'IR_INVESTIGATING', nextLabel: 'Restart investigation' },
}

export default function IRDashboard() {
  const [captures, setCaptures] = useState([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState({})
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const capList = await listCaptures().catch(() => [])
        const completed = capList.filter((c) => c.status === 'COMPLETED')
        const fullDetails = await Promise.all(completed.map((c) => getCapture(c.id).catch(() => null)))
        setCaptures(fullDetails.filter(Boolean).map((detail) => ({ ...adaptBackendCapture(detail), id: detail.id })))
        const allStatuses = await getAllFindingsStatuses().catch(() => [])
        const map = {}
        allStatuses.forEach((s) => { map[`${s.captureId}-${s.streamId}`] = s })
        setStatuses(map)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const incidents = captures.flatMap((cap) =>
    (cap.sessions || [])
      .filter((s) => (s.findings || []).some((f) => ['critical', 'high'].includes(f.severity)))
      .map((s) => {
        const key = `${cap.id}-${s.tcp_stream}`
        return {
          captureId: cap.id,
          captureFile: cap.capture?.filename || 'Unknown',
          stream: s.tcp_stream,
          server: s.server?.ip || s.server,
          protocol: s.protocol,
          findings: (s.findings || []).filter((f) => ['critical', 'high'].includes(f.severity)),
          aiScore: s.ai_score,
          key,
          statusObj: statuses[key],
        }
      }),
  )

  async function advanceStatus(inc, nextStatus) {
    const updated = await updateFindingStatus(inc.captureId, inc.stream, nextStatus)
    setStatuses((prev) => ({ ...prev, [inc.key]: updated }))
  }

  const getStatus = (inc) => inc.statusObj?.irStatus || inc.statusObj?.status || 'ESCALATED'
  const irIncidents = incidents.filter((i) => !['REMEDIATED', 'VERIFIED'].includes(getStatus(i)))
  const handedOff = incidents.filter((i) => ['REMEDIATED', 'VERIFIED'].includes(getStatus(i)))

  if (loading) return <Loading rows={4} label="Loading incident queue" />

  return (
    <div>
      <PageHeader
        title="Response room"
        term="certIn"
        purpose="Contain and remediate. The CERT-In clock runs from the moment an incident is noticed."
      />

      <Panel className="mb-6 grid grid-cols-3 gap-6 p-5 md:divide-x md:divide-hair">
        <Stat label="Needs action" value={irIncidents.filter((i) => ['ESCALATED', 'REJECTED'].includes(getStatus(i))).length} tone="danger" />
        <div className="md:pl-6"><Stat label="In progress" value={irIncidents.filter((i) => ['IR_INVESTIGATING', 'CONTAINED'].includes(getStatus(i))).length} tone="warning" /></div>
        <div className="md:pl-6"><Stat label="Handed to audit" value={handedOff.length} tone="safe" /></div>
      </Panel>

      <Notice tone="info" title="Separation of duties (NIST AC-5)" className="mb-8">
        Raw packet evidence stays with Forensics, who work in parallel to preserve it.
      </Notice>

      <h2 className="mb-3 text-[15px] font-semibold text-bone">Active incidents</h2>
      {irIncidents.length === 0 ? (
        <Panel><Empty icon={Inbox} title="No active incidents">SOC must escalate findings first.</Empty></Panel>
      ) : (
        <ul className="space-y-3">
          {irIncidents.map((inc) => {
            const st = getStatus(inc)
            const info = STATUS_FLOW[st] || STATUS_FLOW.ESCALATED
            const open = expandedId === inc.key
            const escalated = st === 'ESCALATED' || st === 'REJECTED'
            const deadline = inc.statusObj?.noticedAt ? new Date(new Date(inc.statusObj.noticedAt).getTime() + 6 * 3600 * 1000).toISOString() : null
            return (
              <li key={inc.key} className="sg-panel overflow-hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpandedId(open ? null : inc.key)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-carbon-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-bone">
                      {inc.server || 'Unknown'} · {String(inc.protocol || '').toUpperCase()}
                      {inc.aiScore != null && <span className="ml-2 font-code text-[12px] text-smoke">AI {inc.aiScore.toFixed(2)}</span>}
                    </div>
                    <div className="truncate text-[12.5px] text-smoke">{inc.captureFile} · Stream #{inc.stream}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {escalated && deadline && <CertInTimer deadline={deadline} />}
                    <Tag tone={info.tone}>{info.label}</Tag>
                    <ChevronDown size={16} strokeWidth={1.75} className={`text-smoke transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      <div className="space-y-4 border-t border-hair bg-carbon/40 p-5">
                        <ul className="space-y-2">
                          {inc.findings.map((f, i) => (
                            <li key={i} className=" border border-hair bg-carbon-2 px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Severity severity={f.severity} />
                                <span className="text-[13.5px] font-medium text-bone">{f.title || f.rule_id}</span>
                              </div>
                              {f.detail && <p className="mt-1.5 text-[12.5px] text-smoke">{f.detail}</p>}
                              {f.recommendation && <p className="mt-1.5 text-[12.5px] text-ash"><span className="text-signal">Fix · </span>{f.recommendation}</p>}
                            </li>
                          ))}
                        </ul>
                        <p className="flex items-center gap-2 text-[12.5px] text-smoke">
                          <Lock size={13} strokeWidth={1.75} /> Hex dumps and raw packets are available only to the Forensics Analyst (ISO/IEC 27037).
                        </p>
                        {info.next && <button className="sg-btn-primary" onClick={() => advanceStatus(inc, info.next)}>{info.nextLabel}</button>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      )}

      {handedOff.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[15px] font-semibold text-bone">Remediated, handed to audit</h2>
          <div className="space-y-2">
            {handedOff.map((inc) => {
              const info = STATUS_FLOW[getStatus(inc)] || {}
              return (
                <Panel key={inc.key} className="flex items-center justify-between gap-4 px-5 py-3.5 opacity-75">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-bone">{inc.server} · {String(inc.protocol || '').toUpperCase()}</div>
                    <div className="truncate text-[12px] text-smoke">{inc.captureFile} · Stream #{inc.stream}</div>
                  </div>
                  <Tag tone={info.tone}>{info.label}</Tag>
                </Panel>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
