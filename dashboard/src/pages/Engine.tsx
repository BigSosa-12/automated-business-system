import { useState } from 'react';
import { AlertOctagon, CheckCircle2, CircleHelp, Cpu, Hourglass, ShieldAlert, Timer, TriangleAlert, X } from 'lucide-react';
import type { EngineIndicator, EngineStatus, IndicatorState } from '../types';
import { engineView } from '../engineState';
import type { EngineView } from '../engineState';
import { Panel, Pill } from '../components/ui';
import { ago, fmtTime, num, until } from '../format';

const ANGLE: Record<string, number> = { DISCOVERY: -150, CLASSIFICATION: 180, VERIFICATION: 150, QUEUE_PREPARATION: -30, GMAIL_DISPATCH: 0, REPLY_PROCESSING: 30 };
const LEFT = ['DISCOVERY', 'CLASSIFICATION', 'VERIFICATION'];
const RIGHT = ['QUEUE_PREPARATION', 'GMAIL_DISPATCH', 'REPLY_PROCESSING'];
const pol = (deg: number, r: number) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
const tone = (s: IndicatorState) => (s === 'OK' || s === 'ACTIVE' ? 'good' : s === 'WARN' || s === 'SLOW' ? 'warn' : s === 'BLOCKED' || s === 'FAILED' ? 'bad' : 'mute');
const STATE_WORD: Record<IndicatorState, string> = { OK: 'OK', ACTIVE: 'ACTIVE', SLOW: 'SLOW', WARN: 'WARNING', BLOCKED: 'BLOCKED', FAILED: 'FAILED', UNKNOWN: 'UNKNOWN' };

function Core({ view, ind, active }: { view: EngineView; ind: EngineIndicator[]; active: string[] }) {
  const col = view.state === 'BLOCKED' ? 'var(--bad)' : view.amber ? 'var(--warn)' : view.state === 'UNKNOWN' ? 'var(--text-2)' : 'var(--lavender)';
  return (
    <svg className="core" data-spin={view.spin} data-state={view.state} viewBox="-300 -300 600 600" role="img"
      aria-label={`Engine core: ${view.label}. ${view.stopped ? 'Rings stopped.' : 'Rings turning.'}`}>
      <defs>
        <radialGradient id="reactor"><stop offset="0%" stopColor="#fff" stopOpacity=".95" /><stop offset="35%" stopColor={col} stopOpacity=".9" /><stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" /></radialGradient>
        <radialGradient id="halo"><stop offset="55%" stopColor="#8B5CF6" stopOpacity="0" /><stop offset="100%" stopColor={col} stopOpacity=".22" /></radialGradient>
        <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#E9D5FF" /><stop offset="55%" stopColor={col} /><stop offset="100%" stopColor="#8B5CF6" /></linearGradient>
      </defs>
      <circle r="282" fill="url(#halo)" />
      <g className="ring r1"><circle r="250" fill="none" stroke="url(#ringg)" strokeWidth="18" strokeDasharray="40 14" opacity=".8" /></g>
      <circle r="268" fill="none" stroke={col} strokeOpacity=".16" strokeWidth="1" />
      <g className="ring r2"><circle r="196" fill="none" stroke="url(#ringg)" strokeWidth="14" strokeDasharray="26 11" opacity=".75" /></g>
      <g className="ring r3"><circle r="142" fill="none" stroke="url(#ringg)" strokeWidth="10" strokeDasharray="15 9" opacity=".7" /></g>
      <circle r="108" fill="none" stroke={col} strokeOpacity=".2" strokeWidth="1" />
      {ind.map((i) => {
        const a = ANGLE[i.id]; const [x1, y1] = pol(a, 86); const [x2, y2] = pol(a, 268); const on = active.includes(i.id);
        return (
          <g key={i.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeOpacity={on ? 0.95 : 0.22} strokeWidth={on ? 2.5 : 1.2} className={on ? 'flow' : ''} strokeDasharray={on ? '7 9' : undefined} />
            <circle cx={x2} cy={y2} r="6" fill="#09090F" stroke={i.state === 'BLOCKED' || i.state === 'FAILED' ? 'var(--bad)' : i.state === 'WARN' || i.state === 'SLOW' ? 'var(--warn)' : col} strokeWidth="2" />
            {(i.state === 'BLOCKED' || i.state === 'FAILED') && <path d={`M${x2 - 3.5} ${y2 - 3.5}l7 7M${x2 + 3.5} ${y2 - 3.5}l-7 7`} stroke="var(--bad)" strokeWidth="1.6" />}
          </g>
        );
      })}
      <circle className="reactor" r="82" fill="url(#reactor)" />
      <circle r="30" fill="#fff" fillOpacity={view.stopped ? 0.35 : 0.8} />
    </svg>
  );
}

function IndicatorCard({ i, selected, onSelect, now }: { i: EngineIndicator; selected: boolean; onSelect: () => void; now: number }) {
  return (
    <button className={`glass lift ind ${i.state}`} aria-expanded={selected} onClick={onSelect}>
      <span className="ind-h"><span>{i.label}</span><Pill tone={tone(i.state)}>{STATE_WORD[i.state]}</Pill></span>
      <span className="ind-r">{i.reason}</span>
      <span className="ind-m"><span>Last OK {i.lastSuccess ? ago(i.lastSuccess, now) : '—'}</span><span>Errors {num(i.errors)}</span></span>
      {i.activity && <span className="ind-a">▶ {i.activity}</span>}
    </button>
  );
}

export function Engine({ e, now }: { e: EngineStatus | null; now: number }) {
  const [sel, setSel] = useState<string | null>(null);
  const v = engineView(e, now);
  if (!e) return <Panel title="Engine"><div className="empty">Engine telemetry is not available yet. Nothing is assumed healthy.</div></Panel>;
  const selected = e.indicators.find((i) => i.id === sel) ?? null;
  const top = e.diagnostics[0];
  const Icon = v.state === 'BLOCKED' ? ShieldAlert : v.state === 'STALE' ? Hourglass : v.state === 'UNKNOWN' ? CircleHelp : v.state === 'SLOW' ? Timer : v.state === 'PROCESSING' ? Cpu : e.caution ? TriangleAlert : CheckCircle2;
  const bannerTone = v.state === 'BLOCKED' ? 'bad' : v.state === 'STALE' || v.state === 'SLOW' || (v.state === 'IDLE' && e.caution) ? 'warn' : v.state === 'UNKNOWN' ? 'mute' : 'good';
  const by = (ids: string[]) => ids.map((id) => e.indicators.find((i) => i.id === id)!).filter(Boolean);
  const card = (i: EngineIndicator) => <IndicatorCard key={i.id} i={i} selected={sel === i.id} now={now} onSelect={() => setSel(sel === i.id ? null : i.id)} />;
  return (
    <>
      <div className={`banner engine-banner ${bannerTone}`} role={v.stopped ? 'alert' : 'status'}>
        <div className="ico"><Icon size={26} aria-hidden /></div>
        <div>
          <div className="big">ENGINE · {v.label}{v.stopped ? ' · ROTATION STOPPED' : ''}</div>
          <div style={{ color: '#E4E0EE', fontSize: 13.5 }}>{v.detail}</div>
          {v.state === 'STALE' && <div style={{ color: '#E4E0EE', fontSize: 13 }}>Last confirmed update {fmtTime(v.lastConfirmed)} · data age {Math.round(v.ageMin ?? 0)} min (limit {e.thresholds.snapshotStaleMin} min)</div>}
          {v.state === 'BLOCKED' && top && <div style={{ color: '#E4E0EE', fontSize: 13 }}>Affected stage: {e.indicators.find((i) => i.id === top.stage)?.label ?? 'multiple'} · evidence: {top.evidence[0]}</div>}
          {e.process && v.spin !== 'stopped' && <div style={{ color: '#E4E0EE', fontSize: 13 }}>Job {e.process.jobId} · stage {e.indicators.find((i) => i.id === e.process?.stage)?.label} · running at least {Math.round((e.process.elapsedSecAtLeast ?? 0) / 60)} min · items processed: not reported</div>}
        </div>
        <div className="right"><Pill tone="mute">Data {Math.round(v.ageMin ?? 0)}m old</Pill></div>
      </div>

      <div className="engine-stage">
        <div className="ind-col">{by(LEFT).map(card)}</div>
        <div className="core-wrap">
          <Core view={v} ind={e.indicators} active={v.spin === 'stopped' ? [] : e.activePathways} />
          <div className="core-label"><b>{v.label}</b><span>{v.spin === 'stopped' ? 'stationary' : v.spin === 'fast' ? 'processing' : v.spin === 'slow' ? 'reduced speed' : 'idle rotation'}</span></div>
        </div>
        <div className="ind-col">{by(RIGHT).map(card)}</div>
      </div>

      <div className="grid cols-4 metrics">
        <div className="glass tile-g"><div className="t-label">READY (handoff-eligible)</div><div className="t-value">{num(e.metrics.ready)}</div></div>
        <div className="glass tile-g"><div className="t-label">Sent today</div><div className="t-value">{num(e.metrics.sentToday)} / {e.metrics.dailyCap}</div></div>
        <div className="glass tile-g"><div className="t-label">Next dispatch</div><div className="t-value">{e.heartbeats.dispatch.next ? until(e.heartbeats.dispatch.next.at, now) : '—'}</div></div>
        <div className="glass tile-g"><div className="t-label">Prepared send snapshot</div><div className="t-value">{e.metrics.preparedSnapshots ? 'Ready' : 'None'}</div></div>
      </div>

      {selected && (
        <Panel title={`${selected.label} · detail`} meta={<button className="chip" onClick={() => setSel(null)} aria-label="Close detail"><X size={12} /> Close</button>}>
          <div className="grid cols-eq">
            <div>
              <div className="tile"><div className="t-label">State</div><div className="t-value" style={{ fontSize: 16 }}><Pill tone={tone(selected.state)}>{STATE_WORD[selected.state]}</Pill></div></div>
              <p className="note"><b>Latest verified issue:</b> {selected.detail.latestIssue ?? 'None'}</p>
              <p className="note">Last success {fmtTime(selected.lastSuccess)} · errors {num(selected.errors)} · items {num(selected.items)}</p>
              <p className="note">Last step duration {selected.detail.durationSec != null ? `${Math.round(selected.detail.durationSec)}s` : 'not recorded'} · baseline median {selected.detail.baselineMedianSec != null ? `${Math.round(selected.detail.baselineMedianSec)}s` : 'not enough samples'}</p>
            </div>
            <div className="tbl-wrap"><table><thead><tr><th>Recent events</th><th>Result</th></tr></thead>
              <tbody>{selected.detail.recent.length ? selected.detail.recent.map((r, k) => <tr key={k}><td>{r.text}<div className="t-label">{fmtTime(r.at)}</div></td><td>{r.ok ? 'OK' : 'ISSUE'}</td></tr>) : <tr><td colSpan={2}>No events recorded.</td></tr>}</tbody></table></div>
          </div>
        </Panel>
      )}

      <div className="grid cols-3">
        <Panel title="Exporter heartbeat" meta="Is monitoring updating?">
          <div className="tile"><div className="t-label">Last export</div><div className="t-value">{ago(e.heartbeats.exporter.lastSuccessAt, now)}</div><div className="t-label">Limit {e.heartbeats.exporter.staleAfterMin} min · {e.heartbeats.exporter.lastError ? 'last publish problem recorded' : 'no publish problem recorded'}</div></div>
          <p className="note">{e.heartbeats.exporter.note}. A fresh snapshot does not prove Gmail dispatch is healthy.</p>
        </Panel>
        <Panel title="Pipeline heartbeat" meta="Is work running or complete?">
          <div className="tile"><div className="t-label">State</div><div className="t-value" style={{ fontSize: 16 }}>{e.heartbeats.pipeline.state.replace(/_/g, ' ')}</div><div className="t-label">Last preparation {ago(e.heartbeats.pipeline.lastPreparationAt, now)} · lock {e.heartbeats.pipeline.lock.toLowerCase()}</div></div>
          <p className="note">“Idle” is normal between scheduled runs and is never treated as stale.</p>
        </Panel>
        <Panel title="Dispatch health" meta="Windows and safety gates">
          <div className="tile"><div className="t-label">Gates</div><div className="t-value" style={{ fontSize: 16 }}><Pill tone={e.heartbeats.dispatch.state === 'GATES_OK' ? 'good' : 'bad'}>{e.heartbeats.dispatch.state.replace(/_/g, ' ')}</Pill></div>
            <div className="t-label">Gmail auth {e.heartbeats.dispatch.gates.gmailAuthorization} · safety audit {e.heartbeats.dispatch.gates.safetyAudit} · cap {e.heartbeats.dispatch.gates.dailyCap}/day</div></div>
          <div className="t-label" style={{ marginTop: 8 }}>{e.heartbeats.dispatch.windows.map((w) => `${w.label.replace(' Dispatch', '')}: ${w.state}`).join(' · ')}</div>
        </Panel>
      </div>

      <Panel title="Engine diagnostics" meta="Deterministic rules, highest priority first">
        {e.diagnostics.length === 0 ? <div className="empty">No rule is currently triggered.</div> : (
          <div className="alerts">
            {e.diagnostics.map((d, k) => (
              <div key={d.id} className={`alert ${d.severity}`}>
                <Pill tone={d.severity === 'CRITICAL' ? 'bad' : d.severity === 'WARNING' ? 'warn' : 'info'}>{k === 0 ? 'PRIMARY · ' : ''}{d.severity}</Pill>
                <div><h3>{d.title}</h3>{d.evidence.map((x, j) => <p key={j}>{x}</p>)}<div className="when">Stage: {e.indicators.find((i) => i.id === d.stage)?.label ?? 'system'} · rule {d.id}</div></div>
              </div>))}
          </div>)}
        <p className="note"><AlertOctagon size={12} style={{ verticalAlign: '-2px' }} /> Read-only: this page cannot start, stop, retry or change anything. Every state above comes from a named file or table.</p>
      </Panel>
    </>
  );
}
