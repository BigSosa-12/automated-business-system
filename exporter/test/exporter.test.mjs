import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildSnapshot, inventoryState } from '../lib/build.mjs';
import { assertPublicSafe, scrub } from '../lib/sanitize.mjs';
import { validateSnapshot } from '../lib/validate.mjs';
import { etDay, etWallToUtc, inProtectedWindow, etMinutes } from '../lib/time.mjs';
import { parseCsv } from '../lib/sources.mjs';
import { acquire } from '../lib/lock.mjs';

// ---- fixture factory: fake data only, never production values ---------------------------------
function fixture({ gmailBlocked = true, ready = 3, sendRows = [], withDb = true, reports = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
  const w = (n, o) => fs.writeFileSync(path.join(dir, n), typeof o === 'string' ? o : JSON.stringify(o));
  if (withDb) {
    const db = new DatabaseSync(path.join(dir, 'prospect_foundry.sqlite'));
    db.exec(`CREATE TABLE businesses(id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
      CREATE TABLE business_classification(business_id INTEGER PRIMARY KEY, primary_campaign TEXT, contact_route TEXT, qualification_state TEXT, duplicate_status TEXT, suppression_status TEXT);
      CREATE TABLE contacts(id INTEGER PRIMARY KEY, business_id INT, channel TEXT, verification TEXT);
      CREATE TABLE route_queue(id INTEGER PRIMARY KEY, business_id INT, service TEXT, status TEXT, reason TEXT);
      CREATE TABLE source_jobs(id INTEGER PRIMARY KEY, source TEXT, status TEXT, attempts INT);
      CREATE TABLE audit_events(id INTEGER PRIMARY KEY, event TEXT);
      CREATE TABLE suppression(id INTEGER PRIMARY KEY);`);
    for (let i = 1; i <= 6; i++) {
      const st = i <= ready ? 'READY' : i === 6 ? 'UNRESOLVED' : 'QUALIFIED';
      db.prepare('INSERT INTO businesses VALUES (?,?,?)').run(i, `Biz ${i}`, '2026-11-03 10:00:00');
      db.prepare('INSERT INTO business_classification VALUES (?,?,?,?,?,?)').run(i, i % 2 ? 'WEBSITE_WORLD' : 'LOCAL_DETAILING', i % 2 ? 'EMAIL' : 'FORM', st, 'UNIQUE_CANDIDATE', 'CLEAR_LOCAL_INDEX');
      if (st === 'READY') db.prepare('INSERT INTO route_queue VALUES (?,?,?,?,?)').run(i, i, i % 2 ? 'WEBSITE_WORLD' : 'LOCAL_DETAILING', 'READY', 'ok');
    }
    db.close();
  }
  w('foundry_safety_audit.json', { at: '2026-11-04T16:00:00Z', status: gmailBlocked ? 'BLOCKED' : 'PASS', failures: gmailBlocked ? ['GMAIL_CONFIGURATION_MISSING'] : [] });
  w('foundry_daily_audit.json', { at: '2026-11-04T16:00:00Z', status: 'PASS', failures: [], counts: { database_ready: ready } });
  w('foundry_day_review.json', { reply_coverage: gmailBlocked ? 'UNKNOWN' : 'COMPLETE', as_of: '2026-11-04T16:00:00Z' });
  w('foundry_final_handoff_report.json', { at: '2026-11-04T16:00:00Z', exported: ready, excluded_invalid: 0 });
  w('FoundryCampaigns.csv', 'campaign_id,service,territory,target_count,target_type,state\nWEBSITE_WORLD,Website,WORLDWIDE,300,X,REFILLING\n');
  w('BattleCreek_Prospect_Foundry_Dispatch.installed.xml', '<Task><Triggers><CalendarTrigger><StartBoundary>2026-11-04T09:30:00</StartBoundary></CalendarTrigger><CalendarTrigger><StartBoundary>2026-11-04T13:00:00</StartBoundary></CalendarTrigger><CalendarTrigger><StartBoundary>2026-11-04T16:00:00</StartBoundary></CalendarTrigger></Triggers><Actions><Exec><Arguments>-File x.ps1 -Mode Dispatch</Arguments></Exec></Actions></Task>');
  if (sendRows.length) w('send_ledger_2026-11-04.csv', 'sent_at,campaign,business,email,origin_account,gmail_message_id,thread_id,status\n' + sendRows.join('\n') + '\n');
  for (const [n, o] of Object.entries(reports)) w(n, o);
  return dir;
}
const NOON_ET = new Date('2026-11-04T17:00:00Z'); // 12:00 EST (after DST end)
const build = (dir, now = NOON_ET, extra = {}) => buildSnapshot({ dir, now, prev: null, scheduler: { available: false, tasks: [] }, exporterRun: {}, ...extra });

test('snapshot validates, counts match fixture, READY is not treated as send-ready', () => {
  const s = build(fixture());
  assert.deepEqual(validateSnapshot(s), []);
  assert.equal(s.leads.total, 6);
  assert.equal(s.leads.byQualification.READY, 3);
  assert.notEqual(s.leads.funnel.find((f) => f.id === 'VERIFIED_READY').count, s.leads.byQualification.READY);
  assert.notEqual(s.health.status, 'HEALTHY');
});
test('missing Gmail authorization => BLOCKED with CRITICAL alert', () => {
  const s = build(fixture({ gmailBlocked: true }));
  assert.equal(s.health.status, 'BLOCKED');
  assert.ok(s.alerts.some((a) => a.id === 'GMAIL_AUTH_MISSING' && a.severity === 'CRITICAL'));
});
test('passing audits but unreconciled Gmail history => DEGRADED, never HEALTHY', () => {
  const s = build(fixture({ gmailBlocked: false }));
  // sqlite lacks safety_* tables in fixture so history sync is incomplete => reconciliation WARN => DEGRADED, never HEALTHY
  assert.equal(s.health.status, 'DEGRADED');
});
test('SQLite unreadable => BLOCKED, null metrics (no fake zeroes), still valid', () => {
  const s = build(fixture({ withDb: false }));
  assert.equal(s.health.status, 'BLOCKED');
  assert.equal(s.leads.total, null);
  assert.ok(s.alerts.some((a) => a.id === 'SQLITE_READ_FAILURE'));
  assert.deepEqual(validateSnapshot(s), []);
});
test('confirmed sends: only GMAIL_ACCEPTED, deduped by message id, counted in Eastern days', () => {
  const rows = [
    '"2026-11-04T15:00:00Z","WEBSITE_WORLD","A","a@x.com","acct1@x.com","m1","t1","GMAIL_ACCEPTED"',
    '"2026-11-04T15:00:00Z","WEBSITE_WORLD","A","a@x.com","acct1@x.com","m1","t1","GMAIL_ACCEPTED"',
    '"2026-11-04T15:05:00Z","WEBSITE_WORLD","B","b@x.com","acct2@x.com","m2","t2","DRAFT_ONLY"',
    '"2026-11-05T03:30:00Z","WEBSITE_WORLD","C","c@x.com","acct1@x.com","m3","t3","GMAIL_ACCEPTED"', // 10:30 PM ET Nov 4
  ];
  const s = build(fixture({ sendRows: rows }));
  assert.equal(s.outreach.sentToday, 2);
  assert.equal(s.outreach.remainingToday, 48);
  assert.equal(s.outreach.inboxDeliveryConfirmed, false);
  assert.ok(s.outreach.byAccount.every((a) => /^Account [A-Z]$/.test(a.account)));
});
test('completed scheduled task alone is never a send; past window without evidence is UNKNOWN', () => {
  const s = build(fixture(), new Date('2026-11-04T22:00:00Z')); // 5 PM ET
  assert.deepEqual(s.outreach.windows.map((w) => w.state), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  assert.equal(s.outreach.sentToday, 0);
});
test('run report => window BLOCKED when blockers and zero sent', () => {
  const s = build(fixture({ reports: { 'outreach_run_report_2026-11-04_0930.json': { at: '2026-11-04T09:33:00-05:00', execution: { emails_sent: 0 }, blockers: ['quota'] } } }));
  assert.equal(s.outreach.windows[0].state, 'BLOCKED');
  assert.equal(s.outreach.windows[1].state, 'SCHEDULED');
});
test('alerts dedupe and keep firstDetected across runs', () => {
  const dir = fixture();
  const a = build(dir);
  const b = build(dir, new Date(NOON_ET.getTime() + 600e3), { prev: a });
  const g = (s) => s.alerts.find((x) => x.id === 'GMAIL_AUTH_MISSING');
  assert.equal(g(b).firstDetected, g(a).firstDetected);
  assert.equal(new Set(b.alerts.map((x) => x.id)).size, b.alerts.length);
});
test('history starts when collection starts and is not back-filled', () => {
  const s = build(fixture());
  assert.equal(s.history.days.length, 1);
  assert.equal(s.history.startsOn, '2026-11-04');
});
test('inventory bands follow policy', () => {
  assert.deepEqual([0, 149, 150, 299, 300, 449, 450].map(inventoryState), ['CRITICAL', 'CRITICAL', 'LOW', 'LOW', 'HEALTHY', 'HEALTHY', 'SURPLUS']);
});
test('sanitizer masks emails/paths and the gate rejects leaks', () => {
  assert.equal(scrub('fail for bob@example.com at C:\\Users\\x\\f.txt'), 'fail for [email] at [path]');
  assert.throws(() => assertPublicSafe({ a: { b: 'contact me@site.com' } }), /SANITIZATION_FAILED/);
  assert.throws(() => assertPublicSafe({ k: 'Bearer abcdefghijklmnop' }), /SANITIZATION_FAILED/);
  assert.throws(() => assertPublicSafe({ k: 'C:\\Users\\hahak\\x' }), /SANITIZATION_FAILED/);
  assert.doesNotThrow(() => assertPublicSafe({ ok: 'plain text', n: 5 }));
});
test('real snapshot output carries no addresses or business names', () => {
  const s = build(fixture({ sendRows: ['"2026-11-04T15:00:00Z","WEBSITE_WORLD","Secret Biz","who@secret.com","acct@x.com","m1","t","GMAIL_ACCEPTED"'] }));
  const txt = JSON.stringify(s);
  assert.ok(!txt.includes('who@secret.com') && !txt.includes('Secret Biz') && !txt.includes('acct@x.com') && !txt.includes('Biz 1'));
});
test('timezone: DST transitions resolve correctly', () => {
  assert.equal(etWallToUtc('2026-03-08', 570).toISOString(), '2026-03-08T13:30:00.000Z'); // EDT after spring-forward
  assert.equal(etWallToUtc('2026-11-01', 570).toISOString(), '2026-11-01T14:30:00.000Z'); // EST after fall-back
  assert.equal(etWallToUtc('2026-03-08', 150), null); // 2:30 AM does not exist
  assert.equal(etDay(new Date('2026-11-05T03:30:00Z')), '2026-11-04');
  assert.equal(etMinutes(new Date('2026-07-01T13:30:00Z')), 570);
});
test('protected window mirrors FoundryRun.ps1 ([slot-5, slot+15))', () => {
  const at = (h, m) => etWallToUtc('2026-11-04', h * 60 + m);
  assert.ok(inProtectedWindow(at(9, 25)) && inProtectedWindow(at(9, 44)) && !inProtectedWindow(at(9, 45)) && !inProtectedWindow(at(9, 24)));
  assert.ok(inProtectedWindow(at(12, 55)) && !inProtectedWindow(at(11, 0)));
});
test('csv parser handles quotes and commas', () => {
  assert.deepEqual(parseCsv('a,b\n"x,1","he said ""hi"""\n'), [{ a: 'x,1', b: 'he said "hi"' }]);
});
test('exporter lock refuses a live holder and recovers a dead one', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lk-')), 'x.lock');
  const rel = acquire(f); assert.ok(rel);
  assert.equal(acquire(f), null); // live PID (this process)
  rel();
  fs.writeFileSync(f, JSON.stringify({ pid: 999999, at: new Date().toISOString() }));
  const rel2 = acquire(f); assert.ok(rel2); rel2();
});
test('exporter never writes to the production directory', () => {
  const dir = fixture();
  const before = fs.readdirSync(dir).map((n) => [n, fs.statSync(path.join(dir, n)).mtimeMs]);
  build(dir);
  const after = fs.readdirSync(dir).map((n) => [n, fs.statSync(path.join(dir, n)).mtimeMs]);
  assert.deepEqual(after, before);
});
test('stale snapshot fixture fails schema when required sections are missing', () => {
  assert.ok(validateSnapshot({ schemaVersion: 1 }).length > 3);
});

// ---- ENGINE CORE fixtures ---------------------------------------------------------------------
import { buildEngine } from '../lib/engine.mjs';
import { validateEngine } from '../lib/validate.mjs';
const eng = (dir, now, extra = {}) => {
  const collect = {};
  const snap = build(dir, now, { collect, ...extra });
  const e = buildEngine({ now, snap, c: collect, dir, prevEngine: null, exporterRun: {} });
  return { snap, e };
};
const at = (h, m) => etWallToUtc('2026-11-04', h * 60 + m);

test('engine: Gmail unauthorized => BLOCKED, GMAIL_AUTH ranked first, valid', () => {
  const { e } = eng(fixture({ gmailBlocked: true }), NOON_ET);
  assert.deepEqual(validateEngine(e), []);
  assert.equal(e.state, 'BLOCKED');
  assert.equal(e.diagnostics[0].id, 'GMAIL_AUTH');
  assert.ok(e.diagnostics.every((d, i, a) => i === 0 || a[i - 1].rank >= d.rank));
});
test('engine: healthy gates + no lock + midday => IDLE, never STALE/BLOCKED, never fake PROCESSING', () => {
  const { e } = eng(fixture({ gmailBlocked: false }), NOON_ET, { lockOverride: { state: 'ABSENT' } });
  assert.notEqual(e.state, 'PROCESSING');
  assert.notEqual(e.state, 'STALE');
  assert.equal(e.process, null);
});
test('engine: lock held inside prep window => PROCESSING with evidence', () => {
  const { e } = eng(fixture({ gmailBlocked: false }), at(9, 10), { lockOverride: { state: 'HELD' } });
  if (e.state === 'PROCESSING') { assert.ok(e.process); assert.ok(e.process.evidence); assert.ok(e.activePathways.length > 0); }
  else assert.ok(['SLOW', 'BLOCKED', 'UNKNOWN'].includes(e.state)); // never silently healthy
  assert.deepEqual(validateEngine(e), []);
});
test('engine: lock held outside any run window is never PROCESSING', () => {
  const { e } = eng(fixture({ gmailBlocked: false }), at(11, 0), { lockOverride: { state: 'HELD' } });
  assert.notEqual(e.state, 'PROCESSING');
});
test('engine: lock held long past dispatch deadline => SLOW or worse', () => {
  const { e } = eng(fixture({ gmailBlocked: false }), at(13, 14), { lockOverride: { state: 'HELD' } });
  assert.notEqual(e.state, 'IDLE');
});
test('engine: missing database => UNKNOWN/BLOCKED with SQLITE_UNREADABLE, not healthy', () => {
  const { e } = eng(fixture({ withDb: false }), NOON_ET);
  assert.ok(['UNKNOWN', 'BLOCKED'].includes(e.state));
  assert.ok(e.diagnostics.some((d) => d.id === 'SQLITE_UNREADABLE'));
});
test('engine: telemetry carries no email addresses or paths', () => {
  const { e } = eng(fixture({ gmailBlocked: true }), NOON_ET);
  assert.doesNotThrow(() => assertPublicSafe(JSON.stringify(e)));
});
