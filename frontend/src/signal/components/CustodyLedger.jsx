import React from 'react'
import { Explain } from '../ui'

/** Chain-of-custody entries as an append-only timeline (ISO/IEC 27037). */
export default function CustodyLedger({ entries = [], empty = 'No custody entries yet.' }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-medium text-ash">
        Chain of custody <Explain term="custody" />
        {entries.length > 0 && <span className="ml-1 text-smoke">· {entries.length}</span>}
      </div>
      {entries.length === 0 ? (
        <p className="text-[13px] text-smoke">{empty}</p>
      ) : (
        <ol className="relative max-h-56 space-y-0 overflow-y-auto pr-1">
          {entries.map((e, i) => (
            <li key={i} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
              <span className="relative flex justify-center" aria-hidden>
                <span className="mt-1.5 h-2 w-2 rounded-full border border-signal bg-carbon" />
                {i < entries.length - 1 && <span className="absolute top-4 bottom-[-6px] w-px bg-hair" />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-code text-[12px] text-bone">{e.action}</span>
                  <span className="font-code text-[11.5px] text-smoke">{new Date(e.performedAt).toLocaleString()}</span>
                </div>
                <div className="text-[12px] text-smoke">by {e.performedBy}{e.notes ? ` · ${e.notes}` : ''}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
