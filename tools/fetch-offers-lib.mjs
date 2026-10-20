// robots.txt check (User-agent: * group; longest match wins; * and $ supported).
export function robotsAllows(txt, path) {
  let applies = false, rules = [];
  for (const raw of txt.split(/\r?\n/)) { const l = raw.replace(/#.*/, '').trim(); const m = l.match(/^(user-agent|disallow|allow):\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { applies = v === '*'; continue; }
    if (applies && v) rules.push([k, v]); }
  let best = null;
  for (const [k, v] of rules) { const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')); if (re.test(path) && (!best || v.length > best[1].length)) best = [k, v]; }
  return !best || best[0] === 'allow';
}
