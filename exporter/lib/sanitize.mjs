// Public-snapshot safety net. Nothing personal, no credentials, no local paths may reach GitHub Pages.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const WIN_PATH = /[A-Za-z]:\\[^\s"',;]*/g;
const POSIX_HOME = /\/(?:Users|home)\/[^\s"',;]*/g;
const SECRET = /(AIza[0-9A-Za-z_-]{20,}|ya29\.[0-9A-Za-z_-]+|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{10,}|refresh_token|client_secret|private_key)/i;
const STACK = /\n\s+at\s+\S+/;

export function scrub(value, max = 240) {
  if (value == null) return value;
  let s = String(value).replace(EMAIL, '[email]').replace(WIN_PATH, '[path]').replace(POSIX_HOME, '[path]');
  if (STACK.test(s)) s = s.split('\n')[0];
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Throws when any string in the snapshot still looks sensitive. Called after scrub() as a hard gate before writing/publishing.
export function assertPublicSafe(obj) {
  const hits = [];
  (function walk(v, path) {
    if (v == null) return;
    if (typeof v === 'string') {
      if (new RegExp(EMAIL.source).test(v)) hits.push(`${path}: email`);
      if (new RegExp(WIN_PATH.source).test(v) || new RegExp(POSIX_HOME.source).test(v)) hits.push(`${path}: local path`);
      if (SECRET.test(v)) hits.push(`${path}: credential-like`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (SECRET.test(k)) hits.push(`${path}.${k}: credential-like key`);
      walk(x, `${path}.${k}`);
    }
  })(obj, '$');
  if (hits.length) throw new Error('SANITIZATION_FAILED: ' + hits.slice(0, 8).join('; '));
}
