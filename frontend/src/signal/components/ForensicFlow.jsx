import React, { useEffect, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { gradeColor } from '../ui'

/*
 * ForensicFlow — the analysis-run canvas.
 *
 * The narrative it draws is the pipeline the engine actually runs:
 *
 *     PCAP capture → TCP stream reassembly → protocol / TLS / rule / ML
 *     inspection → evidence.
 *
 * It is driven only by the job record (/api/captures/{id}); see
 * CaptureController.detail and AnalysisService for the contract. While a run
 * is in progress that record carries stage-level state plus the file's name,
 * hash and size — no packet counts, stream identities or findings. Those
 * appear in the response only once the engine finishes, which is exactly when
 * the canvas resolves into its summary readout. Wherever state is still
 * unknown, the canvas shows deliberate indeterminate motion instead of
 * invented numbers: nothing animates a packet that was never reported.
 */

// Stage tokens in engine order, as parsed from SMS_PROGRESS by EngineClient.
const STAGES = [
  'QUEUED', 'STARTING', 'READING', 'REASSEMBLING', 'TLS_AND_CERTIFICATES',
  'RULES_AND_COVERAGE', 'ML_ASSESSMENT', 'AGGREGATING', 'HISTORY_COMPARISON', 'COMPLETED',
]

const PHRASE = {
  QUEUED: 'queued — waiting for a worker',
  STARTING: 'starting the engine',
  READING: 'reading packet headers',
  REASSEMBLING: 'reassembling TCP streams',
  TLS_AND_CERTIFICATES: 'parsing TLS handshakes and certificates',
  RULES_AND_COVERAGE: 'evaluating NIST / RFC rules',
  ML_ASSESSMENT: 'scoring anomaly risk',
  AGGREGATING: 'grading sessions and servers',
  HISTORY_COMPARISON: 'comparing against history',
  COMPLETED: 'analysis complete',
  FAILED: 'run failed',
  INTERRUPTED: 'service restarted mid-run',
  CANCELLED: 'run cancelled',
}

// Restrained identity per mail protocol: a small tick in a different palette
// tone. Anything unclassified stays neutral.
const PROTO_TICK = { SMTP: 'bg-ice', IMAP: 'bg-go', POP3: 'bg-mid' }

const SEV_DOT = { critical: 'bg-signal', high: 'bg-heat', medium: 'bg-mid', low: 'bg-ash' }
const SEV_TEXT = { critical: 'text-signal', high: 'text-heat', medium: 'text-mid', low: 'text-ash' }

const CHECKPOINTS = [
  { stage: 'TLS_AND_CERTIFICATES', title: 'TLS handshake', note: 'records + certificate chain' },
  { stage: 'TLS_AND_CERTIFICATES', title: 'STARTTLS', note: 'upgrade & downgrade evidence' },
  { stage: 'TLS_AND_CERTIFICATES', title: 'Protocol check', note: 'SMTP · IMAP · POP3' },
  { stage: 'RULES_AND_COVERAGE', title: 'NIST / RFC rules', note: 'deterministic checks' },
  { stage: 'ML_ASSESSMENT', title: 'ML anomaly', note: 'model-assessed risk' },
  { stage: 'AGGREGATING', title: 'Grade roll-up', note: 'servers & sessions' },
  { stage: 'HISTORY_COMPARISON', title: 'History diff', note: 'against past runs' },
]

// Fixed wireframe interleavings for the placeholder lanes, so the reassembly
// column reads as distinct conversations taking shape rather than one row
// repeated three times. Deliberately not tied to any real stream.
const GHOST_LANES = [
  [[2, 17], [21, 11], [34, 13], [49, 8], [58, 15], [75, 9], [85, 12]],
  [[2, 13], [17, 15], [34, 10], [46, 17], [65, 10], [76, 11], [88, 9]],
  [[2, 19], [23, 9], [33, 15], [50, 11], [62, 12], [75, 10], [86, 11]],
]

const PKTS = 34

// ------------------------------------------------------------------ helpers

const fmtBytes = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

const fmtCount = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : null)

const shortHash = (h, head = 10, tail = 6) =>
  h ? `${String(h).slice(0, head)}…${String(h).slice(-tail)}` : null

const asMs = (t) => {
  if (t == null) return null
  if (typeof t === 'number') return t
  const ms = Date.parse(t)
  return Number.isFinite(ms) ? ms : null
}

const clock = (ms) => {
  if (ms == null || ms < 0) return null
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const shortStamp = (t) => {
  const ms = asMs(t)
  if (ms == null) return null
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const tlsWord = (m) => String(m || '').toLowerCase().replaceAll('_', ' ')

/*
 * The detail endpoint serves real session data once (and only once) the
 * engine report exists. Normalise it into one lane shape; findings detail
 * comes from the raw engine document that travelled with the same response.
 */
function lanesFrom(job) {
  const rows = job?.sessions || []
  const raw = job?.report?.sessions || []
  const byStream = new Map(raw.map((s) => [s.tcp_stream, s]))
  return rows.slice(0, 4).map((s) => {
    const f = byStream.get(s.stream)?.findings || s.findings || []
    const findings = f.map((x) => ({
      ruleId: x.ruleId ?? x.rule_id,
      severity: String(x.severity || 'info').toLowerCase(),
      frame: (Array.isArray(x?.evidence?.frames) && x.evidence.frames.length ? x.evidence.frames : [null])[0],
    }))
    return {
      stream: s.stream ?? s.tcp_stream,
      firstFrame: s.firstFrame,
      lastFrame: s.lastFrame,
      protocol: s.protocol || null,
      tlsMode: s.tlsMode || s.tls_mode || null,
      tlsVersion: s.tlsVersion || null,
      cipher: s.cipherSuite || null,
      grade: typeof s.grade === 'string' ? s.grade : s.grade?.letter,
      server: s.server || null,
      client: s.client || null,
      findings,
      findingCount: typeof s.findingCount === 'number' ? s.findingCount : findings.length,
    }
  })
}

// tiny wireframe file glyph (folded corner + packet rows)
function FileGlyph() {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true" className="shrink-0">
      <path d="M2 1.5h11.5L19.5 8v16.5H2z" fill="rgb(var(--s-carbon-2))" stroke="rgb(var(--s-hair-2))" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M13.5 1.5V8h6" fill="none" stroke="rgb(var(--s-hair-2))" strokeWidth="1.4" strokeLinejoin="round" />
      <g stroke="rgb(var(--s-ice))" strokeWidth="1.6" opacity="0.75" strokeLinecap="round">
        <path d="M5 12h9" /> <path d="M5 15.5h12" /> <path d="M5 19h6.5" />
      </g>
    </svg>
  )
}

/* ──────────────────────────────── gutters ───────────────────────────────── */

function Gutter({ flowing }) {
  return (
    <div className="relative hidden lg:block" aria-hidden="true">
      <span className="absolute inset-y-4 left-1/2 w-px bg-hair" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-carbon-2/90">
        <ChevronRight size={15} strokeWidth={2.25} className={flowing ? 'text-ice' : 'text-hair-2'} />
      </span>
    </div>
  )
}

/* ─────────────────────────────── A. capture source ──────────────────────── */

function PacketStrip({ state }) {
  // 'idle' | 'reading' | 'read' | 'halted'
  const reading = state === 'reading'
  const read = state === 'read'
  return (
    <div aria-hidden="true" className="relative">
      <div className="flex h-[24px] gap-[2px] overflow-hidden">
        {Array.from({ length: PKTS }, (_, i) => (
          <span
            key={i}
            className={`min-w-0 flex-1 rounded-[1.5px] border ${
              reading
                ? 'ff-illum border-ice/40 bg-ice/40'
                : read
                  ? 'border-ice/30 bg-ice/35'
                  : 'border-hair/60 bg-hair-2/20'
            }`}
            style={reading ? { animationDelay: `${(i * 0.113).toFixed(3)}s` } : undefined}
          />
        ))}
      </div>
      {reading && <span className="ff-scan absolute inset-y-0 left-0 w-[16%] bg-bone/10" />}
    </div>
  )
}

function CaptureSource({ job, stripState, readWord }) {
  const name = job?.filename || null
  const hash = job?.sha256
  const size = fmtBytes(job?.sizeBytes)
  const ext = name ? (name.match(/\.pcap(?:ng)?\.gz$|\.pcap(?:ng)?$|\.cap$/i)?.[0] || '').replace(/^\./, '').toUpperCase() : null
  const packets = fmtCount(job?.packetCount)
  const captured = shortStamp(job?.capturedAt)

  return (
    <div className="min-w-0 px-4 py-4 lg:px-5">
      <div className="font-code text-[10.5px] font-medium uppercase tracking-[0.14em] text-smoke">Capture file</div>
      <div className="mt-2.5 flex items-start gap-2.5">
        <FileGlyph />
        <div className="min-w-0">
          <div className="break-all text-[13px] font-bold leading-snug text-bone">{name || '—'}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-code text-[11px] text-smoke">
            {ext && <span className="rounded-[3px] border border-hair-2 px-1 py-px text-[10.5px] text-ash">{ext}</span>}
            {size && <span>{size}</span>}
          </div>
        </div>
      </div>
      {hash && (
        <div className="mt-2.5 truncate font-code text-[11px] text-smoke" title={hash}>
          sha256·{shortHash(hash)}
        </div>
      )}

      <div className="mt-3.5 border-t border-hair/80 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="font-code text-[10.5px] font-medium uppercase tracking-[0.14em] text-smoke">packets</span>
        </div>
        <div className="mt-1">
          <span className={`font-bold leading-none tabular ${packets ? 'text-[22px] text-bone' : 'text-[18px] text-smoke'}`}>
            {packets || '···'}
          </span>
        </div>
        <div className="mt-2.5">
          <PacketStrip state={stripState} />
        </div>
        <div className="mt-2 flex items-baseline justify-between font-code text-[10.5px]">
          <span className={stripState === 'reading' ? 'text-ice' : 'text-smoke'}>{readWord}</span>
          {captured && <span className="text-smoke">cap {captured}</span>}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── B. TCP stream reconstruction ─────────────────── */

function LaneLabel({ done, stream, protocol }) {
  return (
    <div className="flex w-[84px] shrink-0 items-center gap-1.5 sm:w-[92px]">
      {done && (
        <span className={`h-2.5 w-[3px] shrink-0 rounded-full ${PROTO_TICK[protocol] || 'bg-hair-2'}`} aria-hidden="true" />
      )}
      <span className={`tabular font-code text-[11.5px] whitespace-nowrap ${done ? 'text-ash' : 'text-smoke'}`}>
        {done ? `stream ${String(stream).padStart(2, '0')}` : 'stream ··'}
      </span>
    </div>
  )
}

function LaneMeta({ children }) {
  return (
    <div className="pointer-events-none invisible absolute left-2 top-[calc(100%+4px)] z-40 w-[min(400px,92%)] rounded-md border border-hair-2 bg-carbon-2/95 px-3 py-2 text-left font-code text-[11px] leading-relaxed text-ash opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
      {children}
    </div>
  )
}

function GhostLane({ i, assembling, empty }) {
  return (
    <div className="group relative flex items-center gap-3 py-[7px] first:pt-1">
      <LaneLabel />
      <div className="relative h-[20px] min-w-0 flex-1 overflow-hidden rounded-[3px] border border-hair/80 bg-carbon-3/40">
        {!empty && (
          GHOST_LANES[i].map(([l, w], j) => (
            <span
              key={j}
              className={`absolute inset-y-[3px] rounded-[2px] border border-hair-2/40 ${
                assembling ? 'ff-assemble bg-ash/40' : 'bg-ash/25'
              }`}
              style={{
                left: `${l}%`,
                width: `${w}%`,
                ...(assembling ? { animationDelay: `${(i * 0.23 + j * 0.15).toFixed(2)}s` } : {}),
              }}
            />
          ))
        )}
        {assembling && <span className="ff-scan absolute inset-y-0 left-0 w-[14%] bg-bone/5" aria-hidden="true" />}
      </div>
      <LaneMeta>
        {assembling
          ? 'indeterminate — the count and identity of conversations are reported only when reassembly completes.'
          : 'packets are grouped into reconstructed conversations as the engine works through the capture.'}
      </LaneMeta>
    </div>
  )
}

function RealLane({ row, pos }) {
  const left = pos(row.firstFrame)
  const right = pos(row.lastFrame)
  const width = Math.max(1.2, right - left)
  const cleartext = tlsWord(row.tlsMode) === 'cleartext'
  const flag = row.findings[0]
  const flagPos = flag && flag.frame != null ? pos(flag.frame) : null
  return (
    <div className="group relative flex items-center gap-3 py-[7px] first:pt-1">
      <LaneLabel done stream={row.stream} protocol={row.protocol} />
      <div className="relative h-[20px] min-w-0 flex-1 rounded-[3px] border border-hair/80 bg-carbon-3/40">
        <span
          className={`absolute inset-y-[3px] rounded-[2px] border ${cleartext ? 'border-heat/50 bg-heat/40' : 'border-ice/40 bg-ice/30'}`}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        {flagPos != null && (
          <span
            className="absolute top-[-2px] h-[8px] w-[8px] -translate-x-1/2 rounded-full border border-hair bg-signal"
            style={{ left: `${flagPos}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <LaneMeta>
        <span className="grid grid-cols-[76px_1fr] gap-x-2">
          <span className="text-smoke">protocol</span>
          <span className="text-bone">{row.protocol || '—'}{row.tlsMode ? ` · ${tlsWord(row.tlsMode)}` : ''}</span>
          <span className="text-smoke">endpoints</span>
          <span className="break-all text-bone">{row.client || '?'} → {row.server || '?'}</span>
          {row.tlsVersion && <><span className="text-smoke">tls</span><span className="text-bone">{row.tlsVersion}{row.cipher ? ` · ${row.cipher}` : ''}</span></>}
          {row.grade && <><span className="text-smoke">grade</span><span style={{ color: gradeColor(row.grade) }} className="font-bold">{row.grade}</span></>}
          {cleartext && <><span className="text-smoke">note</span><span className="text-heat">cleartext conversation</span></>}
        </span>
        {row.findingCount > 0 && (
          <span className="mt-2 grid grid-cols-[76px_1fr] gap-x-2 gap-y-1 border-t border-hair pt-1.5">
            <span className="text-smoke">findings · {row.findingCount}</span>
            <span className="grid gap-1">
              {row.findings.slice(0, 3).map((f, j) => (
                <span key={j} className="flex min-w-0 items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEV_DOT[f.severity] || 'bg-ash'}`} />
                  <span className="truncate"><span className="text-bone">{f.ruleId || '—'}</span> <span className={`font-semibold ${SEV_TEXT[f.severity] || ''}`}>{f.severity}</span></span>
                </span>
              ))}
              {row.findingCount > 3 && <span className="text-smoke">+{row.findingCount - 3} more — session report</span>}
            </span>
          </span>
        )}
      </LaneMeta>
    </div>
  )
}

const RealAxis = ({ rows, children }) => {
  const fMin = Math.min(...rows.map((r) => r.firstFrame ?? 0))
  const fMax = Math.max(...rows.map((r) => r.lastFrame ?? 0))
  const span = Math.max(1, fMax - fMin)
  const pos = (f) => (f == null ? 3 : 3 + ((f - fMin) / span) * 88)
  return (
    <>
      {children(pos)}
      <div className="flex items-baseline justify-between pt-0.5 font-code text-[10px] tabular text-smoke">
        <span>frame {fmtCount(fMin)}</span>
        <span>frame {fmtCount(fMax)}</span>
      </div>
    </>
  )
}

function StreamLanes({ job, done, stageIdx, terminal, counts }) {
  const cur = STAGES[Math.max(0, Math.min(stageIdx, STAGES.length - 1))]
  const before = (t) => stageIdx >= 0 && stageIdx > STAGES.indexOf(t)
  const queued = !done && !before('REASSEMBLING') && cur !== 'REASSEMBLING'   // through READING
  const assembling = !done && cur === 'REASSEMBLING'
  const rows = done ? lanesFrom(job) : []
  const have = rows.length > 0
  const total = typeof counts?.sessions === 'number' ? counts.sessions : rows.length

  return (
    <div className="flex min-w-0 flex-col px-4 py-4 lg:px-5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-code text-[10.5px] font-medium uppercase tracking-[0.14em] text-smoke">TCP reassembly</span>
        <span className={`font-code text-[10.5px] uppercase tracking-[0.08em] ${terminal ? 'text-signal' : done ? 'text-go' : assembling ? 'text-ice' : 'text-smoke'}`}>
          {terminal ? 'halted' : done ? (have ? `${total} stream${total === 1 ? '' : 's'}` : 'none found') : assembling ? 'reassembling···' : queued ? 'pending' : 'assembled'}
        </span>
      </div>

      <div className="mt-1.5 flex-1">
        {done && !have && (
          <div className="flex h-full min-h-[92px] items-center justify-center rounded-md border border-dashed border-hair px-4 text-center text-[12.5px] text-smoke">
            No mail-protocol conversations were reconstructed from this capture.
          </div>
        )}
        {done && have && (
          <RealAxis rows={rows}>
            {(pos) => rows.map((r) => <RealLane key={r.stream} row={r} pos={pos} />)}
          </RealAxis>
        )}
        {!done && GHOST_LANES.map((_, i) => (
          <GhostLane key={i} i={i} assembling={assembling} empty={queued} />
        ))}
        {done && have && total > rows.length && (
          <div className="pt-1.5 font-code text-[10.5px] text-smoke">
            + {total - rows.length} more stream{total - rows.length === 1 ? '' : 's'} — full detail in the session report
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────── C. inspection rail ──────────────────────── */

function Inspection({ stageIdx, done, terminal, flags }) {
  const reached = (t) => done || (stageIdx >= 0 && stageIdx > STAGES.indexOf(t))
  const active = (t) => !done && stageIdx >= 0 && STAGES[Math.min(stageIdx, STAGES.length - 1)] === t

  return (
    <div className="min-w-0 px-4 py-4 lg:px-5">
      <div className="font-code text-[10.5px] font-medium uppercase tracking-[0.14em] text-smoke">Inspection</div>
      <ul className="mt-2.5 space-y-[9px]">
        {CHECKPOINTS.map((cp, i) => {
          const node = active(cp.stage) ? 'active' : reached(cp.stage) ? 'done' : 'queued'
          const offset = CHECKPOINTS.slice(0, i).filter((c) => c.stage === cp.stage).length
          const word = node === 'active' ? 'running' : node === 'done' ? 'done' : 'queued'
          return (
            <li key={i} className="flex items-center gap-2.5" title={cp.note}>
              <span
                aria-hidden="true"
                className={`h-[9px] w-[9px] shrink-0 rounded-[2px] border ${
                  node === 'active'
                    ? 'ff-node border-ice bg-ice/70'
                    : node === 'done'
                      ? 'border-ice/50 bg-ice/25'
                      : 'border-hair-2 bg-carbon-3'
                }`}
                style={node === 'active' ? { animationDelay: `${(offset * 0.3).toFixed(2)}s` } : undefined}
              />
              <span className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${node === 'queued' ? 'text-smoke' : 'text-bone'}`}>
                {cp.title}
              </span>
              <span className={`hidden shrink-0 font-code text-[10px] xl:block ${node === 'active' ? 'text-ice' : 'text-smoke'}`}>
                {word}
              </span>
            </li>
          )
        })}
      </ul>

      {done && flags?.stlsDowngrade && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-signal/40 bg-signal/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-signal" title="STARTTLS downgrade behaviour — see findings">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" aria-hidden="true" /> STARTTLS downgrade evidence
        </div>
      )}
      {done && flags?.cleartext && !flags?.stlsDowngrade && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-heat/40 bg-heat/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-heat" title="cleartext credential exposure observed — see findings">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-heat" aria-hidden="true" /> cleartext credentials exposed
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────── D. evidence output ──────────────────────── */

function Evidence({ job, done, terminal }) {
  const counts = job?.counts
  const sev = done && counts
    ? [['critical', counts.critical], ['high', counts.high], ['medium', counts.medium], ['low', counts.low]]
    : []
  const anyFinding = sev.some(([, n]) => typeof n === 'number' && n > 0)
  const grade = done ? (job?.overallGrade || '–') : null
  const packets = fmtCount(job?.packetCount)
  const sessions = fmtCount(counts?.sessions)

  return (
    <div className="flex min-w-0 flex-col px-4 py-4 lg:border-l lg:border-hair lg:px-5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-code text-[10.5px] font-medium uppercase tracking-[0.14em] text-smoke">Evidence</span>
        {done && typeof job?.id === 'number' && (
          <span className="font-code text-[10.5px] text-smoke">run #{job.id}</span>
        )}
      </div>

      {done ? (
        <>
          <div className="mt-2.5 flex items-start gap-2.5">
            <span
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-md border px-2 text-[20px] font-bold leading-none"
              style={{
                color: gradeColor(grade),
                borderColor: `color-mix(in srgb, ${gradeColor(grade)} 45%, transparent)`,
                background: `color-mix(in srgb, ${gradeColor(grade)} 10%, rgb(var(--s-carbon-2)))`,
              }}
              title={grade ? `Grade ${grade}` : undefined}
            >
              {grade}
            </span>
            <div className="min-w-0 space-y-1 pt-0.5">
              <div className="font-code text-[11px] text-smoke">overall grade</div>
              <div className="font-code text-[11.5px] leading-snug text-ash">
                {sessions != null && <>{sessions} stream{counts?.sessions === 1 ? '' : 's'}</>}
                {packets != null && <>{sessions != null && ' · '}{packets} pkts</>}
              </div>
              {job?.analysedAt && (
                <div className="font-code text-[10.5px] text-smoke">stored {shortStamp(job.analysedAt)}</div>
              )}
            </div>
          </div>

          <div className="mt-3 border-t border-hair/80 pt-2.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {sev.map(([key, n]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${(typeof n === 'number' && n > 0) ? SEV_DOT[key] : 'bg-hair-2'}`} aria-hidden="true" />
                  <span className="font-code text-[11px] text-smoke">{key.slice(0, 4)}</span>
                  <span className={`ml-auto font-code text-[12px] font-bold tabular ${(typeof n === 'number' && n > 0) ? SEV_TEXT[key] : 'text-smoke'}`}>
                    {typeof n === 'number' ? n : '–'}
                  </span>
                </div>
              ))}
            </div>
            {!anyFinding && (
              <div className="mt-2.5 rounded-md border border-go/40 bg-go/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-go" title="rules and the model found no findings">
                no findings (rules + model)
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 space-y-2.5">
            {['grade', 'findings', 'sessions'].map((k) => (
              <div key={k} className="flex items-baseline justify-between font-code text-[11px]">
                <span className="text-smoke">{k}</span>
                <span className="text-smoke">—</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-smoke">
            {terminal ? 'the run stopped before an engine verdict existed' : 'the engine returns its verdict once every stream is inspected'}
          </p>
        </>
      )}
    </div>
  )
}

/* ────────────────────────────────── the canvas ──────────────────────────── */

export default function ForensicFlow({ job }) {
  const status = job?.status || 'PENDING'
  const stage = job?.stage
  const done = status === 'COMPLETED'
  const terminal = status === 'FAILED' || status === 'CANCELLED' || stage === 'INTERRUPTED' || status === 'INTERRUPTED'
  const stageIdx = STAGES.indexOf(stage)

  // Elapsed wall-clock of the engine run — real data, from jobs.claim().
  const [now, setNow] = useState(null)
  useEffect(() => {
    if (status !== 'RUNNING') { setNow(null); return undefined }
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [status])
  const started = asMs(job?.startedAt)
  const elapsed = now != null && started != null ? clock(now - started) : null

  const passed = (t) => done || (stageIdx >= 0 && stageIdx > STAGES.indexOf(t))
  const reading = !done && !terminal && stage === 'READING'
  const stripState = terminal ? 'halted' : done || passed('READING') ? 'read' : reading ? 'reading' : 'idle'
  const readWord = terminal ? 'read halted' : done || passed('READING') ? 'read' : reading ? 'reading···' : 'idle'

  const word = terminal
    ? (PHRASE[stage === 'INTERRUPTED' ? 'INTERRUPTED' : status] || 'stopped')
    : done ? PHRASE.COMPLETED
      : PHRASE[stage] || 'pending'

  const flags = done ? summarizeFlags(job) : null

  return (
    <div
      className={terminal ? 'ff-freeze' : ''}
      aria-label={`PCAP ${done ? 'analysis summary' : 'analysis progress'}: ${word}`}
    >
      {/* status strip */}
      <div className="flex items-center gap-2.5 border-b border-hair px-4 py-2.5 sm:px-5" role="status">
        {terminal ? (
          <span className="h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
        ) : done ? (
          <span className="h-2 w-2 rounded-full bg-go" aria-hidden="true" />
        ) : (
          <Loader2 size={14} strokeWidth={2} className="animate-spin text-ice" aria-hidden="true" />
        )}
        <span className={`text-[13px] font-semibold capitalize ${terminal ? 'text-signal' : 'text-ash'}`}>
          {word}
        </span>
        {elapsed && <span className="font-code text-[11px] tabular text-smoke">T+{elapsed}</span>}
        <span className="ml-auto hidden font-code text-[10.5px] uppercase tracking-[0.14em] text-smoke sm:block">
          offline pcap · forensic reconstruction
        </span>
      </div>

      {/* forensic canvas: capture → lanes → inspection → evidence */}
      <div className="grid grid-cols-1 lg:h-[252px] lg:grid-cols-[minmax(188px,212px)_24px_minmax(0,1fr)_24px_minmax(228px,252px)_24px_minmax(196px,216px)]">
        <CaptureSource job={job} stripState={stripState} readWord={readWord} />
        <Gutter flowing={!terminal && stripState !== 'idle'} />
        <div className="min-w-0 lg:border-x lg:border-hair">
          <StreamLanes job={job} done={done} stageIdx={stageIdx} terminal={terminal} counts={job?.counts} />
        </div>
        <Gutter flowing={!terminal && passed('REASSEMBLING')} />
        <div className="min-w-0 lg:border-x lg:border-hair">
          <Inspection stageIdx={stageIdx} done={done} terminal={terminal} flags={flags} />
        </div>
        <Gutter flowing={!terminal && passed('RULES_AND_COVERAGE')} />
        <Evidence job={job} done={done} terminal={terminal} />
      </div>
    </div>
  )
}

/* Only flags the engine itself asserts in its report — nothing client-side. */
function summarizeFlags(job) {
  const sessions = job?.report?.sessions || []
  return {
    stlsDowngrade: sessions.some((s) => s.capability_mangled),
    cleartext: sessions.some((s) => s.cleartext_auth),
  }
}
