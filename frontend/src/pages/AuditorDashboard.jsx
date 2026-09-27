import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Download, FileText, CheckCircle, ShieldCheck, Activity, Target, Search, ClipboardCheck, XCircle, RotateCcw } from 'lucide-react';
import { listCaptures, getCapture, adaptBackendCapture, getAllFindingsStatuses, updateFindingStatus } from '../lib/api';
import { Spinner, Notice, GradeBadge, SeverityPill } from '../components/ui';

export default function AuditorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allStatuses, setAllStatuses] = useState([]);   // DB-backed
  const [awaitingAudit, setAwaitingAudit] = useState([]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [capturesList, dbStatuses] = await Promise.all([
          listCaptures(),
          getAllFindingsStatuses().catch(() => []),
        ]);
        const successful = capturesList.filter(c => c.status === 'COMPLETED');

        // Build status map: key=`${captureId}-${streamId}` → status obj
        const statusMap = {};
        dbStatuses.forEach(s => { statusMap[`${s.captureId}-${s.streamId}`] = s; });
        if (active) setAllStatuses(dbStatuses);

        let totalSessions = 0;
        let tlsVersions = { 'TLS 1.3': 0, 'TLS 1.2': 0, 'TLS 1.1': 0, 'TLS 1.0': 0, 'Cleartext': 0 };
        let ciphers = {};
        let scores = [];
        let nistPass = true;
        let rfc8314Pass = true;
        let pqcReadiness = 0;
        let pqcCount = 0;
        let allSessionsList = [];
        let awaitingList = [];

        for (const c of successful) {
          const detail = await getCapture(c.id);
          const r = detail.report;
          if (!r) continue;

          if (r.overall_score !== undefined) scores.push(r.overall_score);

          for (const s of (r.sessions || [])) {
            totalSessions++;
            const key = `${c.id}-${s.tcp_stream}`;
            allSessionsList.push({ captureId: c.id, captureName: c.filename, ...s });

            // Build awaiting audit list from DB statuses
            const st = statusMap[key]?.status;
            if (st === 'AWAITING_AUDIT') {
              awaitingList.push({
                key,
                captureId:   c.id,
                captureFile: c.filename,
                stream:      s.tcp_stream,
                server:      s.server?.ip || s.server,
                protocol:    s.protocol,
                findings:    (s.findings || []).filter(f => ['critical','high'].includes(f.severity)),
                statusObj:   statusMap[key],
              });
            }

            if (!s.tls_version) {
              tlsVersions['Cleartext']++;
              if (s.role === 'submission_access') rfc8314Pass = false;
            } else {
              const v = `TLS ${s.tls_version}`;
              if (tlsVersions[v] !== undefined) tlsVersions[v]++;
              else tlsVersions[v] = 1;
              if (['1.0', '1.1'].includes(s.tls_version)) nistPass = false;
            }

            if (s.cipher_suite) {
              ciphers[s.cipher_suite] = (ciphers[s.cipher_suite] || 0) + 1;
              if (s.cipher_suite.includes('RC4') || s.cipher_suite.includes('DES')) nistPass = false;
            }

            if (s.kex && (s.kex.includes('Kyber') || s.kex.includes('ML-KEM') || s.kex.includes('X25519MLKEM'))) {
              pqcCount++;
            }
          }
        }

        const tlsData = Object.entries(tlsVersions)
          .filter(([_, count]) => count > 0)
          .map(([name, value]) => ({ name, value }));

        const cipherData = Object.entries(ciphers)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const pqcMetric = totalSessions > 0 ? Math.round((pqcCount / totalSessions) * 100) : 0;

        if (active) {
          setData({ tlsData, cipherData, avgScore, totalSessions, nistPass, rfc8314Pass, pqcMetric, allSessions: allSessionsList });
          setAwaitingAudit(awaitingList);
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const handleExport = () => {
    window.print();
  };

  const COLORS = ['#00FF41', '#00B8FF', '#FFB800', '#FF3333', '#888888'];

  if (loading) return <div className="py-20 flex justify-center"><Spinner label="Aggregating global compliance data..." /></div>;
  if (error) return <Notice tone="crit" title="Failed to load dashboard">{error}</Notice>;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Widget 4: Reporting Engine & Header */}
      <div className="bg-surface p-6 rounded-xl border border-line shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-[24px] font-display font-bold text-ink mb-1">Compliance Officer View</h2>
          <p className="text-ink-2 text-[14px]">Read-only overview of enterprise cryptographic posture across {data.totalSessions} aggregated sessions.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" className="bg-surface-2 border border-line rounded px-3 py-2 text-sm text-ink outline-none focus:border-accent" defaultValue="2026-09" />
          <button 
            onClick={handleExport}
            className="bg-accent text-surface px-5 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-accent/90 transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)] hover:shadow-[0_0_20px_rgba(0,255,65,0.4)]"
          >
            <Download size={16} /> Generate Audit Report
          </button>
        </div>
      </div>

      {/* Top Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
        <div className="bg-surface rounded-xl border border-line p-6 shadow-sm flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink-2 text-sm uppercase tracking-wider mb-2">Network Health Score</h3>
            <div className="text-5xl font-display font-bold text-ink">{data.avgScore}<span className="text-2xl text-ink-3">/100</span></div>
          </div>
          <div className={`w-24 h-24 rounded-full flex items-center justify-center border-[8px] ${data.avgScore >= 80 ? 'border-ok text-ok' : data.avgScore >= 50 ? 'border-warn text-warn' : 'border-crit text-crit'}`}>
            <Activity size={32} />
          </div>
        </div>
        
        <div className="bg-surface rounded-xl border border-line p-6 shadow-sm flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink-2 text-sm uppercase tracking-wider mb-2">PQC Readiness Metric</h3>
            <div className="text-5xl font-display font-bold text-ink">{data.pqcMetric}<span className="text-2xl text-ink-3">%</span></div>
            <p className="text-xs text-ink-3 mt-2">Sessions using ML-KEM/Kyber hybrid key exchange</p>
          </div>
          <div className="w-24 h-24 rounded-full flex items-center justify-center border-[8px] border-accent/20 text-accent">
            <Target size={32} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-10">
        {/* Widget 1: Global Cryptographic Posture */}
        <div className="bg-surface rounded-xl border border-line p-6 shadow-sm">
          <h3 className="font-bold text-ink mb-6 text-center flex items-center justify-center gap-2">
            <ShieldCheck className="text-accent" size={18}/> TLS Version Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.tlsData} innerRadius={70} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                  {data.tlsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-line)' }} itemStyle={{ color: 'var(--color-ink)' }} labelStyle={{ color: 'var(--color-ink)' }} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: 'var(--color-ink)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Widget 2: Top Vulnerable Ciphers */}
        <div className="bg-surface rounded-xl border border-line p-6 shadow-sm">
          <h3 className="font-bold text-ink mb-6 text-center text-sm uppercase tracking-wider">Top 5 Negotiated Cipher Suites</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.cipherData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-line)" />
                <XAxis type="number" stroke="var(--color-ink-3)" tick={{ fill: 'var(--color-ink-2)' }} />
                <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 10, fill: 'var(--color-ink-2)' }} />
                <Tooltip cursor={{ fill: 'var(--color-surface-2)' }} contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-line)' }} itemStyle={{ color: 'var(--color-ink)' }} labelStyle={{ color: 'var(--color-ink)' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.cipherData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Widget 3: Framework Compliance Tracker */}
        <div className="bg-surface rounded-xl border border-line p-6 shadow-sm lg:col-span-2">
          <h3 className="font-bold text-ink mb-6 text-sm uppercase tracking-wider">Federal Framework Compliance Tracker</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`flex items-start gap-3 p-4 border rounded-xl ${data.nistPass ? 'bg-ok/5 border-ok/20' : 'bg-crit/5 border-crit/20'}`}>
              {data.nistPass ? <CheckCircle className="text-ok mt-0.5 shrink-0" size={20} /> : <FileText className="text-crit mt-0.5 shrink-0" size={20} />}
              <div>
                <div className="text-sm font-bold text-ink">NIST SP 800-52r2</div>
                <div className="text-xs text-ink-2 mt-1 leading-relaxed">
                  {data.nistPass 
                    ? "Network complies with TLS 1.2+ enforcement and prohibits deprecated cipher suites (RC4, 3DES)."
                    : "Failed: Deprecated TLS versions (1.0/1.1) or prohibited cipher suites detected on active sessions."}
                </div>
              </div>
            </div>
            
            <div className={`flex items-start gap-3 p-4 border rounded-xl ${data.rfc8314Pass ? 'bg-ok/5 border-ok/20' : 'bg-warn/5 border-warn/20'}`}>
              {data.rfc8314Pass ? <CheckCircle className="text-ok mt-0.5 shrink-0" size={20} /> : <FileText className="text-warn mt-0.5 shrink-0" size={20} />}
              <div>
                <div className="text-sm font-bold text-ink">RFC 8314 (Cleartext Deprecation)</div>
                <div className="text-xs text-ink-2 mt-1 leading-relaxed">
                  {data.rfc8314Pass 
                    ? "All submission and access traffic utilizes Implicit TLS or STARTTLS upgrades."
                    : "Failed: Unencrypted cleartext sessions observed on implicit/submission ports."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comprehensive Audit Logs Table */}
      <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden mt-12">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink mb-1 flex items-center gap-2">
              <FileText size={18} className="text-accent" />
              Comprehensive Audit Logs
            </h3>
            <p className="text-sm text-ink-2">Detailed packet-wise drilldown for all observed sessions across the enterprise.</p>
          </div>
          <div className="text-sm text-ink-3 font-mono">{data.allSessions.length} total sessions</div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-line">
                <th className="py-3 px-4 text-xs font-bold text-ink-2 uppercase tracking-wider">Capture</th>
                <th className="py-3 px-4 text-xs font-bold text-ink-2 uppercase tracking-wider">Connection</th>
                <th className="py-3 px-4 text-xs font-bold text-ink-2 uppercase tracking-wider">Protocol</th>
                <th className="py-3 px-4 text-xs font-bold text-ink-2 uppercase tracking-wider">Encryption</th>
                <th className="py-3 px-4 text-xs font-bold text-ink-2 uppercase tracking-wider">Risk Grade</th>
                <th className="py-3 px-4 text-xs font-bold text-ink-2 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {data.allSessions.map((s, idx) => (
                <tr key={`${s.captureId}-${s.tcp_stream}-${idx}`} className="hover:bg-surface-2/50 transition-colors group">
                  <td className="py-3 px-4">
                    <div className="text-sm font-medium text-ink flex items-center gap-2">
                      {s.captureName}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm font-mono text-ink-2">{s.client?.ip}:{s.client?.port} &rarr;</div>
                    <div className="text-sm font-mono font-medium text-ink">{s.server?.ip}:{s.server?.port}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm text-ink uppercase">{s.protocol}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm font-medium text-ink">
                      {s.tls_version ? `TLS ${s.tls_version}` : <span className="text-crit">Cleartext</span>}
                    </div>
                    {s.cipher_suite && <div className="text-xs text-ink-3 mt-1 font-mono">{s.cipher_suite}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <GradeBadge grade={s.grade?.letter} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      to={`/report/${s.captureId}/sessions/${s.tcp_stream}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/10 text-accent font-medium text-sm hover:bg-accent/20 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Search size={14} /> Inspect Packets
                    </Link>
                  </td>
                </tr>
              ))}
              {data.allSessions.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-ink-3">No sessions recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Audit Verification Queue ─── */}
      <AuditVerificationQueue />
    </div>
  );
}

function AuditVerificationQueue() {
  const [items, setItems] = useState([]);
  const [captures, setCaptures] = useState([]);

  useEffect(() => {
    async function load() {
      const [capList, dbStatuses] = await Promise.all([
        listCaptures().catch(() => []),
        getAllFindingsStatuses().catch(() => []),
      ]);
      const adapted = capList
        .filter(c => c.status === 'COMPLETED')
        .map(adaptBackendCapture);
      setCaptures(adapted);

      const statusMap = {};
      dbStatuses.forEach(s => { statusMap[`${s.captureId}-${s.streamId}`] = s; });

      const awaiting = adapted.flatMap(cap =>
        (cap.sessions || [])
          .filter(s => statusMap[`${cap.id}-${s.tcp_stream}`]?.status === 'AWAITING_AUDIT')
          .map(s => ({
            key:         `${cap.id}-${s.tcp_stream}`,
            captureId:   cap.id,
            captureFile: cap.capture?.filename || 'Unknown',
            stream:      s.tcp_stream,
            server:      s.server?.ip || s.server,
            protocol:    s.protocol,
            findings:    (s.findings || []).filter(f => ['critical','high'].includes(f.severity)),
          }))
      );
      setItems(awaiting);
    }
    load();
  }, []);

  async function decide(inc, decision) {
    await updateFindingStatus(inc.captureId, inc.stream, decision);
    setItems(prev => prev.filter(i => i.key !== inc.key));
  }

  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-line flex items-center gap-2">
        <ClipboardCheck size={18} className="text-accent" />
        <h3 className="font-display font-semibold text-ink">Audit Verification Queue</h3>
        <span className="ml-auto text-xs bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full font-medium">
          {items.length} Pending
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center text-ink-3 text-sm">
          No incidents awaiting audit verification. Forensics team must submit reports first.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {items.map(inc => (
            <div key={inc.key} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">{inc.server} · {inc.protocol}</p>
                  <p className="text-xs text-ink-3">{inc.captureFile} · Stream #{inc.stream} · {inc.findings.length} finding(s)</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded border bg-accent/10 text-accent border-accent/30 font-medium">
                  Submitted by Forensics
                </span>
              </div>

              <div className="text-sm text-ink-2 space-y-1">
                {inc.findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`text-xs mt-0.5 px-1.5 py-0.5 rounded font-medium shrink-0 ${f.severity === 'critical' ? 'bg-crit/10 text-crit' : 'bg-warn/10 text-warn'}`}>
                      {f.severity?.toUpperCase()}
                    </span>
                    <span>{f.title || f.rule_id}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Link
                  to={`/report/${inc.captureId}/sessions/${inc.stream}`}
                  className="text-xs text-accent hover:underline"
                >
                  View Forensic Evidence
                </Link>
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => decide(inc, 'REJECTED')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-crit/30 text-crit text-sm font-medium hover:bg-crit/10 transition-colors"
                  >
                    <XCircle size={13} /> Reject — Return to IR
                  </button>
                  <button
                    onClick={() => decide(inc, 'VERIFIED')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ok text-surface text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    <CheckCircle size={13} /> Verify & Close Incident
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
