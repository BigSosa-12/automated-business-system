import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ClipboardList, Cog, Cpu, LayoutDashboard, Mail, MessageSquareReply, RefreshCw, TriangleAlert } from 'lucide-react';
import type { EngineStatus, Health, Snapshot } from './types';
import { HealthBanner } from './components/shared';
import { Pill } from './components/ui';
import { Overview } from './pages/Overview';
import { Leads } from './pages/Leads';
import { Outreach } from './pages/Outreach';
import { Replies } from './pages/Replies';
import { Operations } from './pages/Operations';
import { Analytics } from './pages/Analytics';
import { Engine } from './pages/Engine';
import { ago, fmtTime } from './format';

const TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', Icon: ClipboardList },
  { id: 'outreach', label: 'Outreach', Icon: Mail },
  { id: 'replies', label: 'Replies', Icon: MessageSquareReply },
  { id: 'operations', label: 'Ops', Icon: Cog },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'engine', label: 'Engine', Icon: Cpu },
] as const;
type TabId = (typeof TABS)[number]['id'];
const readHash = (): TabId => (TABS.find((t) => t.id === location.hash.slice(1))?.id ?? 'overview');

export default function App() {
  const [tab, setTab] = useState<TabId>(readHash);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as Snapshot;
      if (j.schemaVersion !== 1) throw new Error('Unsupported snapshot version');
      setSnap(j); setErr(null);
      try { const er = await fetch(`${import.meta.env.BASE_URL}data/engine-status.json?t=${Date.now()}`, { cache: 'no-store' }); if (er.ok) { const ej = (await er.json()) as EngineStatus; if (ej.schemaVersion === 1) setEngine(ej); } } catch { /* engine view falls back to UNKNOWN */ }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); }
  }, []);

  useEffect(() => { void load(); const a = setInterval(() => void load(), 60_000); const b = setInterval(() => setNow(Date.now()), 30_000); return () => { clearInterval(a); clearInterval(b); }; }, [load]);
  useEffect(() => { const h = () => setTab(readHash()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  const go = (id: TabId) => { location.hash = id; window.scrollTo({ top: 0 }); };

  // A browser refresh is not a data sync: staleness is judged from the snapshot's own timestamp.
  const ageMin = snap ? (now - new Date(snap.generatedAt).getTime()) / 60000 : 0;
  const stale = !!snap && ageMin > snap.exporter.staleAfterMinutes;
  const effective: Health = snap ? (stale ? 'UNKNOWN' : snap.health.status) : 'UNKNOWN';

  return (
    <>
      <div className="atmos" aria-hidden />
      <nav className="nav" aria-label="Primary">
        <div className="logo" aria-hidden><LayoutDashboard size={20} /></div>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className="nav-btn" aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={19} aria-hidden /><span>{label}</span></button>))}
        <div className="nav-foot"><Pill tone={effective === 'HEALTHY' ? 'good' : effective === 'DEGRADED' ? 'warn' : effective === 'BLOCKED' ? 'bad' : 'mute'}>{({ HEALTHY: 'OK', DEGRADED: 'WARN', BLOCKED: 'BLOCK', UNKNOWN: '?' } as const)[effective]}</Pill></div>
      </nav>

      <div className="shell">
        <main className="main">
          <header className="topbar">
            <div><h1>Prospect Foundry</h1><div className="sub">Command Center · read-only monitoring</div></div>
            <div className="sync">
              {snap && <Pill tone={stale ? 'warn' : 'info'}><RefreshCw size={11} aria-hidden />Synced {ago(snap.generatedAt, now)}</Pill>}
              {snap && <span className="sub hide-m">{fmtTime(snap.generatedAt)}</span>}
            </div>
          </header>

          {err && !snap && <div className="banner bad"><div className="ico"><TriangleAlert /></div><div><div className="big">Snapshot unavailable</div><div>{err}. The exporter may not have published yet.</div></div></div>}
          {err && snap && <div className="stalebar"><TriangleAlert size={16} />Could not refresh ({err}). Showing last loaded data.</div>}
          {!snap && !err && <div className="glass panel"><div className="empty">Loading snapshot…</div></div>}

          {snap && (
            <>
              {stale && <div className="stalebar" role="alert"><TriangleAlert size={16} aria-hidden />STALE: last successful sync {ago(snap.generatedAt, now)}. Figures below may be out of date. The exporter on the laptop may be offline or failing to publish.</div>}
              <HealthBanner s={snap} stale={stale} effective={effective} />
              {tab === 'overview' && <Overview s={snap} now={now} effective={effective} />}
              {tab === 'leads' && <Leads s={snap} />}
              {tab === 'outreach' && <Outreach s={snap} />}
              {tab === 'replies' && <Replies s={snap} />}
              {tab === 'operations' && <Operations s={snap} now={now} />}
              {tab === 'analytics' && <Analytics s={snap} />}
              {tab === 'engine' && <Engine e={engine} now={now} />}
              <div className="pagefoot">Data as of {fmtTime(snap.sourceAsOf)} · schema v{snap.schemaVersion} · exporter {snap.exporter.version} · sanitized aggregates only</div>
            </>
          )}
        </main>
      </div>

      <nav className="tabbar" aria-label="Primary mobile">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={19} aria-hidden /><span>{label}</span></button>))}
      </nav>
    </>
  );
}
