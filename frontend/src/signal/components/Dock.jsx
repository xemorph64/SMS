import React, { useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Command as CommandIcon } from 'lucide-react'

/*
 * Floating instrument dock. Icons magnify with cursor proximity (motion
 * values only, no re-renders). The active destination carries a signal tick.
 */

function DockItem({ item, mouseX, active }) {
  const ref = useRef(null)
  const dist = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect()
    return b ? x - b.left - b.width / 2 : 999
  })
  const size = useSpring(useTransform(dist, [-120, 0, 120], [44, 62, 44]), { stiffness: 320, damping: 22 })
  const Icon = item.icon
  const inner = (
    <motion.span
      ref={ref}
      style={{ width: size, height: size }}
      className={`group relative flex items-center justify-center rounded-full border transition-colors ${
        active ? 'border-signal bg-signal text-carbon' : 'border-hair-2 bg-carbon-3 text-ash hover:text-bone'
      }`}
    >
      <Icon size={18} strokeWidth={1.6} />
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap border border-hair-2 bg-carbon-3 px-2 py-1 font-code text-[10.5px] uppercase tracking-[0.1em] text-bone opacity-0 transition-opacity group-hover:opacity-100">
        {item.label}
      </span>
    </motion.span>
  )
  return item.to ? (
    <Link to={item.to} aria-label={item.label} aria-current={active ? 'page' : undefined}>{inner}</Link>
  ) : (
    <button type="button" onClick={item.action} aria-label={item.label}>{inner}</button>
  )
}

export default function Dock({ items, onCommand }) {
  const { pathname } = useLocation()
  const mouseX = useMotionValue(Infinity)
  const all = [...items, { label: 'Command  ⌘K', icon: CommandIcon, action: onCommand, id: 'cmd' }]
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
    >
      <div
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="flex h-[66px] items-end gap-2.5 rounded-full border border-hair-2 bg-carbon-2/85 px-3 pb-[10px] shadow-[0_20px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl"
      >
        {all.map((it, i) => (
          <React.Fragment key={it.id || it.to + it.label}>
            {it.id === 'cmd' && <span aria-hidden className="mb-2.5 h-6 w-px self-end bg-hair-2" />}
            <DockItem item={it} mouseX={mouseX} active={it.match ? it.match(pathname) : false} />
          </React.Fragment>
        ))}
      </div>
    </nav>
  )
}
