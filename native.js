// Android app (Capacitor) glue. Web content loads live from glp1life.co.uk, so only the native shell ever needs an update:
// - safe-area insets -> CSS vars (WebView env() can be 0 with Android 15 edge-to-edge)
// - status bar style
// - in-app updater: compares the installed versionCode with the latest GitHub release (apk-v1.0.<code>) and installs it.
const C = window.Capacitor, P = C?.Plugins || {};
export const native = !!C?.isNativePlatform?.();
const REL = 'https://api.github.com/repos/mitchrobfilms/coach-workout-app/releases/latest';
export const codeFromTag = t => { const m = /^apk-v\d+\.\d+\.(\d+)$/.exec(t || ''); return m ? +m[1] : 0; };
function setInsets(i) { if (!i) return; const r = document.documentElement.style; r.setProperty('--sat-fb', `${Math.max(0, i.top | 0)}px`); r.setProperty('--sab-fb', `${Math.max(0, i.bottom | 0)}px`); }
async function insets() {
  document.documentElement.classList.add('native');
  try { const SA = P.SafeArea; if (SA) { setInsets((await SA.getSafeAreaInsets()).insets); SA.addListener?.('safeAreaChanged', d => setInsets(d.insets)); return; } } catch {}
  // last resort: typical status bar / nav bar heights if nothing reports insets
  const probe = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top');
  if (!parseFloat(probe)) setInsets({ top: 28, bottom: 16 });
}
async function statusBar() { try { await P.StatusBar?.setStyle?.({ style: 'DARK' }); } catch {} }
function banner(rel, code) {
  if (document.getElementById('apkUpdate')) return;
  const b = document.createElement('div'); b.id = 'apkUpdate'; b.className = 'apkupdate'; b.setAttribute('role', 'status');
  b.innerHTML = `<span><b>Update available</b><small>GLP1 Life app ${rel.tag_name.replace('apk-v', 'v')}</small></span><button type="button" class="primary" id="apkGo">Update</button><button type="button" aria-label="Later" id="apkLater">✕</button>`;
  document.body.append(b);
  b.querySelector('#apkLater').onclick = () => { localStorage.setItem('apkSkip', String(code)); b.remove(); };
  b.querySelector('#apkGo').onclick = async () => {
    const go = b.querySelector('#apkGo'), U = P.ApkUpdater, asset = rel.assets?.find(a => /\.apk$/.test(a.name));
    const url = asset?.browser_download_url || 'https://github.com/mitchrobfilms/coach-workout-app/releases/latest/download/GLP1-Life.apk';
    if (!U) return P.Browser ? P.Browser.open({ url }) : (location.href = url);
    try {
      if (!(await U.canInstall()).allowed) { go.textContent = 'Allow, then tap again'; await U.openInstallSettings(); return; }
      go.disabled = true; go.textContent = 'Downloading…'; const h = await U.addListener('progress', p => { go.textContent = `Downloading ${p.percent}%`; });
      await U.downloadAndInstall({ url }); h?.remove?.(); go.disabled = false; go.textContent = 'Install';
    } catch (e) { go.disabled = false; go.textContent = 'Retry'; console.warn('update', e); }
  };
}
export async function checkUpdate({ force = false } = {}) {
  if (!native || !P.App) return null;
  try {
    const info = await P.App.getInfo(), have = +info.build || 0;
    const r = await fetch(REL, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }); if (!r.ok) return null;
    const rel = await r.json(), code = codeFromTag(rel.tag_name);
    window.__kova && (window.__kova.apk = { have, latest: code });
    if (code > have && (force || localStorage.getItem('apkSkip') !== String(code))) banner(rel, code);
    return { have, latest: code, version: info.version, rel };
  } catch { return null; }
}
// Settings > App updates row (works in the app and on the web)
export const WEB_VERSION = 'web v38';
async function updRow(manual) {
  const info = document.getElementById('updInfo'), btn = document.getElementById('updCheck'); if (!info) return;
  if (!native) {
    info.textContent = `GLP1 Life ${WEB_VERSION}. Website updates install automatically.`;
    if (manual) { btn.textContent = 'Checking…'; try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch {} btn.textContent = '🔄 Check for updates'; info.textContent = `GLP1 Life ${WEB_VERSION}. You're up to date (new versions load automatically).`; }
    return;
  }
  if (manual) { btn.disabled = true; btn.textContent = 'Checking…'; }
  const r = await checkUpdate({ force: manual });
  btn.disabled = false; btn.textContent = '🔄 Check for updates';
  if (!r) { info.textContent = "Couldn't check for updates right now. Check your internet and try again."; return; }
  info.textContent = r.latest > r.have ? `Installed: v${r.version}. New version v1.0.${r.latest} available, tap Update in the banner.` : `Installed: v${r.version}. You're on the latest version.`;
}
function wireUpd() { const b = document.getElementById('updCheck'); if (b && !b.onclick) { b.onclick = () => updRow(true); updRow(false); } }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireUpd); else wireUpd();
if (native) { insets(); statusBar(); setTimeout(checkUpdate, 2500); document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkUpdate()); }
