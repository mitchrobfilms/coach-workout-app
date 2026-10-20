// Steps sources. 1) Health Connect (Android app only, via Capacitor @capgo/capacitor-health). 2) Fitbit Web API (OAuth 2.0 + PKCE, browser-only, no secret).
// Read-only: we only read today's step count. Nothing is written to Health Connect or Fitbit.
export const FITBIT = {
  clientId: '',   // <- Mitchell: paste the OAuth 2.0 Client ID from dev.fitbit.com (Application Type: "Client")
  redirect: location.origin + location.pathname.replace(/[^/]*$/, '') + 'fitbit.html',
  scope: 'activity',
};
const HC = () => window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.Health;
export const healthConnectAvailable = async () => { const h = HC(); if (!h) return false; try { return !!(await h.isAvailable()).available; } catch { return false; } };
export async function healthConnectSteps(day = new Date()) {
  const h = HC(); if (!h) throw new Error('Health Connect needs the GLP1 Life Android app');
  await h.requestAuthorization({ read: ['steps'], write: [] });
  const s = new Date(day); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(e.getDate() + 1);
  // Aggregated sum: Health Connect de-duplicates overlapping sources (phone + watch).
  const { samples = [] } = await h.queryAggregated({ dataType: 'steps', startDate: s.toISOString(), endDate: (e > new Date() ? new Date() : e).toISOString(), bucket: 'day', aggregation: 'sum' });
  return Math.round(samples.reduce((a, x) => a + (+x.value || 0), 0));
}
// ---- Fitbit PKCE ----
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function fitbitConnect() {
  if (!FITBIT.clientId) throw new Error('Fitbit isn\'t set up yet (no Client ID).');
  const v = b64u(crypto.getRandomValues(new Uint8Array(48))), ch = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))), st = b64u(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem('fitbit.pkce', JSON.stringify({ v, st, back: location.href }));
  location.href = 'https://www.fitbit.com/oauth2/authorize?' + new URLSearchParams({ response_type: 'code', client_id: FITBIT.clientId, redirect_uri: FITBIT.redirect, scope: FITBIT.scope, code_challenge: ch, code_challenge_method: 'S256', state: st });
}
const tokKey = 'glp1life.fitbit';
const saveTok = j => localStorage.setItem(tokKey, JSON.stringify({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 60) * 1000, user: j.user_id }));
async function token(body) { const r = await fetch('https://api.fitbit.com/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: FITBIT.clientId, ...body }) }); const j = await r.json(); if (!r.ok) throw new Error(j.errors?.[0]?.message || 'Fitbit sign-in failed'); saveTok(j); return j; }
export async function fitbitCallback(params) { // used by fitbit.html
  const p = JSON.parse(sessionStorage.getItem('fitbit.pkce') || 'null'); sessionStorage.removeItem('fitbit.pkce');
  if (!p || params.get('state') !== p.st) throw new Error('Fitbit sign-in expired, please try again.');
  if (params.get('error')) throw new Error(params.get('error_description') || params.get('error'));
  await token({ grant_type: 'authorization_code', code: params.get('code'), code_verifier: p.v, redirect_uri: FITBIT.redirect }); return p.back;
}
export const fitbitLinked = () => !!localStorage.getItem(tokKey);
export function fitbitUnlink() { const t = JSON.parse(localStorage.getItem(tokKey) || 'null'); localStorage.removeItem(tokKey); if (t && FITBIT.clientId) fetch('https://api.fitbit.com/oauth2/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: FITBIT.clientId, token: t.refresh || t.access }) }).catch(() => {}); }
export async function fitbitSteps(day = new Date()) {
  let t = JSON.parse(localStorage.getItem(tokKey) || 'null'); if (!t) throw new Error('Fitbit not connected');
  if (Date.now() > t.exp) { await token({ grant_type: 'refresh_token', refresh_token: t.refresh }); t = JSON.parse(localStorage.getItem(tokKey)); }
  const d = day.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const r = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${d}.json`, { headers: { authorization: 'Bearer ' + t.access } });
  if (r.status === 401) { localStorage.removeItem(tokKey); throw new Error('Fitbit access expired, please reconnect'); }
  const j = await r.json(); return +j.summary?.steps || 0;
}
