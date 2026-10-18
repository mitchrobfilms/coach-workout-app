// Offline cache for the app shell (camera + pose model still load from the network first time).
// - Network-first for the shell; a new version waits until the page asks it to activate ("Update available, tap to refresh").
// - library.json is never cached here (the app fetches it network-first with ?v= and keeps its own offline copy).
// - Videos are never cached or intercepted: class clips stream straight from the network (Range requests work).
const C = 'reta-v11', SHELL = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'food.js', 'hero.jpg', 'avatar.jpg', 'manifest.webmanifest', 'weight.js', 'voice.js', 'auth.js', 'avatar-f.svg', 'shopping.js', 'prep.js', 'classes.js', 'music.js', 'voicelines.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))));
self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  if (/\/library\.json$/.test(u.pathname) || /manifest\.json$/.test(u.pathname)) return; // always live (incl. media/voice/voice-manifest.json)
  if (/\.(mp4|webm|mov)$/i.test(u.pathname) || u.pathname.includes('/media/classes/') || e.request.headers.has('range')) return; // stream, don't cache
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cl = r.clone(); caches.open(C).then(c => c.put(e.request, cl)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
