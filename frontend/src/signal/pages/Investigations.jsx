import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FolderKanban, ArrowRight, Plus, RefreshCw, GitCompareArrows, ArrowUpRight, UploadCloud } from 'lucide-react'
import { listInvestigations, createInvestigation, getInvestigation, compareRuns, listCaptures, saveRemediation } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Empty, Explain, Grade, Notice, PageHeader, Panel, SectionTitle, Tag } from '../ui'

const RUN_TONE = { COMPLETED: 'safe', FAILED: 'danger', CANCELLED: 'muted' }

export default function Investigations() {
  const { investigationId } = useParams()
  const { role } = useAuth()
  const [items, setItems] = useState([])
  const [detail, setDetail] = useState(null)
  const [runs, setRuns] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [comparison, setComparison] = useState(null)

  // Same data flow as the classic page.
  async function load() {
    if (investigationId) setDetail(await getInvestigation(investigationId))
    else { const [i, r] = await Promise.all([listInvestigations(), listCaptures()]); setItems(i); setRuns(r) }
  }

  useEffect(() => {
    let alive = true
    setDetail(null); setComparison(null); setBefore(''); setAfter(''); setError('')
    const request = investigationId ? getInvestigation(investigationId) : Promise.all([listInvestigations(), listCaptures()])
    request
      .then((data) => { if (!alive) return; if (investigationId) setDetail(data); else { setItems(data[0]); setRuns(data[1]) } })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [investigationId])

  async function perform(fn) { setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const shownRuns = detail?.runs || runs
  const complete = shownRuns.filter((r) => r.status === 'COMPLETED')
  const isDetail = !!investigationId
  const canUpload = role === 'ROLE_SOC_ANALYST'

  return (
    <div>
      <PageHeader
        back={isDetail ? { to: '/investigations', label: 'All investigations' } : undefined}
        title={detail?.investigation.name || (isDetail ? 'Loading investigation…' : 'Investigations')}
        term="investigation"
        purpose={isDetail ? 'Every run for this infrastructure. Compare two runs to prove a fix worked.' : 'Group captures of the same infrastructure, compare runs over time and track fixes.'}
        actions={canUpload && (
          <Link className="sg-btn-primary" to={isDetail ? `/analyst-dashboard?investigation=${investigationId}` : '/analyst-dashboard'}>
            <UploadCloud size={15} strokeWidth={2} /> Analyse a capture
          </Link>
        )}
      />

      {error && <Notice tone="warn" title="Request failed" className="mb-6">{error}</Notice>}

      {!isDetail && (
        <div className="mb-10 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-bone">
              <Plus size={16} strokeWidth={1.75} className="text-signal" /> New investigation
            </h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => { e.preventDefault(); perform(async () => { await createInvestigation(name); setName(''); await load() }) }}
            >
              <div>
                <label htmlFor="inv-name" className="sg-label">Name</label>
                <input id="inv-name" required maxLength={160} className="sg-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mail infrastructure review" />
              </div>
              <button className="sg-btn-primary w-full" disabled={busy || !name.trim()}>Create investigation</button>
            </form>
          </Panel>

          <div>
            {items.length === 0 ? (
              <Panel className="h-full"><Empty icon={FolderKanban} title="No investigations yet">Create one to group related captures.</Empty></Panel>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((i) => (
                  <Link
                    key={i.id}
                    to={`/investigations/${i.id}`}
                    className="sg-panel group flex items-center justify-between gap-3 p-4 transition-all hover:-translate-y-px hover:border-hair-2"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-carbon-4 text-smoke group-hover:text-signal transition-colors">
                        <FolderKanban size={17} strokeWidth={1.5} />
                      </span>
                      <span className="truncate text-[14px] font-medium text-bone">{i.name}</span>
                    </span>
                    <ArrowRight size={15} strokeWidth={1.75} className="shrink-0 text-smoke transition-transform group-hover:translate-x-0.5 group-hover:text-signal" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <section className="mb-10">
        <SectionTitle
          title="Analysis runs"
          right={
            <button className="sg-btn-ghost sg-btn-sm" disabled={busy} onClick={() => perform(load)}>
              <RefreshCw size={13} strokeWidth={1.75} className={busy ? 'animate-spin' : ''} /> Refresh
            </button>
          }
        />
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="border-b border-hair text-left text-[12px] text-smoke">
                <th className="px-5 py-3 font-medium">Run</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Grade</th>
                <th className="px-5 py-3 font-medium">Uploaded</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {shownRuns.map((r) => (
                <tr key={r.id} className="group border-b border-hair/60 last:border-0 hover:bg-carbon-3/60">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-code text-[11.5px] text-smoke">#{r.id}</span>
                      <span className="max-w-[260px] truncate font-code text-[12.5px] text-bone" title={r.filename}>{r.filename}</span>
                    </div>
                    {r.sourceCaptureId && <div className="mt-1 text-[11.5px] text-smoke">Retry of #{r.sourceCaptureId}</div>}
                  </td>
                  <td className="px-5 py-3"><Tag tone={RUN_TONE[r.status] || 'cipher'}>{r.status.toLowerCase()}</Tag></td>
                  <td className="px-5 py-3">{r.overallGrade ? <Grade grade={r.overallGrade} size="xs" /> : <span className="text-smoke">–</span>}</td>
                  <td className="px-5 py-3 text-[12.5px] text-ash">{new Date(r.uploadedAt).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    {role === 'ROLE_INCIDENT_RESPONDER' && r.status === 'COMPLETED' ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-smoke">Forensic view only <Explain term="separation" /></span>
                    ) : (
                    <Link className="inline-flex items-center gap-1 text-[13px] text-ash hover:text-signal" to={r.status === 'COMPLETED' ? `/report/${r.id}` : `/jobs/${r.id}`}>
                      Open <ArrowRight size={13} strokeWidth={1.75} />
                    </Link>
                    )}
                  </td>
                </tr>
              ))}
              {!shownRuns.length && (
                <tr><td colSpan="5" className="p-10 text-center text-[13.5px] text-smoke">No captures yet. Analyse one to start.</td></tr>
              )}
            </tbody>
          </table>
        </Panel>
      </section>

      {isDetail && (
        <div className="space-y-10">
          <section>
            <SectionTitle title="Compare two runs" hint="Pick a baseline and a later run to see what was fixed, what is new and what changed on each server." />
            <Panel className="p-5">
              <form
                className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
                onSubmit={(e) => { e.preventDefault(); perform(async () => setComparison(await compareRuns(investigationId, before, after))) }}
              >
                {[['Before (baseline)', before, setBefore, 'cmp-before'], ['After (remediation)', after, setAfter, 'cmp-after']].map(([lab, value, set, fid]) => (
                  <div key={fid}>
                    <label htmlFor={fid} className="sg-label">{lab}</label>
                    <select id={fid} required className="sg-input" value={value} onChange={(e) => { set(e.target.value); setComparison(null) }}>
                      <option value="">Select a completed run</option>
                      {complete.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.filename}</option>)}
                    </select>
                  </div>
                ))}
                <button className="sg-btn-primary h-[46px]" disabled={busy || !before || !after || before === after}>
                  <GitCompareArrows size={15} strokeWidth={1.75} /> Compare
                </button>
              </form>
            </Panel>

            {comparison && (
              <div className="mt-6 space-y-6">
                {comparison.caveats.length > 0 && (
                  <div className="space-y-2">{comparison.caveats.map((c) => <Notice key={c} tone="info">{c}</Notice>)}</div>
                )}

                <Panel className="grid grid-cols-2 gap-6 p-5">
                  {[['Before', comparison.beforeCoverage], ['After', comparison.afterCoverage]].map(([lab, cov]) => (
                    <div key={lab}>
                      <div className="flex items-center gap-1.5 text-[12.5px] text-smoke">{lab} coverage <Explain term="coverage" /></div>
                      <div className="mt-1 text-[22px] font-semibold text-bone tabular">
                        {cov.assessed_checks ?? '?'} <span className="text-[14px] font-normal text-smoke">/ {cov.applicable_checks ?? '?'}</span>
                      </div>
                    </div>
                  ))}
                </Panel>

                <div>
                  <h3 className="mb-3 text-[15px] font-semibold text-bone">Findings and remediation</h3>
                  {!comparison.findings.length && <Panel><Empty title="No non-informational findings in either run" /></Panel>}
                  <div className="space-y-2.5">
                    {comparison.findings.map((f) => (
                      <Panel key={f.key} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="min-w-0">
                          <Tag tone={f.state.includes('NEW') ? 'danger' : f.state.includes('RESOLVED') ? 'safe' : 'caution'}>{f.state.replaceAll('_', ' ').toLowerCase()}</Tag>
                          <h4 className="mt-2 text-[14.5px] font-medium text-bone">{f.rule} · {f.title}</h4>
                          <p className="mt-2 border-l-2 border-signal/60 pl-3 text-[13px] leading-relaxed text-ash">{f.remediation}</p>
                          <p className="mt-2 font-code text-[11.5px] text-smoke">{f.key}</p>
                        </div>
                        <div>
                          <label htmlFor={`st-${f.key}`} className="sg-label">Analyst status</label>
                          <select
                            id={`st-${f.key}`}
                            className="sg-input"
                            disabled={busy}
                            value={detail?.remediation.find((r) => r.finding_key === f.key)?.status || 'open'}
                            onChange={(e) => perform(async () => { await saveRemediation(investigationId, f.key, e.target.value); await load() })}
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="fix_reported">Fix reported</option>
                          </select>
                        </div>
                      </Panel>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-[15px] font-semibold text-bone">What changed on each server</h3>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {comparison.servers.map((s) => (
                      <Panel key={s.identity} className="p-5">
                        <p className="break-all font-code text-[12px] text-bone">{s.identity}</p>
                        <p className="mt-1 text-[12.5px] capitalize text-signal">{s.match.replaceAll('_', ' ')}</p>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          {[['Before', s.before], ['After', s.after]].map(([lab, values]) => (
                            <div key={lab}>
                              <div className="mb-2 border-b border-hair pb-1 text-[12.5px] font-medium text-bone">{lab}</div>
                              {Object.entries(values).map(([k, v]) => (
                                <div key={k} className="mb-2">
                                  <div className="text-[11px] text-smoke">{k}</div>
                                  <div className="break-all font-code text-[11.5px] text-ash">{v.join(', ')}</div>
                                </div>
                              ))}
                              {!Object.keys(values).length && <span className="text-[12px] text-smoke">Not observed</span>}
                            </div>
                          ))}
                        </div>
                      </Panel>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
            <SectionTitle title="Server history" hint="Latest analysed run per server. Open a report to see its baseline and evidence." term="baseline" />
            {!detail?.servers?.length ? (
              <Panel><Empty title="No servers observed yet" /></Panel>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detail.servers.map((s) => (
                  <Panel key={s.assessment.identity} className="flex flex-col p-5">
                    <div className="break-all font-code text-[13px] text-bone">{s.assessment.host}:{s.assessment.port}</div>
                    <div className="mt-2 text-[13px] capitalize text-ash">{s.assessment.status.replaceAll('_', ' ')}</div>
                    <div className="mt-1 text-[12px] text-smoke">
                      {s.assessment.prior_sessions} prior sessions · {s.assessment.prior_captures} captures
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-hair pt-3">
                      <Tag>{s.assessment.identity_confidence.replaceAll('_', ' ')}</Tag>
                      {role === 'ROLE_INCIDENT_RESPONDER' ? (
                        <span className="text-[12.5px] text-smoke">Run #{s.captureId}</span>
                      ) : (
                        <Link className="inline-flex items-center gap-1 text-[12.5px] text-ash hover:text-signal" to={`/report/${s.captureId}`}>
                          Run #{s.captureId} <ArrowUpRight size={13} strokeWidth={1.75} />
                        </Link>
                      )}
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
