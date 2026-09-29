import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { UploadCloud, Loader2, ShieldCheck } from 'lucide-react'
import { useReport } from '../lib/roles'
import { Explain, Grade, Notice } from '../ui'
import { analyseDemoCapture, listDemoCaptures, listInvestigations, uploadCapture } from '../../lib/api'

/*
 * Capture intake. Same calls as the classic Upload page: upload or run a
 * bundled sample, optionally inside an investigation, then go to the job.
 */
export default function UploadPanel() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [investigations, setInvestigations] = useState([])
  const [investigationId, setInvestigationId] = useState(search.get('investigation') || '')
  const { health } = useReport()
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [demos, setDemos] = useState([])
  const inputRef = useRef(null)

  useEffect(() => { listInvestigations().then(setInvestigations).catch(() => {}) }, [])

  const ready = health?.status === 'UP'

  useEffect(() => {
    let cancelled = false
    if (!health?.reachable) return undefined
    listDemoCaptures()
      .then((list) => { if (!cancelled) setDemos(list) })
      .catch(() => { if (!cancelled) setDemos([]) })
    return () => { cancelled = true }
  }, [health?.reachable])

  const show = useCallback(async (created) => { navigate(`/jobs/${created.id}`) }, [navigate])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError(null)
    setBusy(`Uploading ${file.name}`)
    try {
      await show(await uploadCapture(file, { investigationId }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }, [show, investigationId])

  const runDemo = useCallback(async (name) => {
    setError(null)
    setBusy(`Starting ${name}`)
    try {
      await show(await analyseDemoCapture(name, investigationId))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }, [show, investigationId])

  return (
    <div className="space-y-6">
      {health && !health.reachable && (
        <Notice tone="warn" title="The API is not running">
          Start it with <code className="font-code text-bone">docker compose up</code>, or{' '}
          <code className="font-code text-bone">java -jar backend/target/mailsentinel-1.0.0.jar</code> from the project root.
          This page works as soon as it answers.
        </Notice>
      )}
      {health?.reachable && health.status !== 'UP' && (
        <Notice tone="warn" title="The API is up but cannot reach the analysis engine">
          {health.error || 'The engine could not be imported.'}
          {health.hint ? ` ${health.hint}` : ''}
        </Notice>
      )}

      <div
        className={`relative overflow-hidden border transition-all duration-300 ${
          dragging ? 'border-signal bg-signal/[0.06] scale-[1.005]' : 'border-dashed border-hair-2 bg-carbon-2'
        }`}
        aria-busy={!!busy}
        onDragOver={(e) => { e.preventDefault(); if (ready && !busy) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (ready && !busy) handleFile(e.dataTransfer.files?.[0])
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: 'radial-gradient(50% 70% at 50% 0%, rgb(var(--s-signal) / 0.06), transparent 70%)' }}
        />
        <input ref={inputRef} type="file" accept=".pcap,.pcapng,.cap,.gz" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        <AnimatePresence mode="wait">
          {busy ? (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex flex-col items-center px-6 py-16 text-center">
              <Loader2 size={28} strokeWidth={1.5} className="animate-spin text-signal" />
              <div className="mt-4 text-[15px] font-medium text-bone">{busy}</div>
              <div className="mt-1 text-[13px] text-smoke">Hashing and queueing the evidence.</div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex flex-col items-center px-6 py-14 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center border border-hair-2 bg-carbon-3 text-signal">
                <UploadCloud size={26} strokeWidth={1.5} />
              </div>
              <h2 className="flex items-center gap-2 text-[19px] font-semibold tracking-[-0.01em] text-bone">
                Drop a packet capture <Explain term="pcap" />
              </h2>
              <p className="mt-1.5 text-[13.5px] text-smoke">.pcap, .pcapng, .cap or .gz, up to 2 GB</p>
              <button type="button" disabled={!ready} onClick={() => inputRef.current?.click()} className="sg-btn-primary mt-6 h-11 px-6">
                Choose file
              </button>
              <p className="mt-5 flex items-center gap-1.5 text-[12px] text-smoke">
                <ShieldCheck size={13} strokeWidth={1.75} className="text-signal" />
                Sealed with a SHA-256 fingerprint on arrival <Explain term="sha256" />
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="inv-select" className="flex shrink-0 items-center gap-1.5 text-[13px] text-ash">
          File under investigation <Explain term="investigation" />
        </label>
        <select
          id="inv-select"
          className="sg-input sm:max-w-[340px]"
          value={investigationId}
          onChange={(e) => setInvestigationId(e.target.value)}
          disabled={!!busy}
        >
          <option value="">Standalone analysis</option>
          {investigations.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      {error && <Notice tone="crit" title="Analysis failed">{error}</Notice>}

      {demos.length > 0 && (
        <section className="pt-4">
          <h3 className="text-[15px] font-semibold text-bone">Or try a sample</h3>
          <p className="mt-1 text-[13px] text-smoke">Each sample carries a known issue, or a clean session. The expected grade is shown.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {demos.map((d) => (
              <button
                key={d.name}
                type="button"
                disabled={!ready || !!busy}
                onClick={() => runDemo(d.name)}
                className="group flex items-start gap-3.5 border border-hair bg-carbon-2 p-4 text-left transition-all hover:-translate-y-px hover:border-hair-2 hover:bg-carbon-3 disabled:pointer-events-none disabled:opacity-50"
              >
                <Grade grade={d.grade} size="sm" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-bone group-hover:text-signal transition-colors">{d.title}</span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-smoke">{d.note}</span>
                  <span className="mt-2 block truncate font-code text-[11px] text-smoke">{d.name}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
