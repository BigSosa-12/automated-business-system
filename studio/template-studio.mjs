#!/usr/bin/env node
// PRIVATE local Template Studio. Binds to 127.0.0.1 only. Reads OutreachTemplates.json (read-only) to import existing copy.
// Writes ONLY to studio/state/. Never touches the outreach queue, SQLite, Gmail or the scheduler.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Studio, SERVICES, MIN_ACTIVE } from './library.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const SRC = arg('--src', process.env.FOUNDRY_DIR || 'C:\\Users\\hahak\\OneDrive\\Desktop\\OutreachQueue');
const PORT = Number(arg('--port', 4478));
const STATE = path.resolve(arg('--state', path.join(HERE, 'state', 'studio.json')));

const ok = (h) => /^(127\.0\.0\.1|localhost):\d+$/.test(h || '');
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
export function makeServer(studio) {
  const view = () => ({ min: MIN_ACTIVE, services: studio.summary(), templates: studio.state.templates, exportFile: path.join(path.dirname(studio.file), 'template-decisions.json') });
  return http.createServer(async (req, res) => {
  if (!ok(req.headers.host)) return send(res, 403, { error: 'forbidden host' });
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, fs.readFileSync(path.join(HERE, 'ui.html'), 'utf8'), 'text/html');
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, view());
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (req.headers['x-studio'] !== '1') return send(res, 403, { error: 'missing header' });
      let raw = ''; for await (const c of req) { raw += c; if (raw.length > 4096) return send(res, 413, { error: 'too large' }); }
      const b = raw ? JSON.parse(raw) : {};
      const act = url.pathname.slice(5);
      const r = act === 'like' ? studio.like(b.id) : act === 'dislike' ? studio.dislike(b.id) : act === 'change' ? studio.change(b.id) : act === 'used' ? studio.setUsed(b.id, b.used) : null;
      if (!r) return send(res, 404, { error: 'unknown action' });
      return send(res, 200, { ...r, state: view() });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, e.code === 404 || e.code === 409 ? e.code : 400, { error: e.message }); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const studio = new Studio(STATE, path.join(SRC, 'OutreachTemplates.json'));
  makeServer(studio).listen(PORT, '127.0.0.1', () => console.log(`Template Studio (private, local only): http://127.0.0.1:${PORT}\nExisting templates read from: ${path.join(SRC, 'OutreachTemplates.json')}\nDecisions saved to: ${path.join(path.dirname(STATE), 'template-decisions.json')}`));
}
