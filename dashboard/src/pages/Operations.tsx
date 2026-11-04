import type { Snapshot } from '../types';
import { Panel, Pill, checkTone, stageTone } from '../components/ui';
import { AlertList } from '../components/shared';
import { ago, fmtTime, num } from '../format';

export function Operations({ s, now }: { s: Snapshot; now: number }) {
  return (
    <>
      <Panel title="Health checks" meta={s.health.rule}>
        <div className="tbl-wrap"><table><thead><tr><th>Check</th><th>State</th><th>Detail</th></tr></thead>
          <tbody>{s.health.checks.map((c) => <tr key={c.id}><td>{c.label}</td><td><Pill tone={checkTone(c.state)}>{c.state}</Pill></td><td>{c.detail}</td></tr>)}</tbody></table></div>
      </Panel>
      <Panel title="Pipeline stages" meta="Duration is not recorded by the production scripts">
        <div className="tbl-wrap"><table><thead><tr><th>Stage</th><th>Status</th><th>Last run</th><th className="r">Items</th><th className="r">Errors</th><th className="hide-m">Note</th></tr></thead>
          <tbody>{s.pipeline.map((p) => <tr key={p.id}><td>{p.label}</td><td><Pill tone={stageTone(p.status)}>{p.status}</Pill></td><td>{p.lastRun ? `${ago(p.lastRun, now)} · ${fmtTime(p.lastRun)}` : '—'}</td><td className="r">{num(p.items)}</td><td className="r">{num(p.errors)}</td><td className="hide-m">{p.note ?? ''}</td></tr>)}</tbody></table></div>
      </Panel>
      <div className="grid cols-eq">
        <Panel title="Scheduled tasks" meta={s.schedulerEvidence.available ? 'From Windows Task Scheduler' : 'Definitions only: run results unavailable'}>
          <div className="tbl-wrap"><table><thead><tr><th>Task</th><th>Mode</th><th>Times</th>{s.schedulerEvidence.available && <th>Last result</th>}</tr></thead>
            <tbody>{s.schedules.map((t) => <tr key={t.name}><td>{t.name.replace('BattleCreek_Prospect_Foundry_', '')}</td><td>{t.mode ?? '—'}</td><td>{t.times.join(', ')}</td>{s.schedulerEvidence.available && <td>{t.lastResult ?? '—'}</td>}</tr>)}</tbody></table></div>
          <p className="note">9:00 preparation finishes by 9:25. Dispatch-only windows at 9:30 AM, 1:00 PM and 4:00 PM ET. The dashboard is read-only and never restarts a task or clears a lock.</p>
        </Panel>
        <Panel title="Locks & data quality">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <div className="tile"><div className="t-label">Execution lock</div><div className="t-value" style={{ fontSize: 15 }}>{s.locks.production}</div></div>
            <div className="tile"><div className="t-label">Protected window</div><div className="t-value" style={{ fontSize: 15 }}>{s.locks.protectedWindowNow ? 'ACTIVE' : 'No'}</div></div>
          </div>
          <div className="tbl-wrap" style={{ marginTop: 10 }}><table><tbody>
            {Object.entries(s.dataQuality.availability).map(([k, v]) => <tr key={k}><td>{k}</td><td><Pill tone={v.state === 'AVAILABLE' ? 'good' : v.state === 'PARTIAL' ? 'warn' : 'mute'}>{v.state.replace('_', ' ')}</Pill></td><td className="hide-m">{v.note}</td></tr>)}
            {s.dataQuality.crossChecks.map((c) => <tr key={c.id}><td>{c.id.replace(/_/g, ' ')}</td><td><Pill tone={c.ok ? 'good' : 'warn'}>{c.ok ? 'MATCH' : 'DIFFERS'}</Pill></td><td className="hide-m">{c.detail}</td></tr>)}
          </tbody></table></div>
        </Panel>
      </div>
      <Panel title="All alerts" meta={`${s.alerts.length} active · deduplicated`}><AlertList alerts={s.alerts} /></Panel>
    </>
  );
}
