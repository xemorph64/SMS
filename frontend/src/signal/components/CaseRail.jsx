import React from 'react'
import { Explain } from '../ui'

/*
 * The mission line: the whole operating model in one strip.
 *   SOC detects -> IR and Forensics run in parallel -> Auditor verifies.
 * The signed-in role's seat is lit in signal colour with a live marker.
 */

const SEATS = {
  soc: ['01', 'SOC', 'Detect'],
  ir: ['02', 'IR', 'Contain'],
  forensics: ['02', 'DF', 'Preserve'],
  audit: ['03', 'Audit', 'Verify'],
}

function Seat({ id, mine }) {
  const [n, label, verb] = SEATS[id]
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap px-2 font-code text-[11px] uppercase tracking-[0.1em] ${
        mine ? 'bg-signal text-carbon' : 'text-smoke'
      }`}
      aria-current={mine ? 'step' : undefined}
      title={mine ? 'Your seat in the workflow' : undefined}
    >
      <span className={mine ? 'opacity-70' : 'text-hair-2'}>{n}</span>
      <span className="font-medium">{label}</span>
      <span className={`hidden md:inline ${mine ? '' : 'text-hair-2'}`}>{verb}</span>
    </span>
  )
}

const Wire = () => <span aria-hidden className="h-px w-3 shrink-0 bg-hair-2 sm:w-6" />

export default function CaseRail({ seat }) {
  const all = seat === 'admin'
  return (
    <div className="flex min-w-0 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Incident workflow">
      <Seat id="soc" mine={all || seat === 'soc'} />
      <Wire />
      <span className="inline-flex items-center border border-dashed border-hair-2">
        <Seat id="ir" mine={all || seat === 'ir'} />
        <span className="px-1 font-code text-[11px] text-smoke" title="Run in parallel">∥</span>
        <Seat id="forensics" mine={all || seat === 'forensics'} />
      </span>
      <Wire />
      <Seat id="audit" mine={all || seat === 'audit'} />
      <Explain term="dualGate" className="ml-2" />
    </div>
  )
}
