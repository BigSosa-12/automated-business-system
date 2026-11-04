import { useEffect, useMemo } from 'react';

// Deep-space backdrop: seeded starfield (SVG), drifting smoke/nebula layers (pre-blurred gradients, transforms only) and scroll parallax.
function rng(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function Stars({ seed, n, twinkle }: { seed: number; n: number; twinkle?: boolean }) {
  const stars = useMemo(() => {
    const r = rng(seed); const cols = ['#FFFFFF', '#CFE8FF', '#E9D5FF', '#A5F3FC'];
    return Array.from({ length: n }, (_, i) => ({ x: r() * 1600, y: r() * 1000, r: 0.35 + r() ** 3 * 1.5, o: 0.35 + r() * 0.65, c: cols[Math.floor(r() * cols.length)], d: (r() * 6).toFixed(2), k: i }));
  }, [seed, n]);
  return (
    <svg className={`stars${twinkle ? ' twinkle' : ''}`} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {stars.map((s) => <circle key={s.k} cx={s.x} cy={s.y} r={s.r} fill={s.c} opacity={s.o} style={twinkle ? { animationDelay: `${s.d}s` } : undefined} />)}
    </svg>
  );
}

export function Atmos() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => document.documentElement.style.setProperty('--sy', String(window.scrollY))); };
    addEventListener('scroll', on, { passive: true }); on();
    return () => { removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="atmos" aria-hidden>
      <div className="smoke s1" /><div className="smoke s2" /><div className="smoke s3" /><div className="smoke s4" />
      <div className="far"><Stars seed={11} n={170} /></div>
      <div className="near"><Stars seed={29} n={70} twinkle /></div>
    </div>
  );
}
