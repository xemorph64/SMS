import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, CircleAlert, BrainCircuit, Binary } from 'lucide-react'

import { useReport } from '../lib/roles'
import { Coverage } from '../components/Assessment'
import StartTlsMachine from '../components/StartTlsMachine'
import { adaptBackendCapture, getCapture } from '../../lib/api'
import { dateOnly, sessionKind, yesNo } from '../../lib/format'
import {
  Empty, Explain, Grade, KV, Readout, Loading, Notice, PageHeader, Panel, SectionTitle, Severity, ShapBars, Tag,
} from '../ui'

export default function SessionDetail() {
  const { id, stream } = useParams()
  const { report, setReport } = useReport()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!report)

  // Same load contract as the classic session view (shared report cache).
  useEffect(() => {
    if (report?.id && String(report.id) === String(id)) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
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

  if (loading) return <Loading rows={5} label="Loading the session" />
  if (error) {
    return (
      <Panel>
        <Empty title="Could not load that session" action={<Link to={`/report/${id}`} className="sg-btn-ghost">Back to report</Link>}>{error}</Empty>
      </Panel>
    )
  }

  const s = (report?.report?.sessions || []).find((x) => String(x.tcp_stream) === String(stream))
  if (!s) {
    return (
      <Panel>
        <Empty title="No such session in this capture" action={<Link to={`/report/${id}`} className="sg-btn-ghost">Back to report</Link>} />
      </Panel>
    )
  }

  const leaf = (s.chain || [])[0]
  const findings = s.findings || []
  const real = findings.filter((f) => f.severity !== 'info')
  const info = findings.filter((f) => f.severity === 'info')

  return (
    <div>
      <PageHeader back={{ to: `/report/${id}`, label: 'Capture report' }} kicker={`Session #${s.tcp_stream}`} title={sessionKind(s)} />

      {/* ---- identity ---- */}
      <Panel className="-mt-2 mb-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <Grade grade={s.grade?.letter} size="lg" className="!h-28 !min-w-28 !text-[84px]" />
        <div className="min-w-0 flex-1">
          <div className="font-code text-[14px] text-bone">
            {s.client?.ip}:{s.client?.port} <span className="text-signal">→</span> {s.server?.ip}:{s.server?.port}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-smoke">
            {s.server_name && <span>SNI <span className="font-code text-ash">{s.server_name}</span></span>}
            <span className="tabular">Frames {s.first_frame} to {s.last_frame}</span>
            <span className="inline-flex items-center gap-1">
              {s.role === 'mta_relay' ? 'Relay hop' : 'Submission / access'} <Explain term={s.role === 'mta_relay' ? 'relay' : 'submission'} />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.grade?.trusted === false && <Tag tone="warning">Untrusted chain</Tag>}
            {s.confidence === 'partial' && <Tag>Partial view</Tag>}
            {s.ml?.anomaly && <Tag tone="warning">Anomalous session</Tag>}
          </div>
        </div>
        <div className="shrink-0 border-t border-hair pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <div className="flex items-center gap-1.5 text-[12.5px] text-smoke">Weighted score <Explain term="score" /></div>
          <div className="mt-2"><Readout value={s.grade?.raw_score ?? '–'} className="text-[48px] text-bone" /></div>
          {s.grade?.components && (
            <div className="mt-2 flex gap-3 text-[11.5px] text-smoke">
              <span>Protocol <span className="text-ash tabular">{fmt(s.grade.components.protocol)}</span></span>
              <span>Kex <span className="text-ash tabular">{fmt(s.grade.components.key_exchange)}</span></span>
              <span>Cipher <span className="text-ash tabular">{fmt(s.grade.components.cipher)}</span></span>
            </div>
          )}
        </div>
      </Panel>

      {(s.grade?.capped_by || s.grade?.zero_category) && (
        <div className="mb-6 space-y-2">
          {s.grade?.capped_by && (
            <Notice tone="warn" title={`Grade capped at ${s.grade.letter}`}>
              Capped by rule <span className="font-code text-bone">{s.grade.capped_by}</span>. <Explain term="gradeCap" />
            </Notice>
          )}
          {s.grade?.zero_category && (
            <Notice tone="crit" title="Score forced to zero">A zero in {s.grade.zero_category} forces the whole score to 0.</Notice>
          )}
        </div>
      )}

      {s.capability_mangled && (
        <Notice tone="crit" title="Downgrade evidence" className="mb-4">
          The capability list contains <code className="font-code text-signal">{s.mangled_token}</code> where the STARTTLS
          keyword belongs. It is an equal-length substitution, so packet sizes stay identical and nothing downstream notices.
          This exact attack was measured in the wild (Durumeric et al., IMC 2015). <Explain term="strip" />
        </Notice>
      )}
      {s.cleartext_auth && (
        <Notice tone="crit" title="Credentials exposed" className="mb-4">
          {s.cleartext_auth.mechanism || 'Authentication'} credentials for{' '}
          <code className="font-code text-signal">{s.cleartext_auth.username || 'an unknown user'}</code> were sent before any
          encryption existed{s.cleartext_auth.frame ? ` (frame ${s.cleartext_auth.frame})` : ''}. The password itself is never
          stored, only a SHA-256, so reuse can be correlated without the report becoming a second copy of the leak. Treat the
          credential as compromised.
        </Notice>
      )}

      {/* ---- STARTTLS path ---- */}
      <Panel className="mb-6 p-6">
        <StartTlsMachine session={s} />
      </Panel>

      {/* ---- handshake + certificate ---- */}
      <div className="mb-10 grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="mb-2 flex items-center gap-1.5 text-[14px] font-medium text-bone">TLS handshake <Explain term="tls" /></div>
          <div className="divide-y divide-hair/70">
            <KV k="Version" v={s.tls_version || 'none, cleartext'} bad={!s.tls_version} />
            <KV k="Cipher suite" term="cipher" v={s.cipher_suite || '–'} mono />
            <KV k="Key exchange" term="kex" v={s.kex ? `${s.kex}${s.kex_bits ? ` · ${s.kex_bits}-bit equivalent` : ''}` : '–'} />
            <KV k="Forward secrecy" term="forwardSecrecy" v={yesNo(s.forward_secrecy)} bad={s.forward_secrecy === false} />
            <KV k="STARTTLS offered" v={yesNo(s.starttls_offered, 'no')} />
            <KV k="STARTTLS completed" v={yesNo(s.starttls_accepted, 'no')} />
            <KV k="JA4" term="ja3" v={s.ja4 || '–'} mono />
            <KV k="JA3" v={s.ja3 || '–'} mono />
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-2 flex items-center gap-1.5 text-[14px] font-medium text-bone">Certificate <Explain term="certificate" /></div>
          {s.cert_visibility === 'encrypted_tls13' ? (
            <div className="mt-3 border border-ice/30 bg-ice/[0.06] p-4 text-[13.5px] leading-relaxed text-ash">
              TLS 1.3 encrypts the certificate message (RFC 8446 §4.4), so a passive sensor cannot read it. No certificate
              findings apply here. That is a property of the protocol, not a gap in the analysis.
            </div>
          ) : leaf ? (
            <div className="divide-y divide-hair/70">
              <KV k="Subject" v={leaf.subject} />
              <KV k="Issuer" v={leaf.issuer} bad={leaf.self_signed} />
              <KV
                k="Valid until"
                v={<span className="inline-flex items-center gap-2">{dateOnly(leaf.not_after)} {leaf.expired_at_capture ? <Tag tone="danger">expired</Tag> : <Tag tone="safe">valid</Tag>}</span>}
              />
              <KV k="Key / signature" v={`${leaf.key_algorithm || '?'} ${leaf.key_bits || '?'} · ${leaf.signature_hash || '?'}`} bad={leaf.key_bits && leaf.key_bits < 2048} />
              <KV k="Self-signed" v={yesNo(leaf.self_signed, 'no')} bad={leaf.self_signed} />
              <KV k="Chain valid" v={yesNo(s.chain_valid, 'not evaluated')} bad={s.chain_valid === false} />
              <KV k="Revocation" v={revocationText(s.revocation)} />
            </div>
          ) : (
            <p className="mt-3 text-[13.5px] text-smoke">No certificate was presented. This session never negotiated TLS.</p>
          )}
        </Panel>
      </div>

      <div className="mb-10">
        <Coverage coverage={s.coverage} />
      </div>

      {/* ---- findings ---- */}
      <section className="mb-10">
        <SectionTitle title="Findings" hint="Each one cites the standard it enforces. The worst cap sets the grade." term="gradeCap" />
        {real.length === 0 && (
          <Panel className="mb-3 flex items-center gap-3 p-5 text-[14px] text-ash">
            <CheckCircle2 size={18} strokeWidth={1.75} className="text-go" /> Nothing above informational. This session met every rule the tool checks.
          </Panel>
        )}
        <div className="space-y-2.5">
          {[...real, ...info].map((f) => <FindingCard key={f.rule_id} f={f} />)}
        </div>
      </section>

      {/* ---- AI ---- */}
      {s.ml && (
        <section className="mb-10">
          <SectionTitle title="AI assessment" hint="Advisory only. The rules decide every verdict above; the model explains posture and flags the unusual." term="riskScore" />
          <Panel className="p-6">
            <div className="grid grid-cols-2 gap-6 border-b border-hair pb-5 sm:grid-cols-4">
              <div>
                <div className="text-[12px] text-smoke">Risk class</div>
                <div className="mt-1.5">
                  <Tag tone={s.ml.risk_class === 'critical' ? 'danger' : s.ml.risk_class === 'secure' ? 'safe' : 'warning'}>{s.ml.risk_class}</Tag>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[12px] text-smoke">Critical probability <Explain term="riskScore" /></div>
                <div className="mt-1 text-[20px] font-semibold text-bone tabular">{s.ml.risk_score}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[12px] text-smoke">Anomaly <Explain term="anomaly" /></div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[14px] text-bone">
                  {s.ml.anomaly ? <AlertTriangle size={15} className="text-heat" /> : <CheckCircle2 size={15} className="text-go" />}
                  {s.ml.anomaly ? 'Yes' : 'No'}
                </div>
              </div>
              {s.ml.model_version && (
                <div>
                  <div className="text-[12px] text-smoke">Model</div>
                  <div className="mt-1.5 font-code text-[12.5px] text-ash">{s.ml.model_version}</div>
                </div>
              )}
            </div>
            {s.ml.explanation && (
              <p className="mt-5 flex gap-2.5 text-[14px] leading-relaxed text-bone">
                <BrainCircuit size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-signal" /> {s.ml.explanation}
              </p>
            )}
            {(s.ml.shap || []).length > 0 && (
              <div className="mt-6">
                <div className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-bone">Why the model thinks so <Explain term="shap" /></div>
                <ShapBars contributions={s.ml.shap} />
              </div>
            )}
          </Panel>
        </section>
      )}

      {/* ---- raw evidence ---- */}
      {(s.command_transcript || []).length > 0 && (
        <section className="mb-10">
          <SectionTitle title="Packet evidence" hint="The reconstructed cleartext conversation, byte for byte." term="hex" />
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-hair px-5 py-3">
              <span className="flex items-center gap-2 text-[12.5px] text-ash">
                <Binary size={15} strokeWidth={1.75} className="text-signal" /> Offset · hex · ASCII
              </span>
              {s.capability_mangled && <Tag tone="danger">Tampered bytes highlighted</Tag>}
            </div>
            <pre className="m-0 max-h-[460px] overflow-auto p-5 font-code text-[12px] leading-relaxed text-ash">
              {s.command_transcript.flatMap((line, lineIdx) => {
                const str = String(line || '')
                const chunks = []
                for (let i = 0; i < str.length; i += 16) chunks.push({ chunk: str.substring(i, i + 16), lineIdx, offset: i })
                if (chunks.length === 0) chunks.push({ chunk: '', lineIdx, offset: 0 })
                return chunks
              }).map(({ chunk, lineIdx, offset }, idx) => {
                const hex = Array.from(chunk).map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
                const ascii = chunk.replace(/[\u0000-\u001F\u007F-\u009F]/g, '.')
                const hit = lineIdx === 2 && s.capability_mangled
                return (
                  <div key={idx} className={`flex gap-6 ${hit ? '-mx-5 border-y border-signal/30 bg-signal/10 px-5 text-signal' : 'hover:bg-carbon-3'}`}>
                    <span className="w-12 shrink-0 select-none text-smoke">{offset.toString(16).padStart(4, '0')}</span>
                    <span className="w-[410px] shrink-0 whitespace-pre">{hex.padEnd(47, ' ')}</span>
                    <span className={`flex-1 whitespace-pre ${hit ? '' : 'text-bone'}`}>{ascii}</span>
                  </div>
                )
              })}
            </pre>
          </Panel>
        </section>
      )}

      {(s.notes || []).length > 0 && (
        <Panel className="space-y-2 p-5 text-[13px] leading-relaxed text-smoke">
          {s.notes.map((n, i) => (
            <div key={i} className="flex items-start gap-2">
              <CircleAlert size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" /> <span>{n}</span>
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}

function FindingCard({ f }) {
  const frames = f.evidence?.frames?.length ? f.evidence.frames.join(', ') : f.frames
  return (
    <Panel className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Severity severity={f.severity} />
          <span className="font-code text-[11.5px] text-smoke">{f.rule_id}</span>
          {f.cap_grade && <Tag tone="warning">caps grade at {f.cap_grade}</Tag>}
        </div>
        <h3 className="mt-2 text-[15px] font-medium text-bone">{f.title}</h3>
        {f.detail && <p className="mt-1.5 text-[13.5px] leading-relaxed text-ash">{f.detail}</p>}
        {f.remediation && (
          <p className="mt-3 border-l-2 border-signal/60 pl-3 text-[13.5px] leading-relaxed text-bone">
            <span className="text-signal">Fix · </span>{f.remediation}
          </p>
        )}
      </div>
      <dl className="space-y-3 border-t border-hair pt-4 text-[12.5px] md:border-l md:border-t-0 md:pl-5 md:pt-0">
        <div>
          <dt className="text-smoke">Standard</dt>
          <dd className="mt-0.5 font-code text-bone">{f.standard}</dd>
        </div>
        {frames && (
          <div>
            <dt className="text-smoke">Evidence frames</dt>
            <dd className="mt-0.5 font-code text-bone">{frames}</dd>
          </div>
        )}
      </dl>
    </Panel>
  )
}

function fmt(n) {
  return n == null ? '–' : Math.round(n)
}

function revocationText(v) {
  if (v === 'good') return <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-go" /> Not revoked (stapled OCSP)</span>
  if (v === 'revoked') return <span className="inline-flex items-center gap-1.5 text-signal"><AlertTriangle size={14} /> Revoked (stapled OCSP)</span>
  return <span className="text-smoke">Not checked (offline mode)</span>
}
