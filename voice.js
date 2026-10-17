// Pure helpers for the "Hey Reta" wake word. Fuzzy, works on interim transcripts.
const STRONG = ['reta', 'retta', 'reeta', 'rhetta', 'retah']; // accepted even without "hey" at the start of a phrase
const VARIANTS = [...STRONG, 'rita', 'reda', 'rida', 'ritter', 'rater', 'greta', 'beta', 'reader', 'rhea', 'rheta', 'retter', 'rina', 'reba'];
const PRE = ['hey', 'hi', 'hay', 'ok', 'okay', 'a', 'eh', 'yo', 'hello', 'oi'];
export function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const isReta = w => VARIANTS.includes(w) || (w.length >= 4 && w.length <= 6 && lev(w, 'reta') <= 1);
export const tokens = s => String(s || '').toLowerCase().replace(/[^a-z0-9'\s.]/g, ' ').split(/\s+/).filter(Boolean);
/** Finds the wake phrase. Returns { index, rest } (rest = words after the wake word) or null.
 *  Accepts "hey reta" (+ rita, retta, reeta, rhetta, reda, rida, ritter, rater, greta, beta), "a reta", "okay reta",
 *  "heyreta", and "reta ..." at the start of a phrase. */
export function findWake(text) {
  const t = tokens(text);
  for (let i = 0; i < t.length; i++) {
    const w = t[i].replace(/[.']/g, '');
    const glued = w.match(/^(hey|hi|ok|okay)(\w{3,7})$/); // "heyreta"
    if (glued && isReta(glued[2])) return { index: i, rest: t.slice(i + 1).join(' ') };
    if (isReta(w) && i > 0 && PRE.includes(t[i - 1])) return { index: i, rest: t.slice(i + 1).join(' ') };
    if (i === 0 && STRONG.includes(w)) return { index: i, rest: t.slice(i + 1).join(' ') };
  }
  return null;
}
/** Restart backoff for Chrome Android, which ends recognition sessions every few seconds. */
export function nextDelay(failures) { return Math.min(250 * 2 ** Math.max(0, failures - 1), 5000); }
