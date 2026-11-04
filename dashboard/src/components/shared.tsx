import { AlertTriangle, CheckCircle2, CircleHelp, ShieldAlert } from 'lucide-react';
import type { Alert, Health, Snapshot, Stage } from '../types';
import { Pill, healthTone, stageTone } from './ui';
import { ago, fmtTime, num } from '../format';

export const nowMs = () => Date.now();

export function HealthBanner({ s, stale, effective }: { s: Snapshot; stale: boolean; effective: Health }) {
  const tone = healthTone(effective);
  const Icon = effective === 'HEALTHY' ? CheckCircle2 : effective === 'BLOCKED' ? ShieldAlert : effective === 'DEGRADED' ? AlertTriangle : CircleHelp;
  return (
    <div className={`banner ${tone}`} role="status" aria-live="polite">
      <div className="ico"><Icon size={24} aria-hidden /></div>
      <div>
        <div className="big">{effective}{stale && <span style={{ fontSize: 13, fontWeight: 500 }}> · last known {s.health.status}</span>}</div>
        {s.health.reasons.length > 0 ? <ul>{s.health.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul> : <div style={{ color: '#D7D2E4', fontSize: 13 }}>All documented checks pass.</div>}
      </div>
      <div className="right"><Pill tone="mute">{s.health.checks.filter((c) => c.state === 'OK').length}/{s.health.checks.length} checks OK</Pill></div>
    </div>
  );
}

export function AlertList({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const list = limit ? alerts.slice(0, limit) : alerts;
  if (!list.length) return <div className="empty">No active alerts.</div>;
  return (
    <div className="alerts">
      {list.map((a) => (
        <div key={a.id} className={`alert ${a.severity}`}>
          <Pill tone={a.severity === 'CRITICAL' ? 'bad' : a.severity === 'WARNING' ? 'warn' : 'info'}>{a.severity}</Pill>
          <div>
            <h3>{a.title}</h3>
            <p>{a.detail}</p>
            <div className="when">First {fmtTime(a.firstDetected)} · last {ago(a.lastDetected)} · {a.state}</div>
          </div>
        </div>
      ))}
      {limit && alerts.length > limit && <div className="note">+{alerts.length - limit} more on Operations</div>}
    </div>
  );
}

export function PipelinePulse({ stages }: { stages: Stage[] }) {
  return (
    <div className="pulse" aria-label="Pipeline stages">
      {stages.map((st) => {
        const t = stageTone(st.status);
        return (
          <div key={st.id} className="stage" title={st.note ?? undefined}>
            <div className="s-name">{st.label}</div>
            <div className="s-val">{num(st.items)}</div>
            <div className="s-st"><span className={`dot ${t}`} aria-hidden />{st.status}</div>
          </div>
        );
      })}
    </div>
  );
}
