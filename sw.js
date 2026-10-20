// Offline cache for the app shell (camera + pose model still load from the network first time).
// - Network-first for the shell; a new version waits until the page asks it to activate ("Update available, tap to refresh").
// - library.json is never cached here (the app fetches it network-first with ?v= and keeps its own offline copy).
// - Videos are never cached or intercepted: class clips stream straight from the network (Range requests work).
const C = 'glp1life-v33', SHELL = ['certs.js', 'inject.js', 'progress.js', 'backup.js', 'glp1.js', 'offers.js', './', 'index.html', 'style.css', 'app.js', 'style.css?v=33', 'app.js?v=33', 'cook.js', 'logic.js', 'food.js', 'hero.jpg', 'avatar.jpg', 'manifest.webmanifest', 'weight.js', 'voice.js', 'auth.js', 'avatar-f.svg', 'logo.svg', 'logo-white.svg', 'icons/any-192.png', 'icons/favicon-64.png', 'cloud.js', 'icon-192.png', 'shopping.js', 'prep.js', 'classes.js', 'music.js', 'voicelines.js', 'classvoice.js', 'cast.js', 'health.js', 'files.js', 'native.js', 'hydration.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))));
self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  if (/\/data\/[\w-]+\.json$/.test(u.pathname) || /\/library\.json$/.test(u.pathname) || /manifest\.json$/.test(u.pathname)) return; // always live (incl. media/voice/voice-manifest.json)
  if (/\.(mp4|webm|mov)$/i.test(u.pathname) || u.pathname.includes('/media/classes/') || e.request.headers.has('range')) return; // stream, don't cache
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const cl = r.clone(); caches.open(C).then(c => c.put(e.request, cl)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
// Injection reminders: periodic background sync (where Chrome allows) reads the next-due time the page saved in IndexedDB.
function idbGet(key) { return new Promise(res => { const r = indexedDB.open('reta-coach', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = () => res(null); r.onsuccess = () => { const t = r.result.transaction('kv').objectStore('kv').get(key); t.onsuccess = () => res(t.result); t.onerror = () => res(null); }; }); }
self.addEventListener('periodicsync', e => { if (e.tag !== 'reta-inject') return; e.waitUntil((async () => {
  let n = null; try { n = JSON.parse(await idbGet('reta.injectNext')); } catch {} if (!n || n.at > Date.now()) return;
  const shown = await self.registration.getNotifications({ tag: 'reta-inject' }); if (shown.length) return;
  await self.registration.showNotification('💉 Injection reminder', { body: 'Log only. Follow your prescriber\'s instructions. This app does not give dosing advice. Tap to log it.', tag: 'reta-inject', icon: 'avatar.jpg', data: { url: './?tab=progress' } });
})()); });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => ws.length ? ws[0].focus() : clients.openWindow(e.notification.data?.url || './'))); });
