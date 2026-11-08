import { ArrowRight, CheckCircle2, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { NextAction } from '../insights';
import { Panel } from './ui';

const ICON = { bad: CircleAlert, warn: TriangleAlert, info: Info, good: CheckCircle2 } as const;
export function ActionCenter({ actions, onGo }: { actions: NextAction[]; onGo: (tab: string) => void }) {
  return (
    <Panel title="Action center" meta={`${actions.filter((a) => a.tone === 'bad' || a.tone === 'warn').length} need attention`}>
      <ul className="ac">{actions.map((a) => { const I = ICON[a.tone]; return (
        <li key={a.id} className={'ac-' + a.tone}>
          <I size={16} aria-hidden /><div><b>{a.title}</b><span>{a.detail}</span></div>
          {a.where && <button className="ac-go" onClick={() => onGo(a.where!.toLowerCase())} aria-label={`Open ${a.where}`}>{a.where}<ArrowRight size={12} aria-hidden /></button>}
        </li>); })}</ul>
    </Panel>
  );
}
