import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, FileSearch, Download, FileLock2, Inbox } from 'lucide-react'
import { listCaptures, getCapture, adaptBackendCapture, getAllFindingsStatuses, updateForensicsStatus, logCustodyAction, getCustodyLog } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import CustodyLedger from '../components/CustodyLedger'
import { Empty, Loading, Notice, PageHeader, Panel, Severity, Stat, Tag } from '../ui'

// Same status map, custody logging and API calls as the classic workstation.
const STATUS_LABEL = {
  ESCALATED: { label: 'Awaiting analysis', tone: 'warning' },
  FORENSIC_ANALYSIS: { label: 'Under analysis', tone: 'gold' },
  REPORT_SUBMITTED: { label: 'Submitted for audit', tone: 'safe' },
  VERIFIED: { label: 'Verified and closed', tone: 'safe' },
}

export default function ForensicsDashboard() {
  const { token } = useAuth()
  const [captures, setCaptures] = useState([])
  const [statuses, setStatuses] = useState({})
  const [custodyLogs, setCustodyLogs] = useState({})
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  const username = (() => {
    try { return JSON.parse(atob(token.split('.')[1])).sub } catch { return 'forensics' }
  })()

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
      .filter((s) => {
        const key = `${cap.id}-${s.tcp_stream}`
        const st = statuses[key]?.forensicsStatus || statuses[key]?.status
        return !['REPORT_SUBMITTED', 'VERIFIED'].includes(st)
      })
      .map((s) => ({
        captureId: cap.id,
        captureFile: cap.capture?.filename || 'Unknown',
        stream: s.tcp_stream,
        server: s.server?.ip || s.server,
        protocol: s.protocol,
        findings: (s.findings || []).filter((f) => ['critical', 'high'].includes(f.severity)),
        key: `${cap.id}-${s.tcp_stream}`,
        statusObj: statuses[`${cap.id}-${s.tcp_stream}`],
      })),
  )

  const statusOf = (i) => i.statusObj?.forensicsStatus || i.statusObj?.status || 'ESCALATED'

  async function advanceStatus(inc, nextStatus) {
    const updated = await updateForensicsStatus(inc.captureId, inc.stream, nextStatus)
    setStatuses((prev) => ({ ...prev, [inc.key]: updated }))
  }

  async function loadCustodyLog(inc) {
    const log = await getCustodyLog(inc.captureId, inc.stream)
    setCustodyLogs((prev) => ({ ...prev, [inc.key]: log }))
  }

  async function handleExpand(inc) {
    const expanding = expandedId !== inc.key
    setExpandedId(expanding ? inc.key : null)
    if (expanding) {
      await logCustodyAction(inc.captureId, inc.stream, 'EVIDENCE_VIEWED', `Forensics Analyst ${username} opened session evidence`)
      await loadCustodyLog(inc)
    }
  }

  if (loading) return <Loading rows={4} label="Loading forensic evidence queue" />

  return (
    <div>
      <PageHeader
        title="Evidence locker"
        term="custody"
        purpose="Preserve, analyse and report. Opening any evidence is written to the custody ledger automatically."
      />

      <Panel className="mb-6 grid grid-cols-2 gap-6 p-5 md:divide-x md:divide-hair">
        <Stat label="Awaiting analysis" value={incidents.filter((i) => statusOf(i) === 'ESCALATED').length} tone="warning" />
        <div className="md:pl-6"><Stat label="In analysis" value={incidents.filter((i) => statusOf(i) === 'FORENSIC_ANALYSIS').length} tone="gold" /></div>
      </Panel>

      <Notice tone="info" title="Evidence isolation active (ISO/IEC 27037:2012)" className="mb-8">
        Every access is logged to the chain-of-custody ledger. Incident Responders cannot reach this partition.
      </Notice>

      {incidents.length === 0 ? (
        <Panel><Empty icon={Inbox} title="No evidence waiting">Escalated incidents appear here for parallel preservation.</Empty></Panel>
      ) : (
        <ul className="space-y-3">
          {incidents.map((inc) => {
            const st = statusOf(inc)
            const info = STATUS_LABEL[st] || STATUS_LABEL.ESCALATED
            const open = expandedId === inc.key
            const log = custodyLogs[inc.key] || []
            return (
              <li key={inc.key} className="sg-panel overflow-hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => handleExpand(inc)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-carbon-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileLock2 size={16} strokeWidth={1.75} className="shrink-0 text-signal" />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-bone">{inc.server || 'Unknown server'} · {String(inc.protocol || '').toUpperCase()}</div>
                      <div className="truncate text-[12.5px] text-smoke">{inc.captureFile} · Stream #{inc.stream} · {inc.findings.length} finding(s)</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Tag tone={info.tone}>{info.label}</Tag>
                    <ChevronDown size={16} strokeWidth={1.75} className={`text-smoke transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      <div className="space-y-5 border-t border-hair bg-carbon/40 p-5">
                        {inc.findings.length > 0 && (
                          <ul className="space-y-2">
                            {inc.findings.map((f, i) => (
                              <li key={i} className=" border border-hair bg-carbon-2 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Severity severity={f.severity} />
                                  <span className="text-[13.5px] font-medium text-bone">{f.title || f.rule_id}</span>
                                </div>
                                {f.detail && <p className="mt-1.5 text-[12.5px] text-smoke">{f.detail}</p>}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/report/${inc.captureId}/sessions/${inc.stream}`}
                            onClick={() => logCustodyAction(inc.captureId, inc.stream, 'HEX_DUMP_ACCESSED', `Forensics Analyst ${username} opened raw hex dump`)}
                            className="sg-btn-ghost"
                          >
                            <FileSearch size={15} strokeWidth={1.75} className="text-signal" /> Open hex and packet evidence
                          </Link>
                          <Link
                            to={`/report/${inc.captureId}/export`}
                            onClick={() => logCustodyAction(inc.captureId, inc.stream, 'REPORT_EXPORTED', `Forensics Analyst ${username} triggered forensic report export`)}
                            className="sg-btn-ghost"
                          >
                            <Download size={15} strokeWidth={1.75} /> Export report
                          </Link>
                          {st === 'ESCALATED' && <button className="sg-btn-primary" onClick={() => advanceStatus(inc, 'FORENSIC_ANALYSIS')}>Begin analysis</button>}
                          {st === 'FORENSIC_ANALYSIS' && <button className="sg-btn-primary" onClick={() => advanceStatus(inc, 'REPORT_SUBMITTED')}>Submit report for audit</button>}
                          {st === 'REPORT_SUBMITTED' && <span className="self-center text-[13px] text-smoke">Awaiting auditor verification.</span>}
                        </div>
                        <CustodyLedger entries={log} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
