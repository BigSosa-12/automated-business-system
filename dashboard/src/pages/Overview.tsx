import { Activity, Gauge, Inbox, Layers, MailCheck, MessageSquareReply, ShieldCheck, Sparkles } from 'lucide-react';
import type { Snapshot } from '../types';
import { Kpi, Panel, Pill, healthTone, invTone } from '../components/ui';
import { AlertList, PipelinePulse } from '../components/shared';
import { ago, fmtTime, num, until } from '../format';

export function Overview({ s, now, effective }: { s: Snapshot; now: number; effective: Snapshot['health']['status'] }) {
  const { leads, outreach, replies } = s;
  const gmail = s.health.checks.find((c) => c.id === 'gmail_authorization');
  const nextWin = outreach.windows.find((w) => w.scheduledAt && new Date(w.scheduledAt).getTime() > now)?.scheduledAt ?? outreach.nextDispatchAt;
  const prepAge = outreach.lastPreparation?.at ? ago(outreach.lastPreparation.at, now) : '—';
  const verified = s.leads.funnel.find((f) => f.id === 'VERIFIED_READY')?.count ?? null;
  return (
    <>
      <div className="grid kpis">
        <Kpi accent label="Emails sent today" icon={<MailCheck size={14} />} value={num(outreach.sentToday)} unit={`/ ${outreach.dailyCap}`}
          progress={(outreach.sentToday ?? 0) / outreach.dailyCap} foot={outreach.coverage.status === 'PARTIAL' ? 'Gmail confirmation partial' : 'Gmail-confirmed'} />
        <Kpi label="Verified send-ready" icon={<ShieldCheck size={14} />} value={num(verified)} foot="Mailbox + identity verified" />
        <Kpi label="Positive opportunities" icon={<Sparkles size={14} />} na={replies.counts.POSITIVE == null ? 'NOT TRACKED' : undefined} value={num(replies.counts.POSITIVE)} foot={`Reply coverage ${replies.coverage.toLowerCase()}`} />
        <Kpi label="Remaining capacity" icon={<Gauge size={14} />} value={num(outreach.remainingToday)} unit="today" foot={outreach.capacityNote} />
        <Kpi label="Total businesses" icon={<Layers size={14} />} value={num(leads.total)} foot={`${num(leads.classified)} classified`} />
        <Kpi label="Qualified leads" icon={<Activity size={14} />} value={num(leads.byQualification ? leads.byQualification.QUALIFIED + leads.byQualification.READY : null)} foot={`${num(leads.byQualification?.READY)} READY (handoff eligible)`} />
        <Kpi label="Needs review" icon={<Inbox size={14} />} value={num(leads.byQualification?.UNRESOLVED)} foot={`${num(leads.unassigned)} unassigned`} />
        <Kpi label="Replies received" icon={<MessageSquareReply size={14} />} na={replies.counts.UNKNOWN == null && replies.coverage === 'UNKNOWN' ? 'NOT TRACKED' : undefined} value="0" foot={replies.pendingUnreadable ? `${replies.pendingUnreadable} unreadable, review manually` : '—'} />
      </div>

      <div className="grid cols-3">
        <Panel title="Dispatch" meta={`Cap ${outreach.dailyCap}/day total`}>
          <div className="grid" style={{ gap: 10 }}>
            <div className="tile"><div className="t-label">Next dispatch</div><div className="t-value">{until(nextWin, now)}</div><div className="t-label">{fmtTime(nextWin)}</div></div>
            <div className="tile"><div className="t-label">Last dispatch</div><div className="t-value">{outreach.lastDispatch ? ago(outreach.lastDispatch.at, now) : 'None recorded'}</div>
              <div className="t-label">{outreach.lastDispatch ? <Pill tone={outreach.lastDispatch.state === 'COMPLETED' ? 'good' : 'bad'}>{outreach.lastDispatch.state}</Pill> : '—'}</div></div>
          </div>
        </Panel>
        <Panel title="Preparation & queue">
          <div className="grid" style={{ gap: 10 }}>
            <div className="tile"><div className="t-label">Last successful preparation</div><div className="t-value">{prepAge}</div><div className="t-label">{fmtTime(outreach.lastPreparation?.at)} · {num(outreach.lastPreparation?.rows)} rows</div></div>
            <div className="tile"><div className="t-label">Prepared send snapshot</div><div className="t-value">{outreach.queued.preparedSnapshots ? 'Ready' : 'None'}</div><div className="t-label">{num(outreach.queued.queueRows)} queued messages</div></div>
          </div>
        </Panel>
        <Panel title="Connection & sync">
          <div className="grid" style={{ gap: 10 }}>
            <div className="tile"><div className="t-label">Gmail connection</div><div className="t-value"><Pill tone={gmail?.state === 'OK' ? 'good' : gmail?.state === 'FAIL' ? 'bad' : 'mute'}>{gmail?.state === 'OK' ? 'AUTHORIZED' : gmail?.state === 'FAIL' ? 'BLOCKED' : 'UNKNOWN'}</Pill></div></div>
            <div className="tile"><div className="t-label">Last dashboard sync</div><div className="t-value">{ago(s.generatedAt, now)}</div><div className="t-label">Health <Pill tone={healthTone(effective)}>{effective}</Pill></div></div>
          </div>
        </Panel>
      </div>

      <Panel title="Pipeline pulse" meta="Last known state per stage"><PipelinePulse stages={s.pipeline} /></Panel>

      <div className="grid cols-2">
        <Panel title="Needs attention" meta={`${s.alerts.length} active`}><AlertList alerts={s.alerts} limit={4} /></Panel>
        <Panel title="Inventory by campaign" meta="EMAIL-ready">
          <div className="tbl-wrap"><table><thead><tr><th>Campaign</th><th className="r">Ready</th><th className="r">Email</th><th>State</th></tr></thead>
            <tbody>{leads.byCampaign.filter((c) => c.id !== 'UNASSIGNED').map((c) => (
              <tr key={c.id}><td>{c.label}</td><td className="r">{num(c.ready)}</td><td className="r">{num(c.readyEmail)}</td><td><Pill tone={invTone(c.inventoryState)}>{c.inventoryState ?? '—'}</Pill></td></tr>))}</tbody></table></div>
        </Panel>
      </div>
    </>
  );
}
