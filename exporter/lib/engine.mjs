// Engine Core telemetry: deterministic diagnostics over evidence already collected by the read-only exporter.
// Every state, indicator and issue below is derived from a named file/table. Nothing is inferred by a model.
import fs from 'node:fs';
import path from 'node:path';
import { scrub } from './sanitize.mjs';
import { etDay, etMinutes, fmtHm, etWallToUtc, toIso } from './time.mjs';

export const ENGINE_VERSION = 1;
export const THRESHOLDS = {
  snapshotStaleMin: 75,        // GitHub Pages: age of published telemetry before the engine stops
  processingTtlMin: 6,         // "processing" is only claimed for this long after it was observed
  prepWindowMin: [540, 565],   // FoundryRun.ps1: preparation runs 9:00–9:25 ET
  prepDeadlineMin: 25, dispatchDeadlineMin: 10, // FoundryRun.ps1 deadlines
  prepGraceMin: 15,            // after the prep deadline before a missing prep counts as MISSED
  backlogPending: 100, backlogIdleHours: 12,
  slowFactor: 2, slowMinExtraSec: 30, minBaselineSamples: 5,
};

const STAGES = [
  { id: 'DISCOVERY', label: 'Discovery', files: ['FastTargetedDiscovery.js', 'ImportDiscovery.js', 'TargetedCampaignDiscovery.ps1', 'DiscoverCompanies.ps1', 'DiscoverNationwide.ps1'], pipeline: 'DISCOVERY' },
  { id: 'CLASSIFICATION', label: 'Classification', files: ['CategorizeAllBusinesses.js', 'ApplyCampaignTargets.js', 'ApplyLocalTargetLocations.js'], pipeline: 'CLASSIFICATION' },
  { id: 'VERIFICATION', label: 'Verification', files: ['FoundryDailyAudit.js', 'FoundrySafetyAudit.js', 'FoundryQuarantine.js', 'ReconcileSuppression.js', 'FoundryFinalReconcile.js'], pipeline: 'VALIDATION' },
  { id: 'QUEUE_PREPARATION', label: 'Queue Prep', files: ['FoundryProductionPipeline.js', 'FoundryFinalHandoffExport.js', 'FoundryReady.js'], pipeline: 'QUEUE_PREPARATION' },
  { id: 'GMAIL_DISPATCH', label: 'Gmail Dispatch', files: ['FoundrySend.js', 'FoundryGmail.js'], pipeline: 'DISPATCH' },
  { id: 'REPLY_PROCESSING', label: 'Reply Processing', files: ['FoundryDayReview.js'], pipeline: 'REPLY_PROCESSING' },
];
const FILE_STAGE = Object.fromEntries(STAGES.flatMap((s) => s.files.map((f) => [f, s.id])));

// foundry_safety.log: "<ISO> <Mode> <file> EXIT=<n>" plus free-text "Audit BLOCKED …" lines.
export function readSafetyLog(dir) {
  let txt = '';
  try { txt = fs.readFileSync(path.join(dir, 'foundry_safety.log'), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(Prepare|Dispatch|Audit)\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const at = new Date(m[1].replace(/(\.\d{3})\d+/, '$1'));
    if (Number.isNaN(at.getTime())) continue;
    const step = /^(\S+\.(?:js|ps1))\s+EXIT=(\d*)/.exec(m[3]);
    if (step) out.push({ at, mode: m[2], file: step[1], exit: step[2] === '' ? null : Number(step[2]), kind: 'STEP' });
    else out.push({ at, mode: m[2], file: null, exit: null, kind: /process cannot access|\.lock/i.test(m[3]) ? 'LOCK_CONTENTION' : 'NOTE', text: scrub(m[3], 160) });
  }
  return out.sort((a, b) => a.at - b.at);
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

export function buildEngine({ now, snap, c, dir, prevEngine, exporterRun, thresholds = THRESHOLDS }) {
  const T = thresholds, day = etDay(now), nowMin = etMinutes(now), nowIso = now.toISOString();
  const log = readSafetyLog(dir);
  const pipe = Object.fromEntries(snap.pipeline.map((p) => [p.id, p]));
  const db = c.db, lock = c.lock, gmailBlocked = c.gmailBlocked;
  const sourcesPresent = snap.dataQuality.sources.filter((s) => s.present).length;
  const insufficient = !db && sourcesPresent < Math.ceil(snap.dataQuality.sources.length / 2);

  // ---- run baselines: approximate step durations from consecutive log lines (same mode, same ET day) ----
  const baselines = { ...(prevEngine?.baselines ?? {}) };
  const lastTs = prevEngine?.lastLogAt ? new Date(prevEngine.lastLogAt) : new Date(0);
  const latestDur = {};
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1], b = log[i];
    if (b.kind !== 'STEP' || a.mode !== b.mode || etDay(a.at) !== etDay(b.at)) continue;
    const sec = (b.at - a.at) / 1000;
    if (sec <= 0 || sec > 1800) continue;
    latestDur[b.file] = sec;
    if (b.at > lastTs) baselines[b.file] = [...(baselines[b.file] ?? []), Math.round(sec)].slice(-30);
  }

  // ---- pipeline heartbeat: is a run executing right now? Evidence = OS-held execution lock inside a scheduled window ----
  const inPrep = nowMin >= T.prepWindowMin[0] && nowMin < T.prepWindowMin[1] + 5;
  const slot = c.slots.find((s) => nowMin >= s && nowMin < s + T.dispatchDeadlineMin + 5);
  const running = lock.state === 'HELD' && (inPrep || slot != null);
  const mode = running ? (slot != null ? 'Dispatch' : 'Prepare') : null;
  const windowStartMin = running ? (slot ?? T.prepWindowMin[0]) : null;
  const deadlineMin = running ? (slot != null ? slot + T.dispatchDeadlineMin : T.prepWindowMin[0] + T.prepDeadlineMin) : null;
  const runLog = running ? log.filter((l) => etDay(l.at) === day && l.mode === mode && etMinutes(l.at) >= windowStartMin - 1) : [];
  const lastStep = [...runLog].reverse().find((l) => l.kind === 'STEP');
  const startedLowerBound = runLog[0]?.at ?? etWallToUtc(day, windowStartMin ?? 0);
  const activeStage = running ? (mode === 'Dispatch' ? 'GMAIL_DISPATCH' : (lastStep ? (FILE_STAGE[lastStep.file] ?? 'QUEUE_PREPARATION') : 'DISCOVERY')) : null;
  const staleLock = lock.state === 'HELD' && !running;
  const overdue = running && nowMin >= deadlineMin;

  // ---- per-indicator evidence ------------------------------------------------------------------
  const logByStage = (id) => log.filter((l) => l.kind === 'STEP' && FILE_STAGE[l.file] === id);
  const indicators = STAGES.map((st) => {
    const p = pipe[st.pipeline];
    const steps = logByStage(st.id);
    const okStep = [...steps].reverse().find((l) => l.exit === 0);
    const failed24 = steps.filter((l) => l.exit !== 0 && now - l.at < 864e5);
    const lastSuccess = [p?.lastSuccess, okStep && toIso(okStep.at)].filter(Boolean).sort().at(-1) ?? null;
    let state = 'UNKNOWN', reason = 'No telemetry for this stage';
    if (p) {
      state = { OK: 'OK', DEGRADED: 'WARN', FAILED: 'FAILED', BLOCKED: 'BLOCKED', STALE: 'WARN', UNKNOWN: 'UNKNOWN' }[p.status] ?? 'UNKNOWN';
      reason = p.note ?? (state === 'OK' ? 'Last run completed' : `Stage ${p.status.toLowerCase()}`);
    }
    if (st.id === 'GMAIL_DISPATCH') {
      if (gmailBlocked) { state = 'BLOCKED'; reason = 'Gmail authorization incomplete. Sender is gated.'; }
      else if (c.windows.some((w) => ['BLOCKED', 'FAILED', 'MISSED'].includes(w.state))) { state = 'FAILED'; reason = `Window ${c.windows.find((w) => ['BLOCKED', 'FAILED', 'MISSED'].includes(w.state)).state.toLowerCase()} today`; }
    }
    if (st.id === 'REPLY_PROCESSING' && c.replyCoverage === 'UNKNOWN') {
      const gm = (c.src.foundry_day_review.data?.blockers ?? []).some((b) => /GMAIL_CONFIGURATION_MISSING/.test(b));
      state = gm ? 'BLOCKED' : 'UNKNOWN'; reason = gm ? 'Reply review blocked: Gmail configuration missing' : 'Reply coverage unknown';
    }
    if (st.id === 'VERIFICATION' && p?.status === 'FAILED') reason = `Audit failing: ${(c.auditFailures[0] ?? 'see audit').toLowerCase().replace(/_/g, ' ')}`;
    const active = activeStage === st.id;
    let activity = null;
    if (active) { state = overdue ? 'SLOW' : 'ACTIVE'; activity = `${mode === 'Dispatch' ? 'Dispatch window' : 'Preparation run'} holds the execution lock`; reason = overdue ? `Run exceeded its ${mode === 'Dispatch' ? T.dispatchDeadlineMin : T.prepDeadlineMin}-minute limit` : reason; }
    const recent = [...steps.slice(-5).map((l) => ({ at: toIso(l.at), text: `${l.file} ${l.exit === 0 ? 'completed' : `exit ${l.exit ?? '?'}`}`, ok: l.exit === 0 })),
      ...(p?.lastRun ? [{ at: p.lastRun, text: `Report written (${p.status.toLowerCase()})`, ok: p.status === 'OK' }] : [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    const base = steps.length ? baselines[steps.at(-1).file] : null;
    return {
      id: st.id, label: st.label, state, lastSuccess, activity, errors: (p?.errors ?? 0) + failed24.length, reason: scrub(reason, 160), items: p?.items ?? null,
      detail: { recent, durationSec: steps.length ? (latestDur[steps.at(-1).file] ?? null) : null, baselineMedianSec: base?.length >= T.minBaselineSamples ? median(base) : null, latestIssue: state === 'OK' || state === 'ACTIVE' ? null : scrub(reason, 200) },
    };
  });

  // ---- deterministic rules (rank = priority; highest first) ------------------------------------
  const issues = [];
  const R = (id, rank, severity, stage, title, evidence) => issues.push({ id, rank, severity, stage, title, evidence: evidence.map((e) => scrub(e, 200)) });
  if (!db) R('SQLITE_UNREADABLE', 100, 'CRITICAL', 'VERIFICATION', 'CRM database unreadable', [`Read-only open failed: ${scrub(c.dbError, 80)}`]);
  if (gmailBlocked) R('GMAIL_AUTH', 95, 'CRITICAL', 'GMAIL_DISPATCH', 'Gmail authorization incomplete', [...(c.src.foundry_safety_audit.data?.failures ?? []).map((f) => `foundry_safety_audit: ${f}`), ...(db?.safetyControl ?? []).map((r) => `safety_control: ${r.reason}`)]);
  if (db?.readySuppressed) R('SUPPRESSION_CONFLICT', 94, 'CRITICAL', 'VERIFICATION', 'Suppressed contacts present in READY routes', [`${db.readySuppressed} READY route(s) matched suppression`]);
  const badWin = c.windows.filter((w) => ['BLOCKED', 'FAILED', 'MISSED'].includes(w.state));
  if (badWin.length) R('DISPATCH_ERRORS', 90, 'CRITICAL', 'GMAIL_DISPATCH', 'Dispatch window did not complete cleanly', badWin.map((w) => `${w.label}: ${w.state} (${w.sent ?? 0} sent, ${w.errors ?? 0} blocker(s); ${w.evidence.toLowerCase().replace(/_/g, ' ')})`));
  if (exporterRun?.lastError) R('PUBLISH_FAILURE', 85, 'WARNING', null, 'Snapshot publishing failed', [exporterRun.lastError]);
  const prepToday = c.prepAt && etDay(c.prepAt) === day;
  if (!prepToday && !running && nowMin >= T.prepWindowMin[0] + T.prepDeadlineMin + T.prepGraceMin) R('MISSED_PREP', 80, 'WARNING', 'QUEUE_PREPARATION', 'No preparation report today', [`Expected by ${fmtHm(T.prepWindowMin[0] + T.prepDeadlineMin + T.prepGraceMin)}; latest report ${c.prepAt ? c.prepAt.toISOString() : 'none'}`]);
  if (overdue) R('PREP_DELAY', 78, 'WARNING', activeStage, `${mode} run exceeded its time limit`, [`Lock held at ${fmtHm(nowMin)}, limit ${fmtHm(deadlineMin)}`]);
  const slow = Object.entries(latestDur).filter(([f, sec]) => { const b = baselines[f]; return b?.length >= T.minBaselineSamples && sec > T.slowFactor * median(b) && sec - median(b) > T.slowMinExtraSec; });
  if (slow.length) R('SLOW_VS_BASELINE', 72, 'WARNING', FILE_STAGE[slow[0][0]], 'Step slower than its baseline', slow.map(([f, s]) => `${f}: ${Math.round(s)}s vs median ${Math.round(median(baselines[f]))}s (${baselines[f].length} samples, threshold ${T.slowFactor}×)`));
  if (staleLock) R('STALE_LOCK', 70, 'WARNING', null, 'Execution lock held outside any scheduled window', ['foundry_execution.lock is held with no preparation or dispatch window active. Not cleared automatically.']);
  if (c.auditFailures.length) R('VALIDATION_FAILED', 65, 'WARNING', 'VERIFICATION', 'Daily audit failing', c.auditFailures.map((f) => `foundry_daily_audit: ${f}`));
  if (db?.readyMultiService) R('DUPLICATE_CONFLICT', 62, 'WARNING', 'VERIFICATION', 'Business READY in more than one campaign', [`${db.readyMultiService} business(es)`]);
  const crit = snap.leads.byCampaign.filter((x) => x.inventoryState === 'CRITICAL');
  if (crit.length || (db && !(db.preparedSnapshots > 0))) R('QUEUE_SHORTAGE', 55, 'WARNING', 'QUEUE_PREPARATION', 'Send queue shortage', [...crit.map((x) => `${x.short}: ${x.readyEmail} EMAIL-ready (CRITICAL < 150)`), ...(db && !(db.preparedSnapshots > 0) ? ['No immutable send snapshot prepared (safety_snapshots empty)'] : [])]);
  const bad = snap.dataQuality.crossChecks.filter((x) => !x.ok && x.id !== 'crm_vs_production_report');
  if (bad.length || c.historyUnreconciled) R('CRM_LEDGER_MISMATCH', 50, 'WARNING', 'VERIFICATION', 'CRM and Gmail ledger not reconciled', [...bad.map((x) => x.detail), ...(c.historyUnreconciled ? ['Gmail send history not reconciled; local zero sends is not proof of zero sent'] : [])]);
  const wj = db?.workerJobs ?? [];
  const pending = wj.filter((w) => w.status === 'PENDING').reduce((a, w) => a + w.n, 0);
  if (pending >= T.backlogPending) R('WORKER_BACKLOG', 20, 'INFO', null, 'Worker job backlog', [`${pending} jobs PENDING in worker_jobs. Cause not established by available evidence.`]);
  issues.sort((a, b) => b.rank - a.rank);

  // ---- engine state (precedence: UNKNOWN > BLOCKED > SLOW > PROCESSING > IDLE) ----------------------
  const blocking = indicators.filter((i) => ['BLOCKED', 'FAILED'].includes(i.state));
  const hasCritical = issues.some((i) => i.severity === 'CRITICAL') || snap.health.status === 'BLOCKED';
  let state, headline;
  if (insufficient) { state = 'UNKNOWN'; headline = 'Telemetry missing or insufficient'; }
  else if (hasCritical) { state = 'BLOCKED'; const top = issues.find((i) => i.severity === 'CRITICAL'); headline = top ? top.title : 'Blocking health check failed'; }
  else if (overdue || issues.some((i) => i.id === 'SLOW_VS_BASELINE')) { state = 'SLOW'; headline = issues.find((i) => ['PREP_DELAY', 'SLOW_VS_BASELINE'].includes(i.id))?.title ?? 'Slowdown detected — cause unknown'; }
  else if (running) { state = 'PROCESSING'; headline = `${indicators.find((i) => i.id === activeStage)?.label} in progress`; }
  else { state = 'IDLE'; headline = issues.length ? issues[0].title : 'Healthy and idle'; }
  const failed = blocking.some((i) => i.state === 'FAILED') && !blocking.some((i) => i.state === 'BLOCKED') ? 'FAILED' : 'BLOCKED';

  const nextWin = snap.outreach.windows.find((w) => w.state === 'SCHEDULED');
  return {
    schemaVersion: ENGINE_VERSION, generatedAt: nowIso, lastLogAt: log.at(-1) ? toIso(log.at(-1).at) : (prevEngine?.lastLogAt ?? null),
    thresholds: T,
    state, stoppedKind: state === 'BLOCKED' ? failed : null, caution: state === 'IDLE' && issues.some((i) => i.severity !== 'INFO'),
    headline: scrub(headline, 120),
    process: running ? { mode, jobId: `${mode.toLowerCase()}-${day}-${String(windowStartMin).padStart(4, '0')}`, stage: activeStage, startedAtLowerBound: toIso(startedLowerBound), elapsedSecAtLeast: Math.max(0, Math.round((now - startedLowerBound) / 1000)), items: lastStep ? null : null, evidence: 'foundry_execution.lock held inside a scheduled window' } : null,
    heartbeats: {
      exporter: { lastSuccessAt: nowIso, lastError: exporterRun?.lastError ? scrub(exporterRun.lastError, 160) : null, staleAfterMin: T.snapshotStaleMin, note: 'Age is judged from this file’s publish time on GitHub Pages' },
      pipeline: { state: running ? 'RUNNING' : staleLock ? 'LOCK_ANOMALY' : lock.state === 'UNKNOWN' ? 'UNKNOWN' : prepToday ? 'COMPLETED_TODAY' : 'NO_RUN_EVIDENCE_TODAY', lastPreparationAt: toIso(c.prepAt), lock: lock.state },
      dispatch: { state: gmailBlocked ? 'BLOCKED' : badWin.length ? 'FAILED' : 'GATES_OK', gates: { gmailAuthorization: gmailBlocked ? 'FAIL' : 'OK', safetyAudit: c.src.foundry_safety_audit.data?.status ?? 'UNKNOWN', dailyCap: snap.outreach.dailyCap }, windows: c.windows.map((w) => ({ id: w.id, label: w.label, state: w.state })), next: nextWin ? { label: nextWin.label, at: nextWin.scheduledAt } : null },
    },
    indicators, activePathways: running ? [activeStage] : [],
    diagnostics: issues.slice(0, 12),
    metrics: { ready: snap.leads.byQualification?.READY ?? null, sentToday: snap.outreach.sentToday, dailyCap: snap.outreach.dailyCap, preparedSnapshots: snap.outreach.queued.preparedSnapshots, total: snap.leads.total },
    baselines,
  };
}
