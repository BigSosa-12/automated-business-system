import type { Snapshot } from '../types';
import { Kpi, Panel, Pill, windowTone } from '../components/ui';
import { BarsSimple, C } from '../components/charts';
import { fmtClock, num } from '../format';

export function Outreach({ s }: { s: Snapshot }) {
  const o = s.outreach;
  const campaignRows = s.charts.campaignPerformance;
  return (
    <>
      <div className="grid kpis">
        <Kpi accent label="Sent today" value={num(o.sentToday)} unit={`/ ${o.dailyCap}`} progress={(o.sentToday ?? 0) / o.dailyCap} foot="Confirmed Gmail acceptance" />
        <Kpi label="This week / month" value={`${num(o.sentThisWeek)} / ${num(o.sentThisMonth)}`} foot="Mon–today · calendar month" />
        <Kpi label="Remaining capacity" value={num(o.remainingToday)} foot={o.capacityNote} />
        <Kpi label="Queued messages" value={num(o.queued.queueRows)} foot={`${num(o.queued.routeReady)} route-ready · ${num(o.queued.preparedSnapshots)} snapshots`} />
      </div>

      <Panel title="Dispatch timeline" meta="Eastern Time · 50 total per day across all windows">
        <div className="timeline">
          {o.windows.map((w) => (
            <div key={w.id} className="win">
              <h3>{w.label}<Pill tone={windowTone(w.state)}>{w.state}</Pill></h3>
              <dl>
                <dt>Scheduled</dt><dd>{fmtClock(w.scheduledAt)}</dd>
                <dt>Started</dt><dd>{w.startedAt ? fmtClock(w.startedAt) : '—'}</dd>
                <dt>Finished</dt><dd>{w.finishedAt ? fmtClock(w.finishedAt) : '—'}</dd>
                <dt>Sent</dt><dd>{num(w.sent)}</dd>
                <dt>Errors</dt><dd>{num(w.errors)}</dd>
                <dt>Run</dt><dd>{w.runId ?? '—'}</dd>
                <dt>Evidence</dt><dd>{w.evidence.replace(/_/g, ' ').toLowerCase()}</dd>
              </dl>
            </div>))}
        </div>
        <p className="note">A completed scheduled task does not count as a send. Only Gmail-accepted records in the send ledger do. Gmail acceptance is not proof of inbox delivery.</p>
      </Panel>

      <div className="grid cols-eq">
        <Panel title="Confirmed sends · 7 days" meta={`${num(o.sent7d)} total`}>
          <BarsSimple data={o.daily.slice(-7)} x="day" series={[{ key: 'count', name: 'Confirmed sends', color: C.lav }]} />
        </Panel>
        <Panel title="Campaign comparison" meta="Confirmed sends · ready inventory">
          <BarsSimple data={campaignRows} x="label" labelX series={[{ key: 'sent', name: 'Sent', color: C.lav }, { key: 'ready', name: 'Ready', color: C.lilac }]} />
        </Panel>
      </div>

      <div className="grid cols-eq">
        <Panel title="Safeguards">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <div className="tile"><div className="t-label">Suppressed contacts</div><div className="t-value">{num(o.suppressedContacts)}</div></div>
            <div className="tile"><div className="t-label">Failed attempts</div><div className="t-value">{num(o.failedAttempts)}</div></div>
            <div className="tile"><div className="t-label">Bounces</div><div className="t-value" style={{ fontSize: 14 }}>{o.bounces == null ? 'NOT TRACKED' : o.bounces}</div></div>
            <div className="tile"><div className="t-label">Duplicates prevented</div><div className="t-value" style={{ fontSize: 14 }}>{o.duplicatesPrevented == null ? 'NOT TRACKED' : o.duplicatesPrevented}</div></div>
            <div className="tile"><div className="t-label">Queue aging</div><div className="t-value" style={{ fontSize: 14 }}>{o.queued.agingHours == null ? 'NO QUEUE' : `${o.queued.agingHours}h`}</div></div>
            <div className="tile"><div className="t-label">By account</div><div className="t-value" style={{ fontSize: 14 }}>{o.byAccount.length ? o.byAccount.map((a) => `${a.account} ${a.count}`).join(' · ') : '—'}</div></div>
          </div>
        </Panel>
        <Panel title="Send data coverage"><Pill tone={o.coverage.status === 'FULL' ? 'good' : 'warn'}>{o.coverage.status}</Pill><p className="note" style={{ marginTop: 10 }}>{o.coverage.note}</p></Panel>
      </div>
    </>
  );
}
