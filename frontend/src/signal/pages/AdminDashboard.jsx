import React, { useEffect, useState } from 'react'
import { Activity, SlidersHorizontal, Users, TrendingDown, Cpu, MemoryStick, Database, ShieldAlert } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { health } from '../../lib/api'
import { Explain, PageHeader, Panel, Tabs, Tag } from '../ui'

// Same sample series and local-only controls as the classic admin page.
const latencyData = Array.from({ length: 20 }, (_, i) => ({ time: `10:${i < 10 ? '0' : ''}${i}`, ms: Math.random() * 0.5 + 0.1 }))
const mttrData = [
  { month: 'Jan', critical: 12, weak: 20 }, { month: 'Feb', critical: 9, weak: 18 },
  { month: 'Mar', critical: 7, weak: 15 }, { month: 'Apr', critical: 6, weak: 14 },
  { month: 'May', critical: 4, weak: 12 }, { month: 'Jun', critical: 4.2, weak: 12.5 },
]
const auditLog = [
  { id: 1, user: 'admin', action: 'Exported compliance report', time: '2 mins ago' },
  { id: 2, user: 'analyst', action: 'Uploaded external-smtp.pcap', time: '1 hour ago' },
  { id: 3, user: 'auditor', action: 'Viewed NIST SP 800-52r2 checklist', time: '3 hours ago' },
]

const axis = { fill: 'rgb(var(--s-smoke))', fontSize: 11 }

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('system')
  const [apiHealth, setApiHealth] = useState(null)
  const [aiSensitivity, setAiSensitivity] = useState(75)
  const [strictMode, setStrictMode] = useState(false)
  const [users, setUsers] = useState(['admin', 'analyst', 'auditor'])

  useEffect(() => {
    let mounted = true
    health().then((h) => { if (mounted) setApiHealth(h) })
    return () => { mounted = false }
  }, [])

  return (
    <div>
      <PageHeader
        title="Administration"
        purpose="Keep the platform healthy, manage accounts and tune the engine."
        actions={apiHealth?.engine && <Tag tone="safe">{apiHealth.engine} v{apiHealth.engineVersion}</Tag>}
      />

      <div className="mb-6">
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'system', icon: Activity, label: 'System health' },
            { id: 'rules', icon: SlidersHorizontal, label: 'Engine tuning' },
            { id: 'users', icon: Users, label: 'Users' },
            { id: 'metrics', icon: TrendingDown, label: 'Time to fix' },
          ]}
        />
      </div>

      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [Cpu, 'CPU', '14%', null],
              [MemoryStick, 'Memory', '4.2 GB', '/ 16 GB'],
              [Database, 'Database storage', '1.8 TB', '/ 5 TB'],
            ].map(([Icon, label, v, of]) => (
              <Panel key={label} className="flex items-center gap-4 p-5">
                <span className="flex h-10 w-10 items-center justify-center bg-carbon-4 text-signal"><Icon size={18} strokeWidth={1.5} /></span>
                <div>
                  <div className="text-[12.5px] text-smoke">{label}</div>
                  <div className="text-[22px] font-semibold tracking-[-0.02em] text-bone tabular">{v} {of && <span className="text-[13px] font-normal text-smoke">{of}</span>}</div>
                </div>
              </Panel>
            ))}
          </div>
          <Panel className="p-5">
            <div className="mb-4 text-[14px] font-medium text-bone">Engine processing latency (sample)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={latencyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="svMs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--s-signal))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="rgb(var(--s-signal))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgb(var(--s-hair))" />
                  <XAxis dataKey="time" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="ms" stroke="rgb(var(--s-signal))" strokeWidth={1.75} fill="url(#svMs)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-3">
          <Panel className="flex items-center justify-between gap-6 p-5">
            <div>
              <div className="text-[14.5px] font-medium text-bone">Strict TLS 1.3 mode</div>
              <p className="mt-1 text-[13px] text-smoke">Treat TLS 1.2 as a weakness. All non-1.3 traffic becomes medium severity.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={strictMode}
              onClick={() => setStrictMode(!strictMode)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${strictMode ? 'bg-signal' : 'bg-hair-2'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-bone transition-transform ${strictMode ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </Panel>
          <Panel className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5 text-[14.5px] font-medium text-bone">Anomaly sensitivity <Explain term="anomaly" /></div>
                <p className="mt-1 text-[13px] text-smoke">Threshold for Isolation Forest verdicts.</p>
              </div>
              <span className="font-code text-[14px] text-signal tabular">{aiSensitivity}%</span>
            </div>
            <input
              type="range" min="0" max="100" value={aiSensitivity}
              onChange={(e) => setAiSensitivity(e.target.value)}
              aria-label="Anomaly sensitivity"
              className="mt-4 w-full accent-[rgb(var(--s-signal))]"
            />
            <div className="mt-2 flex justify-between text-[12px] text-smoke"><span>Fewer false positives</span><span>Catch everything</span></div>
          </Panel>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[14px] font-medium text-bone">Active accounts</div>
              <button className="sg-btn-primary sg-btn-sm">Create user</button>
            </div>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-hair text-left text-[12px] text-smoke">
                  <th className="py-2.5 font-medium">Username</th>
                  <th className="py-2.5 font-medium">Role</th>
                  <th className="py-2.5" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u} className="border-b border-hair/60 last:border-0">
                    <td className="py-3 text-bone">{u}</td>
                    <td className="py-3 font-code text-[12px] text-ash">ROLE_{u === 'analyst' ? 'SOC_ANALYST' : u.toUpperCase()}</td>
                    <td className="py-3 text-right">
                      <button onClick={() => setUsers(users.filter((x) => x !== u))} className="text-[12.5px] text-signal hover:underline">Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel className="p-5">
            <div className="mb-4 text-[14px] font-medium text-bone">Recent activity</div>
            <ul className="space-y-2">
              {auditLog.map((l) => (
                <li key={l.id} className="flex items-center gap-3 border border-hair bg-carbon-3 p-3">
                  <ShieldAlert size={15} strokeWidth={1.75} className="shrink-0 text-smoke" />
                  <div>
                    <div className="text-[13px] text-bone">{l.action}</div>
                    <div className="text-[11.5px] text-smoke">by {l.user} · {l.time}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {activeTab === 'metrics' && (
        <Panel className="p-5">
          <div className="mb-4 text-[14px] font-medium text-bone">Mean time to remediate, in days (sample)</div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mttrData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgb(var(--s-hair))" />
                <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="critical" name="Critical issues" stroke="rgb(var(--s-signal))" strokeWidth={1.75} fill="rgb(var(--s-signal))" fillOpacity={0.12} />
                <Area type="monotone" dataKey="weak" name="Weak ciphers" stroke="rgb(var(--s-heat))" strokeWidth={1.75} fill="rgb(var(--s-heat))" fillOpacity={0.08} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </div>
  )
}
