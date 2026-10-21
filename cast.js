// TV casting for workout/class sessions.
// - Chromecast / Google TV / Sky Glass? (see docs/tv.md): Google Cast Web Sender SDK + Default Media Receiver (CC1AD845).
//   Casts the current move clip on repeat; follows the class as each move changes.
// - Anything else: open the app on the TV's own browser with ?tv=1 (big-screen mode).
const RECEIVER = 'CC1AD845';
let ctx = null, ready = false, lastSrc = '', onState = () => {};
const abs = u => new URL(u, location.href).href;
// The Cast Web Sender SDK never becomes available inside the Android app's WebView, so the APK
// uses Android's own Cast / screen-mirroring panel (native ApkUpdater.openCastSettings) instead.
const nativeCast = () => !!(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.ApkUpdater?.openCastSettings);
export const castMode = () => nativeCast() ? 'system' : ready ? 'sdk' : 'none';
export const castState = () => ({ cast: ready || nativeCast(), mode: castMode(), connected: !!ctx?.getCurrentSession() });
export function initCast(cb = () => {}) {
  onState = cb; cb(castState());
  if (nativeCast() || /; wv\)/.test(navigator.userAgent)) return;
  if (!/Chrome|CriOS|Edg/.test(navigator.userAgent) || /\?.*tv=1/.test(location.search)) return;
  if (window.cast?.framework && ctx) { onState(castState()); return; }
  window.__onGCastApiAvailable = ok => {
    if (!ok || !window.cast?.framework) return;
    ctx = cast.framework.CastContext.getInstance();
    ctx.setOptions({ receiverApplicationId: RECEIVER, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
    ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, e => {
      if (e.sessionState === 'SESSION_STARTED' || e.sessionState === 'SESSION_RESUMED') { lastSrc = ''; follow(); }
      onState(castState());
    });
    ready = true; onState(castState());
  };
  if (document.getElementById('castSdk')) return;
  const s = document.createElement('script'); s.id = 'castSdk'; s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'; s.async = true; document.head.appendChild(s);
}
let getMedia = () => null;
export function setCastSource(fn) { getMedia = fn; }
export async function follow() {
  const ses = ctx?.getCurrentSession(); const m = getMedia(); if (!ses || !m?.src) return;
  const src = abs(m.src); if (src === lastSrc) return; lastSrc = src;
  const info = new chrome.cast.media.MediaInfo(src, /\.jpe?g$/i.test(src) ? 'image/jpeg' : 'video/mp4');
  info.metadata = new chrome.cast.media.GenericMediaMetadata(); info.metadata.title = m.title || 'GLP1 Life class'; info.metadata.subtitle = m.subtitle || 'GLP1 Life';
  info.metadata.images = [new chrome.cast.Image(abs('icon-512.png'))];
  const req = new chrome.cast.media.LoadRequest(info); req.autoplay = true;
  const q = new chrome.cast.media.QueueData(); q.items = [new chrome.cast.media.QueueItem(info)]; q.repeatMode = chrome.cast.media.RepeatMode.SINGLE; req.queueData = q;
  try { await ses.loadMedia(req); } catch (e) { lastSrc = ''; console.warn('cast', e); }
}
export async function castClick(video) {
  if (nativeCast()) { try { await window.Capacitor.Plugins.ApkUpdater.openCastSettings(); return 'system'; } catch { return 'nocast'; } }
  if (ctx) { if (ctx.getCurrentSession()) return ctx.endCurrentSession(true); try { await ctx.requestSession(); } catch {} return; }
  return 'nocast'; // Google Cast only (no AirPlay / TV-browser mode)
}
// Big-screen TV mode: ?tv=1. Bigger type, no camera self-view, D-pad/arrow-key focus navigation.
export function initTvMode() {
  if (!/[?&]tv=1/.test(location.search)) return false;
  document.documentElement.classList.add('tv'); window.__tvMode = true;
  const focusables = () => [...document.querySelectorAll('button, a[href], input, select, [tabindex="0"]')].filter(e => e.offsetParent && !e.disabled && !e.closest('[hidden]'));
  addEventListener('keydown', e => {
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; if (!dir) return;
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) && dir[0]) return;
    const cur = document.activeElement?.getBoundingClientRect?.() || { x: innerWidth / 2, y: 0, width: 0, height: 0 }, cx = cur.x + cur.width / 2, cy = cur.y + cur.height / 2;
    let best = null, bd = Infinity;
    for (const el of focusables()) { if (el === document.activeElement) continue; const r = el.getBoundingClientRect(), dx = r.x + r.width / 2 - cx, dy = r.y + r.height / 2 - cy;
      if (dir[0] ? Math.sign(dx) !== dir[0] || Math.abs(dx) < 4 : Math.sign(dy) !== dir[1] || Math.abs(dy) < 4) continue;
      const d = (dir[0] ? Math.abs(dx) + 2 * Math.abs(dy) : Math.abs(dy) + 2 * Math.abs(dx)); if (d < bd) { bd = d; best = el; } }
    if (best) { e.preventDefault(); best.focus(); best.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });
  return true;
}
