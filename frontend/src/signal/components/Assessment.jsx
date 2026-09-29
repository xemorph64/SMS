import React from 'react'
import { Explain, Panel, Tag } from '../ui'

/** Evidence coverage: how much could actually be checked (separate from the grade). */
export function Coverage({ coverage }) {
  if (!coverage) {
    return (
      <Panel className="p-5">
        <Title />
        <p className="text-[13px] text-smoke">Coverage was not recorded by this older analysis run.</p>
      </Panel>
    )
  }
  const assessed = coverage.assessed_checks ?? 0
  const applicable = coverage.applicable_checks ?? 0
  const pct = applicable ? Math.round((assessed / applicable) * 100) : 0
  return (
    <Panel className="p-5">
      <Title />
      <div className="flex items-end gap-3">
        <span className="text-[28px] font-semibold leading-none tracking-[-0.03em] text-bone tabular">{assessed}</span>
        <span className="pb-0.5 text-[13px] text-smoke">of {applicable} applicable checks assessed</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hair">
        <div className="h-full rounded-full bg-ice" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-smoke">
        {coverage.limited_sessions !== undefined && `${coverage.limited_sessions} session(s) have visibility limits. `}
        A good grade does not vouch for evidence that was not visible.
      </p>
      {coverage.checks && (
        <details className="group mt-4">
          <summary className="cursor-pointer text-[12.5px] text-signal hover:underline">Show each check</summary>
          <ul className="mt-3 space-y-2.5">
            {coverage.checks.map((c) => (
              <li key={c.check} className="text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium capitalize text-bone">{c.check.replaceAll('_', ' ')}</span>
                  <Tag tone={c.status === 'assessed' ? 'cipher' : 'muted'}>{c.status.replaceAll('_', ' ')}</Tag>
                </div>
                <p className="mt-0.5 text-smoke">{c.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  )
}

function Title() {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-[14px] font-medium text-bone">
      Evidence coverage <Explain term="coverage" />
    </div>
  )
}

/** Server-level changes against earlier captures in the same investigation. */
export function HistoryAssessment({ history }) {
  return (
    <Panel className="p-5">
      <div className="mb-1 flex items-center gap-1.5 text-[14px] font-medium text-bone">
        Changes since earlier captures <Explain term="baseline" />
      </div>
      <p className="mb-4 text-[12.5px] leading-relaxed text-smoke">
        Needs 8 prior sessions from 2 earlier captures in this investigation, same host and endpoint.
      </p>
      {!history?.servers?.length && <p className="text-[13px] text-smoke">No server baseline available for this run.</p>}
      <div className="space-y-3">
        {history?.servers?.map((s) => (
          <div key={s.identity} className=" border border-hair bg-carbon-3 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-code text-[12.5px] text-bone">{s.host}:{s.port}</span>
              <Tag>{s.status.replaceAll('_', ' ')}</Tag>
            </div>
            <p className="mt-1 text-[12px] text-smoke">
              {s.prior_sessions} prior sessions · {s.prior_captures} captures · {s.identity_confidence.replaceAll('_', ' ')}
            </p>
            {s.changes.map((c) => (
              <p key={c.field} className="mt-2 break-all text-[12.5px] text-ash">
                <span className="text-smoke">{c.field}:</span> {c.previous.join(', ')} <span className="text-signal">→</span> {c.new.join(', ')}
              </p>
            ))}
            {s.anomalies?.some((a) => a.unusual) && (
              <p className="mt-2 text-[12.5px] text-heat">
                {s.anomalies.filter((a) => a.unusual).length} session(s) unusual against the historical baseline.
              </p>
            )}
            <p className="mt-2 text-[11.5px] text-smoke">Historical ML: {(s.ml_status || 'unavailable').replaceAll('_', ' ')}</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}
