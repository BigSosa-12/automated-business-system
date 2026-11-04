// Dependency-free structural validation of the public snapshot (schemaVersion 1).
const STATUS = ['HEALTHY', 'DEGRADED', 'BLOCKED', 'UNKNOWN'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v) => v === null || isNum(v);
const isStr = (v) => typeof v === 'string';
const isArr = Array.isArray;
const isObj = (v) => v && typeof v === 'object' && !isArr(v);

export function validateSnapshot(s) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  need(isObj(s), 'snapshot must be an object');
  if (!isObj(s)) return errs;
  need(s.schemaVersion === 1, 'schemaVersion must be 1');
  need(isStr(s.generatedAt) && !Number.isNaN(Date.parse(s.generatedAt)), 'generatedAt must be an ISO timestamp');
  need(s.sourceAsOf === null || (isStr(s.sourceAsOf) && !Number.isNaN(Date.parse(s.sourceAsOf))), 'sourceAsOf invalid');
  need(isObj(s.health) && STATUS.includes(s.health.status) && isArr(s.health.checks) && isArr(s.health.reasons), 'health invalid');
  for (const c of s.health?.checks ?? []) need(isStr(c.id) && ['OK', 'WARN', 'FAIL', 'UNKNOWN'].includes(c.state), `health check ${c.id} invalid`);
  need(isObj(s.leads) && isArr(s.leads.byCampaign), 'leads.byCampaign missing');
  if (isObj(s.leads)) {
    need(isNumOrNull(s.leads.total), 'leads.total must be number|null');
    for (const c of s.leads.byCampaign ?? []) need(isStr(c.id) && isNumOrNull(c.total) && isNumOrNull(c.ready), `campaign ${c.id} invalid`);
  }
  need(isObj(s.outreach) && isNum(s.outreach.dailyCap) && isArr(s.outreach.windows) && isArr(s.outreach.daily), 'outreach invalid');
  if (isObj(s.outreach)) {
    need(isNumOrNull(s.outreach.sentToday), 'outreach.sentToday must be number|null');
    for (const w of s.outreach.windows) need(['SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'BLOCKED', 'MISSED', 'UNKNOWN'].includes(w.state), `window ${w.id} state invalid`);
  }
  need(isObj(s.replies) && isStr(s.replies.coverage), 'replies invalid');
  need(isArr(s.schedules), 'schedules must be array');
  need(isArr(s.pipeline) && s.pipeline.length === 9, 'pipeline must have 9 stages');
  need(isObj(s.charts), 'charts missing');
  need(isArr(s.alerts), 'alerts must be array');
  for (const a of s.alerts ?? []) need(['CRITICAL', 'WARNING', 'INFO'].includes(a.severity) && isStr(a.id) && isStr(a.firstDetected), `alert ${a.id} invalid`);
  need(isObj(s.dataQuality) && isObj(s.dataQuality.availability), 'dataQuality invalid');
  return errs;
}

const ENGINE_STATES = ['IDLE', 'PROCESSING', 'SLOW', 'STALE', 'BLOCKED', 'UNKNOWN'];
export function validateEngine(e) {
  const errs = [];
  const need = (c, m) => { if (!c) errs.push(m); };
  need(isObj(e) && e.schemaVersion === 1, 'engine schemaVersion must be 1');
  if (!isObj(e)) return errs;
  need(isStr(e.generatedAt) && !Number.isNaN(Date.parse(e.generatedAt)), 'engine.generatedAt invalid');
  need(ENGINE_STATES.includes(e.state), 'engine.state invalid');
  need(isArr(e.indicators) && e.indicators.length === 6, 'engine needs 6 indicators');
  for (const i of e.indicators ?? []) need(['OK', 'ACTIVE', 'SLOW', 'WARN', 'BLOCKED', 'FAILED', 'UNKNOWN'].includes(i.state) && isStr(i.reason), `indicator ${i.id} invalid`);
  need(isArr(e.diagnostics) && isObj(e.heartbeats) && isObj(e.thresholds), 'engine diagnostics/heartbeats/thresholds missing');
  need(e.state !== 'PROCESSING' || isObj(e.process), 'PROCESSING requires process evidence');
  return errs;
}
