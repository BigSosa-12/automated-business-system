import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export interface Cmd { id: string; label: string; hint?: string; run: () => void }

export function CommandPalette({ open, onClose, cmds }: { open: boolean; onClose: () => void; cmds: Cmd[] }) {
  const [q, setQ] = useState(''); const [i, setI] = useState(0); const ref = useRef<HTMLInputElement>(null);
  const list = useMemo(() => { const t = q.trim().toLowerCase(); return t ? cmds.filter((c) => (c.label + ' ' + (c.hint ?? '')).toLowerCase().includes(t)) : cmds; }, [q, cmds]);
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => ref.current?.focus(), 0); } }, [open]);
  useEffect(() => setI(0), [q]);
  if (!open) return null;
  const go = (c?: Cmd) => { if (!c) return; onClose(); c.run(); };
  return (
    <div className="cmdk-back" onMouseDown={onClose} role="presentation">
      <div className="cmdk glass" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); } else if (e.key === 'Enter') go(list[i]); }}>
        <div className="cmdk-in"><Search size={16} aria-hidden /><input ref={ref} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page or run an action…" aria-label="Search commands" /><kbd>esc</kbd></div>
        <ul role="listbox">{list.length === 0 && <li className="cmdk-empty">No matches</li>}
          {list.map((c, n) => <li key={c.id} role="option" aria-selected={n === i} className={n === i ? 'on' : ''} onMouseEnter={() => setI(n)} onClick={() => go(c)}><span>{c.label}</span>{c.hint && <kbd>{c.hint}</kbd>}</li>)}</ul>
      </div>
    </div>
  );
}
