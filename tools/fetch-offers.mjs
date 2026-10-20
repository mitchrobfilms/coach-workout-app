// Daily offers fetch (GitHub Actions, ~06:00 UK). Polite: robots.txt checked, one request per page, 3 s apart,
// identifying user agent, no logins, no cookies, no bot-protection bypass. A blocked/failed store keeps its last good
// data (marked stale) or falls back to curated typical prices. Writes data/offers.json and data/prices.json.
import fs from 'node:fs';
import { parseLidlLeaflet, parseAldi, parseLidl, enrich, nutritionFor, parseGrams } from '../offers.js';
import { STAPLES } from '../glp1.js';
import { robotsAllows } from './fetch-offers-lib.mjs';
const UA = 'RetaCoachOffersBot/1.0 (+https://github.com/mitchrobfilms/coach-workout-app; daily, 1 request per page)';
const SOURCES = {
  aldi: { origin: 'https://www.aldi.co.uk', pages: [['/super-6', 'Super Six'], ['/super-weekly-offers', 'Super Weekly Offers']], parse: parseAldi },
  lidl: { origin: 'https://www.lidl.co.uk', pages: [['/c/pick-of-the-week/a10092198', 'Pick of the Week'], ['/c/pick-of-the-week/a10090370', 'Pick of the Week'], ['/c/lidl-plus-offers-current/a10053222', 'Lidl Plus offers'], ['/c/lidl-plus-offers-upcoming/a10053070', 'Lidl Plus offers (upcoming)']], parse: parseLidl },
  asda: { origin: 'https://groceries.asda.com', pages: [['/special-offers', 'Asda offers']], parse: null }, // no parser: probed politely, see note
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) { const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-GB' }, redirect: 'follow' }); return { status: r.status, text: r.ok ? await r.text() : '' }; }
const prev = (() => { try { return JSON.parse(fs.readFileSync('data/offers.json', 'utf8')); } catch { return { stores: {} }; } })();
const now = new Date().toISOString(), out = { updated: now, highProteinMin: 10, stores: {} };
for (const [store, src] of Object.entries(SOURCES)) {
  const res = { status: 'fallback', checked: now, note: '', items: [], pages: [] };
  try {
    const robots = await get(src.origin + '/robots.txt'); await sleep(3000);
    if (robots.status === 403 || robots.status === 429) throw new Error(`robots.txt returned ${robots.status}`);
    for (const [path, label] of src.pages) {
      if (!robotsAllows(robots.text, path)) { res.pages.push({ path, result: 'disallowed by robots.txt' }); continue; }
      const r = await get(src.origin + path); await sleep(3000);
      if (r.status === 403 || r.status === 429 || /cf-chl|challenge-platform|captcha/i.test(r.text.slice(0, 20000))) { res.pages.push({ path, result: `blocked (${r.status})` }); res.note = `${store === 'asda' ? 'Asda' : store} blocks automated requests (HTTP ${r.status}); we don't bypass that.`; break; }
      if (!r.text || !src.parse) { res.pages.push({ path, result: `HTTP ${r.status}${src.parse ? '' : ', no parser'}` }); continue; }
      const items = enrich(src.parse(r.text, { source: label, baseUrl: src.origin }));
      res.pages.push({ path, result: `${items.length} items` }); res.items.push(...items);
    }
  } catch (e) { res.note ||= `Fetch failed: ${e.message}`; }
  if (store === 'lidl') { // this week's and next week's leaflets: lidl.co.uk/c/online-leaflets lists them; the viewer loads public JSON
    try {
      const lp = await get(src.origin + '/c/online-leaflets/s10023175'); await sleep(3000);
      const ids = [...new Set([...lp.text.matchAll(/\/l\/en\/online-leaflets\/(\d\d-\d\d-\d\d-\d\d-lidl-weekly)\//g)].map(m => m[1]))];
      for (const id of ids) { const r = await fetch('https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=' + id, { headers: { 'user-agent': UA, accept: 'application/json' } }); await sleep(3000);
        if (!r.ok) { res.pages.push({ path: 'leaflet ' + id, result: 'HTTP ' + r.status }); continue; }
        const items = enrich(parseLidlLeaflet(await r.json(), { baseUrl: src.origin })); res.pages.push({ path: 'leaflet ' + id, result: `${items.length} items` }); res.items.push(...items); }
    } catch (e) { res.pages.push({ path: 'leaflets', result: 'failed: ' + e.message }); }
  }
  const seen = new Set(); res.items = res.items.filter(o => { const k = o.id + '|' + o.from; return !seen.has(k) && seen.add(k); });
  if (res.items.length) { res.status = 'live'; res.note = ''; }
  else if (prev.stores?.[store]?.items?.length) { Object.assign(res, { status: 'stale', items: prev.stores[store].items, checked: prev.stores[store].checked, note: (res.note || 'Today\'s fetch found nothing') + '. Showing the last good list.' }); }
  else res.note ||= 'No offers could be read today.';
  out.stores[store] = res; console.log(store, res.status, res.items.length, JSON.stringify(res.pages), res.note);
}
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/offers.json', JSON.stringify(out, null, 1));
// prices.json: curated typical shelf prices for GLP-1 staples, overridden by a matching live offer where one exists.
const all = Object.values(out.stores).flatMap(s => s.status === 'live' ? s.items : []);
const prices = { updated: now, curatedChecked: '2026-10-20', note: 'Typical shelf prices (estimates) unless marked as a live offer. Prices vary by store and region.', items: STAPLES.map(s => {
  const offers = {}; for (const st of ['aldi', 'lidl', 'asda']) { const o = all.map(x => ({ ...x, grams: parseGrams(x.size) || parseGrams(x.name) })).filter(x => x.store === st && x.grams && s.match.test(x.name) && !(s.exclude && s.exclude.test(x.name))).sort((a, b) => a.price / a.grams - b.price / b.grams)[0]; if (o) offers[st] = { name: o.name, price: o.price, was: o.was, size: o.size, grams: o.grams, url: o.url, promo: o.promo }; }
  return { key: s.key, name: s.name, pack: s.pack, protein: s.protein, prices: s.prices, offers };
}) };
fs.writeFileSync('data/prices.json', JSON.stringify(prices, null, 1));
console.log('wrote data/offers.json and data/prices.json', nutritionFor('chicken breast')?.protein);
