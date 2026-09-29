import React, { useEffect } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

/*
 * ⌘K / Ctrl+K: every destination and global action in one keyboard-first
 * list. Items are pre-filtered by role by the caller.
 */
export default function CommandPalette({ open, setOpen, items }) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const groups = items.reduce((acc, it) => {
    ;(acc[it.group] ||= []).push(it)
    return acc
  }, {})

  const run = (it) => {
    setOpen(false)
    if (it.to) navigate(it.to)
    else it.action?.()
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-[70] bg-carbon/70 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[14vh] z-[71] w-[min(620px,calc(100vw-32px))] -translate-x-1/2 border border-hair-2 bg-carbon-2 shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b border-hair px-4">
        <span className="font-code text-[12px] text-signal">&gt;</span>
        <Command.Input
          autoFocus
          placeholder="Go to, or do…"
          className="h-14 w-full bg-transparent text-[15px] text-bone outline-none placeholder:text-smoke focus-visible:outline-none"
        />
        <kbd className="font-code text-[10.5px] text-smoke">ESC</kbd>
      </div>
      <Command.List className="max-h-[52vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-smoke">Nothing matches.</Command.Empty>
        {Object.entries(groups).map(([group, list]) => (
          <Command.Group
            key={group}
            heading={group}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:font-code [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-smoke"
          >
            {list.map((it) => {
              const Icon = it.icon
              return (
                <Command.Item
                  key={it.id}
                  value={`${it.label} ${it.keywords || ''}`}
                  onSelect={() => run(it)}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[14px] text-ash"
                >
                  {Icon && <Icon size={16} strokeWidth={1.5} />}
                  <span className="flex-1">{it.label}</span>
                  {it.hint && <span className="font-code text-[11px] text-smoke">{it.hint}</span>}
                  <ArrowRight size={14} className="cmdk-arrow opacity-0" />
                </Command.Item>
              )
            })}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  )
}
