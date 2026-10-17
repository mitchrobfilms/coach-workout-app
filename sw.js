// Minimal offline cache for the app shell (camera + pose model still load from the network first time).
const C = 'kova-v6', SHELL = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'food.js', 'hero.jpg', 'avatar.jpg', 'manifest.webmanifest', 'weight.js', 'voice.js', 'auth.js', 'avatar-f.svg', 'shopping.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => { if (e.request.method !== 'GET') return; e.respondWith(fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const cl = r.clone(); caches.open(C).then(c => c.put(e.request, cl)); } return r; }).catch(() => caches.match(e.request))); });
