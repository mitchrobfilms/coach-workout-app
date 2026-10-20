// Save / share generated files. Web: <a download> + navigator.share({files}). Android app (Capacitor WebView ignores
// <a download> and blob: URLs): @capacitor/filesystem writes to Download/GLP1 Life (falls back to Documents), and
// @capacitor/share opens the Android share sheet (WhatsApp, Photos/Gallery, Drive...) from a cache copy.
const P = () => (window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins) || null;
export const isNative = () => !!(P()?.Filesystem);
export const safeName = n => String(n || 'file').replace(/[^\w.\- ]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
export const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
async function nativeWrite(blob, name) {
  const fs = P().Filesystem, data = await b64(blob), file = safeName(name);
  const cache = await fs.writeFile({ path: `share/${file}`, data, directory: 'CACHE', recursive: true }); // for the share sheet
  for (const [directory, path, where] of [['EXTERNAL_STORAGE', `Download/GLP1 Life/${file}`, 'Downloads'], ['DOCUMENTS', `GLP1 Life/${file}`, 'Documents']]) {
    try { if (directory === 'EXTERNAL_STORAGE') await fs.requestPermissions?.().catch(() => {}); const r = await fs.writeFile({ path, data, directory, recursive: true }); return { where, uri: r.uri, shareUri: cache.uri }; } catch (e) { console.warn('save', directory, e?.message); }
  }
  return { where: null, shareUri: cache.uri };
}
// Returns { saved: 'Downloads'|'Documents'|'browser'|null, share: () => Promise }
export async function saveBlob(blob, name, { title = '', text = '' } = {}) {
  if (isNative()) { const r = await nativeWrite(blob, name); return { saved: r.where, uri: r.uri, share: () => P().Share.share({ title, text, files: [r.shareUri], dialogTitle: 'Share' }) }; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return { saved: 'browser', share: () => shareBlob(blob, name, { title, text }) };
}
// Share: native share sheet in the app; Web Share with files on phones; otherwise falls back to a download.
export async function shareBlob(blob, name, { title = '', text = '' } = {}) {
  if (isNative()) { const r = await nativeWrite(blob, name); try { await P().Share.share({ title, text, files: [r.shareUri], dialogTitle: 'Share' }); } catch (e) { if (!/cancel/i.test(e?.message || '')) throw e; } return 'shared'; }
  const f = new File([blob], name, { type: blob.type });
  try { if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title, text }); return 'shared'; } } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  await saveBlob(blob, name); return 'downloaded';
}
