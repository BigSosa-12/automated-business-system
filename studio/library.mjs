// Template library: deterministic generator, policy lint, and the decision store.
// Nothing here ever writes to OutreachQueue. Existing production templates are read, never modified.
import fs from 'node:fs';
import path from 'node:path';
import { SERVICES, STYLES } from './copy.mjs';

export const MIN_ACTIVE = 15;
export const TARGET_ACTIVE = 18;
export { SERVICES, STYLES };

// ---- policy lint (mirrors the foundry doctrine: no invented claims, urgency, guarantees, rankings) ------------------
const BANNED = /guarantee|urgent|act now|last chance|limited time|don.t miss|you.re (losing|missing)|losing (money|customers|leads|business)|#\s?1\b|number one|best in|top[- ]rated|highly rated|rank(ed|ing)|proven|100%|risk[- ]free|click here|buy now|congratulations|!/i;
export function lint(t, { existing = false } = {}) {
  const errs = [];
  if (!t.subject || /[\r\n]/.test(t.subject) || t.subject.length > 72) errs.push('subject must be one line, ≤72 chars');
  if (!t.body || t.body.split(/\s+/).length > 130) errs.push('body missing or too long');
  const text = `${t.subject}\n${t.body}`;
  if (!existing) {
    if (BANNED.test(text)) errs.push('contains a banned claim/urgency/guarantee phrase');
    const ph = text.match(/\[[^\]]+\]/g) || [];
    if (ph.some((p) => p !== '[Business Name]')) errs.push('only [Business Name] placeholder allowed in generated copy');
    if (!t.body.endsWith(SERVICES[t.service].sign)) errs.push('missing approved sign-off');
  }
  return errs;
}

// ---- deterministic PRNG --------------------------------------------------------------------------------------------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export function generate(service, { seed, style, taken }) {
  const S = SERVICES[service];
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = mulberry32(hash(`${service}:${seed}:${attempt}`));
    const subject = pick(rng, S.subjects);
    const opener = pick(rng, S.openers[style]);
    const v1 = pick(rng, S.values);
    const v2 = S.values.filter((v) => v !== v1)[Math.floor(rng() * (S.values.length - 1))];
    const value = rng() < 0.5 ? v1 : `${v1} ${v2}`;
    const cta = pick(rng, S.ctas);
    const body = `Hi [Business Name],\n\n${opener}\n\n${value}\n\n${cta}\n\n${S.sign}`;
    const sig = `${subject}|${opener}|${value}|${cta}`;
    if (taken.has(sig) || taken.has(`B:${body}`)) continue;
    // keep the library varied: never reuse the same opener+subject pair or the identical opener+CTA pair
    if (attempt < 120 && (taken.has(`O:${subject}|${opener}`) || taken.has(`P:${opener}|${cta}`))) continue;
    const t = { service, subject, body, style };
    if (lint(t).length) continue;
    taken.add(sig); taken.add(`B:${body}`); taken.add(`O:${subject}|${opener}`); taken.add(`P:${opener}|${cta}`);
    return t;
  }
  throw new Error(`No unused combinations left for ${service}/${style}`);
}

const fp = (t) => t.body;
const decode = (s) => String(s).replace(/\\n/g, '\n'); // OutreachTemplates.json stores line breaks as literal \n

// ---- store ---------------------------------------------------------------------------------------------------------
export class Studio {
  constructor(stateFile, existingTemplatesFile) {
    this.file = stateFile; this.existingFile = existingTemplatesFile;
    this.state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    if (!this.state) { this.state = { version: 1, counter: 0, templates: [], log: [] }; this.seed(); this.save(); }
  }
  taken() { // everything ever created (active, retired, replaced) so nothing is regenerated
    const t = new Set();
    for (const x of this.state.templates) {
      t.add(`B:${x.body}`);
      const parts = x.body.split('\n\n');
      if (x.origin === 'generated' && parts.length === 5) { t.add(`O:${x.subject}|${parts[1]}`); t.add(`P:${parts[1]}|${parts[3]}`); }
    }
    return t;
  }
  seed() {
    const ex = this.existingFile && fs.existsSync(this.existingFile) ? JSON.parse(fs.readFileSync(this.existingFile, 'utf8')) : { campaigns: {} };
    for (const [service] of Object.entries(SERVICES)) {
      for (const [key, tpl] of Object.entries(ex.campaigns?.[service] ?? {})) {
        if (!tpl?.subject || !tpl?.body) continue;
        this.state.templates.push({ id: `${service}:existing:${key}`, service, origin: 'existing', origKey: key, style: 'existing', subject: tpl.subject, body: decode(tpl.body), status: 'unreviewed', used: null, createdAt: new Date().toISOString() });
      }
    }
    for (const service of Object.keys(SERVICES)) this.topUp(service, TARGET_ACTIVE);
  }
  active(service) { return this.state.templates.filter((t) => t.service === service && !['retired', 'replaced'].includes(t.status)); }
  topUp(service, target = TARGET_ACTIVE, avoidStyle = null) {
    const taken = this.taken(); const added = [];
    while (this.active(service).length < target) {
      const counts = Object.fromEntries(STYLES.map((s) => [s, this.active(service).filter((t) => t.style === s).length]));
      const order = STYLES.filter((s) => s !== avoidStyle).sort((a, b) => counts[a] - counts[b] || STYLES.indexOf(a) - STYLES.indexOf(b));
      const style = order[0]; const n = ++this.state.counter;
      const t = generate(service, { seed: n, style, taken });
      const rec = { id: `${service}:gen:${n}`, ...t, origin: 'generated', status: 'unreviewed', used: false, createdAt: new Date().toISOString(), isNew: true };
      this.state.templates.push(rec); added.push(rec);
    }
    return added;
  }
  get(id) { const t = this.state.templates.find((x) => x.id === id); if (!t) throw Object.assign(new Error('Unknown template'), { code: 404 }); return t; }
  log(action, t, extra = {}) { this.state.log.push({ at: new Date().toISOString(), action, id: t.id, service: t.service, ...extra }); this.state.log = this.state.log.slice(-500); }
  like(id) { const t = this.get(id); if (['retired', 'replaced'].includes(t.status)) throw Object.assign(new Error('Template is retired'), { code: 409 }); t.status = t.status === 'liked' ? 'unreviewed' : 'liked'; t.isNew = false; this.log(t.status === 'liked' ? 'like' : 'unlike', t); return this.commit(); }
  dislike(id) {
    const t = this.get(id); if (['retired', 'replaced'].includes(t.status)) throw Object.assign(new Error('Already retired'), { code: 409 });
    t.status = 'retired'; t.retiredAt = new Date().toISOString(); t.retiredReason = 'disliked'; t.retiredWasUsed = t.used === true;
    this.log('dislike', t, { wasUsed: t.used === true });
    const added = this.active(t.service).length < MIN_ACTIVE ? this.topUp(t.service, TARGET_ACTIVE, t.style) : [];
    return this.commit({ added: added.map((a) => a.id) });
  }
  change(id) {
    const t = this.get(id);
    if (t.status === 'liked') throw Object.assign(new Error('Liked templates are kept. Remove the like first to change it.'), { code: 409 });
    if (['retired', 'replaced'].includes(t.status)) throw Object.assign(new Error('Template is retired'), { code: 409 });
    t.status = 'replaced'; t.retiredAt = new Date().toISOString(); t.retiredReason = 'changed'; t.retiredWasUsed = t.used === true;
    const taken = this.taken(); const n = ++this.state.counter;
    const style = STYLES.filter((s) => s !== t.style).sort((a, b) => hash(`${n}${a}`) - hash(`${n}${b}`))[0];
    const g = generate(t.service, { seed: n, style, taken });
    const rec = { id: `${t.service}:gen:${n}`, ...g, origin: 'generated', status: 'unreviewed', used: false, createdAt: new Date().toISOString(), isNew: true, replaces: t.id };
    this.state.templates.push(rec); this.log('change', t, { newId: rec.id });
    return this.commit({ added: [rec.id] });
  }
  setUsed(id, used) { const t = this.get(id); t.used = !!used; this.log('used', t, { used: !!used }); return this.commit(); }
  commit(extra = {}) { this.save(); this.exportDecisions(); return { ok: true, ...extra }; }
  save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.state, null, 1)); fs.renameSync(tmp, this.file); }
  summary() {
    return Object.entries(SERVICES).map(([id, s]) => {
      const all = this.state.templates.filter((t) => t.service === id);
      const c = (f) => all.filter(f).length;
      return { id, label: s.label, active: this.active(id).length, liked: c((t) => t.status === 'liked'), unreviewed: c((t) => t.status === 'unreviewed'), retired: c((t) => ['retired', 'replaced'].includes(t.status)), existing: c((t) => t.origin === 'existing' && !['retired', 'replaced'].includes(t.status)) };
    });
  }
  // Decisions file for human/Codex review. NOT read by the sender. Production copy format uses literal \n like OutreachTemplates.json.
  exportDecisions() {
    const out = { generatedAt: new Date().toISOString(), note: 'Library decisions only. Not read by the sender. Use doNotUse as the exclusion list when templates are wired to dispatch.', liked: {}, doNotUse: [], retired: [] };
    for (const [id] of Object.entries(SERVICES)) out.liked[id] = this.state.templates.filter((t) => t.service === id && t.status === 'liked').map((t) => ({ id: t.id, subject: t.subject, body: t.body.replace(/\n/g, '\\n') }));
    for (const t of this.state.templates.filter((x) => ['retired', 'replaced'].includes(x.status))) {
      out.doNotUse.push(t.id);
      out.retired.push({ id: t.id, service: t.service, subject: t.subject, reason: t.retiredReason, wasUsed: t.retiredWasUsed === true, origin: t.origin, origKey: t.origKey ?? null });
    }
    const f = path.join(path.dirname(this.file), 'template-decisions.json');
    fs.writeFileSync(f + '.tmp', JSON.stringify(out, null, 1)); fs.renameSync(f + '.tmp', f);
    return out;
  }
}
