#!/usr/bin/env node
// Prospect Foundry Command Center — read-only snapshot exporter.
// Usage: node exporter/export-snapshot.mjs [--publish] [--dry-run] [--force] [--src <OutreachQueue dir>] [--out <file>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from './lib/build.mjs';
import { buildEngine } from './lib/engine.mjs';
import { scrub, assertPublicSafe } from './lib/sanitize.mjs';
import { validateSnapshot, validateEngine } from './lib/validate.mjs';
import { inProtectedWindow } from './lib/time.mjs';
import { queryScheduler } from './lib/sources.mjs';
import { acquire } from './lib/lock.mjs';
import { publish } from './lib/publish.mjs';

const HEARTBEAT_MS = 30 * 60e3; // unchanged data is re-stamped at most this often, so Git history stays quiet

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const srcDir = opt('src', process.env.FOUNDRY_DIR || 'C:\\Users\\hahak\\OneDrive\\Desktop\\OutreachQueue');
const outFile = path.resolve(opt('out', path.join(repo, 'dashboard', 'public', 'data', 'snapshot.json')));
const engineFile = path.join(path.dirname(outFile), 'engine-status.json');
const stateDir = path.join(here, 'state');
fs.mkdirSync(stateDir, { recursive: true });
const log = (m) => { try { fs.appendFileSync(path.join(stateDir, 'export.log'), `${new Date().toISOString()} ${m}\n`); } catch { /* best effort */ } console.log(m); };
const lastRunFile = path.join(stateDir, 'last-run.json');
const readLast = () => { try { return JSON.parse(fs.readFileSync(lastRunFile, 'utf8')); } catch { return {}; } };
const writeLast = (o) => fs.writeFileSync(lastRunFile, JSON.stringify(o, null, 1));

// Stable content hash ignoring timestamps that change on every run.
const stable = (s) => crypto.createHash('sha256').update(JSON.stringify(s, (k, v) => (['generatedAt'].includes(k) ? undefined : v))).digest('hex');

async function main() {
  const now = new Date();
  if (!flag('force') && inProtectedWindow(now)) { log('DEFERRED protected dispatch window'); return 0; }
  const release = acquire(path.join(stateDir, 'exporter.lock'));
  if (!release) { log('SKIPPED another exporter run is active'); return 0; }
  const prevRun = readLast();
  try {
    let prev = null; try { prev = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch { /* first run */ }
    const scheduler = await queryScheduler(execFileSync);
    let prevEngine = null; try { prevEngine = JSON.parse(fs.readFileSync(engineFile, 'utf8')); } catch { /* first run */ }
    const collect = {};
    const exporterRun = { lastError: prevRun.publishError ?? null };
    const snap = buildSnapshot({ dir: srcDir, now, prev, scheduler, exporterRun, collect });
    const engine = buildEngine({ now, snap, c: collect, dir: srcDir, prevEngine, exporterRun });
    // Hard gates: sanitize, then validate. Failure keeps the previous valid snapshot untouched.
    const clean = JSON.parse(JSON.stringify(snap), (k, v) => (typeof v === 'string' ? scrub(v, 400) : v));
    const cleanEngine = JSON.parse(JSON.stringify(engine), (k, v) => (typeof v === 'string' ? scrub(v, 400) : v));
    assertPublicSafe(clean); assertPublicSafe(cleanEngine);
    const errs = [...validateSnapshot(clean), ...validateEngine(cleanEngine)];
    if (errs.length) throw new Error('SCHEMA_INVALID: ' + errs.slice(0, 5).join('; '));

    const unchanged = prev && prevEngine && stable(prev) === stable(clean) && stable(prevEngine) === stable(cleanEngine) && now - new Date(prev.generatedAt) < HEARTBEAT_MS;
    if (unchanged) { log('UNCHANGED no write'); writeLast({ ...prevRun, checkedAt: now.toISOString(), exportError: null }); return 0; }
    if (flag('dry-run')) { console.log(JSON.stringify(clean, null, 1).slice(0, 1500)); return 0; }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const tmp = outFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 1) + '\n');
    fs.renameSync(tmp, outFile); // atomic replace
    fs.writeFileSync(engineFile + '.tmp', JSON.stringify(cleanEngine, null, 1) + '\n');
    fs.renameSync(engineFile + '.tmp', engineFile);
    log(`WROTE ${path.relative(repo, outFile)} + engine health=${clean.health.status} engine=${cleanEngine.state}`);
    let publishError = null;
    if (flag('publish')) {
      try { const r = publish(repo, clean.generatedAt); log(`PUBLISH ${r.reason}`); }
      catch (e) { publishError = scrub(e.stderr || e.message, 200); log(`PUBLISH_FAILED ${publishError}`); }
    }
    writeLast({ checkedAt: now.toISOString(), exportedAt: now.toISOString(), exportError: null, publishError });
    return publishError ? 3 : 0;
  } catch (e) {
    const msg = scrub(e.message, 300);
    log(`EXPORT_FAILED ${msg} (previous snapshot preserved)`);
    writeLast({ ...prevRun, checkedAt: now.toISOString(), exportError: msg });
    return 2;
  } finally { release(); }
}
main().then((c) => process.exit(c));
