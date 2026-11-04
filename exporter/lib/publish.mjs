// Publishes ONLY dashboard/public/data/* through the machine's existing Git authentication. No tokens are handled here.
import { execFileSync } from 'node:child_process';

const PATHS = ['dashboard/public/data/snapshot.json'];
const git = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 60000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

export function publish(repo, stamp) {
  git(repo, ['add', '--', ...PATHS]);
  try { git(repo, ['diff', '--cached', '--quiet', '--', ...PATHS]); return { published: false, reason: 'NO_CHANGES' }; } catch { /* exit 1 = staged changes */ }
  git(repo, ['commit', '-m', `chore(data): dashboard snapshot ${stamp}`, '--only', '--', ...PATHS]);
  try { git(repo, ['push', 'origin', 'HEAD']); }
  catch {
    git(repo, ['pull', '--rebase', '--autostash', 'origin', 'main']);
    git(repo, ['push', 'origin', 'HEAD']);
  }
  return { published: true, reason: 'PUSHED' };
}
