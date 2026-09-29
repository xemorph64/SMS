import React from 'react'
import { Check, Search, Lock, Wrench, LifeBuoy, FileLock2, Microscope, FileText, Send, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { Explain } from '../ui'

/*
 * The dual-track map: two lanes that run in parallel and converge on the
 * audit gate.
 *
 *   IR : Investigate -> Contain -> Remediate -> Recover ----\
 *                                                            > Audit gate -> Closed
 *   DF : Lock evidence -> Analyse -> Report -> Submit ------/
 *
 * Step keys are the backend's; this component only draws them.
 */

export const IR_STEPS = [
  { key: 'INVESTIGATING', label: 'Investigate', icon: Search },
  { key: 'CONTAINED', label: 'Contain', icon: Lock },
  { key: 'REMEDIATED', label: 'Remediate', icon: Wrench },
  { key: 'RECOVERED', label: 'Recover', icon: LifeBuoy },
]

export const DF_STEPS = [
  { key: 'EVIDENCE_LOCKED', label: 'Lock evidence', icon: FileLock2 },
  { key: 'ANALYZING', label: 'Analyse', icon: Microscope },
  { key: 'REPORT_GENERATED', label: 'Write report', icon: FileText },
  { key: 'REPORT_SUBMITTED', label: 'Submit', icon: Send },
]

/** How many steps of a lane are finished (current step counts as in progress). */
export function laneProgress(steps, current, parent) {
  if (parent === 'AWAITING_AUDIT' || parent === 'VERIFIED_CLOSED') return steps.length
  const idx = steps.findIndex((s) => s.key === current)
  return idx < 0 ? 0 : idx
}

function Lane({ title, term, steps, current, parent }) {
  const idx = steps.findIndex((s) => s.key === current)
  const allDone = parent === 'AWAITING_AUDIT' || parent === 'VERIFIED_CLOSED'
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-medium text-ash">
        {title} <Explain term={term} />
      </div>
      <ol className="grid grid-cols-4 gap-1.5">
        {steps.map((s, i) => {
          const done = allDone || (idx >= 0 && i < idx) || (idx === steps.length - 1 && i === idx && current === steps[steps.length - 1].key)
          const active = !done && s.key === current
          const Icon = s.icon
          return (
            <li key={s.key} className="min-w-0">
              <div
                className={`mb-2 h-1 rounded-full ${done ? 'bg-ice' : active ? 'bg-signal' : 'bg-hair'}`}
                aria-hidden
              />
              <div className={`flex items-center gap-1.5 text-[12px] ${active ? 'text-bone' : done ? 'text-ash' : 'text-smoke'}`}>
                {done ? (
                  <Check size={13} strokeWidth={2.25} className="shrink-0 text-ice" />
                ) : (
                  <Icon size={13} strokeWidth={1.75} className={`shrink-0 ${active ? 'text-signal' : ''}`} />
                )}
                <span className={`truncate ${active ? 'font-medium' : ''}`}>{s.label}</span>
              </div>
              {active && <div className="mt-0.5 pl-[19px] text-[11px] text-signal">Now</div>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function DualTrack({ irStatus, dfStatus, incidentStatus }) {
  const closed = incidentStatus === 'VERIFIED_CLOSED'
  const atGate = incidentStatus === 'AWAITING_AUDIT'
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-center">
      <div className="space-y-5">
        <Lane title="Incident Response" term="irTrack" steps={IR_STEPS} current={irStatus} parent={incidentStatus} />
        <Lane title="Digital Forensics" term="dfTrack" steps={DF_STEPS} current={dfStatus} parent={incidentStatus} />
      </div>

      <div className="flex items-stretch gap-3 lg:flex-col">
        <div
          className={`flex flex-1 items-center gap-2.5 border px-3 py-2.5 ${
            atGate ? 'border-signal/50 bg-signal/10' : closed ? 'border-ice/40 bg-ice/10' : 'border-dashed border-hair-2'
          }`}
        >
          <ClipboardCheck size={16} strokeWidth={1.75} className={atGate ? 'text-signal' : closed ? 'text-ice' : 'text-smoke'} />
          <div className="leading-tight">
            <div className={`text-[12.5px] font-medium ${atGate || closed ? 'text-bone' : 'text-smoke'}`}>Audit gate</div>
            <div className="text-[11px] text-smoke">{atGate ? 'Both tracks done' : closed ? 'Passed' : 'Opens when both finish'}</div>
          </div>
        </div>
        <div
          className={`flex flex-1 items-center gap-2.5 border px-3 py-2.5 ${
            closed ? 'border-go/40 bg-go/10' : 'border-dashed border-hair-2'
          }`}
        >
          <ShieldCheck size={16} strokeWidth={1.75} className={closed ? 'text-go' : 'text-smoke'} />
          <div className="leading-tight">
            <div className={`text-[12.5px] font-medium ${closed ? 'text-bone' : 'text-smoke'}`}>Verified closed</div>
            <div className="text-[11px] text-smoke">{closed ? 'Incident complete' : 'Auditor decides'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
