import React from 'react'
import { Check, X, Minus } from 'lucide-react'
import { motion } from 'framer-motion'
import { Explain } from '../ui'

/*
 * The STARTTLS state machine for one session, derived from what the engine
 * actually observed (tls_mode, starttls_offered/requested/accepted,
 * capability_mangled, tls_version). Maps to the six exclusive states the
 * engine reasons about.
 */

const STATES = {
  IMPLICIT_TLS: { label: 'Implicit TLS', tone: 'safe', text: 'Encrypted from the very first byte (ports 465, 993, 995).' },
  UPGRADED_SUCCESS: { label: 'Upgraded successfully', tone: 'safe', text: 'The server offered STARTTLS, the client asked, and encryption began.' },
  NEVER_OFFERED: { label: 'Never offered', tone: 'warning', text: 'The server never advertised STARTTLS, so the session stayed readable.' },
  OFFERED_NOT_USED: { label: 'Offered, not used', tone: 'warning', text: 'Encryption was available but the client ignored it.' },
  UPGRADED_FAILED: { label: 'Upgrade failed', tone: 'danger', text: 'STARTTLS was requested but no TLS handshake followed.' },
  STRIPPED_SUSPICIOUS: { label: 'Stripped', tone: 'danger', text: 'The STARTTLS offer was tampered with in transit. A downgrade attack signature.' },
  UNKNOWN: { label: 'Not determinable', tone: 'muted', text: 'The capture does not show enough of the conversation to decide.' },
}

export function startTlsState(s) {
  if (s.tls_mode === 'implicit') return 'IMPLICIT_TLS'
  if (s.capability_mangled) return 'STRIPPED_SUSPICIOUS'
  if (s.starttls_accepted && s.tls_version) return 'UPGRADED_SUCCESS'
  if (s.starttls_requested && !s.tls_version) return 'UPGRADED_FAILED'
  if (s.starttls_offered && !s.starttls_requested) return 'OFFERED_NOT_USED'
  if (s.starttls_offered === false || (s.tls_mode === 'cleartext' && !s.starttls_offered)) return 'NEVER_OFFERED'
  if (s.tls_version) return 'UPGRADED_SUCCESS'
  return 'UNKNOWN'
}

function steps(s) {
  const tls = !!s.tls_version
  if (s.tls_mode === 'implicit') {
    return [
      ['TCP connect', 'ok'],
      ['TLS handshake', tls ? 'ok' : 'bad'],
      ['Encrypted mail', tls ? 'ok' : 'skip'],
    ]
  }
  return [
    ['TCP connect', 'ok'],
    ['Server greeting', 'ok'],
    ['STARTTLS offered', s.capability_mangled ? 'bad' : s.starttls_offered ? 'ok' : 'bad'],
    ['Client asks to upgrade', s.starttls_requested ? 'ok' : s.starttls_offered ? 'bad' : 'skip'],
    ['TLS handshake', tls ? 'ok' : s.starttls_requested ? 'bad' : 'skip'],
    ['Encrypted mail', tls ? 'ok' : 'bad'],
  ]
}

const TONE = {
  safe: 'text-go border-go/40',
  warning: 'text-heat border-heat/40',
  danger: 'text-carbon border-signal bg-signal',
  muted: 'text-ash border-hair bg-carbon-4',
}

export default function StartTlsMachine({ session }) {
  const key = startTlsState(session)
  const st = STATES[key]
  const list = steps(session)
  const breakAt = list.findIndex(([, state]) => state !== 'ok')
  const reach = breakAt < 0 ? list.length - 1 : breakAt
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <span className="sg-display flex items-center gap-2 text-[15px] font-semibold text-bone">
          Encryption upgrade path <Explain term="starttls" />
        </span>
        <span className={`border px-2.5 py-1 font-code text-[11px] uppercase tracking-[0.12em] ${TONE[st.tone]}`}>{st.label}</span>
      </div>

      {/* the circuit: a trace that runs until the protocol broke */}
      <div className="relative overflow-x-auto pb-2">
        <div className="relative grid min-w-[640px]" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0,1fr))` }}>
          <span aria-hidden className="absolute left-[calc(50%/var(--n))] right-[calc(50%/var(--n))] top-[22px] h-px bg-hair-2" style={{ '--n': list.length }} />
          <motion.span
            aria-hidden
            className={`absolute left-[calc(50%/var(--n))] top-[21px] h-[3px] origin-left ${breakAt < 0 ? 'bg-ice' : 'bg-ice'}`}
            style={{ '--n': list.length, width: `calc(${(reach / list.length) * 100}%)` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.1, ease: [0.7, 0, 0.3, 1], delay: 0.2 }}
          />
          {list.map(([label, state], i) => (
            <motion.div
              key={label}
              className="relative flex flex-col items-center px-1 text-center"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.14 }}
            >
              <span
                className={`relative z-[1] flex h-11 w-11 items-center justify-center border ${
                  state === 'ok' ? 'border-ice bg-carbon text-ice' : state === 'bad' ? 'border-signal bg-signal text-carbon' : 'border-dashed border-hair-2 bg-carbon text-smoke'
                }`}
              >
                {state === 'ok' ? <Check size={17} strokeWidth={2} /> : state === 'bad' ? <X size={18} strokeWidth={2.25} /> : <Minus size={16} strokeWidth={2} />}
                {state === 'bad' && i === breakAt && <span className="absolute inset-0 animate-ping border border-signal" aria-hidden />}
              </span>
              <span className={`mt-3 font-code text-[10.5px] uppercase leading-snug tracking-[0.08em] ${state === 'bad' ? 'text-signal' : state === 'ok' ? 'text-bone' : 'text-smoke'}`}>
                {label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
      <p className="mt-5 max-w-[70ch] text-[14px] leading-relaxed text-ash">{st.text}</p>
    </div>
  )
}
