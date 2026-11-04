import { useMemo, useState } from 'react';
import type { Snapshot } from '../types';
import { Kpi, Panel, Pill, invTone } from '../components/ui';
import { num } from '../format';
import { Funnel } from './Analytics';

export function Leads({ s }: { s: Snapshot }) {
  const [camp, setCamp] = useState<string>('ALL');
  const rows = useMemo(() => s.leads.byCampaign.filter((c) => camp === 'ALL' || c.id === camp), [s, camp]);
  const q = s.leads.byQualification;
  return (
    <>
      <div className="grid kpis">
        <Kpi label="Total businesses" value={num(s.leads.total)} />
        <Kpi label="Qualified" value={num(q?.QUALIFIED)} foot="Fit confirmed, route still needed" />
        <Kpi label="Route-ready (READY)" value={num(q?.READY)} foot={`${num(s.leads.readyByRoute?.EMAIL)} email · ${num(s.leads.readyByRoute?.FORM)} form`} />
        <Kpi label="Unresolved / suppressed" value={num(q?.UNRESOLVED)} foot={`${num(q?.SUPPRESSED)} suppressed · ${num(s.leads.potentialDuplicates)} possible duplicates`} />
      </div>
      <Panel title="Campaigns" meta="One primary campaign per business">
        <div className="rng" role="group" aria-label="Filter campaign" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {[{ id: 'ALL', label: 'All' }, ...s.leads.byCampaign].map((c) => (
            <button key={c.id} className="chip" aria-pressed={camp === c.id} onClick={() => setCamp(c.id)}>{c.label}</button>))}
        </div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Campaign</th><th className="r">Total</th><th className="r">Qualified</th><th className="r">Ready</th><th className="r hide-m">Email</th><th className="r hide-m">Form</th><th className="r hide-m">Unresolved</th><th>Inventory</th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}><td>{c.label}</td><td className="r">{num(c.total)}</td><td className="r">{num(c.qualified)}</td><td className="r">{num(c.ready)}</td>
              <td className="r hide-m">{num(c.readyEmail)}</td><td className="r hide-m">{num(c.readyForm)}</td><td className="r hide-m">{num(c.unresolved)}</td>
              <td>{c.inventoryState ? <Pill tone={invTone(c.inventoryState)}>{c.inventoryState}{c.target ? ` · target ${c.target}` : ''}</Pill> : <Pill tone="mute">NEEDS EVIDENCE</Pill>}</td></tr>))}</tbody>
        </table></div>
        <p className="note">Inventory bands use EMAIL-ready count: CRITICAL under 150, LOW 150–299, HEALTHY 300–449, SURPLUS 450+. READY means handoff-eligible, not safe to email: final send-time checks still apply.</p>
      </Panel>
      <div className="grid cols-eq">
        <Panel title="Lead funnel" meta="Stages are not strict subsets"><Funnel stages={s.leads.funnel} /></Panel>
        <Panel title="Why leads are blocked" meta={`${num(s.leads.routeQueue?.blocked)} blocked routes`}>
          {s.leads.blockedReasons.length ? <div className="tbl-wrap"><table><tbody>{s.leads.blockedReasons.map((r) => <tr key={r.reason}><td>{r.reason}</td><td className="r">{num(r.n)}</td></tr>)}</tbody></table></div> : <div className="empty">No blocked routes.</div>}
          <p className="note">Individual business records stay on your computer. Open the local lead explorer to search names, contacts and history.</p>
        </Panel>
      </div>
    </>
  );
}
