import { useCallback, useEffect, useState } from 'react';
import { Copy, PlugZap, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Panel, Pill } from '../components/ui';

// This tab talks ONLY to the private Template Studio running on this computer. No template text is bundled into the public site,
// and the Studio can only edit its own local library: it has no access to the outreach queue, database, Gmail or scheduler.
export const STUDIO = 'http://127.0.0.1:4478';

interface Tpl { id: string; service: string; origin: 'existing' | 'generated'; style: string; subject: string; body: string; status: 'unreviewed' | 'liked' | 'retired' | 'replaced'; used: boolean | null; isNew?: boolean; retiredWasUsed?: boolean }
interface Svc { id: string; label: string; active: number; liked: number; retired: number; reserve: number }
interface View { min: number; services: Svc[]; templates: Tpl[]; exportFile: string }
type Flt = 'active' | 'unreviewed' | 'liked' | 'retired';

async function call(path: string, body?: unknown): Promise<View & { added?: string[]; state?: View }> {
  const r = await fetch(`${STUDIO}/api/${path}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json', 'x-studio': '1' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

function Body({ text }: { text: string }) {
  return <div className="tp-body">{text.split(/(\[[^\]]+\])/).map((p, i) => (/^\[[^\]]+\]$/.test(p) ? <span key={i} className="tp-ph">{p}</span> : p))}</div>;
}

export function Templates() {
  const [v, setV] = useState<View | null>(null);
  const [offline, setOffline] = useState(false);
  const [svc, setSvc] = useState('ALL');
  const [flt, setFlt] = useState<Flt>('active');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => { try { setV(await call('state')); setOffline(false); } catch { setOffline(true); } }, []);
  useEffect(() => { void load(); const t = setInterval(() => { if (offline) void load(); }, 8000); return () => clearInterval(t); }, [load, offline]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4500); return () => clearTimeout(t); }, [msg]);

  const act = async (p: string, b: object, ok: string) => {
    try { const j = await call(p, b); if (j.state) setV(j.state); setMsg(ok); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); void load(); }
  };

  if (!v) {
    return (
      <Panel title="Email templates" meta="Private · runs on your computer">
        <div className="empty">
          <PlugZap size={22} aria-hidden />
          <p><b>{offline ? 'Template Studio is not running on this computer.' : 'Connecting to Template Studio…'}</b></p>
          {offline && (<>
            <p>Start it with <code>npm run studio</code> in the repo folder, or run <code>exporter\install-studio-task.ps1</code> once so it starts automatically when you log in. This page reconnects by itself.</p>
            <p className="note">Templates are never stored on the public site, so this tab only works in a browser on the computer where the Studio runs.</p>
          </>)}
        </div>
      </Panel>
    );
  }

  const gone = (t: Tpl) => t.status === 'retired' || t.status === 'replaced';
  const list = v.templates.filter((t) => (svc === 'ALL' || t.service === svc) && (flt === 'retired' ? gone(t) : flt === 'liked' ? t.status === 'liked' : flt === 'unreviewed' ? t.status === 'unreviewed' : !gone(t)));
  const tot = v.services.reduce((a, s) => ({ active: a.active + s.active, liked: a.liked + s.liked, retired: a.retired + s.retired }), { active: 0, liked: 0, retired: 0 });
  const label = (id: string) => v.services.find((s) => s.id === id)?.label ?? id;

  return (
    <>
      <div className="glass tp-sum"><span><b>{tot.active}</b> active templates · <b>{tot.liked}</b> liked · <b>{tot.retired}</b> retired</span><Pill tone="good">Studio connected</Pill></div>
      <div className="tp-tabs" role="tablist">
        {[{ id: 'ALL', label: 'All services', n: `${tot.active} active` }, ...v.services.map((s) => ({ id: s.id, label: s.label, n: `${s.active} active · ${s.liked} liked` }))].map((t) => (
          <button key={t.id} role="tab" aria-selected={svc === t.id} className="tp-tab" onClick={() => setSvc(t.id)}>{t.label}<small>{t.n}</small></button>
        ))}
      </div>
      <div className="tp-filters">
        {([['active', 'Active'], ['unreviewed', 'Not reviewed'], ['liked', 'Liked'], ['retired', 'Retired']] as [Flt, string][]).map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={flt === k} onClick={() => setFlt(k)}>{l}</button>))}
        <button className="chip" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={12} aria-hidden /> Refresh</button>
      </div>
      {list.length === 0 && <div className="empty">Nothing here yet.</div>}
      <div className="tp-grid">
        {list.map((t) => {
          const off = gone(t);
          return (
            <div key={t.id} className={`glass tp-card${t.status === 'liked' ? ' liked' : ''}${off ? ' off' : ''}`}>
              <div className="tp-badges">
                <span className="tp-b">{label(t.service)}</span>
                <span className="tp-b">{t.origin === 'existing' ? 'EXISTING (in production file)' : 'GENERATED'}</span>
                {t.origin === 'generated' && <span className="tp-b">style: {t.style}</span>}
                {t.isNew && !off && <span className="tp-b good">NEW</span>}
                {t.status === 'liked' && <span className="tp-b good">✓ LIKED</span>}
                {t.used === true && <span className="tp-b warn">MARKED ALREADY SENT</span>}
                {off && <span className="tp-b bad">{t.status === 'replaced' ? 'REPLACED BY CHANGE' : 'DISLIKED · RETIRED'}{t.retiredWasUsed ? ' · WAS ALREADY SENT' : ''}</span>}
              </div>
              <div className="tp-subject">Subject: {t.subject}</div>
              <Body text={t.body} />
              {!off && (<>
                <label className="tp-used">Already sent?
                  <select value={String(t.used)} onChange={(e) => void act('used', { id: t.id, used: e.target.value === 'true' }, e.target.value === 'true' ? 'Marked as already sent. If you dislike it, it stays retired for future sends.' : 'Updated.')}>
                    <option value="null">Unknown</option><option value="false">No</option><option value="true">Yes</option>
                  </select>
                </label>
                <div className="tp-act">
                  <button className={`tp-btn${t.status === 'liked' ? ' on' : ''}`} onClick={() => void act('like', { id: t.id }, t.status === 'liked' ? 'Like removed.' : 'Kept. Change is locked while a template is liked.')}><ThumbsUp size={14} aria-hidden /> {t.status === 'liked' ? 'Liked (kept)' : 'Like'}</button>
                  <button className="tp-btn" disabled={t.status === 'liked'} title={t.status === 'liked' ? 'Remove the like to change it' : 'Show the next new style'} onClick={() => void act('change', { id: t.id }, 'Swapped for the next new style. The old one is retired.')}><Copy size={14} aria-hidden /> Change</button>
                  <button className="tp-btn" onClick={() => void act('dislike', { id: t.id }, t.used === true ? 'Retired. It was already sent, so past sends are unchanged and it will not be used going forward.' : 'Retired and will not be used going forward.')}><ThumbsDown size={14} aria-hidden /> Dislike</button>
                </div>
              </>)}
            </div>
          );
        })}
      </div>
      <p className="note">Saved on this computer to {v.exportFile}. Nothing here edits your outreach queue, database, Gmail or schedule, and past sends are never changed. Dislike and Change simply show the next template from a pre-generated reserve.</p>
      {msg && <div className="tp-toast" role="status">{msg}</div>}
    </>
  );
}
