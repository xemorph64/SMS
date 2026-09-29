import React from 'react'
import { Check, Lock, Search, Wrench, LifeBuoy, FileLock2, Microscope, FileText, Send, ClipboardCheck, ShieldCheck, GitMerge } from 'lucide-react'

/**
 * The dual-track workflow, drawn as the spec's diagram: two parallel columns
 * converging on the audit gate, then verified closure.
 *
 *   IR  : Investigate → Contain → Remediate → Recover ──┐
 *                                                        ├→ AWAITING AUDIT → VERIFIED CLOSED
 *   DF  : Lock Evidence → Analyze → Report → Submit ────┘
 *
 * Pass the two tracks' states and the parent incident status; the component
 * derives everything visual from that alone. Actions are rendered by the
 * parent — this component is the map, not the vehicle.
 */

const IR_STEPS = [
  { key: 'INVESTIGATING', label: 'Investigate',  icon: Search },
  { key: 'CONTAINED',     label: 'Contain',      icon: Lock },
  { key: 'REMEDIATED',    label: 'Remediate',    icon: Wrench },
  { key: 'RECOVERED',     label: 'Recover',      icon: LifeBuoy },
]

const DF_STEPS = [
  { key: 'EVIDENCE_LOCKED', label: 'Lock Evidence',  icon: FileLock2 },
  { key: 'ANALYZING',       label: 'Analyze',        icon: Microscope },
  { key: 'REPORT_GENERATED',label: 'Generate Report',icon: FileText },
  { key: 'REPORT_SUBMITTED',label: 'Submit Report',  icon: Send },
]

export default function DualTrackStepper({ irStatus, dfStatus, incidentStatus }) {
  const parentDone = incidentStatus === 'VERIFIED_CLOSED'
  const atGate = incidentStatus === 'AWAITING_AUDIT'

  const renderTrack = (title, steps, current, accent) => (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-3">{title}</p>
      <div className="space-y-0">
        {steps.map((step, i) => {
          const idx = steps.findIndex(s => s.key === current)
          const done = idx >= 0 && i < idx
          const active = step.key === current
          const Icon = step.icon
          return (
            <div key={step.key} className="flex gap-3 items-stretch">
              {/* rail */}
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${
                  done ? 'bg-ok/10 border-ok/40 text-ok'
                  : active ? `border-accent text-accent bg-accent/10 ${accent ? '' : ''}`
                  : 'border-line text-ink-3'
                }`}>
                  {done ? <Check size={13} /> : <Icon size={13} className={active ? '' : 'opacity-50'} />}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[18px] ${done ? 'bg-ok/40' : 'bg-line'}`} />
                )}
              </div>
              {/* label */}
              <div className={`pb-4 text-[13px] leading-none pt-1.5 ${
                active ? 'text-ink font-semibold' : done ? 'text-ink-2' : 'text-ink-3'
              }`}>
                {step.label}
                {active && <span className="block text-[10px] font-mono text-accent mt-1">CURRENT</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="bg-surface border border-line rounded-xl p-5">
      <div className="flex gap-6">
        {renderTrack('Incident Response Progress', IR_STEPS, irStatus)}
        {renderTrack('Forensics Progress', DF_STEPS, dfStatus, true)}
      </div>

      {/* convergence into the audit gate */}
      <div className="mt-2 pt-4 border-t border-line flex items-center gap-3 flex-wrap">
        <GitMerge size={16} className="text-ink-3 shrink-0" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
          atGate || parentDone
            ? atGate ? 'bg-accent/10 text-accent border-accent/30 animate-pulse-soft' : 'bg-ok/10 text-ok border-ok/30'
            : 'bg-surface-2 text-ink-3 border-line'
        }`}>
          <ClipboardCheck size={13} />
          AWAITING AUDIT
          {atGate && <span className="font-mono text-[10px]">← both tracks converge here</span>}
        </div>
        <span className="text-ink-3 text-xs">→</span>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
          parentDone ? 'bg-ok text-surface border-ok' : 'bg-surface-2 text-ink-3 border-line'
        }`}>
          <ShieldCheck size={13} />
          VERIFIED CLOSED
        </div>
        {!atGate && !parentDone && (
          <span className="text-[11px] text-ink-3 font-mono ml-auto">
            gate opens when both tracks finish
          </span>
        )}
      </div>
    </div>
  )
}
