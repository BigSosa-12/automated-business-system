import { ExternalLink } from 'lucide-react';
import { Panel } from '../components/ui';

// The public dashboard never connects to a service on the viewer's computer.
export function Templates() {
  return (
    <Panel title="Email templates" meta="Private · on your computer">
      <div className="empty">
        <p><b>Template Studio is available on the outreach laptop.</b></p>
        <p>Open it locally to review copy and record decisions. The dashboard cannot read or change local files.</p>
        <a href="http://127.0.0.1:4478/" target="_blank" rel="noopener noreferrer">Open local Template Studio <ExternalLink size={16} aria-hidden /></a>
      </div>
    </Panel>
  );
}
