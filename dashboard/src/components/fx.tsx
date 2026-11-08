import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animates plain integers like "4,171"; anything else renders as-is. Respects reduced motion. */
export function CountUp({ text }: { text: ReactNode }) {
  const raw = typeof text === 'string' || typeof text === 'number' ? String(text) : null;
  const target = raw && /^\d{1,3}(,\d{3})*$|^\d+$/.test(raw) ? Number(raw.replace(/,/g, '')) : null;
  const [v, setV] = useState<number | null>(target);
  const prev = useRef<number>(0);
  useEffect(() => {
    if (target == null) return;
    if (reduced()) { setV(target); prev.current = target; return; }
    const from = prev.current, t0 = performance.now(), dur = 900;
    let raf = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); setV(Math.round(from + (target - from) * e)); if (p < 1) raf = requestAnimationFrame(step); else prev.current = target; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (target == null) return <>{text}</>;
  return <span aria-label={String(target)}>{(v ?? target).toLocaleString('en-US')}</span>;
}

/** One delegated pointer listener: sets --gx/--gy on the hovered glass surface for a cursor-lit sheen. */
export function useSpotlight() {
  useEffect(() => {
    if (reduced() || !matchMedia('(pointer: fine)').matches) return;
    let raf = 0, last: PointerEvent | null = null;
    const apply = () => { raf = 0; const e = last; if (!e) return; const g = (e.target as Element | null)?.closest?.('.glass') as HTMLElement | null; if (!g) return; const r = g.getBoundingClientRect(); g.style.setProperty('--gx', `${e.clientX - r.left}px`); g.style.setProperty('--gy', `${e.clientY - r.top}px`); };
    const on = (e: PointerEvent) => { last = e; if (!raf) raf = requestAnimationFrame(apply); };
    document.addEventListener('pointermove', on, { passive: true });
    return () => { document.removeEventListener('pointermove', on); cancelAnimationFrame(raf); };
  }, []);
}

/** A crashing page must never blank the whole dashboard. */
export class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(p: { resetKey: string }) { if (p.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? <div className="glass panel"><div className="empty">This page hit an unexpected error. Other tabs still work. Reload to retry.</div></div> : this.props.children; }
}
