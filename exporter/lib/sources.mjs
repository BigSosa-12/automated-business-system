// Read-only access to existing Prospect Foundry artifacts. Nothing in this file writes to the production directory.
import fs from 'node:fs';
import path from 'node:path';

export function readJson(dir, name) {
  const file = path.join(dir, name);
  try {
    const st = fs.statSync(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return { ok: true, name, data, mtime: st.mtime, error: null };
  } catch (e) {
    return { ok: false, name, data: null, mtime: null, error: e.code || e.name };
  }
}

export function reportTime(r) {
  if (!r?.ok) return null;
  const d = r.data || {};
  for (const k of ['at', 'timestamp', 'generated_at', 'prepared_at', 'as_of']) {
    const t = d[k] && new Date(d[k]);
    if (t && !Number.isNaN(t.getTime())) return t;
  }
  return r.mtime;
}

export function listFiles(dir, re) {
  try { return fs.readdirSync(dir).filter((f) => re.test(f)).sort(); } catch { return []; }
}

// Minimal RFC-4180 CSV reader (quoted fields, doubled quotes, CRLF).
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  const h = head.map((x) => x.replace(/^﻿/, '').trim());
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

// Confirmed sends = rows in send ledgers whose status is a Gmail API acceptance. Addresses are never carried forward.
export function readLedgerSends(dir) {
  const sends = [];
  for (const f of listFiles(dir, /^send_ledger_.*\.csv$/i)) {
    let rows = [];
    try { rows = parseCsv(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    for (const r of rows) {
      if (!/^GMAIL_ACCEPTED$/i.test(r.status || '')) continue;
      const at = new Date(r.sent_at);
      if (Number.isNaN(at.getTime())) continue;
      sends.push({ id: r.gmail_message_id || `${f}:${r.sent_at}`, at, campaign: r.campaign || 'UNKNOWN', account: r.origin_account || '', source: 'LEDGER_CSV' });
    }
  }
  return sends;
}

// Production lock is an OS-exclusive handle (FileShare.None). A read-open that fails with a sharing violation means a run holds it.
export function probeProductionLock(dir) {
  const file = path.join(dir, 'foundry_execution.lock');
  if (!fs.existsSync(file)) return { state: 'ABSENT' };
  try { fs.closeSync(fs.openSync(file, 'r')); return { state: 'FREE' }; }
  catch (e) { return ['EBUSY', 'EPERM', 'EACCES'].includes(e.code) ? { state: 'HELD' } : { state: 'UNKNOWN', error: e.code }; }
}

// Scheduler definitions from the *.installed.xml exports. Pure parsing, no schtasks mutation.
export function readTaskDefinitions(dir) {
  const out = [];
  for (const f of listFiles(dir, /\.installed\.xml$/i)) {
    let xml = '';
    try { xml = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\u0000/g, ''); } catch { continue; }
    const mode = /-Mode\s+(Prepare|Dispatch|Audit)/i.exec(xml)?.[1] ?? null;
    const times = [...xml.matchAll(/<StartBoundary>[^T<]*T(\d{2}):(\d{2})/g)].map((m) => +m[1] * 60 + +m[2]);
    const enabled = !/<Enabled>false<\/Enabled>/i.test(xml.split('<Actions')[0] || '');
    out.push({ name: f.replace(/\.installed\.xml$/i, ''), mode, minutes: times, enabled });
  }
  return out;
}

// Windows only: last/next run + result per Prospect Foundry task. Skipped elsewhere. Read-only (`schtasks /query`).
export async function queryScheduler(execFileSync, platform = process.platform) {
  if (platform !== 'win32') return { available: false, reason: 'NOT_WINDOWS', tasks: [] };
  try {
    const raw = execFileSync('schtasks.exe', ['/Query', '/FO', 'CSV', '/V'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    const rows = parseCsv(raw);
    const tasks = rows.filter((r) => /Prospect_Foundry/i.test(r.TaskName || '')).map((r) => ({
      name: (r.TaskName || '').split('\\').pop(), status: r.Status || null, lastRun: r['Last Run Time'] || null,
      lastResult: r['Last Result'] ?? null, nextRun: r['Next Run Time'] || null,
    }));
    return { available: true, reason: null, tasks };
  } catch (e) { return { available: false, reason: e.code || 'QUERY_FAILED', tasks: [] }; }
}
