// Optional cloud sync (Supabase). Offline-first: the app always reads/writes the on-phone store; this mirrors it to the
// user's own rows in Postgres (Row Level Security: each user only sees their own rows). Only the publishable key is here.
export const SB_URL = 'https://paxukvgdavcolzkvcapo.supabase.co', SB_KEY = 'sb_publishable_UXJgDeGI2ELqWfrNYBrtWg_oC6wV9rr';
const LIST = { weights: ['weights', x => x.date], injections: ['injections', x => x.id || x.at], certificates: ['certificates', x => x.id || x.key || x.at] };
// Everything the app stores per account: list collections get one row per item; the rest are whole documents.
const DOCS = { meal_plans: ['glp1', 'myPlan', 'shop', 'cookProgress'], check_ins: ['daily', 'weekChecks', 'food', 'sessions', 'classes', 'classSeen', 'injectSchedule', 'injNotified', 'backupAt'] };
export const SYNCED_KEYS = ['weights', 'injections', 'certificates', ...Object.values(DOCS).flat(), 'settings'];
const isEmpty = v => v == null || (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v).length);
const SKIP_SETTINGS = ['llmKey', 'llmUrl']; // never upload secrets
export function makeCloud(store, prefix, { certBlob } = {}) {
  const K = prefix + 'cloud.session';
  let ses = (() => { try { return JSON.parse(localStorage.getItem(K)); } catch { return null; } })();
  const save = s => { ses = s; s ? localStorage.setItem(K, JSON.stringify(s)) : localStorage.removeItem(K); };
  async function api(path, { method = 'GET', body, auth = true, prefer } = {}) {
    if (auth && ses && ses.expires_at * 1000 < Date.now() + 60e3) await refresh();
    const r = await fetch(SB_URL + path, { method, headers: { apikey: SB_KEY, 'content-type': 'application/json', ...(auth && ses ? { authorization: 'Bearer ' + ses.access_token } : {}), ...(prefer ? { prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(), j = t ? JSON.parse(t) : null;
    if (!r.ok) throw new Error(j?.msg || j?.message || j?.error_description || j?.error || 'HTTP ' + r.status);
    return j;
  }
  const keep = j => { save({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + j.expires_in, user: { id: j.user.id, email: j.user.email } }); return ses; };
  async function refresh() { const j = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: ses.refresh_token }) }).then(r => r.json()); if (!j.access_token) { save(null); throw new Error('Please sign in to cloud again'); } keep(j); }
  const tomb = c => store.get('cloud.tomb.' + c, []);
  return {
    get user() { return ses?.user || null; },
    async signUp(email, password, name) { const j = await api('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password, data: { name } } }); if (!j.access_token) throw new Error('Check your email to confirm, then sign in.'); keep(j); return ses.user; },
    async signIn(email, password) { keep(await api('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } })); return ses.user; },
    async signOut() { try { await api('/auth/v1/logout', { method: 'POST' }); } catch {} save(null); },
    // record deletions so they sync (call with the old and new arrays of a list collection)
    noteDelete(key, before, after) { const c = Object.entries(LIST).find(([, [k]]) => k === key); if (!c) return; const [tbl, [, id]] = c, now = new Set((after || []).map(id)); const gone = (before || []).map(id).filter(x => !now.has(x)); if (gone.length) store.set('cloud.tomb.' + tbl, [...new Set([...tomb(tbl), ...gone])]); },
    async push(settings, profile) {
      if (!ses) return; const up = (tbl, rows) => rows.length ? api(`/rest/v1/${tbl}?on_conflict=user_id,id`, { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal' }) : null, now = new Date().toISOString();
      for (const [tbl, [key, id]] of Object.entries(LIST)) { const rows = store.get(key, []).map(x => ({ id: String(id(x)), data: x, deleted: false, updated_at: now })); for (const t of tomb(tbl)) rows.push({ id: String(t), data: {}, deleted: true, updated_at: now }); await up(tbl, rows); store.set('cloud.tomb.' + tbl, []); }
      for (const [tbl, keys] of Object.entries(DOCS)) await up(tbl, keys.map(k => ({ id: k, data: { v: store.get(k, null) }, deleted: false, updated_at: now })));
      const s = { ...settings }; for (const k of SKIP_SETTINGS) delete s[k];
      await api('/rest/v1/settings?on_conflict=user_id', { method: 'POST', body: [{ data: s, updated_at: now }], prefer: 'resolution=merge-duplicates,return=minimal' });
      await api('/rest/v1/profiles?on_conflict=user_id', { method: 'POST', body: [{ name: profile?.name || null, data: { email: ses.user.email }, updated_at: now }], prefer: 'resolution=merge-duplicates,return=minimal' });
      if (certBlob) { const done = new Set(store.get('cloud.certImgs', [])); for (const ct of store.get('certificates', [])) { const id = String(ct.id); if (done.has(id)) continue;
        const blob = await certBlob(ct); const r = await fetch(`${SB_URL}/storage/v1/object/certificates/${ses.user.id}/${encodeURIComponent(id)}.png`, { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + ses.access_token, 'content-type': 'image/png', 'x-upsert': 'true' }, body: blob });
        if (r.ok) { done.add(id); store.set('cloud.certImgs', [...done]); } }
      }
      store.set('cloud.lastSync', now);
    },
    // merge cloud rows into the phone (union by id; cloud tombstones remove local items; docs fill gaps)
    async pull(settings, { fresh = !store.get('cloud.lastSync', null) } = {}) { // fresh install / new phone: the cloud copy wins
      if (!ses) return 0; let n = 0;
      for (const [tbl, [key, id]] of Object.entries(LIST)) { const rows = await api(`/rest/v1/${tbl}?select=id,data,deleted`); const local = store.get(key, []), m = new Map(local.map(x => [String(id(x)), x]));
        for (const r of rows) { if (r.deleted) { if (m.delete(r.id)) n++; } else if (!m.has(r.id)) { m.set(r.id, r.data); n++; } }
        let arr = [...m.values()]; if (key === 'weights') arr.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)); if (key === 'injections') arr.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)); store.set(key, arr); }
      for (const tbl of Object.keys(DOCS)) for (const r of await api(`/rest/v1/${tbl}?select=id,data`)) if (isEmpty(store.get(r.id, null)) && !isEmpty(r.data?.v)) { store.set(r.id, r.data.v); n++; }
      const [s] = await api('/rest/v1/settings?select=data'); if (s?.data) for (const [k, v] of Object.entries(s.data)) if (fresh || settings[k] == null || settings[k] === '') settings[k] = v;
      return n;
    },
    async exportAll() { const out = { exported: new Date().toISOString(), email: ses?.user?.email }; for (const t of ['profiles', 'settings', ...Object.keys(LIST), ...Object.keys(DOCS)]) out[t] = await api(`/rest/v1/${t}?select=*`); return out; },
    async certImages() { if (!ses) return []; return api('/storage/v1/object/list/certificates', { method: 'POST', body: { prefix: ses.user.id + '/', limit: 1000 } }); },
    async certImage(id) { const r = await fetch(`${SB_URL}/storage/v1/object/authenticated/certificates/${ses.user.id}/${encodeURIComponent(id)}.png`, { headers: { apikey: SB_KEY, authorization: 'Bearer ' + ses.access_token } }); return r.ok ? r.blob() : null; },
    async deleteAll() { try { const l = await this.certImages(); if (l.length) await api('/storage/v1/object/certificates', { method: 'DELETE', body: { prefixes: l.map(o => `${ses.user.id}/${o.name}`) } }); } catch {} await api('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} }); save(null); store.set('cloud.certImgs', []); },
  };
}
