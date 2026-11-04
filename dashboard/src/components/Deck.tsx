import { useEffect, useRef } from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { Health, Snapshot } from '../types';
import { ago, num, until } from '../format';
import { Tip } from './ui';

// "Command Deck": a tilted 3D board with floating neon glass cards, in the style of the approved reference.
// Every figure is read from the snapshot. Nothing is invented; unavailable values show NOT TRACKED.
const CY = '#22D3EE', PU = '#8B5CF6', LV = '#A78BFA', IC = '#A5F3FC', GREY = '#64748B';
const SHORT: Record<string, string> = { LOCAL_DETAILING: 'Detail', LOCAL_PROPERTY: 'Prop.', WEBSITE_WORLD: 'Web', DIGITAL_INQUIRY: 'Inq.', DIGITAL_ESTIMATES: 'Est.', OTHER_APPROVED: 'Oth.' };
const AX = { stroke: 'transparent', tick: { fill: '#8E93B0', fontSize: 9 }, interval: 0 } as const;
const FUN: Record<string, string> = { DISCOVERED: 'Found', QUALIFIED: 'Qual.', ROUTE_READY: 'Route', VERIFIED_READY: 'Verif.', CONTACTED: 'Sent', REPLIED: 'Reply', CONVERTED: 'Won' };

function MiniArea({ data, keys, axes, id }: { data: Record<string, unknown>[]; keys: { k: string; name: string; c: string }[]; axes?: boolean; id: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
        {keys.map((k) => <defs key={k.k}><linearGradient id={`${id}-${k.k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={k.c} stopOpacity={0.6} /><stop offset="100%" stopColor={k.c} stopOpacity={0.03} /></linearGradient></defs>)}
        {axes && <XAxis dataKey="n" {...AX} />}{axes && <YAxis {...AX} width={34} allowDecimals={false} />}
        {axes && <Tooltip content={<Tip />} cursor={{ stroke: 'rgba(165,243,252,.3)' }} />}
        {keys.map((k) => <Area key={k.k} type="monotone" dataKey={k.k} name={k.name} stroke={k.c} strokeWidth={2.2} fill={`url(#${id}-${k.k})`} dot={false} isAnimationActive={false} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}
function MiniBars({ data, keys, axes, stacked }: { data: Record<string, unknown>[]; keys: { k: string; name: string; c: string }[]; axes?: boolean; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={axes ? "22%" : "6%"}>
        {axes && <XAxis dataKey="n" {...AX} />}{axes && <YAxis {...AX} width={34} allowDecimals={false} />}
        {axes && <Tooltip content={<Tip />} cursor={{ fill: 'rgba(165,243,252,.08)' }} />}
        {keys.map((k, i) => <Bar key={k.k} dataKey={k.k} name={k.name} fill={k.c} stackId={stacked ? 's' : undefined} radius={stacked && i === 0 ? 0 : [3, 3, 0, 0]} isAnimationActive={false} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
function Ring({ data, donut }: { data: { name: string; v: number; c: string }[]; donut?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart><Pie data={data} dataKey="v" nameKey="name" innerRadius={donut ? '58%' : 0} outerRadius="96%" stroke="rgba(5,6,13,.9)" strokeWidth={2} isAnimationActive={false}>
        {data.map((d) => <Cell key={d.name} fill={d.c} />)}</Pie><Tooltip content={<Tip />} /></PieChart>
    </ResponsiveContainer>
  );
}
const Meter = ({ label, val, pct, c }: { label: string; val: string; pct: number; c: string }) => (
  <div className="d-meter"><div className="d-mrow"><span>{label}</span><b>{val}</b></div><div className="d-track"><i style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%`, background: `linear-gradient(90deg, ${c}, ${IC})` }} /></div></div>
);

export function Deck({ s, now, effective }: { s: Snapshot; now: number; effective: Health }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0; const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const upd = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const r = el.getBoundingClientRect(); el.style.setProperty('--p', String(Math.max(0, Math.min(1, -r.top / Math.max(1, r.height))))); }); };
    const mv = (e: PointerEvent) => { const r = el.getBoundingClientRect(); el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3)); el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3)); };
    addEventListener('scroll', upd, { passive: true }); upd(); if (fine) el.addEventListener('pointermove', mv);
    return () => { removeEventListener('scroll', upd); el.removeEventListener('pointermove', mv); cancelAnimationFrame(raf); };
  }, []);

  const { leads, outreach } = s;
  const q = s.charts.queueHealth.filter((x) => x.id !== 'UNASSIGNED').map((x) => ({ n: SHORT[x.id] ?? x.label, ready: x.ready, blocked: x.blocked ?? 0 }));
  const funnel = s.leads.funnel.map((f) => ({ n: FUN[f.id] ?? f.label.split(' ')[0], count: f.count ?? 0 }));
  const byCamp = leads.byCampaign.filter((c) => c.id !== 'UNASSIGNED').map((c) => ({ n: SHORT[c.id] ?? c.label, ready: c.ready ?? 0, email: c.readyEmail ?? 0 }));
  const sends = s.charts.emailActivity.map((d) => ({ n: d.day.slice(5), count: d.count }));
  const growth = s.charts.leadGrowth.map((d) => ({ n: d.day.slice(5), cumulative: d.cumulative }));
  const qual = leads.byQualification;
  const qualRing = qual ? [{ name: 'Qualified', v: qual.QUALIFIED, c: CY }, { name: 'Ready', v: qual.READY, c: PU }, { name: 'Needs review', v: qual.UNRESOLVED, c: LV }, { name: 'Suppressed', v: qual.SUPPRESSED, c: GREY }] : [];
  const route = leads.readyByRoute ? [{ name: 'Email', v: leads.readyByRoute.EMAIL, c: CY }, { name: 'Form', v: leads.readyByRoute.FORM, c: PU }] : [];
  const checksOk = s.health.checks.filter((c) => c.state === 'OK').length;
  const nextWin = outreach.windows.find((w) => w.scheduledAt && new Date(w.scheduledAt).getTime() > now)?.scheduledAt ?? outreach.nextDispatchAt;
  const qualified = qual ? qual.QUALIFIED + qual.READY : null;
  const newToday = s.charts.leadGrowth[s.charts.leadGrowth.length - 1]?.new ?? null;
  const emailReady = leads.byCampaign.reduce((a, c) => a + (c.readyEmail ?? 0), 0);
  const tone = effective === 'HEALTHY' ? 'good' : effective === 'DEGRADED' ? 'warn' : effective === 'BLOCKED' ? 'bad' : 'mute';
  const tick = [
    { k: 'SENT TODAY', v: `${num(outreach.sentToday)}/${outreach.dailyCap}`, t: 'mute' }, { k: 'READY', v: num(leads.byQualification?.READY), t: 'up' },
    { k: 'QUALIFIED', v: num(qualified), t: 'up' }, { k: 'DISCOVERED', v: num(leads.total), t: 'up' },
    { k: 'NEXT DISPATCH', v: until(nextWin, now), t: 'mute' }, { k: 'HEALTH', v: effective, t: tone === 'good' ? 'up' : tone === 'bad' ? 'down' : 'mute' },
  ];

  return (
    <section className="deck" ref={ref} aria-label="Command deck overview">
      <div className="d-ticker neon n-cy" aria-label="Key figures"><div className="d-tkw"><div className="d-tk">{[...tick, ...tick].map((t, i) => <span key={i} className={`d-ti ${t.t}`} aria-hidden={i >= tick.length}><em>{t.k}</em><b>{t.v}</b></span>)}</div></div></div>

      <div className="d-board">
        <div className="d-bh"><h2>Dashboard</h2><span className={`d-pill-s ${tone}`}>{effective}</span><span className="d-sync">Synced {ago(s.generatedAt, now)}</span></div>
        <div className="d-bg">
          <div className="d-p big"><div className="d-pt">Queue health by service <small>Ready vs blocked</small></div>
            <div className="d-ch"><MiniArea id="qh" axes data={q} keys={[{ k: 'blocked', name: 'Blocked', c: PU }, { k: 'ready', name: 'Ready', c: CY }]} /></div></div>
          <div className="d-p rings"><div className="d-pt">Lead status</div>
            <div className="d-ring"><div className="d-rc"><Ring data={qualRing} /></div><ul>{qualRing.map((r) => <li key={r.name}><i style={{ background: r.c }} />{r.name}<b>{num(r.v)}</b></li>)}</ul></div>
            <div className="d-ring"><div className="d-rc"><Ring donut data={route} /></div><ul>{route.map((r) => <li key={r.name}><i style={{ background: r.c }} />Ready · {r.name}<b>{num(r.v)}</b></li>)}</ul></div></div>
          <div className="d-p"><div className="d-pt">Pipeline funnel</div><div className="d-ch"><MiniBars axes data={funnel} keys={[{ k: 'count', name: 'Businesses', c: CY }]} /></div></div>
          <div className="d-p"><div className="d-pt">Ready by service</div><div className="d-ch"><MiniBars axes stacked data={byCamp} keys={[{ k: 'email', name: 'Email-ready', c: CY }, { k: 'ready', name: 'Ready (all routes)', c: PU }]} /></div></div>
          <div className="d-p"><div className="d-pt">Gauges</div>
            <Meter label="Daily cap used" val={`${num(outreach.sentToday)} / ${outreach.dailyCap}`} pct={(outreach.sentToday ?? 0) / outreach.dailyCap} c={PU} />
            <Meter label="Health checks OK" val={`${checksOk} / ${s.health.checks.length}`} pct={checksOk / Math.max(1, s.health.checks.length)} c={CY} />
            <Meter label="Verified send-ready" val={num(s.leads.funnel.find((f) => f.id === 'VERIFIED_READY')?.count)} pct={(s.leads.funnel.find((f) => f.id === 'VERIFIED_READY')?.count ?? 0) / Math.max(1, emailReady)} c={CY} /></div>
        </div>
      </div>

      <div className="d-card c1 neon n-pu"><div className="d-ct">Emails sent</div><div className="d-cv">{num(outreach.sent30d)}</div><div className="d-cs">Last 30 days · today {num(outreach.sentToday)} / {outreach.dailyCap}</div><div className="d-cc"><MiniBars data={sends} keys={[{ k: 'count', name: 'Sent', c: CY }]} /></div></div>
      <div className="d-card c2 neon n-cy"><div className="d-ct">Qualified leads</div><div className="d-cv">{num(qualified)}</div><div className="d-cs up">▲ {num(newToday)} newly discovered today</div><div className="d-cc"><MiniArea id="gr" data={growth} keys={[{ k: 'cumulative', name: 'Discovered', c: CY }]} /></div></div>
      <div className="d-card c3 neon n-mx"><div className="d-ct">Ready inventory</div><div className="d-cv">{num(leads.byQualification?.READY)}</div><div className="d-cs">Handoff-eligible · {num(emailReady)} email-ready</div><div className="d-cc"><MiniArea id="ri" data={byCamp} keys={[{ k: 'ready', name: 'Ready', c: PU }, { k: 'email', name: 'Email-ready', c: CY }]} /></div></div>
      <div className="d-card c4 neon n-cy"><div className="d-ct">Dispatch</div><div className="d-cv">{until(nextWin, now)}</div><div className="d-cs">Next window · cap {outreach.dailyCap}/day</div>
        <Meter label="Remaining today" val={num(outreach.remainingToday)} pct={(outreach.remainingToday ?? 0) / outreach.dailyCap} c={PU} />
        <Meter label="Health checks" val={`${checksOk}/${s.health.checks.length}`} pct={checksOk / Math.max(1, s.health.checks.length)} c={CY} /></div>
      <div className="d-mini neon n-cy"><TrendingUp size={18} aria-hidden /><span><em>READY</em><b>{num(leads.byQualification?.READY)}</b></span><span><em>SENT</em><b>{num(outreach.sentToday)}</b></span><span><em>{effective}</em><b className={tone}>●</b></span></div>
    </section>
  );
}
