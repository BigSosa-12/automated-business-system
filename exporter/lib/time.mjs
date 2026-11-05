// Eastern-time helpers. All wall-clock math goes through Intl so DST transitions are handled by the platform tz database.
const TZ = 'America/New_York';
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export function etParts(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}
export const etDay = (date) => {
  const p = etParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};
export const etMinutes = (date) => { const p = etParts(date); return p.h * 60 + p.min; };

// Convert an Eastern wall-clock time (YYYY-MM-DD + minutes after midnight) to a UTC Date. Returns null for non-existent local times.
export function etWallToUtc(day, minutes) {
  const [y, m, d] = day.split('-').map(Number);
  for (const offsetH of [4, 5]) {
    const cand = new Date(Date.UTC(y, m - 1, d, 0, minutes + offsetH * 60));
    const p = etParts(cand);
    if (p.y === y && p.m === m && p.d === d && p.h * 60 + p.min === minutes) return cand;
  }
  return null;
}

// Dispatch slots mirror FoundryRun.ps1 (540/780/1020) and are re-derived from the task XML when available.
export const DEFAULT_DISPATCH_MINUTES = [540, 780, 1020];
// FoundryRun.ps1 treats [slot-5, slot+15) as protected. The exporter does no DB work inside it.
export function inProtectedWindow(date, slots = DEFAULT_DISPATCH_MINUTES) {
  const m = etMinutes(date);
  return slots.some((s) => m >= s - 5 && m < s + 15);
}
export function parseTime(v) {
  if (!v) return null;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t;
}
export const toIso = (d) => (d ? d.toISOString() : null);
export const fmtHm = (minutes) => {
  const h = Math.floor(minutes / 60), m = minutes % 60, ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap} ET`;
};
export function daysBack(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  return out;
}
