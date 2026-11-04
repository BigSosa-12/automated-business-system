import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Studio, SERVICES, lint, MIN_ACTIVE, POOL_TARGET } from '../../studio/library.mjs';
import { makeServer, ALLOWED_ORIGINS } from '../../studio/template-studio.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
// fake production file with the same shape as OutreachTemplates.json (literal \n line breaks)
const existingFile = (() => {
  const d = tmp(); const f = path.join(d, 'OutreachTemplates.json');
  fs.writeFileSync(f, JSON.stringify({ campaigns: { WEBSITE_WORLD: { primary: { subject: 'Existing subject', body: 'Hi [Business Name],\\n\\nExisting body.\\n\\nThanks,\\nBattleCreekServices' } }, LOCAL_DETAILING: { primary: { subject: 'Det', body: 'Hi [Business Name],\\n\\n[verified_local_ranking_line]\\n\\nThanks,\\nBrian' }, claim_fallback: 'x' } } }));
  return f;
})();
const mk = () => new Studio(path.join(tmp(), 'studio.json'), existingFile);

test('every service starts with ≥18 active templates, existing ones included verbatim', () => {
  const s = mk();
  for (const id of Object.keys(SERVICES)) assert.ok(s.active(id).length >= 18, id);
  const ex = s.state.templates.find((t) => t.id === 'WEBSITE_WORLD:existing:primary');
  assert.equal(ex.body, 'Hi [Business Name],\n\nExisting body.\n\nThanks,\nBattleCreekServices');
  assert.equal(s.state.templates.filter((t) => t.origin === 'existing').length, 2); // claim_fallback strings are not templates
});
test('generated templates pass policy lint, are unique, and vary in style', () => {
  const s = mk(); const gen = s.state.templates.filter((t) => t.origin === 'generated');
  assert.equal(new Set(gen.map((t) => t.body)).size, gen.length);
  for (const t of gen) assert.deepEqual(lint(t), [], t.id);
  for (const id of Object.keys(SERVICES)) assert.ok(new Set(gen.filter((t) => t.service === id).map((t) => t.style)).size >= 4, id);
});
test('lint blocks invented claims, urgency, guarantees, rankings and stray placeholders', () => {
  const base = { service: 'WEBSITE_WORLD', subject: 'Hi', body: 'x\n\n' + SERVICES.WEBSITE_WORLD.sign };
  for (const bad of ['We guarantee results', 'Act now', 'ranked #1 in town', 'You’re losing customers', 'Great deal!', 'Hello [First Name]']) assert.ok(lint({ ...base, body: bad + '\n\n' + SERVICES.WEBSITE_WORLD.sign }).length, bad);
  assert.deepEqual(lint(base), []);
});
test('Like locks Change; unlike unlocks it', () => {
  const s = mk(); const id = s.active('GOOGLE_REVIEWS')[3].id;
  s.like(id); assert.throws(() => s.change(id), /Liked templates are kept/); s.like(id); assert.doesNotThrow(() => s.change(id));
});
test('Change replaces with a different style and never regenerates the old copy', () => {
  const s = mk(); const old = s.active('LOCAL_PROPERTY').find((t) => t.origin === 'generated'); const before = s.active('LOCAL_PROPERTY').length;
  const r = s.change(old.id); const nu = s.get(r.added[0]);
  assert.notEqual(nu.style, old.style); assert.equal(s.get(old.id).status, 'replaced'); assert.equal(s.active('LOCAL_PROPERTY').length, before);
  assert.notEqual(nu.body, old.body);
});
test('Dislike retires, lands on the do-not-use list, and the service is topped up to stay ≥15', () => {
  const s = mk(); const ids = s.active('DIGITAL_INQUIRY').slice(0, 6).map((t) => t.id);
  ids.forEach((id) => s.dislike(id));
  assert.ok(s.active('DIGITAL_INQUIRY').length >= MIN_ACTIVE);
  const dec = JSON.parse(fs.readFileSync(path.join(path.dirname(s.file), 'template-decisions.json'), 'utf8'));
  for (const id of ids) assert.ok(dec.doNotUse.includes(id));
  const retiredBodies = new Set(ids.map((i) => s.get(i).body));
  assert.ok(s.active('DIGITAL_INQUIRY').every((t) => !retiredBodies.has(t.body)));
});
test('disliking a template already marked as sent keeps it retired and records that it was used', () => {
  const s = mk(); const id = 'WEBSITE_WORLD:existing:primary'; s.setUsed(id, true); s.dislike(id);
  const dec = JSON.parse(fs.readFileSync(path.join(path.dirname(s.file), 'template-decisions.json'), 'utf8'));
  assert.ok(dec.retired.find((r) => r.id === id && r.wasUsed === true)); assert.ok(dec.doNotUse.includes(id));
});
test('state persists across restarts and liked templates export in production line-break format', () => {
  const s = mk(); const id = s.active('LOCAL_DETAILING')[2].id; s.like(id);
  const s2 = new Studio(s.file, existingFile); assert.equal(s2.get(id).status, 'liked');
  const dec = JSON.parse(fs.readFileSync(path.join(path.dirname(s.file), 'template-decisions.json'), 'utf8'));
  assert.ok(dec.liked.LOCAL_DETAILING[0].body.includes('\\n') && !dec.liked.LOCAL_DETAILING[0].body.includes('\n'));
});
test('never writes to the production folder: existing templates file is byte-identical after heavy use', () => {
  const before = fs.readFileSync(existingFile); const s = mk();
  s.dislike(s.active('WEBSITE_WORLD')[0].id); s.change(s.active('GOOGLE_REVIEWS')[0].id); s.like(s.active('LOCAL_PROPERTY')[1].id);
  assert.ok(before.equals(fs.readFileSync(existingFile)));
});
test('server: localhost only, host-checked, POST needs custom header, actions work over HTTP', async () => {
  const s = mk(); const srv = makeServer(s); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const { port, address } = srv.address(); assert.equal(address, '127.0.0.1');
    const base = `http://127.0.0.1:${port}`;
    const raw = (headers) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: '/api/state', headers, agent: false }, (r) => { r.resume(); res(r.statusCode); }).on('error', rej));
    assert.equal(await raw({ host: 'evil.example:80' }), 403); // DNS-rebinding style Host is refused
    assert.equal(await raw({}), 200);
    assert.equal((await fetch(base + '/api/like', { method: 'POST', body: '{}' })).status, 403);
    const id = s.active('LOCAL_DETAILING')[0].id;
    const r = await fetch(base + '/api/like', { method: 'POST', headers: { 'x-studio': '1' }, body: JSON.stringify({ id }) });
    assert.equal(r.status, 200); assert.equal(s.get(id).status, 'liked');
    assert.equal((await fetch(base + '/api/change', { method: 'POST', headers: { 'x-studio': '1' }, body: JSON.stringify({ id }) })).status, 409);
    assert.match(await (await fetch(base + '/')).text(), /Template Studio/);
  } finally { srv.closeAllConnections(); srv.close(); }
});
test('studio code has no database, Gmail, or scheduler access', () => {
  for (const f of ['library.mjs', 'template-studio.mjs', 'copy.mjs']) {
    const t = fs.readFileSync(new URL('../../studio/' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(t, /node:sqlite|googleapis|nodemailer|child_process|schtasks|FoundrySend|writeFileSync\([^)]*SRC/i, f);
  }
});

test('reserve pool: every service starts with a full reserve and Dislike/Change draw from it instead of generating live', () => {
  const s = mk();
  for (const id of Object.keys(SERVICES)) assert.equal(s.reserve(id).length, POOL_TARGET, id);
  const pooled = new Set(s.reserve('GOOGLE_REVIEWS').map((t) => t.id));
  const r = s.change(s.active('GOOGLE_REVIEWS').find((t) => t.origin === 'generated').id);
  assert.ok(pooled.has(r.added[0]), 'Change drew an already-generated pool entry');
  const r2 = s.dislike(s.active('GOOGLE_REVIEWS')[0].id); // may not need a top-up while ≥15, but must never throw
  assert.ok(r2.ok);
  assert.ok(s.reserve('GOOGLE_REVIEWS').length >= 10, 'reserve refills in the background');
  assert.equal(s.state.templates.filter((t) => t.status === 'pool' && t.used !== false).length, 0);
});
test('reserve pool never leaks into the list the UI shows', async () => {
  const s = mk(); const srv = makeServer(s); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try { const j = await (await fetch(`http://127.0.0.1:${srv.address().port}/api/state`)).json(); assert.ok(j.templates.every((t) => t.status !== 'pool')); assert.ok(j.services.every((x) => x.reserve > 0)); }
  finally { srv.closeAllConnections(); srv.close(); }
});
test('CORS: the published dashboard origin is allowed (with private-network preflight); every other origin is refused', async () => {
  const s = mk(); const srv = makeServer(s); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`; const good = ALLOWED_ORIGINS[0];
  try {
    const pre = await fetch(base + '/api/like', { method: 'OPTIONS', headers: { origin: good, 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-studio,content-type', 'access-control-request-private-network': 'true' } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), good); assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
    const ok = await fetch(base + '/api/state', { headers: { origin: good } }); assert.equal(ok.status, 200); assert.equal(ok.headers.get('access-control-allow-origin'), good);
    for (const evil of ['https://evil.example', 'https://bigsosa-12.github.io.evil.example', 'http://bigsosa-12.github.io']) {
      assert.equal((await fetch(base + '/api/state', { headers: { origin: evil } })).status, 403, evil);
      assert.equal((await fetch(base + '/api/like', { method: 'POST', headers: { origin: evil, 'x-studio': '1' }, body: JSON.stringify({ id: 'x' }) })).status, 403, evil);
    }
  } finally { srv.closeAllConnections(); srv.close(); }
});
