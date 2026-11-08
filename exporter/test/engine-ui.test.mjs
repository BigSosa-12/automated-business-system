import {fileURLToPath} from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { engineView } from '../../dashboard/src/engineState.ts';

const NOW = Date.parse('2026-11-04T18:00:00Z');
const T = { snapshotStaleMin: 75, processingTtlMin: 6, prepDeadlineMin: 25, dispatchDeadlineMin: 10, slowFactor: 2 };
const mk = (state, minAgo, extra = {}) => ({ schemaVersion: 1, generatedAt: new Date(NOW - minAgo * 60000).toISOString(), thresholds: T, state, stoppedKind: null, caution: false, headline: 'h', ...extra });

test('null telemetry is UNKNOWN and stopped', () => { const v = engineView(null, NOW); assert.equal(v.state, 'UNKNOWN'); assert.equal(v.spin, 'stopped'); });
test('IDLE fresh turns gently and is labeled smooth', () => { const v = engineView(mk('IDLE', 20), NOW); assert.equal(v.state, 'IDLE'); assert.equal(v.spin, 'idle'); assert.equal(v.label, 'SMOOTH'); });
test('idle engine is not marked stale while telemetry is fresh', () => assert.notEqual(engineView(mk('IDLE', 74), NOW).state, 'STALE'));
test('old telemetry is STALE: rings stop, shows age', () => { const v = engineView(mk('IDLE', 76), NOW); assert.equal(v.state, 'STALE'); assert.equal(v.spin, 'stopped'); assert.ok(v.ageMin > 75); });
test('PROCESSING fresh spins fast', () => { const v = engineView(mk('PROCESSING', 2), NOW); assert.equal(v.state, 'PROCESSING'); assert.equal(v.spin, 'fast'); });
test('PROCESSING older than TTL is paused, never extrapolated', () => { const v = engineView(mk('PROCESSING', 10), NOW); assert.equal(v.spin, 'stopped'); assert.equal(v.label, 'LIVE VIEW PAUSED'); });
test('SLOW is amber with a fallback reason', () => { const v = engineView(mk('SLOW', 3, { headline: '' }), NOW); assert.equal(v.spin, 'slow'); assert.ok(v.amber); assert.match(v.detail, /cause unknown/); });
test('BLOCKED / FAILED stop and keep a text label', () => { assert.equal(engineView(mk('BLOCKED', 3, { stoppedKind: 'FAILED' }), NOW).label, 'FAILED'); assert.equal(engineView(mk('BLOCKED', 3), NOW).spin, 'stopped'); });
test('UNKNOWN never looks healthy', () => { const v = engineView(mk('UNKNOWN', 3), NOW); assert.equal(v.spin, 'stopped'); assert.equal(v.amber, false); });
test('invalid timestamp is UNKNOWN', () => assert.equal(engineView(mk('IDLE', 1, { generatedAt: 'nope' }), NOW).state, 'UNKNOWN'));

test('frontend is read-only except the Templates tab, which may only POST to the local Template Studio', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(fileURLToPath(new URL('../../dashboard/src', import.meta.url))).filter((f) => /\.(tsx?|jsx?)$/.test(f));
  const bad = /XMLHttpRequest|sendBeacon|WebSocket|method\s*:\s*['"`](PUT|PATCH|DELETE)|<form\b/i;
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), bad, f);
  // Only one sanctioned write to browser storage: the last-good snapshot cache (sanitized aggregates) in App.tsx.
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/localStorage\.setItem\(([^,)]*)/g)) assert.ok(f.endsWith('App.tsx') && m[1].trim() === 'CACHE_KEY', f + ' ' + m[0]);
  for (const f of files.filter((x) => !x.endsWith('Templates.tsx'))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /method\s*:\s*['"`]POST/i, f);
    for (const m of t.matchAll(/fetch\(([^)]*)\)/g)) assert.doesNotMatch(m[0], /method/i, f);
  }
  const tpl = fs.readFileSync(files.find((x) => x.endsWith('Templates.tsx')), 'utf8');
  assert.match(tpl, /STUDIO = 'http:\/\/127\.0\.0\.1:4478'/);
  const urls = [...tpl.matchAll(/fetch\(([^,)]*)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 1); for (const u of urls) assert.match(u, /STUDIO/, 'Templates may only call the local Studio');
  assert.doesNotMatch(tpl, /https?:\/\/(?!127\.0\.0\.1)/, 'no other hosts');
});


import { nextActions, statusReport, campaignCsv, toCsv, tabTitle } from '../../dashboard/src/insights.ts';
const snap = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dashboard/public/data/snapshot.json'), 'utf8'));

test('nextActions: failing checks rank first and never invent problems', () => {
  const s = structuredClone(snap); s.health.checks = [{ id: 'a', label: 'A', state: 'OK', detail: 'fine', blocking: false }, { id: 'b', label: 'B', state: 'FAIL', detail: 'broken', blocking: true }];
  const a = nextActions(s, null, 'BLOCKED', false);
  assert.equal(a[0].tone, 'bad'); assert.ok(a.some((x) => x.id === 'chk-b')); assert.ok(!a.some((x) => x.id === 'chk-a'));
});
test('nextActions: stale data is surfaced; healthy clean state says all clear', () => {
  const s = structuredClone(snap); s.health.checks = []; s.schedules = []; s.leads.funnel = s.leads.funnel.map((f) => (f.id === 'VERIFIED_READY' ? { ...f, count: 5 } : f));
  assert.ok(nextActions(s, null, 'UNKNOWN', true).some((x) => x.id === 'stale'));
  assert.equal(nextActions(s, null, 'HEALTHY', false)[0].id, 'ok');
});
test('statusReport is aggregate-only text and csv escaping is safe', () => {
  const r = statusReport(snap, null, 'BLOCKED', false, '2026-11-08T00:00:00Z');
  assert.match(r, /OUTREACH OS — STATUS REPORT/); assert.doesNotMatch(r, /@[a-z0-9-]+\.[a-z]{2,}/i);
  assert.equal(toCsv([['a,b', 'c"d', null]]), '"a,b","c""d",\r\n');
  assert.ok(campaignCsv(snap).split('\r\n')[0].startsWith('campaign,total'));
});
test('tabTitle encodes health and cap', () => { assert.equal(tabTitle('BLOCKED', 0, 50), '🔴 BLOCKED · 0/50 · Outreach OS'); assert.match(tabTitle('UNKNOWN', null, 50), /—\/50/); });
