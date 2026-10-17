// Pure helpers for the "Hey Kova" wake word. Fuzzy, works on interim transcripts.
const VARIANTS = ['kova', 'cova', 'cover', 'nova', 'coba', 'koba', 'kofa', 'kover', 'cobra', 'covah', 'kovah', 'cova', 'goba', 'gova', 'korva', 'carver', 'coffer', 'coca', 'kava', 'cava', 'kovac', 'kovacs', 'nover', 'clover'];
const PRE = ['hey', 'hi', 'hay', 'ok', 'okay', 'a', 'eh', 'hey,', 'yo', 'hello', 'oi'];
export function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const isKova = w => VARIANTS.includes(w) || (w.length >= 3 && w.length <= 6 && lev(w, 'kova') <= 1);
export const tokens = s => String(s || '').toLowerCase().replace(/[^a-z0-9'\s.]/g, ' ').split(/\s+/).filter(Boolean);
/** Finds the wake phrase. Returns { index, rest } (rest = words after the wake word) or null.
 *  Accepts "hey kova", "hey cover", "hey nova", "hey coba", "hikova", and "kova ..." at the start. */
export function findWake(text) {
  const t = tokens(text);
  for (let i = 0; i < t.length; i++) {
    const w = t[i].replace(/[.']/g, '');
    const glued = w.match(/^(hey|hi|ok)(\w{3,6})$/); // "heykova"
    if (glued && isKova(glued[2])) return { index: i, rest: t.slice(i + 1).join(' ') };
    if (isKova(w) && (i === 0 || PRE.includes(t[i - 1]))) return { index: i, rest: t.slice(i + 1).join(' ') };
  }
  return null;
}
/** Restart backoff for Chrome Android, which ends recognition sessions every few seconds. */
export function nextDelay(failures) { return Math.min(250 * 2 ** Math.max(0, failures - 1), 5000); }
