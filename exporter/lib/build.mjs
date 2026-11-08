// Builds the sanitized public snapshot from existing Prospect Foundry artifacts. Pure given its inputs (apart from reading files).
import path from 'node:path';
import fs from 'node:fs';
import { readDatabase } from './db.mjs';
import { readJson, reportTime, listFiles, readLedgerSends, probeProductionLock, readTaskDefinitions, parseCsv } from './sources.mjs';
import { etDay, etMinutes, etWallToUtc, daysBack, fmtHm, DEFAULT_DISPATCH_MINUTES, inProtectedWindow, parseTime, toIso } from './time.mjs';
import { scrub } from './sanitize.mjs';

export const EXPORTER_VERSION = '1.0.0';
const DAILY_CAP = 50;

export const CAMPAIGNS = {
  LOCAL_DETAILING: { label: "B's Supa Clean Cars", short: 'Interior detailing' },
  LOCAL_PROPERTY: { label: 'Battle Creek Property Services', short: 'Property services' },
  WEBSITE_WORLD: { label: 'Website Design', short: 'Website design' },
  DIGITAL_INQUIRY: { label: 'Digital Inquiry Follow-Up', short: 'Inquiry follow-up' },
  DIGITAL_ESTIMATES: { label: 'Outstanding Estimate Follow-Up', short: 'Estimate follow-up' },
};
const CAMPAIGN_ORDER = Object.keys(CAMPAIGNS);

// Policy rule 3: EMAIL-ready inventory bands.
export const inventoryState = (n) => (n < 150 ? 'CRITICAL' : n < 300 ? 'LOW' : n < 450 ? 'HEALTHY' : 'SURPLUS');
const slotId = (m) => (m < 720 ? 'MORNING' : m < 900 ? 'MIDDAY' : 'AFTERNOON');
const HOURS = 3600e3;

export function buildSnapshot(ctx) {
  const { dir, now, prev, exporterRun, scheduler } = ctx;
  const today = etDay(now);
  const src = {};
  const names = ['foundry_contact_evidence_audit', 'foundry_health_report', 'foundry_daily_audit', 'foundry_day_review', 'foundry_safety_audit', 'foundry_safe_dispatch_report',
    'foundry_final_handoff_report', 'foundry_production_report', 'foundry_learning_report', 'foundry_targeted_discovery_report',
    'foundry_contact_enrichment_report', 'foundry_local_digital_enrichment_report', 'foundry_full_classification_report',
    'suppression_reconcile_report', 'foundry_discovery_import_report', 'foundry_quarantine_report'];
  for (const n of names) src[n] = readJson(dir, `${n}.json`);
  const t = (n) => reportTime(src[n]);

  // ---- SQLite (authoritative CRM) -------------------------------------------------------------
  let db = null, dbError = null;
  try { db = readDatabase(path.join(dir, 'prospect_foundry.sqlite')); }
  catch (e) { dbError = e.code || e.message?.split('\n')[0] || 'SQLITE_READ_FAILED'; }

  // ---- campaigns -------------------------------------------------------------------------------
  const targets = {};
  try {
    for (const r of parseCsv(fs.readFileSync(path.join(dir, 'FoundryCampaigns.csv'), 'utf8'))) targets[r.campaign_id] = { target: +r.target_count || null, territory: r.territory, state: r.state };
  } catch { /* optional */ }
  const campaigns = [];
  if (db) {
    for (const id of [...CAMPAIGN_ORDER, 'UNASSIGNED']) {
      const rows = db.byCampaign.filter((r) => r.campaign === id);
      const sum = (f) => rows.filter(f).reduce((a, r) => a + r.n, 0);
      const total = sum(() => true), ready = sum((r) => r.state === 'READY');
      const readyEmail = sum((r) => r.state === 'READY' && r.route === 'EMAIL');
      campaigns.push({
        id, label: CAMPAIGNS[id]?.label ?? 'Unassigned', short: CAMPAIGNS[id]?.short ?? 'Needs evidence',
        territory: targets[id]?.territory ?? null, target: targets[id]?.target ?? null,
        total, qualified: sum((r) => r.state === 'QUALIFIED') + ready, ready, readyEmail, readyForm: sum((r) => r.state === 'READY' && r.route === 'FORM'),
        unresolved: sum((r) => r.state === 'UNRESOLVED'), suppressed: sum((r) => r.state === 'SUPPRESSED'),
        inventoryState: id === 'UNASSIGNED' ? null : inventoryState(readyEmail),
      });
    }
  }
  const stateN = (k) => db?.byState.find((r) => r.k === k)?.n ?? 0;
  const readyTotal = db ? stateN('READY') : null;

  // ---- sends (confirmed Gmail API acceptance only) ---------------------------------------------
  const seen = new Map();
  for (const s of readLedgerSends(dir)) seen.set(s.id, s);
  for (const e of db?.outreachSends ?? []) { const at = parseTime(e.at); if (at && !seen.has(e.id ?? `${e.at}`)) seen.set(e.id ?? `${e.at}`, { id: e.id, at, campaign: e.campaign || 'UNKNOWN', account: '', source: 'SQLITE_EVENT' }); }
  const sends = [...seen.values()];
  const day30 = daysBack(today, 30);
  const perDay = Object.fromEntries(day30.map((d) => [d, 0]));
  const perCampaign = {}, perAccount = {};
  const accounts = [...new Set(sends.map((s) => s.account).filter(Boolean))].sort();
  for (const s of sends) {
    const d = etDay(s.at);
    if (d in perDay) perDay[d]++;
    perCampaign[s.campaign] = (perCampaign[s.campaign] || 0) + 1;
    if (s.account) { const label = `Account ${String.fromCharCode(65 + accounts.indexOf(s.account))}`; perAccount[label] = (perAccount[label] || 0) + 1; }
  }
  const sum = (ds) => ds.reduce((a, d) => a + (perDay[d] || 0), 0);
  const sentToday = perDay[today] || 0;
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const weekDays = day30.filter((d) => d >= daysBack(today, dow + 1)[0]);
  const monthDays = day30.filter((d) => d.slice(0, 7) === today.slice(0, 7));
  const audit = src.foundry_daily_audit.data, review = src.foundry_day_review.data, safety = src.foundry_safety_audit.data;
  const auditFailures = audit?.failures ?? [];
  const safetyFailures = [...(safety?.failures ?? []), ...(db?.safetyControl.map((r) => r.reason) ?? [])];
  const gmailBlocked = safetyFailures.some((f) => /GMAIL_(CONFIGURATION|AUTHORIZATION)/i.test(f));
  const historyUnreconciled = auditFailures.includes('SENT_HISTORY_NOT_RECONCILED_WITH_GMAIL') || (db && (db.historySyncedAccounts ?? 0) < 2);

  // ---- dispatch windows ------------------------------------------------------------------------
  const defs = readTaskDefinitions(dir);
  const dispatchMinutes = defs.find((d) => d.mode === 'Dispatch')?.minutes?.slice().sort((a, b) => a - b);
  const slots = dispatchMinutes?.length === 3 ? dispatchMinutes : DEFAULT_DISPATCH_MINUTES;
  const runReports = listFiles(dir, /^outreach_run_report_(\d{4}-\d{2}-\d{2})_(\d{4})\.json$/).map((f) => {
    const [, d, hm] = /_(\d{4}-\d{2}-\d{2})_(\d{4})\.json$/.exec(f); const r = readJson(dir, f);
    return { file: f, day: d, minutes: +hm.slice(0, 2) * 60 + +hm.slice(2), r };
  }).filter((x) => x.r.ok);
  const lock = ctx.lockOverride ?? probeProductionLock(dir);
  const nowMin = etMinutes(now);
  const taskFor = (mode, min) => scheduler?.tasks?.find((tk) => tk.name === defs.find((d) => d.mode === mode && d.minutes.includes(min))?.name);
  const windows = slots.map((slot) => {
    const sched = etWallToUtc(today, slot);
    const rep = runReports.find((x) => x.day === today && x.minutes >= slot && x.minutes < slot + 30);
    const base = { id: slotId(slot), label: `${fmtHm(slot)} Dispatch`, scheduledAt: toIso(sched), startedAt: null, finishedAt: null, sent: null, errors: null, runId: null, evidence: 'NONE' };
    if (rep) {
      const ex = rep.r.data.execution ?? {}, blockers = rep.r.data.blockers ?? [];
      const sentN = Number.isFinite(ex.emails_sent) ? ex.emails_sent : null;
      return { ...base, state: blockers.length && !sentN ? 'BLOCKED' : 'COMPLETED', finishedAt: toIso(parseTime(rep.r.data.at)), sent: sentN, errors: blockers.length, runId: rep.file.replace(/\.json$/, ''), evidence: 'RUN_REPORT' };
    }
    if (defs.find(d => d.mode === 'Dispatch')?.enabled === false) return { ...base, state: 'BLOCKED', evidence: 'TASK_SCHEDULER' };
    if (nowMin < slot) return { ...base, state: 'SCHEDULED' };
    if (nowMin < slot + 15 && lock.state === 'HELD') return { ...base, state: 'RUNNING', evidence: 'LOCK_HELD' };
    const tk = taskFor('Dispatch', slot);
    const lastRun = parseTime(tk?.lastRun);
    if (scheduler?.available && tk && (!lastRun || etDay(lastRun) !== today)) return { ...base, state: 'MISSED', evidence: 'TASK_SCHEDULER' };
    if (scheduler?.available && tk && Number(tk.lastResult) > 0 && etDay(lastRun) === today) return { ...base, state: 'FAILED', evidence: 'TASK_SCHEDULER' };
    return { ...base, state: 'UNKNOWN' }; // no run report, no scheduler evidence: do not assume success
  });
  const nextSlot = slots.find((s) => nowMin < s);
  const nextDispatchAt = toIso(nextSlot != null ? etWallToUtc(today, nextSlot) : etWallToUtc(nextDay(today), slots[0]));
  const lastReport = runReports.slice().sort((a, b) => (a.day + a.minutes).localeCompare(b.day + b.minutes)).at(-1);
  const lastDispatch = lastReport ? {
    at: toIso(parseTime(lastReport.r.data.at)), runId: lastReport.file.replace(/\.json$/, ''), sent: lastReport.r.data.execution?.emails_sent ?? null,
    state: (lastReport.r.data.blockers?.length && !lastReport.r.data.execution?.emails_sent) ? 'BLOCKED' : 'COMPLETED',
    blockers: (lastReport.r.data.blockers ?? []).slice(0, 4).map((b) => scrub(b, 200)),
  } : null;

  // ---- replies ---------------------------------------------------------------------------------
  const CLASSES = ['POSITIVE', 'QUESTION', 'NOT_NOW', 'DECLINE', 'STOP', 'AUTO_REPLY', 'BOUNCE', 'UNKNOWN'];
  const replyCoverage = review?.reply_coverage ?? 'UNKNOWN';
  const evtCount = (k) => (db?.outreachEvents ? db.outreachEvents.filter((e) => String(e.event).toUpperCase() === k).reduce((a, e) => a + e.n, 0) : null);
  const tracked = replyCoverage !== 'UNKNOWN' && !!db?.outreachEvents;
  const counts = Object.fromEntries(CLASSES.map((c) => [c, tracked ? evtCount(c) : null]));
  const pendingRep = lastReport?.r.data.reconciliation?.reply_pending_review ?? null;
  const replies = {
    coverage: replyCoverage, counts, converted: null,
    rates: { reply: null, positive: null, conversion: null, denominator: 'confirmed sends (unavailable until reply coverage is complete)' },
    pendingUnreadable: pendingRep ? 1 : 0,
    needsAttention: pendingRep ? [{ kind: 'UNREADABLE_REPLY', note: 'An inbound reply could not be read (Gmail quota error). Review it manually.' }] : [],
    revenue: { tracked: false }, conversions: { tracked: false },
  };

  // ---- pipeline stages -------------------------------------------------------------------------
  const ageH = (d) => (d ? (now - d) / HOURS : null);
  const stage = (id, label, d, status, items, errors, note) => ({ id, label, lastRun: toIso(d), lastSuccess: status === 'OK' ? toIso(d) : null, durationSec: null, status: d && ageH(d) > 36 && status === 'OK' ? 'STALE' : status, items, errors, note: note ?? null });
  const srcFail = (db?.sourceJobs ?? []).filter((j) => /UNAVAIL|FAIL|ERROR/i.test(j.status)).length;
  const disc = src.foundry_targeted_discovery_report;
  const pipeline = [
    stage('DISCOVERY', 'Discovery', t('foundry_targeted_discovery_report'), disc.ok ? (srcFail ? 'DEGRADED' : 'OK') : 'UNKNOWN', disc.data?.total ?? null, srcFail, srcFail ? `${srcFail} source job(s) unavailable` : null),
    stage('ENRICHMENT', 'Enrichment', t('foundry_local_digital_enrichment_report') ?? t('foundry_contact_enrichment_report'), src.foundry_contact_enrichment_report.ok ? 'OK' : 'UNKNOWN', src.foundry_local_digital_enrichment_report.data?.enriched ?? src.foundry_contact_enrichment_report.data?.enriched ?? null, 0),
    stage('CLASSIFICATION', 'Classification', t('foundry_full_classification_report'), src.foundry_full_classification_report.ok ? (db && db.classified === db.total ? 'OK' : db ? 'DEGRADED' : 'UNKNOWN') : 'UNKNOWN', db?.classified ?? src.foundry_full_classification_report.data?.categorized ?? null, db ? db.total - db.classified : null),
    stage('VALIDATION', 'Validation', t('foundry_daily_audit'), audit ? (audit.status === 'PASS' ? 'OK' : 'FAILED') : 'UNKNOWN', audit?.counts?.database_ready ?? null, auditFailures.length, auditFailures.length ? auditFailures.map((f) => f.replace(/_/g, ' ').toLowerCase()).join('; ') : null),
    stage('RECONCILIATION', 'Reconciliation', t('suppression_reconcile_report'), src.suppression_reconcile_report.ok ? (historyUnreconciled ? 'DEGRADED' : 'OK') : 'UNKNOWN', src.suppression_reconcile_report.data?.suppression_rows ?? null, historyUnreconciled ? 1 : 0, historyUnreconciled ? 'Gmail send history not reconciled' : null),
    stage('QUEUE_PREPARATION', 'Queue Prep', t('foundry_final_handoff_report'), src.foundry_final_handoff_report.ok ? 'OK' : 'UNKNOWN', src.foundry_final_handoff_report.data?.exported ?? null, src.foundry_final_handoff_report.data?.excluded_invalid ?? 0),
    stage('DISPATCH', 'Dispatch', parseTime(lastDispatch?.at) ?? t('foundry_safe_dispatch_report'), lastDispatch ? (lastDispatch.state === 'COMPLETED' ? 'OK' : 'BLOCKED') : src.foundry_safe_dispatch_report.ok ? 'BLOCKED' : 'UNKNOWN', lastDispatch?.sent ?? 0, lastDispatch?.blockers?.length ?? 0, gmailBlocked ? 'Gmail authorization incomplete' : null),
    stage('REPLY_PROCESSING', 'Replies', t('foundry_day_review'), replyCoverage === 'UNKNOWN' ? 'UNKNOWN' : 'OK', null, pendingRep ? 1 : 0, replyCoverage === 'UNKNOWN' ? 'Reply coverage incomplete' : null),
    stage('LEARNING', 'Learning', t('foundry_learning_report'), src.foundry_learning_report.ok ? 'OK' : 'UNKNOWN', src.foundry_learning_report.data?.metrics?.length ?? null, 0, (src.foundry_learning_report.data?.metrics?.length ?? 0) === 0 ? 'Not enough samples yet' : null),
  ];

  // ---- freshness / preparation -----------------------------------------------------------------
  const prepAt = t('foundry_final_handoff_report');
  const sourceTimes = names.map(t).filter(Boolean);
  const sourceAsOf = sourceTimes.length ? new Date(Math.max(...sourceTimes.map((d) => d.getTime()))) : null;

  // ---- health (explicit, documented rules) ----------------------------------------------------
  const checks = [];
  const add = (id, label, state, detail, blocking = false) => checks.push({ id, label, state, detail, blocking });
  add('sqlite_read', 'CRM database readable', db ? 'OK' : 'FAIL', db ? 'Read-only snapshot taken' : `Read failed (${scrub(dbError, 60)})`, true);
  const evidence = src.foundry_contact_evidence_audit.data;
  if (evidence) add('contact_evidence','Evidence-backed email routes',evidence.routes > 0 && evidence.evidence_pass === evidence.routes && !Object.keys(evidence.issues ?? {}).length ? 'OK' : 'FAIL',evidence.evidence_pass+' of '+evidence.routes+' routes pass the contact source check',true);
  add('gmail_authorization', 'Gmail authorization', gmailBlocked ? 'FAIL' : safety ? 'OK' : 'UNKNOWN', gmailBlocked ? 'Configuration / authorization incomplete; sender is gated' : safety ? 'No blocking safety failures' : 'Safety audit missing', true);
  add('safety_audit', 'Send-safety audit', safety ? (safety.status === 'BLOCKED' ? 'FAIL' : 'OK') : 'UNKNOWN', safety ? `Status ${safety.status}` : 'foundry_safety_audit.json missing', true);
  add('quality_audit', 'Daily quality audit', audit ? (audit.status === 'PASS' ? 'OK' : 'WARN') : 'UNKNOWN', audit ? (auditFailures.length ? auditFailures.join(', ') : 'Passed') : 'foundry_daily_audit.json missing');
  add('ledger_reconciliation', 'Gmail ↔ CRM ledger reconciliation', historyUnreconciled ? 'WARN' : 'OK', historyUnreconciled ? 'Historical Gmail sends not reconciled; zero local sends is not proof of zero sent' : 'Reconciled');
  const prepAge = ageH(prepAt);
  add('preparation_fresh', 'Preparation freshness', prepAt ? (prepAge <= 26 ? 'OK' : 'WARN') : 'UNKNOWN', prepAt ? `Last prepared ${prepAge.toFixed(1)}h ago` : 'No preparation report');
  const sched3 = defs.some((d) => d.mode === 'Dispatch' && d.minutes.slice().sort((a,b)=>a-b).join(',') === DEFAULT_DISPATCH_MINUTES.join(','));
  add('dispatch_controls', 'Dispatch schedule (3 windows)', defs.length ? (sched3 ? 'OK' : 'WARN') : 'UNKNOWN', defs.length ? `Windows ${slots.map(fmtHm).join(' · ')}` : 'Task definitions not found');
  const lockExpected = inProtectedWindow(now, slots) || [480,720,960].some(start => nowMin >= start && nowMin < start+25);
  add('production_lock', 'Execution lock', lock.state === 'HELD' && !lockExpected ? 'WARN' : lock.state === 'UNKNOWN' ? 'UNKNOWN' : 'OK', lock.state === 'HELD' ? (lockExpected ? 'Held by an active run' : 'Held outside a scheduled window; possible overlap or stuck run') : `Lock ${lock.state.toLowerCase()}`);
  add('duplicate_risk', 'One READY campaign per business', db ? (db.readyMultiService ? 'WARN' : 'OK') : 'UNKNOWN', db ? `${db.readyMultiService} business(es) READY in more than one campaign` : 'Unavailable');
  add('suppression_integrity', 'Suppression integrity', db ? (db.readySuppressed ? 'FAIL' : 'OK') : 'UNKNOWN', db ? `${db.readySuppressed} suppressed contact(s) in READY routes` : 'Unavailable', true);
  add('handoff_consistency', 'READY vs handoff export', db && src.foundry_final_handoff_report.ok ? (db.byState.find((r) => r.k === 'READY')?.n === src.foundry_final_handoff_report.data.exported ? 'OK' : 'WARN') : 'UNKNOWN', db && src.foundry_final_handoff_report.ok ? `CRM ${readyTotal} · export ${src.foundry_final_handoff_report.data.exported}` : 'Unavailable');
  add('exporter_last_run', 'Dashboard exporter', exporterRun?.lastError ? 'WARN' : 'OK', exporterRun?.lastError ? `Last publish problem: ${scrub(exporterRun.lastError, 120)}` : 'Last export succeeded');
  const states = checks.map((c) => c.state);
  const blockingFail = checks.some((c) => c.blocking && c.state === 'FAIL');
  const unknownCritical = checks.filter((c) => c.blocking && c.state === 'UNKNOWN').length >= 2 || (!db && !src.foundry_safety_audit.ok);
  const status = blockingFail ? 'BLOCKED' : unknownCritical ? 'UNKNOWN' : states.some((s) => s === 'WARN' || s === 'FAIL') ? 'DEGRADED' : 'HEALTHY';
  const reasons = checks.filter((c) => ['FAIL', 'WARN'].includes(c.state)).map((c) => `${c.label}: ${c.detail}`.slice(0, 200));

  // ---- alerts (deduped by id; firstDetected carried across runs) --------------------------------
  const raw = [];
  const A = (id, severity, title, detail) => raw.push({ id, severity, title, detail: scrub(detail, 220) });
  if (!db) A('SQLITE_READ_FAILURE', 'CRITICAL', 'SQLite read failure', `CRM database could not be read (${dbError}).`);
  if (gmailBlocked) A('GMAIL_AUTH_MISSING', 'CRITICAL', 'Gmail authorization missing', 'Sending is gated until both Gmail accounts are authorized and history is reconciled.');
  if (db?.readySuppressed) A('SUPPRESSED_IN_READY', 'CRITICAL', 'Suppressed contacts in READY routes', `${db.readySuppressed} suppressed contact(s) appear in READY.`);
  const todayBlocked = windows.filter((w) => ['BLOCKED', 'FAILED', 'MISSED'].includes(w.state));
  for (const w of todayBlocked) A(`DISPATCH_${w.state}_${w.id}`, w.state === 'BLOCKED' ? 'CRITICAL' : 'CRITICAL', `Dispatch ${w.state.toLowerCase()} · ${w.label}`, `${w.sent ?? 0} sent, ${w.errors ?? 0} blocker(s). Evidence: ${w.evidence}.`);
  if (db && (db.preparedSnapshots ?? 0) === 0 && (db.queueRows ?? 0) === 0) A('QUEUE_SNAPSHOT_EMPTY', 'WARNING', 'No prepared send queue', 'No immutable send snapshot or queued messages exist yet.');
  if (auditFailures.length) A('QUALITY_AUDIT_FAIL', 'WARNING', 'Daily audit failing', auditFailures.join(', ').replace(/_/g, ' ').toLowerCase());
  const crit = campaigns.filter((c) => c.inventoryState === 'CRITICAL');
  if (crit.length) A('INVENTORY_CRITICAL', 'WARNING', 'EMAIL-ready inventory critical', `${crit.length} campaign(s) under 150 EMAIL-ready: ${crit.map((c) => c.short).join(', ')}.`);
  if (pendingRep) A('REPLY_NEEDS_ATTENTION', 'WARNING', 'Reply requiring attention', 'An inbound reply could not be read. Review it manually.');
  if (checks.find((c) => c.id === 'production_lock').state === 'WARN') A('LOCK_OUTSIDE_WINDOW', 'WARNING', 'Execution lock held outside a window', 'Possible overlap or a stuck run. Not cleared automatically.');
  if (checks.find((c) => c.id === 'preparation_fresh').state === 'WARN') A('PREP_STALE', 'WARNING', 'Preparation stale', 'No preparation report in the last 26 hours.');
  if (db?.readyMultiService) A('DUPLICATE_RISK', 'WARNING', 'Duplicate campaign risk', `${db.readyMultiService} business(es) READY in multiple campaigns.`);
  if (checks.find((c) => c.id === 'handoff_consistency').state === 'WARN') A('CRM_HANDOFF_MISMATCH', 'WARNING', 'CRM / handoff mismatch', 'READY count differs from the latest handoff export.');
  if (exporterRun?.lastError) A('EXPORT_PUBLISH_FAILURE', 'WARNING', 'GitHub publish failure', exporterRun.lastError);
  if (sentToday >= DAILY_CAP) A('DAILY_LIMIT', 'INFO', 'Daily limit reached', `${sentToday}/${DAILY_CAP} confirmed sends today.`);
  const prevFirst = Object.fromEntries((prev?.alerts ?? []).map((a) => [a.id, a.firstDetected]));
  const nowIso = now.toISOString();
  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  const alerts = raw.map((a) => ({ ...a, firstDetected: prevFirst[a.id] ?? nowIso, lastDetected: nowIso, state: 'ACTIVE' })).sort((a, b) => order[a.severity] - order[b.severity]);

  // ---- history (collected forward only; never back-filled) -------------------------------------
  const prevDays = (prev?.history?.days ?? []).filter((d) => d.day !== today);
  const wc = (s) => windows.filter((w) => s.includes(w.state)).length;
  const historyDays = [...prevDays, { day: today, total: db?.total ?? null, qualified: db ? stateN('QUALIFIED') + stateN('READY') : null, ready: readyTotal, sent: sentToday, health: status,
    windows: { completed: wc(['COMPLETED']), failed: wc(['FAILED', 'MISSED']), blocked: wc(['BLOCKED']), unknown: wc(['UNKNOWN']) } }].slice(-400);

  // ---- charts ----------------------------------------------------------------------------------
  let cum = 0;
  const leadGrowth = (db?.growth ?? []).filter((g) => g.day).map((g) => ({ day: g.day, new: g.n, cumulative: (cum += g.n) }));
  const charts = {
    leadGrowth,
    emailActivity: day30.map((d) => ({ day: d, count: perDay[d] })),
    campaignPerformance: CAMPAIGN_ORDER.map((id) => ({ id, label: CAMPAIGNS[id].short, sent: perCampaignSent(perCampaign, id), ready: campaigns.find((c) => c.id === id)?.ready ?? null, replies: null, positive: null, converted: null })),
    queueHealth: campaigns.filter((c) => c.id !== 'UNASSIGNED').map((c) => ({ id: c.id, label: c.short, ready: c.ready,
      blocked: db ? db.routeQueue.filter((r) => r.service === c.id && r.status === 'BLOCKED').reduce((a, r) => a + r.n, 0) : null })),
    reliability: historyDays.map((d) => ({ day: d.day, ...d.windows })),
    conversionTrend: [],
  };

  // ---- funnel (stages are NOT strict subsets; see notes) ----------------------------------------
  const funnel = [
    { id: 'DISCOVERED', label: 'Discovered', count: db?.total ?? null, note: 'Business identities in the CRM' },
    { id: 'QUALIFIED', label: 'Qualified', count: db ? stateN('QUALIFIED') + stateN('READY') : null, note: 'QUALIFIED + READY classification' },
    { id: 'ROUTE_READY', label: 'Route-ready', count: readyTotal, note: 'READY = handoff eligible, not safe to email yet' },
    { id: 'VERIFIED_READY', label: 'Evidence-backed email routes', count: db?.verifiedContactEvidence ?? null, note: 'Current official-site or provider evidence; delivery is confirmed only after Gmail accepts a send' },
    { id: 'CONTACTED', label: 'Confirmed sends', count: sends.length, note: 'Gmail API accepted (ledger); coverage partial' },
    { id: 'REPLIED', label: 'Replied', count: null, note: 'Not tracked until reply coverage is complete' },
    { id: 'CONVERTED', label: 'Converted', count: null, note: 'Not tracked: no confirmed conversion events' },
  ];

  const rq = (st) => (db ? db.routeQueue.filter((r) => r.status === st).reduce((a, r) => a + r.n, 0) : null);
  const snapshot = {
    schemaVersion: 1,
    generatedAt: nowIso,
    sourceAsOf: toIso(sourceAsOf),
    timezone: 'America/New_York',
    exporter: { version: EXPORTER_VERSION, mode: 'read-only', refreshMinutes: 5, staleAfterMinutes: 75 },
    health: { status, reasons, checks, rule: 'BLOCKED: a blocking check fails. UNKNOWN: critical evidence missing. DEGRADED: any warning. HEALTHY: all checks pass.' },
    leads: db ? {
      total: db.total, classified: db.classified,
      byQualification: { QUALIFIED: stateN('QUALIFIED'), READY: stateN('READY'), UNRESOLVED: stateN('UNRESOLVED'), SUPPRESSED: stateN('SUPPRESSED') },
      readyByRoute: { EMAIL: campaigns.reduce((a, c) => a + c.readyEmail, 0), FORM: campaigns.reduce((a, c) => a + c.readyForm, 0) },
      contactChannels: db.contactChannels.map((c) => ({ channel: c.channel, verification: c.verification, n: c.n })),
      potentialDuplicates: db.duplicates, unassigned: campaigns.find((c) => c.id === 'UNASSIGNED')?.total ?? 0,
      routeQueue: { ready: rq('READY'), blocked: rq('BLOCKED') },
      blockedReasons: db.blockedReasons.map((r) => ({ reason: scrub(r.reason, 120), n: r.n })),
      quarantined: db.quarantine, byCampaign: campaigns, funnel,
    } : { total: null, classified: null, byQualification: null, readyByRoute: null, contactChannels: [], potentialDuplicates: null, unassigned: null, routeQueue: null, blockedReasons: [], quarantined: null, byCampaign: [], funnel },
    outreach: {
      dailyCap: DAILY_CAP, sentToday, remainingToday: Math.max(0, DAILY_CAP - sentToday),
      sentThisWeek: sum(weekDays), sentThisMonth: sum(monthDays), sent7d: sum(day30.slice(-7)), sent30d: sum(day30),
      capacityNote: gmailBlocked ? 'Nominal capacity. Sending is blocked until Gmail authorization is complete.' : '50 total across all three windows.',
      coverage: { status: sends.length || !historyUnreconciled ? (historyUnreconciled ? 'PARTIAL' : 'FULL') : 'PARTIAL', note: historyUnreconciled ? 'Counts come from send ledgers and CRM events. Gmail history is not fully reconciled, so zero here is not proof of zero sent.' : 'Gmail history reconciled.' },
      evidence: 'GMAIL_API_ACCEPTED', inboxDeliveryConfirmed: false,
      daily: charts.emailActivity, byCampaign: Object.entries(perCampaign).map(([campaign, count]) => ({ campaign, count })), byAccount: Object.entries(perAccount).map(([account, count]) => ({ account, count })),
      failedAttempts: db ? (db.safetyAttempts.filter((a) => /FAIL|ERROR/i.test(a.status)).reduce((x, a) => x + a.n, 0)) : null,
      suppressedContacts: db?.suppressionRows ?? null, bounces: null, duplicatesPrevented: null,
      queued: { routeReady: rq('READY'), preparedSnapshots: db?.preparedSnapshots ?? null, queueRows: db?.queueRows ?? null, agingHours: null },
      windows, lastDispatch, nextDispatchAt, lastPreparation: prepAt ? { at: toIso(prepAt), rows: src.foundry_final_handoff_report.data?.exported ?? null, state: 'COMPLETED' } : null,
    },
    replies,
    schedules: defs.map((d) => ({ name: d.name, mode: d.mode, enabled: d.enabled, times: d.minutes.map(fmtHm),
      ...(() => { const tk = scheduler?.tasks?.find((x) => x.name === d.name); return { lastRun: tk?.lastRun ?? null, lastResult: tk?.lastResult ?? null, nextRun: tk?.nextRun ?? null, taskStatus: tk?.status ?? null }; })() })),
    schedulerEvidence: { available: !!scheduler?.available, reason: scheduler?.reason ?? null },
    locks: { production: lock.state, protectedWindowNow: inProtectedWindow(now, slots) },
    pipeline, charts,
    alerts,
    history: { startsOn: historyDays[0]?.day ?? today, days: historyDays },
    dataQuality: {
      availability: {
        leads: { state: db ? 'AVAILABLE' : 'UNAVAILABLE', note: db ? 'SQLite authoritative' : 'SQLite read failed' },
        sends: { state: 'PARTIAL', note: 'Ledger CSV + CRM events; Gmail reconciliation incomplete' },
        deliveries: { state: 'NOT_TRACKED', note: 'No inbox-delivery evidence; only Gmail API acceptance' },
        replies: { state: replyCoverage === 'UNKNOWN' ? 'UNAVAILABLE' : 'PARTIAL', note: 'Reply coverage ' + replyCoverage.toLowerCase() },
        conversions: { state: 'NOT_TRACKED', note: 'No confirmed conversion events' },
        revenue: { state: 'NOT_TRACKED', note: 'Sales/revenue not recorded' },
        taskScheduler: { state: scheduler?.available ? 'AVAILABLE' : 'UNAVAILABLE', note: scheduler?.available ? 'schtasks query' : 'Task definitions only (no run results)' },
      },
      crossChecks: crossChecks(db, src),
      sources: names.map((n) => ({ name: n, present: src[n].ok, asOf: toIso(t(n)) })),
    },
  };
  if (ctx.collect) Object.assign(ctx.collect, { db, dbError, lock, slots, defs, runReports, gmailBlocked, auditFailures, replyCoverage, historyUnreconciled, windows, checks, src, lastDispatch, prepAt });
  return snapshot;
}

const nextDay = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); };

function perCampaignSent(perCampaign, id) {
  // Ledger campaign names are legacy labels (e.g. BattleCreekServices); only exact campaign ids map. Others stay unattributed.
  return perCampaign[id] ?? 0;
}

function crossChecks(db, src) {
  const out = [];
  const ph = src.foundry_final_handoff_report.data, pr = src.foundry_production_report.data, au = src.foundry_daily_audit.data;
  if (db && ph) out.push({ id: 'crm_vs_handoff', ok: db.byState.find((r) => r.k === 'READY')?.n === ph.exported, detail: `CRM READY ${db.byState.find((r) => r.k === 'READY')?.n} · handoff ${ph.exported}` });
  if (db && au) out.push({ id: 'crm_vs_audit', ok: db.byState.find((r) => r.k === 'READY')?.n === au.counts?.database_ready, detail: `CRM READY ${db.byState.find((r) => r.k === 'READY')?.n} · audit ${au.counts?.database_ready}` });
  if (db && pr) out.push({ id: 'crm_vs_production_report', ok: db.byState.find((r) => r.k === 'READY')?.n === pr.counts?.ready, detail: `CRM READY ${db.byState.find((r) => r.k === 'READY')?.n} · older production report ${pr.counts?.ready} (report predates latest cleanup)` });
  if (db) out.push({ id: 'all_classified', ok: db.classified === db.total, detail: `${db.classified} of ${db.total} businesses classified` });
  return out;
}
