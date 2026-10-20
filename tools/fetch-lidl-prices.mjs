// Nightly: does Lidl GB publish everyday prices on product pages yet? Checks a small sample of /p/ pages
// (allowed by robots.txt) for a price in the page's schema.org Product data. If prices appear, collects up to
// MAX food product pages (3 s apart, identifying UA, no bypass) into data/lidl-prices.json with price history.
import fs from 'node:fs'; import zlib from 'node:zlib';
import { robotsAllows } from './fetch-offers-lib.mjs';
const UA = 'RetaCoachOffersBot/1.0 (+https://github.com/mitchrobfilms/coach-workout-app; nightly, 1 request per page)', O = 'https://www.lidl.co.uk', MAX = 250, SAMPLE = 8;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { for (let a = 0; a < 2; a++) { try { return await get1(u); } catch (e) { if (a) throw e; await sleep(5000); } } };
const get1 = async u => { const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'en-GB', accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(20000) }); return r; };
const prev = (() => { try { return JSON.parse(fs.readFileSync('data/lidl-prices.json', 'utf8')); } catch { return { items: [] }; } })();
const now = new Date().toISOString(), day = now.slice(0, 10);
export function readProduct(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) { let j; try { j = JSON.parse(m[1]); } catch { continue; }
    if (j['@type'] !== 'Product') continue; const offers = [].concat(j.offers || []); const price = offers.map(o => +o.price).find(v => v > 0);
    const food = /"categoryPrimary":"Food"/.test(html) && !/Non-Food|near food\/(Drugstore|Household|Baby)/i.test((html.match(/"wonCategoryPrimary":"[^"]*"/) || [''])[0]);
    return { id: String(j.sku || ''), name: j.name, price: price ?? null, food, url: j.url }; }
  return null;
}
const out = { checked: now, status: 'offers-only', note: 'Lidl only publishes offer prices online.', sample: [], items: prev.items || [] };
try {
  const robots = await (await get(O + '/robots.txt')).text(); await sleep(3000);
  const sm = await get(O + '/p/export/GB/en/product_sitemap.xml.gz'); await sleep(3000);
  const buf = Buffer.from(await sm.arrayBuffer()); let xml; try { xml = zlib.gunzipSync(buf).toString(); } catch { xml = buf.toString(); }
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => robotsAllows(robots, new URL(u).pathname));
  const off = (+day.replace(/-/g, '')) % Math.max(1, urls.length - 400);
  const pick = urls.filter((_, i) => (i + off) % Math.max(1, Math.floor(urls.length / SAMPLE)) === 0).slice(0, SAMPLE);
    for (const u of pick) { let r; try { r = await get(u); } catch (e) { out.sample.push({ url: u, status: 'error' }); continue; } await sleep(3000); const p = r.ok ? readProduct(await r.text()) : null; out.sample.push({ url: u, status: r.status, food: !!p?.food, price: p?.price ?? null }); }
  const fs_ = out.sample.filter(s => s.food); if (fs_.length >= 3 && fs_.filter(s => s.price > 0).length / fs_.length >= 0.6) { // only food pages count: Lidl sells non-food online, which always has prices
    out.status = 'live'; out.note = ''; const old = new Map((prev.items || []).map(i => [i.id, i])), items = [];
    for (const u of urls.slice(0, MAX * 2)) { if (items.length >= MAX) break; const r = await get(u); await sleep(3000); if (r.status === 403 || r.status === 429) break; if (!r.ok) continue;
      const p = readProduct(await r.text()); if (!p?.price || !p.food) continue;
      const h = [...(old.get(p.id)?.history || [])]; if (!h.length || h[h.length - 1].p !== p.price) h.push({ d: day, p: p.price });
      items.push({ ...p, history: h.slice(-30), last: h.length > 1 ? h[h.length - 2] : null }); }
    out.items = items;
  }
} catch (e) { out.note += ' Check failed: ' + e.message; }
fs.writeFileSync('data/lidl-prices.json', JSON.stringify(out));
console.log('lidl product-page price check', out.status, JSON.stringify(out.sample.map(s => [s.food ? 'food' : 'other', s.price])), 'items', out.items.length);
