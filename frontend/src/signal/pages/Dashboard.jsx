import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Download, RefreshCw, ArrowRight, KeyRound, ShieldOff, Sparkles } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useReport } from '../lib/roles'
import { useAuth } from '../../lib/auth'
import { Coverage, HistoryAssessment } from '../components/Assessment'
import { adaptBackendCapture, getCapture, retryRun } from '../../lib/api'
import { bytes, datetime, sessionKind } from '../../lib/format'
import {
  Empty, Explain, Grade, gradeColor, HashText, Loading, Notice, PageHeader, Panel,
  SectionTitle, Severity, Stat, Tag,
} from '../ui'

export default function Dashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const { report, setReport } = useReport()
  const [error, setError] = useState(null)
  const [rerunning, setRerunning] = useState(false)
  const [loading, setLoading] = useState(!report)

  // Same load contract as the classic dashboard (shared report cache).
  useEffect(() => {
    if (report?.id && String(report.id) === String(id)) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const detail = await getCapture(id)
        if (!cancelled) setReport({ report: adaptBackendCapture(detail), id: detail.id })
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, report, setReport])

  if (loading) return <Loading rows={5} label="Loading the analysis" />
  if (error) {
    return (
      <Panel>
        <Empty title="That analysis could not be loaded" action={<Link to="/" className="sg-btn-ghost">Start again</Link>}>
          {error}
        </Empty>
      </Panel>
    )
  }
  if (!report?.report) {
    return (
      <Panel>
        <Empty title="Nothing loaded" action={<Link to="/" className="sg-btn-ghost">Pick a capture</Link>} />
      </Panel>
    )
  }

  const r = report.report
  const c = r.capture || {}
  const counts = r.counts || {}
  const sessions = r.sessions || []
  // Packet evidence is SOC + Forensics only (route guard); others see but cannot open.
  const canOpenSession = role === 'ROLE_SOC_ANALYST' || role === 'ROLE_FORENSICS_ANALYST'
  const openSession = (stream) => { if (canOpenSession) navigate(`/report/${id}/sessions/${stream}`) }

  const gradeCounts = { 'A+': 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
  ;(r.assets || []).forEach((a) => { if (a.grade?.letter) gradeCounts[a.grade.letter] = (gradeCounts[a.grade.letter] || 0) + 1 })
  const gradeData = Object.entries(gradeCounts).map(([name, count]) => ({ name, count }))

  const sev = [
    ['critical', counts.critical || 0, 'danger'],
    ['high', counts.high || 0, 'warning'],
    ['medium', counts.medium || 0, 'caution'],
    ['low', counts.low || 0, 'edge-2'],
  ]
  const sevTotal = sev.reduce((a, [, n]) => a + n, 0)

  return (
    <div>
      <PageHeader
        back={r.investigation_id ? { to: `/investigations/${r.investigation_id}`, label: 'Investigation and comparisons' } : undefined}
        kicker="Capture report"
        title={<span className="break-all">{c.filename}</span>}
        actions={
          <>
            <button
              type="button"
              className="sg-btn-ghost"
              disabled={rerunning}
              onClick={async () => {
                setRerunning(true)
                try { const run = await retryRun(id); navigate(`/jobs/${run.id}`) } catch (e) { setError(e.message) } finally { setRerunning(false) }
              }}
            >
              <RefreshCw size={15} strokeWidth={1.75} className={rerunning ? 'animate-spin' : ''} /> {rerunning ? 'Creating' : 'Reanalyse'}
            </button>
            <Link to={`/report/${id}/export`} className="sg-btn-primary">
              <Download size={15} strokeWidth={2} /> Export report
            </Link>
          </>
        }
      />

      <div className="-mt-4 mb-8 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-smoke">
        {c.format && <span className="uppercase">{c.format}</span>}
        <span className="tabular">{c.packet_count} packets</span>
        <span>{bytes(c.bytes)}</span>
        <span>Captured {datetime(c.first_packet_time)}</span>
        <span className="inline-flex items-center gap-1.5">SHA-256 <HashText value={c.sha256} head={10} tail={6} /> <Explain term="sha256" /></span>
      </div>

      {/* ---- verdict ---- */}
      <Panel className="mb-8 grid gap-6 p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div className="flex items-center gap-5">
          <Grade grade={r.overall_grade} size="xl" />
          <div>
            <div className="flex items-center gap-1.5 font-code text-[11px] uppercase tracking-[0.12em] text-ash">Overall grade <Explain term="grade" /></div>
            {r.overall_score != null && (
              <div className="mt-1 text-[13px] text-smoke">
                Score <span className="font-medium text-bone tabular">{r.overall_score}</span> / 100
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 sm:grid-cols-6">
          <Stat label="Sessions" value={counts.sessions ?? 0} />
          <Stat label="Servers" value={counts.assets ?? 0} />
          <Stat label="Critical" value={counts.critical ?? 0} tone={counts.critical ? 'danger' : 'default'} />
          <Stat label="High" value={counts.high ?? 0} tone={counts.high ? 'warning' : 'default'} />
          <Stat label="Medium" value={counts.medium ?? 0} tone={counts.medium ? 'caution' : 'default'} />
          <Stat label="Creds exposed" value={counts.credentials_exposed ?? 0} tone={counts.credentials_exposed ? 'danger' : 'safe'} term="cleartextAuth" />
        </div>
        {sevTotal > 0 && (
          <div className="lg:col-span-2">
            <div className="mb-2 font-code text-[11px] uppercase tracking-[0.12em] text-smoke">Findings by severity</div>
            <div className="flex h-2 gap-0.5 overflow-hidden">
              {sev.filter(([, n]) => n > 0).map(([k, n, t]) => (
                <div key={k} title={`${n} ${k}`} style={{ flexGrow: n, background: `rgb(var(--s-${t}))` }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-smoke">
              {sev.filter(([, n]) => n > 0).map(([k, n, t]) => (
                <span key={k} className="inline-flex items-center gap-1.5 capitalize">
                  <span className="h-2 w-2" style={{ background: `rgb(var(--s-${t}))` }} /> {k} {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* ---- what to fix first ---- */}
      {(r.remediation || []).length > 0 && (
        <section className="mb-10">
          <SectionTitle title="Fix these first" hint="Ordered by severity and by how much traffic each server carried." term="exposure" />
          <ol className="space-y-2.5">
            {r.remediation.map((m) => (
              <li key={m.rule_id} className="sg-panel grid gap-4 p-4 sm:p-5 md:grid-cols-[48px_minmax(0,1fr)_240px] md:items-start">
                <span className="font-code text-[20px] font-medium leading-none text-smoke tabular">{String(m.order).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Severity severity={m.severity} />
                    <h3 className="text-[14.5px] font-medium text-bone">{m.title}</h3>
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ash">{m.action}</p>
                  <p className="mt-2 font-code text-[11.5px] text-smoke">{m.rule_id} · {m.standard}</p>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-[11.5px] text-smoke">Affected servers</div>
                  <p className="break-all font-code text-[12px] text-ash">{(m.affected_assets || []).join(', ')}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ---- sessions ---- */}
      <section id="sessions" className="mb-10">
        <SectionTitle
          title="Sessions"
          hint={canOpenSession ? 'Every mail conversation in the capture. Open one to see its handshake, findings and raw bytes.' : 'Every mail conversation in the capture.'}
        />

        {sessions.length === 0 ? (
          <Panel><Empty title="No mail sessions found in this capture" /></Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sessions.map((s) => {
              const n = (s.findings || []).filter((f) => f.severity !== 'info').length
              const Wrapper = canOpenSession ? Link : 'div'
              return (
                <Wrapper
                  key={s.tcp_stream}
                  {...(canOpenSession ? { to: `/report/${id}/sessions/${s.tcp_stream}` } : {})}
                  className={`sg-panel group flex flex-col gap-3 p-4 transition-all ${canOpenSession ? 'hover:-translate-y-px hover:border-hair-2' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <Grade grade={s.grade?.letter} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-bone group-hover:text-signal transition-colors">{sessionKind(s)}</div>
                      <div className="mt-0.5 truncate font-code text-[12px] text-smoke">
                        {s.client?.ip}:{s.client?.port} → {s.server?.ip}:{s.server?.port}
                      </div>
                    </div>
                    <span className="shrink-0 text-[12px] text-smoke tabular">{n} finding{n === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tag tone={s.tls_version ? 'cipher' : 'danger'}>{s.tls_version ? `TLS ${s.tls_version}` : 'No encryption'}</Tag>
                    {s.capability_mangled && <Tag tone="danger"><ShieldOff size={11} strokeWidth={2} /> downgrade</Tag>}
                    {s.cleartext_auth && <Tag tone="danger"><KeyRound size={11} strokeWidth={2} /> creds exposed</Tag>}
                    {s.ml?.anomaly && <Tag tone="warning"><Sparkles size={11} strokeWidth={2} /> anomaly</Tag>}
                    {s.confidence === 'partial' && <Tag>partial view</Tag>}
                  </div>
                  {s.cipher_suite && <div className="truncate font-code text-[11.5px] text-smoke">{s.cipher_suite}</div>}
                </Wrapper>
              )
            })}
          </div>
        )}
      </section>

      {/* ---- servers ---- */}
      <section className="mb-10">
        <SectionTitle title="Servers, worst first" hint="Ranked by risk weighted by traffic volume." term="exposure" />
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead>
              <tr className="border-b border-hair text-left text-[12px] text-smoke">
                <th className="px-5 py-3 font-medium">Server</th>
                <th className="px-5 py-3 font-medium">Protocol</th>
                <th className="px-5 py-3 font-medium"><span className="inline-flex items-center gap-1">Role <Explain term="submission" /></span></th>
                <th className="px-5 py-3 font-medium">Grade</th>
                <th className="px-5 py-3 text-right font-medium">Score</th>
                <th className="px-5 py-3 font-medium">TLS seen</th>
                <th className="px-5 py-3 text-right font-medium">Sessions</th>
                <th className="px-5 py-3 text-right font-medium">Exposure</th>
              </tr>
            </thead>
            <tbody>
              {(r.assets || []).map((a) => (
                <tr key={a.key} className="border-b border-hair/60 last:border-0 hover:bg-carbon-3/60">
                  <td className="px-5 py-3 font-code text-[12.5px] text-bone">
                    {a.host}:{a.port}
                    {a.key && a.key !== `${a.host}:${a.port}` && <div className="text-[11px] text-smoke">{a.key}</div>}
                  </td>
                  <td className="px-5 py-3 text-ash">{String(a.protocol || '').toUpperCase()}</td>
                  <td className="px-5 py-3"><Tag tone={a.role === 'mta_relay' ? 'muted' : 'gold'}>{a.role === 'mta_relay' ? 'relay' : 'submission'}</Tag></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Grade grade={a.grade?.letter} size="xs" />
                      {a.grade?.trusted === false && <Tag tone="danger">untrusted</Tag>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-bone tabular">{a.grade?.raw_score ?? '–'}</td>
                  <td className="px-5 py-3 font-code text-[12px] text-ash">
                    {a.worst_tls ? (a.version_spread ? <span className="inline-flex items-center gap-1">{a.worst_tls} <ArrowRight size={11} /> {a.best_tls}</span> : a.worst_tls) : 'none'}
                  </td>
                  <td className="px-5 py-3 text-right text-ash tabular">{a.session_count}</td>
                  <td className="px-5 py-3 text-right font-medium text-bone tabular">{a.exposure_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(r.assets || []).length && <div className="p-8 text-center text-[13px] text-smoke">No servers detected in this capture.</div>}
        </Panel>
      </section>

      {/* ---- context ---- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Coverage coverage={r.coverage} />
          <Panel className="p-5">
            <div className="mb-3 text-[14px] font-medium text-bone">Server grades</div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gradeData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: 'rgb(var(--s-smoke))', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--s-smoke))', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgb(var(--s-carbon-4) / 0.6)' }} />
                  <Bar dataKey="count" radius={0} maxBarSize={36}>
                    {gradeData.map((d) => <Cell key={d.name} fill={gradeColor(d.name)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
        <div className="space-y-4">
          <HistoryAssessment history={r.history} />
          {(r.warnings || []).length > 0 && (
            <div className="space-y-2">
              {(r.warnings || []).map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
            </div>
          )}
          <Panel as="details" className="group p-5">
            <summary className="flex cursor-pointer items-center gap-1.5 text-[14px] font-medium text-bone">
              Analysis provenance <Explain term="provenance" />
            </summary>
            <dl className="mt-4 space-y-3">
              {Object.entries(r.provenance || {}).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[11.5px] capitalize text-smoke">{key.replaceAll('_', ' ')}</dt>
                  <dd className="mt-0.5 break-all font-code text-[12px] text-ash">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </section>
    </div>
  )
}
