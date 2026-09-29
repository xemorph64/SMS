import React, { lazy, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Printer, CheckCircle2, XCircle, ArrowUpRight, ClipboardCheck } from 'lucide-react'
import { listCaptures, getCapture, adaptBackendCapture, getAllFindingsStatuses, updateFindingStatus, updateForensicsStatus } from '../../lib/api'
import Scene3D from '../three/Scene3D'
import { Empty, Explain, Grade, Readout, Loading, Notice, PageHeader, Panel, SectionTitle, Severity, Tag } from '../ui'

const LatticeScene = lazy(() => import('../three/LatticeScene'))

const TLS_COLORS = {
  'TLS 1.3': 'rgb(var(--s-go))',
  'TLS 1.2': 'rgb(var(--s-ice))',
  'TLS 1.1': 'rgb(var(--s-heat))',
  'TLS 1.0': 'rgb(var(--s-heat))',
  Cleartext: 'rgb(var(--s-signal))',
}

export default function AuditorDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Aggregation identical to the classic compliance view.
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [capturesList, dbStatuses] = await Promise.all([listCaptures(), getAllFindingsStatuses().catch(() => [])])
        const successful = capturesList.filter((c) => c.status === 'COMPLETED')
        const statusMap = {}
        dbStatuses.forEach((s) => { statusMap[`${s.captureId}-${s.streamId}`] = s })

        let totalSessions = 0
        const tlsVersions = { 'TLS 1.3': 0, 'TLS 1.2': 0, 'TLS 1.1': 0, 'TLS 1.0': 0, Cleartext: 0 }
        const ciphers = {}
        const scores = []
        let nistPass = true
        let rfc8314Pass = true
        let pqcCount = 0
        const allSessionsList = []

        for (const c of successful) {
          const detail = await getCapture(c.id)
          const r = detail.report
          if (!r) continue
          if (r.overall_score !== undefined) scores.push(r.overall_score)
          for (const s of r.sessions || []) {
            totalSessions++
            allSessionsList.push({ captureId: c.id, captureName: c.filename, ...s })
            if (!s.tls_version) {
              tlsVersions.Cleartext++
              if (s.role === 'submission_access') rfc8314Pass = false
            } else {
              const v = `TLS ${s.tls_version}`
              tlsVersions[v] = (tlsVersions[v] || 0) + 1
              if (['1.0', '1.1'].includes(s.tls_version)) nistPass = false
            }
            if (s.cipher_suite) {
              ciphers[s.cipher_suite] = (ciphers[s.cipher_suite] || 0) + 1
              if (s.cipher_suite.includes('RC4') || s.cipher_suite.includes('DES')) nistPass = false
            }
            if (s.kex && (s.kex.includes('Kyber') || s.kex.includes('ML-KEM') || s.kex.includes('X25519MLKEM'))) pqcCount++
          }
        }

        const tlsData = Object.entries(tlsVersions).filter(([, n]) => n > 0).map(([name, value]) => ({ name, value }))
        const cipherData = Object.entries(ciphers).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5)
        const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
        const pqcMetric = totalSessions > 0 ? Math.round((pqcCount / totalSessions) * 100) : 0

        if (active) setData({ tlsData, cipherData, avgScore, totalSessions, nistPass, rfc8314Pass, pqcMetric, allSessions: allSessionsList })
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  if (loading) return <Loading rows={5} label="Aggregating compliance data" />
  if (error) return <Notice tone="crit" title="Failed to load the compliance view">{error}</Notice>

  const scoreTone = data.avgScore >= 80 ? 'safe' : data.avgScore >= 50 ? 'warning' : 'danger'
  const r = 46
  const circ = 2 * Math.PI * r

  return (
    <div>
      <PageHeader
        title="Compliance"
        purpose={`Read-only view of cryptographic posture across ${data.totalSessions} observed sessions.`}
        actions={
          <>
            <label htmlFor="audit-month" className="sr-only">Reporting month</label>
            <input id="audit-month" type="month" className="sg-input h-10 w-auto py-0" defaultValue="2026-09" />
            <button onClick={() => window.print()} className="sg-btn-primary">
              <Printer size={15} strokeWidth={1.75} /> Audit report
            </button>
          </>
        }
      />

      {/* ---- headline gauges ---- */}
      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel className="flex items-center gap-6 p-6">
          <div className="relative h-[112px] w-[112px] shrink-0">
            <svg viewBox="0 0 112 112" className="-rotate-90" aria-hidden>
              <circle cx="56" cy="56" r={r} fill="none" stroke="rgb(var(--s-hair))" strokeWidth="8" />
              <circle cx="56" cy="56" r={r} fill="none" stroke={`rgb(var(--s-${scoreTone}))`} strokeWidth="8" strokeLinecap="butt"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - data.avgScore / 100)} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center"><Readout value={data.avgScore} className="text-[40px] text-bone" /></span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[14px] font-medium text-bone">Network health score <Explain term="score" /></div>
            <p className="mt-1 text-[13px] leading-relaxed text-smoke">Average of every completed capture's overall score, out of 100.</p>
          </div>
        </Panel>

        <Panel className="relative grid overflow-hidden sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="p-6">
            <div className="flex items-center gap-1.5 text-[14px] font-medium text-bone">Post-quantum readiness <Explain term="pqc" /></div>
            <div className="mt-3"><Readout value={data.pqcMetric} suffix="%" className="text-[72px] text-ice" /></div>
            <p className="mt-3 max-w-[40ch] text-[13px] leading-relaxed text-smoke">
              Sessions already using ML-KEM / Kyber key exchange. Each lit node is one percent of traffic safe from
              "harvest now, decrypt later".
            </p>
          </div>
          <Scene3D className="h-[200px] w-full sm:h-full" camera={{ position: [0, 0.4, 4.2], fov: 40 }}>
            <LatticeScene percent={data.pqcMetric} />
          </Scene3D>
        </Panel>
      </div>

      {/* ---- frameworks ---- */}
      <section className="mb-8">
        <SectionTitle title="Framework compliance" />
        <div className="grid gap-3 md:grid-cols-2">
          <Framework
            pass={data.nistPass}
            name="NIST SP 800-52r2"
            ok="TLS 1.2+ enforced, no deprecated cipher suites (RC4, 3DES)."
            bad="Deprecated TLS (1.0/1.1) or prohibited ciphers seen on active sessions."
          />
          <Framework
            pass={data.rfc8314Pass}
            warnOnly
            name="RFC 8314 · cleartext is obsolete"
            ok="All submission and access traffic uses implicit TLS or STARTTLS."
            bad="Unencrypted sessions seen on submission or access ports."
          />
        </div>
      </section>

      {/* ---- distribution ---- */}
      <section className="mb-10 grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="mb-2 flex items-center gap-1.5 text-[14px] font-medium text-bone">TLS versions <Explain term="tls" /></div>
          <div className="grid items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.tlsData} innerRadius={56} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                    {data.tlsData.map((d) => <Cell key={d.name} fill={TLS_COLORS[d.name] || 'rgb(var(--s-smoke))'} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 text-[13px]">
              {data.tlsData.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-ash">
                    <span className="h-2.5 w-2.5" style={{ background: TLS_COLORS[d.name] || 'rgb(var(--s-smoke))' }} /> {d.name}
                  </span>
                  <span className="text-bone tabular">{d.value}</span>
                </li>
              ))}
              {!data.tlsData.length && <li className="text-smoke">No sessions yet.</li>}
            </ul>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-2 flex items-center gap-1.5 text-[14px] font-medium text-bone">Most negotiated cipher suites <Explain term="cipher" /></div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.cipherData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgb(var(--s-smoke))', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={170} tick={{ fontSize: 10.5, fill: 'rgb(var(--s-ash))' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgb(var(--s-carbon-4) / 0.6)' }} />
                <Bar dataKey="count" radius={0} maxBarSize={18} fill="rgb(var(--s-signal))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>

      {/* ---- per-session audit log ---- */}
      <section className="mb-10">
        <SectionTitle title="Session audit log" hint={`${data.allSessions.length} sessions across every completed capture.`} />
        <Panel className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead className="sticky top-0 z-[1] bg-carbon-2">
              <tr className="border-b border-hair text-left text-[12px] text-smoke">
                <th className="px-5 py-3 font-medium">Capture</th>
                <th className="px-5 py-3 font-medium">Connection</th>
                <th className="px-5 py-3 font-medium">Protocol</th>
                <th className="px-5 py-3 font-medium">Encryption</th>
                <th className="px-5 py-3 font-medium">Grade</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.allSessions.map((s, idx) => (
                <tr key={`${s.captureId}-${s.tcp_stream}-${idx}`} className="border-b border-hair/60 last:border-0 hover:bg-carbon-3/60">
                  <td className="max-w-[220px] truncate px-5 py-3 text-bone">{s.captureName}</td>
                  <td className="px-5 py-3 font-code text-[12px]">
                    <div className="text-smoke">{s.client?.ip}:{s.client?.port} →</div>
                    <div className="text-bone">{s.server?.ip}:{s.server?.port}</div>
                  </td>
                  <td className="px-5 py-3 uppercase text-ash">{s.protocol}</td>
                  <td className="px-5 py-3">
                    <div className={s.tls_version ? 'text-bone' : 'text-signal'}>{s.tls_version ? `TLS ${s.tls_version}` : 'Cleartext'}</div>
                    {s.cipher_suite && <div className="mt-0.5 font-code text-[11px] text-smoke">{s.cipher_suite}</div>}
                  </td>
                  <td className="px-5 py-3"><Grade grade={s.grade?.letter} size="xs" /></td>
                  <td className="px-5 py-3 text-right">
                    <Link to={`/report/${s.captureId}`} className="inline-flex items-center gap-1 text-[12.5px] text-ash hover:text-signal">
                      Report <ArrowUpRight size={13} strokeWidth={1.75} />
                    </Link>
                  </td>
                </tr>
              ))}
              {!data.allSessions.length && <tr><td colSpan="6" className="p-10 text-center text-smoke">No sessions recorded.</td></tr>}
            </tbody>
          </table>
        </Panel>
      </section>

      <AuditVerificationQueue />
    </div>
  )
}

function Framework({ pass, name, ok, bad, warnOnly }) {
  const tone = pass ? 'safe' : warnOnly ? 'warning' : 'danger'
  return (
    <Panel className={`flex items-start gap-3 p-5 ${pass ? '' : warnOnly ? 'border-heat/30' : 'border-signal/30'}`}>
      {pass ? <CheckCircle2 size={19} strokeWidth={1.75} className="mt-0.5 shrink-0 text-go" /> : <XCircle size={19} strokeWidth={1.75} className={`mt-0.5 shrink-0 text-${tone}`} />}
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-bone">
          {name} <Tag tone={tone}>{pass ? 'pass' : 'fail'}</Tag>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ash">{pass ? ok : bad}</p>
      </div>
    </Panel>
  )
}

// Legacy verification queue: same data source and decision calls as the classic page.
function AuditVerificationQueue() {
  const [items, setItems] = useState([])

  useEffect(() => {
    async function load() {
      const [capList, dbStatuses] = await Promise.all([listCaptures().catch(() => []), getAllFindingsStatuses().catch(() => [])])
      const adapted = capList.filter((c) => c.status === 'COMPLETED').map(adaptBackendCapture)
      const statusMap = {}
      dbStatuses.forEach((s) => { statusMap[`${s.captureId}-${s.streamId}`] = s })
      setItems(
        adapted.flatMap((cap) =>
          (cap.sessions || [])
            .filter((s) => statusMap[`${cap.id}-${s.tcp_stream}`]?.status === 'AWAITING_AUDIT')
            .map((s) => ({
              key: `${cap.id}-${s.tcp_stream}`,
              captureId: cap.id,
              captureFile: cap.capture?.filename || 'Unknown',
              stream: s.tcp_stream,
              server: s.server?.ip || s.server,
              protocol: s.protocol,
              findings: (s.findings || []).filter((f) => ['critical', 'high'].includes(f.severity)),
            })),
        ),
      )
    }
    load()
  }, [])

  async function decide(inc, decision) {
    await updateFindingStatus(inc.captureId, inc.stream, decision)
    await updateForensicsStatus(inc.captureId, inc.stream, decision)
    setItems((prev) => prev.filter((i) => i.key !== inc.key))
  }

  return (
    <section>
      <SectionTitle
        title="Verification queue"
        term="dualGate"
        hint="The full incident workflow lives under Incidents. This queue covers per-finding reviews."
        right={<Tag tone="gold">{items.length} pending</Tag>}
      />
      {items.length === 0 ? (
        <Panel><Empty icon={ClipboardCheck} title="Nothing awaiting verification">Forensics must submit reports first.</Empty></Panel>
      ) : (
        <div className="space-y-3">
          {items.map((inc) => (
            <Panel key={inc.key} className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[14px] font-medium text-bone">{inc.server} · {String(inc.protocol || '').toUpperCase()}</div>
                  <div className="text-[12.5px] text-smoke">{inc.captureFile} · Stream #{inc.stream} · {inc.findings.length} finding(s)</div>
                </div>
                <Tag tone="gold">Submitted by Forensics</Tag>
              </div>
              <ul className="space-y-1.5">
                {inc.findings.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px] text-ash"><Severity severity={f.severity} /> {f.title || f.rule_id}</li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2 border-t border-hair pt-3">
                <Link to={`/report/${inc.captureId}`} className="text-[13px] text-signal hover:underline">View report</Link>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => decide(inc, 'REJECTED')} className="sg-btn-danger sg-btn-sm">Return to IR</button>
                  <button onClick={() => decide(inc, 'VERIFIED')} className="sg-btn-primary sg-btn-sm">Verify and close</button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </section>
  )
}
