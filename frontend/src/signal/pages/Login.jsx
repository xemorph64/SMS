import React, { lazy, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { apiUrl } from '../../lib/api'
import Scene3D from '../three/Scene3D'
import SignalField from '../components/SignalField'
import { Decode, Magnetic } from '../ui'

const HandshakeScene = lazy(() => import('../three/HandshakeScene'))

// Demo accounts, presented as channels.
const DEMO_PROFILES = [
  { username: 'analyst', ch: '01', role: 'SOC Analyst', duty: 'Detect & triage' },
  { username: 'ir', ch: '02', role: 'Incident Response', duty: 'Contain & fix' },
  { username: 'forensics', ch: '03', role: 'Forensics', duty: 'Preserve evidence' },
  { username: 'auditor', ch: '04', role: 'Auditor', duty: 'Verify & close' },
  { username: 'admin', ch: '05', role: 'Admin', duty: 'Oversee platform' },
]

const ease = [0.16, 1, 0.3, 1]

function StaticHandshake() {
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
      <div className="relative h-[360px] w-[360px]">
        <div className="absolute inset-0 rounded-full border border-ice/20" />
        <div className="absolute inset-[18%] rounded-full border border-bone/30" />
        <div className="absolute inset-[36%] rounded-full border border-ice/50" />
      </div>
    </div>
  )
}

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const signIn = async (u, p) => {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      })
      if (res.ok) {
        const data = await res.json()
        login(data.token)
        navigate('/incidents')
      } else {
        setError('Invalid credentials')
      }
    } catch {
      setError('Connection failed')
    } finally {
      setBusy(false)
    }
  }

  // One tap on a demo channel fills the form and signs in straight away.
  const pick = (account) => {
    setUsername(account)
    setPassword('password')
    signIn(account, 'password')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    signIn(username, password)
  }

  return (
    <div className="sg-grain relative min-h-[100dvh] overflow-hidden">
      <SignalField />

      {/* the globe: the product's thesis */}
      <div className="pointer-events-none absolute inset-0 z-[1] lg:right-[34%]">
        <Scene3D className="h-full w-full" camera={{ position: [0, -0.2, 8.2], fov: 42 }} fallback={<StaticHandshake />}>
          <HandshakeScene />
        </Scene3D>
      </div>

      <div className="relative z-10 grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_460px]">
        {/* left: statement */}
        <section className="flex min-h-[62dvh] flex-col justify-between p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-7 w-7 items-center justify-center border border-bone" aria-hidden>
              <span className="h-2 w-2 bg-signal" />
              <span className="absolute -right-[3px] -top-[3px] h-1.5 w-1.5 bg-bone" />
            </span>
            <span className="text-[14px] font-bold text-bone">SecureMailScope</span>
            <span className="ml-2 hidden text-[12px] text-smoke sm:inline">Passive mail forensics</span>
          </div>

          <div className="pointer-events-none">
            <h1 className="text-[40px] font-bold leading-[1.02] tracking-[-0.02em] text-bone sm:text-[64px] xl:text-[84px]">
              <Decode text="Touch nothing." className="block" />
              <span className="block text-signal"><Decode text="Read everything." delay={250} /></span>
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease }}
              className="mt-6 max-w-[44ch] text-[15.5px] leading-relaxed text-ash"
            >
              Every SMTP, IMAP and POP3 session in a capture, rebuilt and graded against 35 NIST and RFC rules. Nothing is sent to the network.
            </motion.p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-semibold text-ash">
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-signal" /> Cleartext mail</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-bone" /> TLS boundary</span>
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-ice" /> Encrypted</span>
            </div>
          </div>
        </section>

        {/* right: sign in console */}
        <motion.section
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
          className="flex items-center border-hair bg-carbon/80 p-6 backdrop-blur-xl sm:p-10 lg:border-l"
        >
          <div className="w-full">
            <div className="sg-kicker">Secure channel</div>
            <h2 className="mt-2 text-[26px] font-bold text-bone">Sign in</h2>
            <p className="mt-1 text-[14px] text-ash">Your role decides what you can see and do.</p>
            <p className="mt-1 text-[13px] text-smoke">First time? Pick a demo channel below — one tap signs you in.</p>

            {error && (
              <div role="alert" className="mt-6 rounded-md border-l-2 border-signal bg-signal/10 px-4 py-2.5 text-[13px] font-semibold text-signal">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label className="sg-label" htmlFor="login-username">Operator</label>
                <input id="login-username" className="sg-input" value={username} autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)} placeholder="e.g. analyst" required />
              </div>
              <div>
                <label className="sg-label" htmlFor="login-password">Passphrase</label>
                <input id="login-password" type="password" className="sg-input" value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} placeholder="password" required />
              </div>
              <Magnetic className="w-full" strength={0.12}>
                <button type="submit" className="sg-btn-primary h-12 w-full justify-between px-5" disabled={busy}>
                  <span>{busy ? 'Opening channel' : 'Open channel'}</span>
                  <ArrowRight size={16} strokeWidth={1.75} />
                </button>
              </Magnetic>
            </form>

            <div className="mt-9">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="sg-label mb-0">Demo channels</span>
                <span className="font-code text-[11px] text-smoke">pass: <span className="text-ash">password</span></span>
              </div>
              <p className="mb-3 text-[12px] text-smoke">Tap one to open it instantly — no typing needed.</p>
              <div className="border-t border-hair">
                {DEMO_PROFILES.map((p, i) => {
                  const selected = username === p.username && password === 'password'
                  return (
                    <motion.button
                      key={p.username}
                      type="button"
                      onClick={() => pick(p.username)}
                      aria-label={`Sign in as ${p.role} (${p.username})`}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.45 + i * 0.06, ease }}
                      className={`group grid w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 border-b border-hair px-1 py-3 text-left transition-colors ${
                        selected ? 'bg-signal/10' : 'hover:bg-carbon-3'
                      }`}
                    >
                      <span className={`text-[18px] font-bold leading-none ${selected ? 'text-signal' : 'text-smoke group-hover:text-ash'}`}>{p.ch}</span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-bone">{p.role}</span>
                        <span className="block text-[12px] text-smoke">{p.username} · {p.duty}</span>
                      </span>
                      <span className={`text-[12.5px] font-semibold ${selected ? 'text-signal' : 'text-signal group-hover:text-bone'}`}>
                        {busy && selected ? 'Opening…' : selected ? 'Selected' : 'Use →'}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
