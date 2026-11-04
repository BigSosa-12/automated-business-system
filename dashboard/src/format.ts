export const num = (v: number | null | undefined, na = '—'): string => (v == null ? na : v.toLocaleString('en-US'));
export const pct = (v: number | null | undefined): string => (v == null ? 'NOT TRACKED' : `${(v * 100).toFixed(1)}%`);
const TZ = 'America/New_York';
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
}
export function fmtClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export function until(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const m = Math.round((new Date(iso).getTime() - now) / 60000);
  if (m <= 0) return 'now';
  if (m < 90) return `in ${m}m`;
  const h = Math.floor(m / 60);
  return h < 36 ? `in ${h}h ${m % 60}m` : `in ${Math.round(h / 24)}d`;
}
export const shortDay = (d: string): string => { const [, m, day] = d.split('-'); return `${+m}/${+day}`; };
