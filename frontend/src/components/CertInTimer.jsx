import React, { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'

/**
 * CERT-In Direction No. 70(1)/2022 six-hour reporting clock.
 *
 * Counts down from the server-provided `deadline` (an absolute UTC instant),
 * never from a client-side start time — the clock is the backend's, the badge
 * only renders it. Colour escalates as the window closes; a breached deadline
 * pulses and demands filing.
 */
export default function CertInTimer({ deadline }) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!deadline) return
    const tick = () => setRemaining(Math.max(0, new Date(deadline).getTime() - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  if (!deadline) return null
  if (remaining === null) return null

  const totalSeconds = Math.floor(remaining / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const breached = remaining <= 0

  const urgency = breached
    ? { ring: 'border-crit', text: 'text-crit', label: '🚨 CERT-In SLA BREACHED' }
    : remaining < 1 * 3600 * 1000
    ? { ring: 'border-crit', text: 'text-crit', label: '🚨 CERT-In Timer — CRITICAL' }
    : remaining < 2 * 3600 * 1000
    ? { ring: 'border-warn', text: 'text-warn', label: '⚠ CERT-In Timer — Urgent' }
    : { ring: 'border-ok', text: 'text-ok', label: 'CERT-In 6-Hr Timer' }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${urgency.ring} bg-surface text-xs font-mono shrink-0`}>
      <Timer size={13} className={urgency.text} />
      <span className={`font-bold ${urgency.text}`}>{urgency.label}</span>
      <span className={`${urgency.text} font-mono`}>
        {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      {breached && <span className="text-crit font-bold animate-pulse">OVERDUE — FILE NOW</span>}
    </div>
  )
}
