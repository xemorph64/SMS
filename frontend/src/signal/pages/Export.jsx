import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Braces, FileText, Printer, Copy, Check } from 'lucide-react'
import { useReport } from '../lib/roles'
import { reportHtmlUrl, reportJsonUrl, reportPrintUrl, fetchWithAuth, getCapture, adaptBackendCapture } from '../../lib/api'
import { Empty, Explain, HashText, Loading, PageHeader, Panel } from '../ui'

/*
 * The deliverable an analyst hands over. Every format is rendered from the
 * same stored analysis and carries the capture hash. Download/open logic is
 * identical to the classic Export page.
 */
export default function ExportPage() {
  const { id } = useParams()
  const { report, setReport } = useReport()
  const [copied, setCopied] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Opened directly (e.g. from the evidence locker): load this capture's report
  // the same way the report page does, instead of showing an empty state.
  const loaded = report?.id && String(report.id) === String(id)
  useEffect(() => {
    if (loaded) return undefined
    let cancelled = false
    getCapture(id)
      .then((detail) => { if (!cancelled) setReport({ report: adaptBackendCapture(detail), id: detail.id }) })
      .catch((e) => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [id, loaded, setReport])

  const downloadJson = async (e) => {
    e.preventDefault()
    try {
      const res = await fetchWithAuth(reportJsonUrl(id))
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mailsentinel-${report.report?.capture?.filename || 'report'}.json`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    }
  }

  const openHtml = async (e, print = false) => {
    e.preventDefault()
    try {
      const res = await fetchWithAuth(print ? reportPrintUrl(id) : reportHtmlUrl(id))
      const blob = await res.blob()
      let htmlText = await blob.text()
      if (print) htmlText += '<script>window.onload = function() { window.print(); }</script>'
      const url = window.URL.createObjectURL(new Blob([htmlText], { type: 'text/html' }))
      window.open(url, '_blank')
      setTimeout(() => window.URL.revokeObjectURL(url), 10000)
    } catch (err) {
      console.error(err)
    }
  }

  if (!loaded && !loadError) return <Loading rows={3} label="Loading the report" />
  if (!report?.report || !loaded) {
    return (
      <Panel>
        <Empty title="Nothing to export" action={<Link to={`/report/${id}`} className="sg-btn-ghost">Load the report first</Link>} />
      </Panel>
    )
  }

  const r = report.report
  const formats = [
    {
      icon: Printer,
      title: 'PDF',
      body: 'Print-ready forensic case file with proper page breaks. Opens your browser\'s print dialog; choose "Save as PDF".',
      action: (e) => openHtml(e, true),
      cta: 'Save as PDF',
      primary: true,
    },
    {
      icon: FileText,
      title: 'HTML',
      body: 'A self-contained report that opens in any browser, offline, with every piece of evidence embedded.',
      action: (e) => openHtml(e, false),
      cta: 'Open HTML',
    },
    {
      icon: Braces,
      title: 'JSON',
      body: 'The complete machine-readable record for a SIEM, a ticketing system or a CERT-In submission.',
      action: downloadJson,
      cta: 'Download JSON',
    },
  ]

  return (
    <div className="max-w-[980px]">
      <PageHeader
        back={{ to: `/report/${id}`, label: 'Capture report' }}
        title="Export the forensic report"
        purpose="Hand findings to someone who was not in the room. Every format is the same document, tied to one evidence file."
      />

      <Panel className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-bone">{r.capture?.filename}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-smoke">
            <span>{r.counts?.sessions ?? 0} sessions</span>
            <span className="inline-flex items-center gap-1.5">SHA-256 <HashText value={r.capture?.sha256} head={16} tail={8} /> <Explain term="sha256" /></span>
          </div>
        </div>
        <button
          type="button"
          className="sg-btn-ghost sg-btn-sm"
          onClick={() => {
            navigator.clipboard
              ?.writeText(r.capture?.sha256 || '')
              .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
              .catch(() => setCopied(false))
          }}
        >
          {copied ? <Check size={14} strokeWidth={2} className="text-go" /> : <Copy size={14} strokeWidth={1.75} />}
          {copied ? 'Hash copied' : 'Copy evidence hash'}
        </button>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        {formats.map((f) => {
          const Icon = f.icon
          return (
            <Panel key={f.title} className="flex flex-col p-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-hair-2 bg-carbon-3 text-signal">
                <Icon size={19} strokeWidth={1.5} />
              </div>
              <h2 className="text-[16px] font-semibold text-bone">{f.title}</h2>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-ash">{f.body}</p>
              <a href="#" onClick={f.action} className={`${f.primary ? 'sg-btn-primary' : 'sg-btn-ghost'} mt-5 w-full`}>
                {f.cta}
              </a>
            </Panel>
          )
        })}
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-[15px] font-semibold text-bone">Inside every report</h2>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {[
            ['Evidence identity', 'Capture metadata and its SHA-256, tying every finding to one file.'],
            ['Grade and its reason', 'Score composition and the rule that capped it.'],
            ['Cited findings', 'Every handshake and certificate issue, with its NIST or RFC clause.'],
            ['Attack evidence', 'Downgrade and anomaly detections with the reconstructed transcript.'],
            ['Fix list', 'Remediation ordered by severity and traffic carried.'],
            ['Explainable AI', 'TreeSHAP contributions behind every model estimate.'],
            ['Stated limits', 'What a passive sensor cannot see, said plainly.'],
          ].map(([t, n]) => (
            <div key={t} className="border-l-2 border-hair-2 pl-4">
              <div className="text-[13.5px] font-medium text-bone">{t}</div>
              <div className="mt-0.5 text-[12.5px] text-smoke">{n}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
