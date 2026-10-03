import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Lenis from 'lenis'
import { Toaster } from 'sonner'
import {
  Siren, ScanLine, FolderTree, Microscope, Scale, Cpu, LogOut, Sun, Moon, SunMoon,
  Menu as MenuIcon, Upload, Search, X as CloseIcon,
} from 'lucide-react'

import './signal.css'
import { health as fetchHealth, listIncidents } from '../lib/api'
import { AuthContext, useAuth } from '../lib/auth'
import { ReportContext, roleInfo } from './lib/roles'
import CaseRail from './components/CaseRail'
import CommandPalette from './components/CommandPalette'
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
    try { return localStorage.getItem('sg-theme') || 'light' } catch { return 'light' }
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

/**
 * Live status line. Static (not a marquee) so it can always be read.
 */
function Ticker({ health, incidents }) {
  const detected = incidents.filter((i) => i.status === 'DETECTED').length
  const escalated = incidents.filter((i) => i.status === 'ESCALATED').length
  const gate = incidents.filter((i) => i.status === 'AWAITING_AUDIT').length
  const breached = incidents.filter((i) =>
    i.certInClockDeadline && new Date(i.certInClockDeadline).getTime() < Date.now() &&
    (i.status === 'ESCALATED' || i.status === 'AWAITING_AUDIT')).length
  const engineUp = health?.status === 'UP'
  const engine = !health ? 'Connecting…' : engineUp ? `Engine online${health.engineVersion ? ` ${health.engineVersion}` : ''}` : health.reachable ? 'Engine degraded' : 'API offline'
  const Dot = ({ c }) => <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgb(var(--s-${c}))` }} />
  return (
    <div className="overflow-hidden border-t border-hair bg-carbon/60">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-0.5 px-4 py-1.5 text-[12.5px] sm:px-6">
        <span className="inline-flex items-center gap-2 font-semibold" style={{ color: `rgb(var(--s-${engineUp ? 'go' : 'signal'}))` }}>
          <Dot c={engineUp ? 'go' : 'signal'} /> {engine}
        </span>
        <span className="inline-flex items-center gap-2 text-ash"><Dot c={detected ? 'signal' : 'hair-2'} /> {detected} awaiting triage</span>
        <span className="inline-flex items-center gap-2 text-ash"><Dot c={escalated ? 'heat' : 'hair-2'} /> {escalated} in response</span>
        <span className="hidden items-center gap-2 text-ash sm:inline-flex"><Dot c="hair-2" /> {gate} at audit gate</span>
        <span className="inline-flex items-center gap-2 font-medium" style={{ color: `rgb(var(--s-${breached ? 'signal' : 'ash'}))` }}>
          <Dot c={breached ? 'signal' : 'hair-2'} /> {breached} SLA breached
        </span>
        <span className="ml-auto hidden items-center gap-2 text-smoke lg:inline-flex">
          <Dot c="ice" /> Passive mode · no packets transmitted
        </span>
      </div>
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

/**
 * Two-pane workspace: a fixed sidebar for navigation (works at every width,
 * screen-reader friendly) and a content column with a compact top bar.
 * On phones the sidebar becomes an overlay drawer.
 */
function Shell({ health, children }) {
  const [theme, setTheme] = useTheme()
  const [palette, setPalette] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [incidents, setIncidents] = useState([])
  const { role, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const info = roleInfo(role)
  const reduce = useRef(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches).current

  useSmoothScroll()
  useSpotlight()
  useEffect(() => { window.scrollTo(0, 0); setDrawer(false) }, [pathname])

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

  const sideNav = (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      <div className="sg-kicker mb-2 px-2">Workspace</div>
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          className={({ isActive }) => `group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-semibold transition-colors ${
            isActive || n.match(pathname) ? 'bg-carbon-3 text-bone' : 'text-ash hover:bg-carbon-3/60 hover:text-bone'
          }`}
        >
          {(isActive) => (
            <>
              {(isActive || n.match(pathname)) && <motion.span layoutId="nav-rail" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-signal" aria-hidden />}
              <n.icon size={17} strokeWidth={1.8} className="shrink-0" />
              {n.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )

  const sideFoot = (
    <div className="border-t border-hair p-3">
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-carbon-3 text-[12px] font-bold text-ash" aria-hidden>
          {info.short.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-bone">{info.name}</div>
          <div className="truncate text-[11.5px] leading-snug text-smoke">{info.duty}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={signOut}
        className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-semibold text-ash transition-colors hover:bg-carbon-3 hover:text-signal"
      >
        <LogOut size={15} strokeWidth={1.8} /> Sign out
      </button>
    </div>
  )

  return (
    <div className="sg-grain relative min-h-[100dvh]">
      <SignalField />
      <CommandPalette open={palette} setOpen={setPalette} items={commands} />
      {!reduce && <ScanWipe trigger={pathname} />}

      <div className="relative z-10 flex min-h-[100dvh] w-full">
        {/* sidebar: fixed on desktop, drawer on phones */}
        <aside className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col border-r border-hair bg-carbon/85 backdrop-blur-xl lg:flex">
          <Link to="/incidents" className="flex items-center gap-3 px-5 py-5" aria-label="SecureMailScope home">
            <Mark />
            <span className="text-[15px] font-bold tracking-[-0.01em] text-bone">SecureMailScope</span>
          </Link>
          {sideNav}
          {sideFoot}
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <button aria-label="Close menu" className="absolute inset-0 bg-carbon/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <motion.aside
              initial={reduce ? false : { x: -280 }}
              animate={{ x: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 left-0 flex w-[264px] flex-col border-r border-hair bg-carbon-2"
            >
              <div className="flex items-center justify-between px-5 py-4">
                <Link to="/incidents" className="flex items-center gap-3" aria-label="SecureMailScope home"><Mark /><span className="text-[15px] font-bold text-bone">SecureMailScope</span></Link>
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="p-1.5 text-ash hover:text-bone"><CloseIcon size={18} /></button>
              </div>
              {sideNav}
              {sideFoot}
            </motion.aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* top bar */}
          <header className="sticky top-0 z-40 border-b border-hair bg-carbon/85 backdrop-blur-xl">
            <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
              <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" className="p-2 text-ash hover:text-bone lg:hidden">
                <MenuIcon size={19} strokeWidth={1.8} />
              </button>
              <CaseRail seat={info.seat} />
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  aria-label={theme === 'dark' ? 'Switch to paper theme' : 'Switch to carbon theme'}
                  title={theme === 'dark' ? 'Switch to paper theme' : 'Switch to carbon theme'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-hair-2 text-smoke transition-colors hover:border-ash hover:text-bone"
                >
                  {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
                </button>
                <button
                  type="button"
                  onClick={() => setPalette(true)}
                  className="hidden h-9 items-center gap-2.5 rounded-md border border-hair-2 px-3 text-[12.5px] font-semibold text-smoke transition-colors hover:border-ash hover:text-bone md:inline-flex"
                >
                  <Search size={14} strokeWidth={2} /> Search <kbd className="text-[11px] text-smoke">⌘K</kbd>
                </button>
                <Link to="/analyst-dashboard" className="sg-btn-primary sg-btn-sm hidden sm:inline-flex">
                  <Upload size={14} strokeWidth={2} /> Analyse PCAP
                </Link>
              </div>
            </div>
            <Ticker health={health} incidents={incidents} />
          </header>

          <main className="relative min-w-0 flex-1 px-5 pb-24 pt-8 sm:px-7">
            <motion.div
              key={pathname}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <Suspense fallback={<Loading rows={4} />}>{children}</Suspense>
            </motion.div>
          </main>
        </div>
      </div>
    </div>
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
      <div className="text-[96px] font-bold leading-none text-signal tabular">404</div>
      <div className="mt-4 text-[18px] font-semibold text-bone">No signal on this channel</div>
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
    try { document.documentElement.dataset.theme = localStorage.getItem('sg-theme') || 'light' } catch { /* ignore */ }

    // One probe at mount latched "API offline" for the whole session: Render's
    // free instance sleeps after ~15 min idle and Spring Boot needs ~2.5 min to
    // wake, while each probe gives up after 4s. Retry on a backoff that spans
    // the wake window — staying on "Connecting…" rather than crying offline —
    // then surface the result and keep polling so the badge recovers without a
    // reload and notices when the instance sleeps again.
    let cancelled = false
    let timer = null
    let inFlight = false
    let miss = 0
    const WAKE_DELAYS = [3000, 5000, 8000, 12000, 20000, 30000, 45000, 60000] // ≈ 3 min
    const POLL_MS = 30000

    const probe = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      const h = await fetchHealth()
      inFlight = false
      if (cancelled) return
      if (h.reachable) {
        miss = 0
        setHealth(h)
        timer = setTimeout(probe, POLL_MS)
        return
      }
      miss += 1
      setHealth(miss > WAKE_DELAYS.length ? h : null)
      timer = setTimeout(probe, miss <= WAKE_DELAYS.length ? WAKE_DELAYS[miss - 1] : POLL_MS)
    }

    // Returning to the tab re-probes at once — the instance may have woken (or
    // slept) while the page was hidden.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || inFlight) return
      clearTimeout(timer)
      probe()
    }
    document.addEventListener('visibilitychange', onVisibility)

    probe()
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
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
