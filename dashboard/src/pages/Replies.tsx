import type { Snapshot } from '../types';
import { Kpi, Panel, Pill } from '../components/ui';
import { pct } from '../format';

const CLASSES = ['POSITIVE', 'QUESTION', 'NOT_NOW', 'DECLINE', 'STOP', 'AUTO_REPLY', 'BOUNCE', 'UNKNOWN'];

export function Replies({ s }: { s: Snapshot }) {
  const r = s.replies;
  const na = (v: number | null) => (v == null ? undefined : String(v));
  return (
    <>
      <div className="grid kpis">
        <Kpi label="Reply rate" na={r.rates.reply == null ? 'NOT TRACKED' : undefined} value={pct(r.rates.reply)} foot="Genuine replies ÷ confirmed sends" />
        <Kpi label="Positive reply rate" na={r.rates.positive == null ? 'NOT TRACKED' : undefined} value={pct(r.rates.positive)} />
        <Kpi label="Conversion rate" na={r.rates.conversion == null ? 'NOT TRACKED' : undefined} value={pct(r.rates.conversion)} foot="Confirmed conversion events only" />
        <Kpi label="Revenue" na="NOT TRACKED" foot="Shown as not tracked, never $0" />
      </div>
      <Panel title="Reply coverage" meta={<Pill tone={r.coverage === 'UNKNOWN' ? 'warn' : 'good'}>{r.coverage}</Pill>}>
        <p className="note" style={{ marginTop: 0 }}>Incomplete reply coverage must not be read as “no replies”. Counts below stay unavailable until both Gmail accounts are authorized and scanned. Auto-replies and bounces never count as positive engagement.</p>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 12 }}>
          {CLASSES.map((c) => (
            <div key={c} className="tile"><div className="t-label">{c.replace('_', ' ')}</div><div className="t-value" style={r.counts[c] == null ? { fontSize: 13, color: 'var(--text-2)' } : undefined}>{na(r.counts[c]) ?? 'UNAVAILABLE'}</div></div>))}
        </div>
      </Panel>
      <div className="grid cols-eq">
        <Panel title="Needs attention" meta={`${r.needsAttention.length} item(s)`}>
          {r.needsAttention.length ? r.needsAttention.map((n, i) => <div key={i} className="alert WARNING"><Pill tone="warn">REVIEW</Pill><div><h3>Unread reply</h3><p>{n.note}</p></div></div>) : <div className="empty">No replies need attention.</div>}
        </Panel>
        <Panel title="Conversions"><div className="empty">Conversions are NOT TRACKED. A lead counts as converted only after a confirmed conversion event.</div></Panel>
      </div>
    </>
  );
}
