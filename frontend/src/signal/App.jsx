import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Lenis from 'lenis'
import { Toaster } from 'sonner'
import {
  Siren, ScanLine, FolderTree, Microscope, Scale, Cpu, LogOut, SunMoon, Radio,
} from 'lucide-react'

import './signal.css'
import { health as fetchHealth, listIncidents } from '../lib/api'
import { AuthContext, useAuth } from '../lib/auth'
import { ReportContext, roleInfo } from './lib/roles'
import CaseRail from './components/CaseRail'
import CommandPalette from './components/CommandPalette'
import Dock from './components/Dock'
import SignalField, { HeatProvider } from './components/SignalField'
import { Loading } from './ui'

import Login from './pages/Login'
import IncidentCommandCenter from './pages/IncidentCommandCenter'
import AnalystDashboard from './pages/AnalystDashboard'
import Investigations from './pages/Investigations'
import AnalysisJob from './pages/AnalysisJob'
import ExportPage from './pages/Export'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const SessionDetail = lazy(() => import('./pages/SessionDetail'))
const IRDashboard = lazy(() => import('./pages/IRDashboard'))
const ForensicsDashboard = lazy(() => import('./pages/ForensicsDashboard'))
const AuditorDashboard = lazy(() => import('./pages/AuditorDashboard'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

const ALL = ['ROLE_SOC_ANALYST', 'ROLE_INCIDENT_RESPONDER', 'ROLE_FORENSICS_ANALYST', 'ROLE_AUDITOR', 'ROLE_ADMIN']

// Destinations per role.
const NAV = [
  { to: '/incidents', label: 'Incidents', icon: Siren, roles: ALL, match: (p) => p.startsWith('/incidents') },
  { to: '/analyst-dashboard', label: 'Analyse', icon: ScanLine, roles: ['ROLE_SOC_ANALYST'], match: (p) => p === '/analyst-dashboard' || p.startsWith('/jobs') },
  { to: '/investigations', label: 'Investigations', icon: FolderTree, roles: ['ROLE_SOC_ANALYST', 'ROLE_INCIDENT_RESPONDER'], match: (p) => p.startsWith('/investigations') || p.startsWith('/report') },
  { to: '/forensics-dashboard', label: 'Evidence locker', icon: Microscope, roles: ['ROLE_FORENSICS_ANALYST'], match: (p) => p === '/forensics-dashboard' || p.startsWith('/report') },
  { to: '/auditor-dashboard', label: 'Compliance', icon: Scale, roles: ['ROLE_AUDITOR'], match: (p) => p === '/auditor-dashboard' || p.startsWith('/report') },
  { to: '/admin-dashboard', label: 'System', icon: Cpu, roles: ['ROLE_ADMIN'], match: (p) => p === '/admin-dashboard' },
]

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('sg-theme') || 'dark' } catch { return 'dark' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('sg-theme', theme) } catch { /* ignore */ }
  }, [theme])
  return [theme, setTheme]
}

export function Mark({ className = '' }) {
  // The signal mark: a square aperture with a live dot.
  return (
    <span className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center border border-bone ${className}`} aria-hidden>
      <span className="h-2 w-2 bg-signal" />
      <span className="absolute -right-[3px] -top-[3px] h-1.5 w-1.5 bg-bone" />
    </span>
  )
}

/** Lenis weighted scrolling (skipped under reduced motion). */
function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.9 })
    let raf
    const loop = (t) => { lenis.raf(t); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); lenis.destroy() }
  }, [])
}

/** Feed the cursor position to whichever reticle panel is hovered (spotlight). */
function useSpotlight() {
  useEffect(() => {
    const onMove = (e) => {
      const el = e.target.closest?.('.sg-panel')
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
}

function Ticker({ health, incidents }) {
  const detected = incidents.filter((i) => i.status === 'DETECTED').length
  const escalated = incidents.filter((i) => i.status === 'ESCALATED').length
  const gate = incidents.filter((i) => i.status === 'AWAITING_AUDIT').length
  const breached = incidents.filter((i) =>
    i.certInClockDeadline && new Date(i.certInClockDeadline).getTime() < Date.now() &&
    (i.status === 'ESCALATED' || i.status === 'AWAITING_AUDIT')).length
  const engine = !health ? 'CONNECTING' : health.status === 'UP' ? `ENGINE ${health.engine || 'ONLINE'} ${health.engineVersion || ''}` : health.reachable ? 'ENGINE DEGRADED' : 'API OFFLINE'
  const items = [
    [engine, health?.status === 'UP' ? 'go' : 'signal'],
    [`${detected} AWAITING TRIAGE`, detected ? 'signal' : 'smoke'],
    [`${escalated} IN RESPONSE`, escalated ? 'heat' : 'smoke'],
    [`${gate} AT AUDIT GATE`, 'ash'],
    [`${breached} CERT-IN SLA BREACHED`, breached ? 'signal' : 'smoke'],
    ['PASSIVE MODE · 0 PACKETS TRANSMITTED', 'ice'],
  ]
  const row = (k) => (
    <div className="flex shrink-0 items-center" aria-hidden={k === 1}>
      {items.map(([t, c]) => (
        <span key={t + k} className="flex items-center gap-2 px-6 font-code text-[10.5px] tracking-[0.14em]" style={{ color: `rgb(var(--s-${c}))` }}>
          <span className="h-1 w-1" style={{ background: `rgb(var(--s-${c}))` }} /> {t}
        </span>
      ))}
    </div>
  )
  return (
    <div className="overflow-hidden border-b border-hair bg-carbon/60">
      <div className="sg-marquee flex w-max py-1.5">{row(0)}{row(1)}</div>
    </div>
  )
}

/** A signal-colour scan line sweeps the viewport on every route change. */
function ScanWipe({ trigger }) {
  return (
    <AnimatePresence>
      <motion.div
        key={trigger}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[65] h-[2px] bg-signal shadow-[0_0_24px_rgb(var(--s-signal))]"
        initial={{ y: 0, opacity: 1 }}
        animate={{ y: '100vh', opacity: 0 }}
        transition={{ duration: 0.7, ease: [0.7, 0, 0.3, 1] }}
      />
    </AnimatePresence>
  )
}

function Shell({ health, children }) {
  const [theme, setTheme] = useTheme()
  const [palette, setPalette] = useState(false)
  const [incidents, setIncidents] = useState([])
  const { role, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const info = roleInfo(role)
  const reduce = useRef(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches).current

  useSmoothScroll()
  useSpotlight()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  // Live counts for the ticker (same endpoint the command center uses).
  useEffect(() => {
    let alive = true
    const load = () => listIncidents().then((l) => { if (alive) setIncidents(l || []) }).catch(() => {})
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [pathname])

  const nav = NAV.filter((n) => n.roles.includes(role))
  const signOut = () => { logout(); navigate('/login') }
  const commands = [
    ...nav.map((n) => ({ id: n.to + n.label, group: 'Go to', label: n.label, icon: n.icon, to: n.to })),
    { id: 'theme', group: 'Display', label: theme === 'dark' ? 'Switch to paper (light) theme' : 'Switch to carbon (dark) theme', icon: SunMoon, action: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'logout', group: 'Session', label: 'Sign out', icon: LogOut, action: signOut },
  ]

  return (
    <div className="sg-grain relative min-h-[100dvh]">
      <SignalField />
      <CommandPalette open={palette} setOpen={setPalette} items={commands} />
      {!reduce && <ScanWipe trigger={pathname} />}

      <div className="sticky top-0 z-40 bg-carbon/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <Link to="/incidents" className="flex shrink-0 items-center gap-3" aria-label="SecureMailScope home">
            <Mark />
            <span className="sg-display hidden text-[13px] font-bold tracking-[0.02em] text-bone xl:inline">SecureMailScope</span>
          </Link>
          <span aria-hidden className="hidden h-5 w-px bg-hair-2 sm:block" />
          <div className="min-w-0 flex-1"><CaseRail seat={info.seat} /></div>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="hidden h-8 items-center gap-3 border border-hair-2 px-3 font-code text-[11px] uppercase tracking-[0.1em] text-smoke transition-colors hover:border-bone hover:text-bone md:inline-flex"
          >
            Command <kbd className="text-ash">⌘K</kbd>
          </button>
          <div className="group relative">
            <button type="button" className="flex h-8 items-center gap-2 border border-hair-2 pl-2 pr-3 transition-colors hover:border-bone" aria-haspopup="menu">
              <Radio size={14} strokeWidth={1.6} className="text-signal" />
              <span className="font-code text-[11px] uppercase tracking-[0.1em] text-bone">{info.short}</span>
            </button>
            <div className="invisible absolute right-0 top-full z-50 w-64 translate-y-1 border border-hair-2 bg-carbon-2 p-1 opacity-0 shadow-2xl transition-all group-focus-within:visible group-focus-within:translate-y-2 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-2 group-hover:opacity-100" role="menu">
              <div className="border-b border-hair px-3 py-3">
                <div className="text-[13.5px] font-medium text-bone">{info.name}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-smoke">{info.duty}</div>
              </div>
              <MenuBtn icon={SunMoon} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Paper theme' : 'Carbon theme'}</MenuBtn>
              <MenuBtn icon={LogOut} onClick={signOut} danger>Sign out</MenuBtn>
            </div>
          </div>
        </div>
        <Ticker health={health} incidents={incidents} />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-[1320px] px-4 pb-36 pt-10 sm:px-6 lg:px-10 lg:pt-14">
        <motion.div
          key={pathname}
          initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <Suspense fallback={<Loading rows={4} />}>{children}</Suspense>
        </motion.div>
      </main>

      <Dock items={nav} onCommand={() => setPalette(true)} />
    </div>
  )
}

function MenuBtn({ icon: Icon, children, onClick, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-carbon-4 ${danger ? 'text-signal' : 'text-ash hover:text-bone'}`}
    >
      <Icon size={14} strokeWidth={1.6} /> {children}
    </button>
  )
}

function ProtectedRoute({ children, allowedRoles }) {
  const { token, role } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/" replace />
  return children
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <div className="font-dot text-[96px] font-black leading-none text-signal">404</div>
      <div className="sg-display mt-4 text-[18px] font-semibold text-bone">No signal on this channel</div>
      <Link to="/" className="sg-btn-ghost mt-6">Return home</Link>
    </div>
  )
}

export default function App() {
  const [report, setReport] = useState(null)
  const [health, setHealth] = useState(null)
  const { pathname } = useLocation()

  // Auth: JWT in localStorage under 'sms-token'.
  const [token, setToken] = useState(() => localStorage.getItem('sms-token'))
  const [role, setRole] = useState(() => {
    const t = localStorage.getItem('sms-token')
    if (t) {
      try { return JSON.parse(atob(t.split('.')[1])).role } catch { return null }
    }
    return null
  })

  useEffect(() => {
    try { document.documentElement.dataset.theme = localStorage.getItem('sg-theme') || 'dark' } catch { /* ignore */ }
    let cancelled = false
    fetchHealth().then((h) => { if (!cancelled) setHealth(h) })
    return () => { cancelled = true }
  }, [])

  const login = (jwt) => {
    localStorage.setItem('sms-token', jwt)
    setToken(jwt)
    try { setRole(JSON.parse(atob(jwt.split('.')[1])).role) } catch { setRole(null) }
  }
  const logout = () => {
    localStorage.removeItem('sms-token')
    setToken(null)
    setRole(null)
  }

  const authCtx = useMemo(() => ({ token, role, login, logout }), [token, role])
  const reportCtx = useMemo(() => ({ report, setReport, health }), [report, health])
  const guarded = (roles, el) => <ProtectedRoute allowedRoles={roles}>{el}</ProtectedRoute>

  const routes = (
    <Routes>
      <Route path="/" element={token ? <Navigate to="/incidents" replace /> : <Navigate to="/login" replace />} />
      <Route path="/incidents" element={guarded(ALL, <IncidentCommandCenter />)} />
      <Route path="/analyst-dashboard" element={guarded(['ROLE_SOC_ANALYST'], <AnalystDashboard />)} />
      <Route path="/investigations" element={guarded(['ROLE_SOC_ANALYST', 'ROLE_INCIDENT_RESPONDER'], <Investigations />)} />
      <Route path="/investigations/:investigationId" element={guarded(['ROLE_SOC_ANALYST', 'ROLE_INCIDENT_RESPONDER'], <Investigations />)} />
      <Route path="/jobs/:id" element={guarded(['ROLE_SOC_ANALYST'], <AnalysisJob />)} />
      {/* Report: SOC + Forensics + Auditor (not IR: separation of duties) */}
      <Route path="/report/:id" element={guarded(['ROLE_SOC_ANALYST', 'ROLE_FORENSICS_ANALYST', 'ROLE_AUDITOR'], <Dashboard />)} />
      {/* Packet evidence: SOC (triage) + Forensics only */}
      <Route path="/report/:id/sessions/:stream" element={guarded(['ROLE_SOC_ANALYST', 'ROLE_FORENSICS_ANALYST'], <SessionDetail />)} />
      <Route path="/report/:id/export" element={guarded(['ROLE_SOC_ANALYST', 'ROLE_FORENSICS_ANALYST', 'ROLE_AUDITOR'], <ExportPage />)} />
      <Route path="/ir-dashboard" element={guarded(['ROLE_INCIDENT_RESPONDER'], <IRDashboard />)} />
      <Route path="/forensics-dashboard" element={guarded(['ROLE_FORENSICS_ANALYST'], <ForensicsDashboard />)} />
      <Route path="/auditor-dashboard" element={guarded(['ROLE_AUDITOR'], <AuditorDashboard />)} />
      <Route path="/admin-dashboard" element={guarded(['ROLE_ADMIN'], <AdminDashboard />)} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )

  return (
    <AuthContext.Provider value={authCtx}>
      <ReportContext.Provider value={reportCtx}>
        <HeatProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              unstyled: true,
              classNames: {
                toast: 'flex w-[340px] items-start gap-3 border border-hair-2 border-l-2 border-l-signal bg-carbon-3 px-4 py-3 text-bone shadow-2xl',
                title: 'text-[13.5px] font-medium',
                description: 'mt-0.5 text-[12.5px] text-ash',
              },
            }}
          />
          {pathname === '/login' || !token ? (
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          ) : (
            <Shell health={health}>{routes}</Shell>
          )}
        </HeatProvider>
      </ReportContext.Provider>
    </AuthContext.Provider>
  )
}
