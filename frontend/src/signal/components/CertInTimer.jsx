import React, { useEffect, useState } from 'react'
import { Explain } from '../ui'

/*
 * CERT-In Direction No. 70(1)/2022 six-hour reporting clock.
 * Counts down to the server-provided absolute `deadline`; the clock is the
 * backend's, this only renders it. Same urgency thresholds as the classic UI.
 */

const WINDOW = 6 * 3600 * 1000

function useRemaining(deadline) {
  const [remaining, setRemaining] = useState(null)
  useEffect(() => {
    if (!deadline) return undefined
    const tick = () => setRemaining(Math.max(0, new Date(deadline).getTime() - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])
  return remaining
}

function tone(remaining) {
  if (remaining <= 0) return { key: 'danger', label: 'Overdue, file now' }
  if (remaining < 3600 * 1000) return { key: 'danger', label: 'Critical' }
  if (remaining < 2 * 3600 * 1000) return { key: 'warning', label: 'Urgent' }
  return { key: 'safe', label: 'On track' }
}

const hms = (ms) => {
  const t = Math.floor(ms / 1000)
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

export default function CertInTimer({ deadline, size = 'sm' }) {
  const remaining = useRemaining(deadline)
  if (!deadline || remaining === null) return null
  const t = tone(remaining)
  const frac = Math.max(0, Math.min(1, remaining / WINDOW))
  const color = `rgb(var(--s-${t.key}))`

  if (size === 'sm') {
    const r = 9
    const c = 2 * Math.PI * r
    return (
      <span className="inline-flex items-center gap-2" title={`CERT-In 6-hour clock: ${t.label}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90" aria-hidden>
          <circle cx="12" cy="12" r={r} fill="none" stroke="rgb(var(--s-hair-2))" strokeWidth="2.5" />
          <circle cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
        </svg>
        <span className={`font-code text-[12.5px] tabular ${remaining <= 0 ? 'animate-pulse' : ''}`} style={{ color }}>
          {remaining <= 0 ? 'OVERDUE' : hms(remaining)}
        </span>
      </span>
    )
  }

  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90" aria-hidden>
          <circle cx="42" cy="42" r={r} fill="none" stroke="rgb(var(--s-hair))" strokeWidth="3" strokeDasharray="2 4" />
          <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="butt"
            strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-code text-[11px] text-smoke">6h</span>
      </div>
      <div>
        <div className="flex items-center gap-1.5 font-code text-[11px] uppercase tracking-[0.12em] text-ash">
          CERT-In reporting clock <Explain term="certIn" />
        </div>
        <div className={`mt-1.5 font-dot text-[38px] font-black leading-none tabular ${remaining <= 0 ? 'animate-pulse' : ''}`} style={{ color }}>
          {remaining <= 0 ? '00:00:00' : hms(remaining)}
        </div>
        <div className="mt-2 font-code text-[11px] uppercase tracking-[0.12em]" style={{ color }}>{t.label}</div>
      </div>
    </div>
  )
}
