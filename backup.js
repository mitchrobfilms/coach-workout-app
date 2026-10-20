// "Save so it's not lost": localStorage + IndexedDB mirror, persistent-storage request, JSON backup/restore.
// Pure helpers (makeBackup/parseBackup/restoreInto) are unit-tested; IDB helpers no-op where IndexedDB is missing.
export const BACKUP_VERSION = 1;
export const BACKUP_KEYS = ['settings', 'weights', 'sessions', 'food', 'shop', 'prep', 'glp1', 'classes', 'classHistory', 'backupAt', 'injections', 'injectSchedule', 'certificates'];
export function makeBackup(get, { account = null, now = new Date() } = {}) {
  const data = {}; for (const k of BACKUP_KEYS) { const v = get(k); if (v !== undefined && v !== null) data[k] = v; }
  return { app: 'reta-coach', version: BACKUP_VERSION, created: now.toISOString(), account, data };
}
export function parseBackup(text) {
  let o; try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch { return { error: 'That file isn\'t a GLP1 Life backup (not valid JSON).' }; }
  if (!o || o.app !== 'reta-coach' || typeof o.data !== 'object') return { error: 'That file isn\'t a GLP1 Life backup.' };
  if (o.version > BACKUP_VERSION) return { error: 'This backup is from a newer version of the app. Update the app and try again.' };
  if (o.data.weights && !Array.isArray(o.data.weights)) return { error: 'The weigh-ins in that backup look damaged.' };
  return { backup: o };
}
// Merge weigh-ins by date (no duplicates); other keys are replaced by the backup.
export function restoreInto(get, set, backup) {
  let n = 0;
  for (const [k, v] of Object.entries(backup.data)) {
    if (!BACKUP_KEYS.includes(k)) continue;
    if (k === 'weights') { const cur = get('weights') || [], seen = new Set(cur.map(e => e.date)); const merged = cur.concat(v.filter(e => !seen.has(e.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)); set('weights', merged); n += merged.length - cur.length; }
    else { set(k, v); n++; }
  }
  return n;
}
export const BACKUP_EVERY_DAYS = 14;
export const backupDue = (lastIso, now = Date.now(), hasData = true) => hasData && (!lastIso || now - Date.parse(lastIso) > BACKUP_EVERY_DAYS * 864e5);
/* ---------- IndexedDB mirror ---------- */
const DB = 'reta-coach', OS = 'kv';
function idb() { return new Promise((res, rej) => { if (typeof indexedDB === 'undefined') return rej(new Error('no idb')); const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(OS); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export async function idbSet(key, value) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction(OS, 'readwrite'); t.objectStore(OS).put(value, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); db.close(); return true; } catch { return false; } }
export async function idbAll(prefix) { try { const db = await idb(); const out = await new Promise((res, rej) => { const t = db.transaction(OS), s = t.objectStore(OS), o = {}; const c = s.openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(o); if (String(cur.key).startsWith(prefix)) o[cur.key] = cur.value; cur.continue(); }; c.onerror = () => rej(c.error); }); db.close(); return out; } catch { return {}; } }
export async function requestPersist() { try { if (!navigator.storage?.persist) return null; return (await navigator.storage.persisted()) || await navigator.storage.persist(); } catch { return null; } }
export async function idbClear(prefix) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction(OS, 'readwrite'), s = t.objectStore(OS); const c = s.openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return; if (String(cur.key).startsWith(prefix)) cur.delete(); cur.continue(); }; t.oncomplete = res; t.onerror = () => rej(t.error); }); db.close(); return true; } catch { return false; } }
