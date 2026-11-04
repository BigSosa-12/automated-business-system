import { useState } from 'react';
import type { FunnelStage, Snapshot } from '../types';
import { Panel } from '../components/ui';
import { AreaTrend, BarsSimple, C } from '../components/charts';
import { num } from '../format';

export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((x) => x.count ?? 0));
  return (
    <div className="funnel">
      {stages.map((st) => (
        <div key={st.id} className="f-row" title={st.note}>
          <span>{st.label}</span>
          <div className="track"><b style={{ width: `${st.count == null ? 0 : Math.max(1.5, (st.count / max) * 100)}%` }} /></div>
          <span className={`v ${st.count == null ? 'na' : ''}`}>{st.count == null ? 'NOT TRACKED' : num(st.count)}</span>
        </div>))}
    </div>
  );
}

const RANGES = [['7D', 7], ['30D', 30], ['90D', 90], ['ALL', 9999]] as const;

export function Analytics({ s }: { s: Snapshot }) {
  const [range, setRange] = useState<number>(30);
  const cut = <T,>(a: T[]) => a.slice(-range);
  const hasConv = s.charts.conversionTrend.length > 0;
  return (
    <>
      <div className="rng" role="group" aria-label="Date range">
        {RANGES.map(([l, n]) => <button key={l} className="chip" aria-pressed={range === n} onClick={() => setRange(n)}>{l}</button>)}
      </div>
      <div className="grid cols-eq">
        <Panel title="Lead growth" meta={`New identities per day · history from ${s.charts.leadGrowth[0]?.day ?? '—'}`}>
          <BarsSimple data={cut(s.charts.leadGrowth)} x="day" series={[{ key: 'new', name: 'New businesses', color: C.lav }]} />
        </Panel>
        <Panel title="Lead funnel" meta="Not strict subsets"><Funnel stages={s.leads.funnel} /></Panel>
      </div>
      <div className="grid cols-eq">
        <Panel title="Email activity" meta={`Confirmed sends · ${s.outreach.coverage.status.toLowerCase()} coverage`}>
          <AreaTrend data={cut(s.charts.emailActivity)} x="day" y="count" name="Confirmed sends" />
        </Panel>
        <Panel title="Campaign performance" meta="Replies, positives and conversions not tracked yet">
          <BarsSimple data={s.charts.campaignPerformance} x="label" labelX series={[{ key: 'sent', name: 'Sent', color: C.lav }, { key: 'ready', name: 'Ready', color: C.lilac }]} />
        </Panel>
      </div>
      <div className="grid cols-eq">
        <Panel title="Queue health" meta="Route-ready vs blocked">
          <BarsSimple data={s.charts.queueHealth} x="label" labelX stacked series={[{ key: 'ready', name: 'Ready', color: C.lav }, { key: 'blocked', name: 'Blocked', color: C.mute }]} />
        </Panel>
        <Panel title="Operational reliability" meta={`History begins ${s.history.startsOn}`}>
          <BarsSimple data={cut(s.charts.reliability)} x="day" stacked series={[{ key: 'completed', name: 'Completed', color: C.good }, { key: 'blocked', name: 'Blocked', color: C.bad }, { key: 'failed', name: 'Failed/missed', color: C.warn }, { key: 'unknown', name: 'Unknown', color: C.mute }]} />
        </Panel>
      </div>
      <Panel title="Conversion trend" meta="Positive replies and confirmed conversions">
        {hasConv ? null : <div className="empty">No data yet. Reply coverage is incomplete and no conversion events are recorded. History begins {s.history.startsOn}.</div>}
      </Panel>
    </>
  );
}
