import type { ReactNode } from 'react';
import type { CheckState, Health, StageStatus, WindowState } from '../types';

export function Panel({ title, meta, children, className = '' }: { title?: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass panel ${className}`}>
      {title && (
        <div className="panel-h">
          <h2>{title}</h2>
          {meta != null && <span className="meta">{meta}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = 'good' | 'warn' | 'bad' | 'info' | 'mute';
export const Pill = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <span className={`pill ${tone}`}><i aria-hidden />{children}</span>
);

export const healthTone = (h: Health): Tone => (h === 'HEALTHY' ? 'good' : h === 'DEGRADED' ? 'warn' : h === 'BLOCKED' ? 'bad' : 'mute');
export const checkTone = (s: CheckState): Tone => (s === 'OK' ? 'good' : s === 'WARN' ? 'warn' : s === 'FAIL' ? 'bad' : 'mute');
export const stageTone = (s: StageStatus): Tone => (s === 'OK' ? 'good' : s === 'DEGRADED' || s === 'STALE' ? 'warn' : s === 'FAILED' || s === 'BLOCKED' ? 'bad' : 'mute');
export const windowTone = (s: WindowState): Tone =>
  s === 'COMPLETED' ? 'good' : s === 'RUNNING' ? 'info' : s === 'SCHEDULED' ? 'mute' : s === 'UNKNOWN' ? 'mute' : s === 'SKIPPED' ? 'warn' : 'bad';
export const invTone = (s: string | null): Tone => (s === 'CRITICAL' ? 'bad' : s === 'LOW' ? 'warn' : s === 'HEALTHY' || s === 'SURPLUS' ? 'good' : 'mute');

export function Kpi({ label, icon, value, unit, foot, na, accent, progress }: {
  label: string; icon?: ReactNode; value?: ReactNode; unit?: ReactNode; foot?: ReactNode; na?: string; accent?: boolean; progress?: number;
}) {
  return (
    <div className={`glass lift kpi ${accent ? 'accent' : ''}`}>
      <div className="label">{icon}{label}</div>
      <div>
        {na ? <div className="na">{na}</div> : <div className="value">{value}{unit != null && <small> {unit}</small>}</div>}
        {progress != null && <div className="bar" aria-hidden><b style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></div>}
      </div>
      <div className="foot">{foot}</div>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

// Recharts tooltip content (opaque, readable).
export function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <b>{label}</b>
      {payload.map((p, i) => <div key={i}>{p.name}: {p.value != null ? (fmt ? fmt(p.value) : p.value.toLocaleString('en-US')) : '—'}</div>)}
    </div>
  );
}
