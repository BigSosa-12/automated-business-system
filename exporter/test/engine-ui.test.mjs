import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { engineView } from '../../dashboard/src/engineState.ts';

const NOW = Date.parse('2026-11-04T18:00:00Z');
const T = { snapshotStaleMin: 75, processingTtlMin: 6, prepDeadlineMin: 25, dispatchDeadlineMin: 10, slowFactor: 2 };
const mk = (state, minAgo, extra = {}) => ({ schemaVersion: 1, generatedAt: new Date(NOW - minAgo * 60000).toISOString(), thresholds: T, state, stoppedKind: null, caution: false, headline: 'h', ...extra });

test('null telemetry is UNKNOWN and stopped', () => { const v = engineView(null, NOW); assert.equal(v.state, 'UNKNOWN'); assert.equal(v.spin, 'stopped'); });
test('IDLE fresh turns gently and is not stale', () => { const v = engineView(mk('IDLE', 20), NOW); assert.equal(v.state, 'IDLE'); assert.equal(v.spin, 'idle'); });
test('idle engine is not marked stale while telemetry is fresh', () => assert.notEqual(engineView(mk('IDLE', 74), NOW).state, 'STALE'));
test('old telemetry is STALE: rings stop, shows age', () => { const v = engineView(mk('IDLE', 76), NOW); assert.equal(v.state, 'STALE'); assert.equal(v.spin, 'stopped'); assert.ok(v.ageMin > 75); });
test('PROCESSING fresh spins fast', () => { const v = engineView(mk('PROCESSING', 2), NOW); assert.equal(v.state, 'PROCESSING'); assert.equal(v.spin, 'fast'); });
test('PROCESSING older than TTL is paused, never extrapolated', () => { const v = engineView(mk('PROCESSING', 10), NOW); assert.equal(v.spin, 'stopped'); assert.equal(v.label, 'LIVE VIEW PAUSED'); });
test('SLOW is amber with a fallback reason', () => { const v = engineView(mk('SLOW', 3, { headline: '' }), NOW); assert.equal(v.spin, 'slow'); assert.ok(v.amber); assert.match(v.detail, /cause unknown/); });
test('BLOCKED / FAILED stop and keep a text label', () => { assert.equal(engineView(mk('BLOCKED', 3, { stoppedKind: 'FAILED' }), NOW).label, 'FAILED'); assert.equal(engineView(mk('BLOCKED', 3), NOW).spin, 'stopped'); });
test('UNKNOWN never looks healthy', () => { const v = engineView(mk('UNKNOWN', 3), NOW); assert.equal(v.spin, 'stopped'); assert.equal(v.amber, false); });
test('invalid timestamp is UNKNOWN', () => assert.equal(engineView(mk('IDLE', 1, { generatedAt: 'nope' }), NOW).state, 'UNKNOWN'));

test('frontend is read-only: no write-capable network calls', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(new URL('../../dashboard/src', import.meta.url).pathname).filter((f) => /\.(tsx?|jsx?)$/.test(f));
  const bad = /XMLHttpRequest|sendBeacon|WebSocket|method\s*:\s*['"`](POST|PUT|PATCH|DELETE)|<form\b|localStorage\.setItem/i;
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), bad, f);
  const fetches = files.flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[0]));
  assert.ok(fetches.length >= 2); for (const x of fetches) assert.doesNotMatch(x, /method/i);
});
