// Pure, read-only derivations from the published snapshot. No new data is invented here.
import type { EngineStatus, Health, Snapshot } from './types';

export interface NextAction { id: string; tone: 'bad' | 'warn' | 'info' | 'good'; title: string; detail: string; where?: string }

export function nextActions(s: Snapshot, e: EngineStatus | null, effective: Health, stale: boolean): NextAction[] {
  const out: NextAction[] = [];
  if (stale) out.push({ id: 'stale', tone: 'warn', title: 'Data is stale', detail: 'The exporter has not published recently. Check that the 5-minute export task is running on the laptop.', where: 'Ops' });
  for (const c of s.health.checks) {
    if (c.state === 'FAIL') out.push({ id: 'chk-' + c.id, tone: 'bad', title: `${c.label}: failing`, detail: c.detail, where: 'Ops' });
    else if (c.state === 'WARN') out.push({ id: 'chk-' + c.id, tone: 'warn', title: `${c.label}: warning`, detail: c.detail, where: 'Ops' });
  }
  if (e && (e.state === 'BLOCKED' || e.stoppedKind)) out.push({ id: 'engine', tone: 'bad', title: e.headline, detail: e.diagnostics[0]?.evidence[0] ?? 'Open the Engine tab for the ranked diagnostics.', where: 'Engine' });
  const dispatch = s.schedules.find((x) => x.mode === 'Dispatch');
  if (dispatch && dispatch.enabled === false) out.push({ id: 'dispatch-off', tone: 'info', title: 'Dispatch task is disabled', detail: 'Live sending is held. This is expected until you explicitly release it.', where: 'Ops' });
  const verified = s.leads.funnel.find((f) => f.id === 'VERIFIED_READY')?.count ?? null;
  if (verified === 0) out.push({ id: 'no-verified', tone: 'warn', title: 'No verified send-ready contacts', detail: 'Nothing can be dispatched until contacts pass verification.', where: 'Leads' });
  if (!out.length && effective === 'HEALTHY') out.push({ id: 'ok', tone: 'good', title: 'All clear', detail: 'No failing checks or warnings in the latest snapshot.' });
  const rank = { bad: 0, warn: 1, info: 2, good: 3 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

export function statusReport(s: Snapshot, e: EngineStatus | null, effective: Health, stale: boolean, nowIso: string): string {
  const o = s.outreach;
  const L = [
    'OUTREACH OS — STATUS REPORT',
    `Generated: ${nowIso}  |  Snapshot: ${s.generatedAt}  |  Source as of: ${s.sourceAsOf ?? 'unknown'}`,
    `Health: ${effective}${stale ? ' (snapshot STALE)' : ''}  |  Engine: ${e ? e.state + ' — ' + e.headline : 'UNKNOWN'}`,
    `Sent today: ${o.sentToday ?? 'NOT TRACKED'}/${o.dailyCap}  |  Sent 7d: ${o.sent7d ?? 'n/a'}  |  Sent 30d: ${o.sent30d ?? 'n/a'}`,
    `Leads: total ${s.leads.total ?? 'n/a'}, classified ${s.leads.classified ?? 'n/a'}, unassigned ${s.leads.unassigned ?? 'n/a'}`,
    '', 'HEALTH CHECKS',
    ...s.health.checks.map((c) => `- [${c.state}] ${c.label}: ${c.detail}`),
    '', 'NEXT ACTIONS',
    ...nextActions(s, e, effective, stale).map((a) => `- (${a.tone.toUpperCase()}) ${a.title} — ${a.detail}`),
    '', 'SCHEDULES',
    ...s.schedules.map((x) => `- ${x.name} [${x.mode}] ${x.enabled ? 'enabled' : 'disabled'}: ${x.times.join(', ')}`),
    '', 'INVENTORY BY CAMPAIGN (ready / email-ready)',
    ...s.leads.byCampaign.filter((c) => c.id !== 'UNASSIGNED').map((c) => `- ${c.label}: ${c.ready} / ${c.readyEmail}`),
    '', 'Aggregates only. No recipient data. Read-only.',
  ];
  return L.join('\n');
}

const q = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function toCsv(rows: (string | number | null)[][]): string { return rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'; }
export function campaignCsv(s: Snapshot): string {
  return toCsv([['campaign', 'total', 'qualified', 'ready', 'ready_email', 'ready_form', 'unresolved', 'suppressed'],
    ...s.leads.byCampaign.map((c) => [c.label, c.total, c.qualified, c.ready, c.readyEmail, c.readyForm, c.unresolved, c.suppressed])]);
}
export function sendsCsv(s: Snapshot): string { return toCsv([['day', 'sent'], ...s.outreach.daily.map((d) => [d.day, d.count])]); }

export function tabTitle(effective: Health, sentToday: number | null, cap: number): string {
  const dot = { HEALTHY: '🟢', DEGRADED: '🟡', BLOCKED: '🔴', UNKNOWN: '⚪' }[effective];
  return `${dot} ${effective} · ${sentToday ?? '—'}/${cap} · Outreach OS`;
}
