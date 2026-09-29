import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Sparkles, ShieldAlert, Wrench, FileSearch, ClipboardCheck, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';

const DEMO_PROFILES = [
  { username: 'analyst', label: 'analyst', role: 'SOC', icon: ShieldAlert },
  { username: 'ir', label: 'ir', role: 'IR', icon: Wrench },
  { username: 'forensics', label: 'forensics', role: 'Forensics', icon: FileSearch },
  { username: 'auditor', label: 'auditor', role: 'Auditor', icon: ClipboardCheck },
  { username: 'admin', label: 'admin', role: 'Admin', icon: ShieldCheck },
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [justFilled, setJustFilled] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSelectProfile = (account) => {
    setUsername(account);
    setPassword('password');
    setError(null);
    setJustFilled(account);
    setTimeout(() => setJustFilled(null), 2500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const data = await res.json();
        login(data.token);
        // Every role lands on the unified incident command center; the tabs
        // inside scope themselves to the role encoded in the token.
        navigate('/incidents');
      } else {
        setError('Invalid credentials');
      }
    } catch (err) {
      setError('Connection failed');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] animate-fade-in py-8">
      <div className="w-full max-w-md bg-surface p-8 rounded-xl border border-line shadow-lg">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-accent text-surface rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(0,255,65,0.4)] mb-4">
            <ShieldCheck size={28} className="stroke-[2.5px]" />
          </div>
          <h2 className="text-2xl font-bold font-display text-ink uppercase tracking-tight">SecureMailScope</h2>
          <p className="text-ink-3 mt-1 text-sm">Sign in to access your dashboard</p>
        </div>

        {error && (
          <div className="bg-crit/10 border border-crit/30 text-crit px-4 py-2 rounded-md mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1" htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              value={username}
              autoComplete="username"
              onChange={(e) => {
                setUsername(e.target.value);
                setJustFilled(null);
              }}
              className={`w-full bg-surface-2 border ${
                justFilled ? 'border-accent ring-1 ring-accent' : 'border-line'
              } rounded-md px-4 py-2 text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono`}
              placeholder="e.g. analyst"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => {
                setPassword(e.target.value);
                setJustFilled(null);
              }}
              className={`w-full bg-surface-2 border ${
                justFilled ? 'border-accent ring-1 ring-accent' : 'border-line'
              } rounded-md px-4 py-2 text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono`}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-accent text-surface font-bold py-2.5 rounded-md hover:bg-accent/90 transition-colors shadow-sm flex items-center justify-center gap-2 mt-6 cursor-pointer"
          >
            <Lock size={16} /> Sign In
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-line/60">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-semibold uppercase tracking-wider text-ink-3 flex items-center gap-1.5">
              <Sparkles size={13} className="text-accent" /> One-Click Profiles
            </span>
            <span className="text-ink-3 font-mono text-[11px]">
              pwd: <span className="text-ink-2">password</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {DEMO_PROFILES.map((p) => {
              const isSelected = username === p.username && password === 'password';
              const Icon = p.icon;
              return (
                <button
                  key={p.username}
                  type="button"
                  onClick={() => handleSelectProfile(p.username)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all duration-150 border cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-accent/20 border-accent text-accent shadow-[0_0_12px_rgba(0,255,65,0.25)] font-bold'
                      : 'bg-surface-2 border-line text-ink-2 hover:border-accent/60 hover:text-accent hover:bg-surface-3'
                  }`}
                  title={`Click to enter ${p.username} and password into the box`}
                >
                  <Icon size={13} className={isSelected ? 'text-accent' : 'text-ink-3'} />
                  <span>{p.username}</span>
                  <span className="text-[10px] text-ink-3 font-sans">({p.role})</span>
                  {isSelected && <Check size={11} className="text-accent stroke-[3px]" />}
                </button>
              );
            })}
          </div>

          {justFilled ? (
            <p className="text-[11px] text-accent text-center mt-3 font-mono animate-fade-in flex items-center justify-center gap-1">
              <Check size={12} className="stroke-[3px]" /> Entered <span className="font-bold underline">{justFilled}</span> & password into the box
            </p>
          ) : (
            <p className="text-[10px] text-ink-3 text-center mt-3">
              Click any profile above to enter username & password into the box
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
