import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, X, RotateCcw } from 'lucide-react'
import { getCapture, cancelRun, retryRun } from '../../lib/api'
import ForensicFlow from '../components/ForensicFlow'
import { Notice, PageHeader, Panel } from '../ui'

// Engine stage events, in order (same list as the classic job page).
const STAGES = ['QUEUED', 'STARTING', 'READING', 'REASSEMBLING', 'TLS_AND_CERTIFICATES', 'RULES_AND_COVERAGE', 'ML_ASSESSMENT', 'AGGREGATING', 'HISTORY_COMPARISON', 'COMPLETED']
const SHOWN = STAGES.filter((s) => !['STARTING', 'COMPLETED'].includes(s))

const COPY = {
  QUEUED: ['Queued', 'Waiting for a worker'],
  READING: ['Read', 'Loading packets from the file'],
  REASSEMBLING: ['Reassemble', 'Rebuilding each TCP conversation'],
  TLS_AND_CERTIFICATES: ['TLS & certificates', 'Parsing handshakes and certs'],
  RULES_AND_COVERAGE: ['Rules', 'Checking NIST and RFC rules'],
  ML_ASSESSMENT: ['AI assessment', 'Scoring risk and anomalies'],
  AGGREGATING: ['Grade', 'Rolling up servers and sessions'],
  HISTORY_COMPARISON: ['History', 'Comparing with earlier captures'],
}

const label = (v) => (v || 'queued').toLowerCase().replaceAll('_', ' ')

// How long the completion summary stays on the canvas before the run hands
// off to its report — long enough for the evidence readout to be read.
const COMPLETION_HOLD_MS = 3400

export default function AnalysisJob() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)

  useEffect(() => {
    let stop = false
    let timer
    // A run that finishes while someone is watching resolves on the canvas for
    // a moment first. A link opened straight onto a finished run (or a browser
    // that asks for reduced motion) jumps to the report without the pause.
    let watched = false
    setJob(null); setError('')
    async function poll() {
      try {
        const data = await getCapture(id)
        if (stop) return
        setJob(data); setError('')
        if (watched || ['PENDING', 'RUNNING'].includes(data.status)) watched = true
        if (data.status === 'COMPLETED') {
          const hold = watched && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          if (hold) {
            timer = setTimeout(() => { if (!stop) navigate(`/report/${id}`, { replace: true }) }, COMPLETION_HOLD_MS)
          } else {
            navigate(`/report/${id}`, { replace: true })
          }
          return
        }
        if (['FAILED', 'CANCELLED'].includes(data.status)) return
      } catch (e) { if (!stop) setError(e.message) }
      if (!stop) timer = setTimeout(poll, 1200)
    }
    poll()
    return () => { stop = true; clearTimeout(timer) }
  }, [id, navigate])

  async function act(action) {
    setActing(true)
    try {
      const data = await action(id)
      if (data.id !== Number(id)) navigate(`/jobs/${data.id}`)
      else setJob(data)
    } catch (e) { setError(e.message) } finally { setActing(false) }
  }

  const terminal = ['FAILED', 'CANCELLED'].includes(job?.status)
  const cur = STAGES.indexOf(job?.stage)
  const active = SHOWN.filter((s) => STAGES.indexOf(s) < cur).length

  return (
    <div>
      <PageHeader
        back={{ to: job?.investigationId ? `/investigations/${job.investigationId}` : '/investigations', label: 'Analysis history' }}
        title={`Analysis run #${id}`}
        purpose={job?.filename || 'Loading run…'}
        actions={job && (
          <button className={terminal ? 'sg-btn-primary' : 'sg-btn-ghost'} disabled={acting} onClick={() => act(terminal ? retryRun : cancelRun)}>
            {terminal ? <><RotateCcw size={15} strokeWidth={1.75} /> Retry as new run</> : <><X size={15} strokeWidth={1.75} /> Cancel analysis</>}
          </button>
        )}
      />

      {error && <Notice tone="warn" title="Could not update the run" className="mb-5">{error}</Notice>}

      <Panel>
        <ForensicFlow job={job} />
        <ol className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-hair p-5 sm:grid-cols-4 sm:p-6 lg:grid-cols-8">
          {SHOWN.map((s, i) => {
            const idx = STAGES.indexOf(s)
            const done = idx < cur
            const now = !!job && !done && i === active // the first unfinished stage is the one running
            return (
              <li key={s} className="min-w-0">
                <div className={`mb-2 h-1 rounded-full ${done ? 'bg-ice' : now ? (terminal ? 'bg-signal' : 'bg-signal') : 'bg-hair'}`} />
                <div className={`flex items-center gap-1.5 text-[12.5px] ${done || now ? 'text-bone' : 'text-smoke'}`}>
                  {done && <Check size={13} strokeWidth={2.25} className="shrink-0 text-ice" />}
                  <span className="truncate font-medium">{COPY[s][0]}</span>
                </div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-smoke">{COPY[s][1]}</div>
              </li>
            )
          })}
        </ol>
      </Panel>

      {job?.errorMessage && <Notice tone="crit" title="The engine reported an error" className="mt-5">{job.errorMessage}</Notice>}

      <p className="mt-5 text-[13px] leading-relaxed text-smoke">
        You can leave this page; the server keeps the job and its evidence. The canvas and the tracker read the engine's
        own stage events, not an estimated percentage — counts and findings appear only when the engine publishes them.
        Retrying keeps this run for the record.
      </p>
      <Link className="mt-3 inline-block text-[13px] text-signal hover:underline" to={job?.investigationId ? `/investigations/${job.investigationId}` : '/investigations'}>
        Back to analysis history
      </Link>
    </div>
  )
}
