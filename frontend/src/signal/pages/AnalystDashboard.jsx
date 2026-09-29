import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Radar } from 'lucide-react'
import UploadPanel from '../components/UploadPanel'
import { listCaptures, getCapture } from '../../lib/api'
import { Empty, Explain, Loading, PageHeader, Panel, Severity } from '../ui'

/*
 * SOC workspace: bring in evidence on the left, see what recent analyses
 * flagged on the right. The feed is built exactly like the classic one
 * (last 5 completed captures, critical/high findings plus ML anomalies).
 */
export default function AnalystDashboard() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const capturesList = await listCaptures()
        const successful = capturesList.filter((c) => c.status === 'COMPLETED').slice(0, 5)
        const found = []
        for (const c of successful) {
          const detail = await getCapture(c.id)
          const r = detail.report
          if (!r) continue
          for (const s of r.sessions || []) {
            for (const f of s.findings || []) {
              if (f.severity === 'critical' || f.severity === 'high') {
                found.push({
                  id: `${c.id}-${s.tcp_stream}-${f.rule_id}`,
                  captureId: c.id,
                  stream: s.tcp_stream,
                  type: f.title,
                  target: `${s.client?.ip} → ${s.server?.ip}`,
                  time: new Date(c.uploadedAt || c.capturedAt || Date.now()).toLocaleString(),
                  severity: f.severity,
                  score: s.ml?.risk_score ?? 'n/a',
                })
              }
            }
            if (s.ml?.anomaly) {
              found.push({
                id: `${c.id}-${s.tcp_stream}-ml-anomaly`,
                captureId: c.id,
                stream: s.tcp_stream,
                type: 'Isolation Forest anomaly',
                target: `${s.client?.ip} → ${s.server?.ip}`,
                time: new Date(c.uploadedAt || c.capturedAt || Date.now()).toLocaleString(),
                severity: 'warn',
                score: s.ml.risk_score ?? 'n/a',
              })
            }
          }
        }
        if (active) {
          setAlerts(found.slice(0, 8))
          setLoading(false)
        }
      } catch {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  return (
    <div>
      <PageHeader
        title="New analysis"
        term="passive"
        purpose="Drop a capture. The engine rebuilds every mail session, grades its encryption and tells you what deserves escalation."
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <UploadPanel />

        <Panel className="self-start p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-bone">
              <Radar size={16} strokeWidth={1.75} className="text-signal" /> Latest detections
            </h2>
            <span className="text-[12px] text-smoke">last 5 runs</span>
          </div>

          {loading ? (
            <Loading rows={4} label="Scanning recent captures" />
          ) : alerts.length === 0 ? (
            <Empty icon={Radar} title="All quiet">No critical or high findings in recent captures.</Empty>
          ) : (
            <ul className="-mx-2 space-y-1">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/report/${a.captureId}/sessions/${a.stream}`}
                    className="group flex items-start gap-3 px-2 py-2.5 transition-colors hover:bg-carbon-3"
                  >
                    <Severity severity={a.severity === 'warn' ? 'warn' : a.severity} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium leading-snug text-bone group-hover:text-signal transition-colors">{a.type}</span>
                      <span className="mt-0.5 block truncate font-code text-[11.5px] text-smoke">{a.target}</span>
                      <span className="mt-1 flex items-center gap-1 text-[11.5px] text-smoke">
                        AI risk {typeof a.score === 'number' ? a.score.toFixed(2) : a.score}
                        <Explain term="riskScore" />
                      </span>
                    </span>
                    <ArrowUpRight size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-smoke group-hover:text-signal" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-hair pt-4 text-[12.5px] leading-relaxed text-smoke">
            Past runs and comparisons live in <Link to="/investigations" className="text-signal hover:underline">Investigations</Link>.
          </p>
        </Panel>
      </div>
    </div>
  )
}
