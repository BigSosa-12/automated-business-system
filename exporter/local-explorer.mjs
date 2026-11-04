#!/usr/bin/env node
// PRIVATE local lead explorer. Binds to 127.0.0.1 only; reads prospect_foundry.sqlite read-only. Never publish its output.
// Usage: node exporter/local-explorer.mjs [--src <OutreachQueue dir>] [--port 4477]
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dir = opt('src', process.env.FOUNDRY_DIR || 'C:\\Users\\hahak\\OneDrive\\Desktop\\OutreachQueue');
const port = Number(opt('port', 4477));
const db = new DatabaseSync(path.join(dir, 'prospect_foundry.sqlite'), { readOnly: true });
db.exec('PRAGMA busy_timeout = 4000; PRAGMA query_only = ON;');
const hasEvents = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='outreach_events'").get();

const SQL = `SELECT b.id, b.name, b.city, b.state, c.primary_campaign AS campaign, c.qualification_state AS qualification, c.contact_route AS route,
  c.fit_reason AS evidence, c.last_verified_at AS verified,
  (SELECT value FROM contacts k WHERE k.business_id=b.id AND k.channel=c.contact_route LIMIT 1) AS contact,
  (SELECT r.status || ': ' || r.reason FROM route_queue r WHERE r.business_id=b.id AND r.service=c.primary_campaign LIMIT 1) AS next_action,
  ${hasEvents ? "(SELECT e.event || ' ' || e.at FROM outreach_events e WHERE e.business_id=b.id ORDER BY e.at DESC LIMIT 1)" : 'NULL'} AS last_activity
  FROM businesses b JOIN business_classification c ON c.business_id=b.id
  WHERE (@q='' OR b.name LIKE @like OR b.city LIKE @like OR c.fit_reason LIKE @like)
    AND (@campaign='' OR c.primary_campaign=@campaign) AND (@state='' OR c.qualification_state=@state) AND (@route='' OR c.contact_route=@route)
  ORDER BY b.id LIMIT 300`;
const stmt = db.prepare(SQL);
const facets = () => ({
  campaign: db.prepare('SELECT DISTINCT primary_campaign v FROM business_classification ORDER BY 1').all().map((r) => r.v),
  state: db.prepare('SELECT DISTINCT qualification_state v FROM business_classification ORDER BY 1').all().map((r) => r.v),
  route: db.prepare('SELECT DISTINCT contact_route v FROM business_classification ORDER BY 1').all().map((r) => r.v),
});

const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lead Explorer (private, local)</title>
<style>
:root{--bg:#09090F;--text:#F8F7FC;--t2:#A7A1B5;--lav:#A78BFA;--lilac:#E9D5FF}
*{box-sizing:border-box}body{margin:0;min-height:100vh;color:var(--text);font:14px/1.45 system-ui,sans-serif;padding:20px;
background:radial-gradient(60vmax 44vmax at 12% -8%,rgba(139,92,246,.26),transparent 62%),radial-gradient(52vmax 40vmax at 96% 12%,rgba(167,139,250,.16),transparent 60%),var(--bg)}
.glass{border-radius:20px;background:rgba(23,19,33,.45);-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(233,213,255,.09);box-shadow:0 24px 60px -28px rgba(139,92,246,.38),inset 0 1px 0 rgba(255,255,255,.07);padding:16px 18px;margin-bottom:16px}
@supports not (backdrop-filter:blur(1px)){.glass{background:#171321}}
h1{font-size:19px;margin:0 0 4px}.sub{color:var(--t2);font-size:12px}.warn{color:#FCD34D}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
input,select{background:rgba(167,139,250,.08);border:1px solid rgba(233,213,255,.14);border-radius:12px;color:var(--text);padding:8px 12px;font:inherit}
input{flex:1;min-width:200px}.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--t2);font-weight:500;padding:6px 8px;white-space:nowrap}td{padding:8px;border-top:1px solid rgba(233,213,255,.07);vertical-align:top;max-width:340px;overflow-wrap:anywhere}
tr:hover td{background:rgba(167,139,250,.06)}
.p{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(167,139,250,.14);color:#C4B5FD}.p.READY{background:rgba(52,211,153,.12);color:#6EE7B7}.p.SUPPRESSED{background:rgba(248,113,113,.14);color:#FCA5A5}.p.UNRESOLVED{background:rgba(251,191,36,.12);color:#FCD34D}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<div class="glass"><h1>Lead Explorer</h1><div class="sub">Private · local only · read-only · <span class="warn">contains business contact details: never publish</span></div>
<div class="bar"><input id="q" placeholder="Search name, city, evidence…" aria-label="Search"><select id="campaign"></select><select id="state"></select><select id="route"></select></div></div>
<div class="glass"><div class="sub" id="count"></div><div class="wrap"><table><thead><tr><th>Business</th><th>Campaign</th><th>Location</th><th>Qualification</th><th>Route / contact</th><th>Evidence</th><th>Last activity</th><th>Next action</th></tr></thead><tbody id="rows"></tbody></table></div></div>
<script>
const $=id=>document.getElementById(id);let t;
const cell=(v,cls)=>{const td=document.createElement('td');if(cls){const s=document.createElement('span');s.className='p '+cls;s.textContent=v??'—';td.append(s)}else td.textContent=v??'—';return td};
async function load(){const p=new URLSearchParams({q:$('q').value,campaign:$('campaign').value,state:$('state').value,route:$('route').value});
const r=await (await fetch('/api/leads?'+p)).json();$('count').textContent=r.length+(r.length===300?'+':'')+' businesses shown';const tb=$('rows');tb.replaceChildren();
for(const x of r){const tr=document.createElement('tr');tr.append(cell(x.name),cell(x.campaign),cell([x.city,x.state].filter(Boolean).join(', ')),cell(x.qualification,x.qualification),cell(x.route+(x.contact?' · '+x.contact:'')),cell(x.evidence),cell(x.last_activity||'none recorded'),cell(x.next_action));tb.append(tr)}}
(async()=>{const f=await (await fetch('/api/facets')).json();for(const k of ['campaign','state','route']){const s=$(k);s.append(new Option('All '+k+'s',''));f[k].forEach(v=>s.append(new Option(v,v)));s.onchange=load}
$('q').oninput=()=>{clearTimeout(t);t=setTimeout(load,200)};load()})();
</script></html>`;

http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) { res.writeHead(403); return res.end('forbidden'); } // blocks DNS-rebinding
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname === '/api/leads') {
      const q = u.searchParams.get('q') || '';
      const rows = stmt.all({ q, like: `%${q}%`, campaign: u.searchParams.get('campaign') || '', state: u.searchParams.get('state') || '', route: u.searchParams.get('route') || '' });
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(rows));
    }
    if (u.pathname === '/api/facets') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(facets())); }
    if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(PAGE); }
    res.writeHead(404); res.end('not found');
  } catch (e) { res.writeHead(500); res.end('query failed'); }
}).listen(port, '127.0.0.1', () => console.log(`Lead Explorer (private) → http://127.0.0.1:${port}  (Ctrl+C to stop)`));
