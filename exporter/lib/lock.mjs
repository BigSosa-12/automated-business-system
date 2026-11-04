// Exporter-only lock (separate from foundry_execution.lock). O_EXCL create; a dead PID or an old file is treated as stale.
import fs from 'node:fs';

export function acquire(file, maxAgeMs = 10 * 60e3) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      fs.closeSync(fd);
      return () => { try { fs.unlinkSync(file); } catch { /* already gone */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let stale = false;
      try {
        const { pid, at } = JSON.parse(fs.readFileSync(file, 'utf8'));
        let alive = true;
        try { process.kill(pid, 0); } catch (k) { alive = k.code === 'EPERM'; }
        stale = !alive || Date.now() - new Date(at).getTime() > maxAgeMs;
      } catch { stale = true; }
      if (!stale) return null;
      try { fs.unlinkSync(file); } catch { return null; }
    }
  }
  return null;
}
