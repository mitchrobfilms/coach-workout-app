// Nightly full-range price list (00:30 UK, with offers). Aldi only: public category pages, robots.txt checked per path,
// first page of each category only (robots.txt disallows ?page=), 3 s between requests, identifying UA, no cookies,
// no bot-protection bypass. Lidl GB does not publish everyday shelf prices online (product pages carry no price),
// so Lidl stays offers-only. Keeps last-price history per product in data/full-prices.json.
import fs from 'node:fs';
import { parseAldi, enrich } from '../offers.js';
import { robotsAllows } from './fetch-offers-lib.mjs';
const UA = 'RetaCoachOffersBot/1.0 (+https://github.com/mitchrobfilms/coach-workout-app; nightly, 1 request per page)';
const O = 'https://www.aldi.co.uk';
const CATS = [['Fruit','fresh-food/fruit/k/1588161416978050001'],['Vegetables','fresh-food/vegetables/k/1588161416978050002'],['Stir fry','fresh-food/stir-fry-vegetables-sauce-noodles/k/1588161416978050003'],['Poultry','fresh-food/poultry/k/1588161416978050004'],['Beef','fresh-food/beef/k/1588161416978050005'],['Pork','fresh-food/pork-gammon/k/1588161416978050006'],['Bacon & sausages','fresh-food/bacon-sausages/k/1588161416978050007'],['Lamb','fresh-food/lamb/k/1588161416978050008'],['Fish','fresh-food/fish/k/1588161416978050011'],['Seafood','fresh-food/seafood-prawns/k/1588161416978050012'],['Cereals','food-cupboard/cereals-snack-bars/k/1588161416978053002'],['Herbs & spices','food-cupboard/herbs-spices/k/1588161416978053007'],['Rice, pasta & noodles','food-cupboard/rice-pasta-noodles/k/1588161416978053008'],['Nuts & seeds','food-cupboard/seeds-nuts-dried-fruits/k/1588161416978053009'],['Sauces & oils','food-cupboard/sauces-oils-dressings/k/1588161416978053010'],['Tins & packets','food-cupboard/tins-cans-packets/k/1588161416978053012'],['Milk','chilled-food/milk/k/1588161416978051001'],['Dairy','chilled-food/dairy/k/1588161416978051002'],['Eggs','chilled-food/eggs/k/1588161416978051003'],['Cheese','chilled-food/cheese/k/1588161416978051004'],['Yogurts','chilled-food/yogurts/k/1588161416978051005'],['Chilled meats','chilled-food/chilled-meats/k/1588161416978051011'],['Meat-free','chilled-food/meat-substitutes/k/1588161421695436'],['Soups','chilled-food/soups/k/1588161416978051010'],['Frozen meat','frozen-food/meat-poultry/k/1588161416978056001'],['Frozen fish','frozen-food/fish-seafood/k/1588161416978056002'],['Frozen veg','frozen-food/vegetables-sides/k/1588161416978056004'],['Frozen fruit','frozen-food/fruit-smoothies/k/1588161416978056008'],['Bread','bakery/bread/k/1588161416978049001'],['Wraps & thins','bakery/wraps-naans-pittas-thins/k/1588161416978049007']];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'en-GB' } }); return { status: r.status, text: await r.text() }; };
const prev = (() => { try { return JSON.parse(fs.readFileSync('data/full-prices.json', 'utf8')); } catch { return { stores: {} }; } })();
const now = new Date().toISOString(), day = now.slice(0, 10);
const old = new Map((prev.stores?.aldi?.items || []).map(i => [i.id, i]));
const res = { status: 'fallback', checked: now, pages: [], items: [] };
try {
  const robots = await get(O + '/robots.txt'); await sleep(3000);
  if (robots.status !== 200) throw new Error('robots.txt HTTP ' + robots.status);
  for (const [cat, path] of CATS) {
    const p = '/products/' + path;
    if (!robotsAllows(robots.text, p)) { res.pages.push({ cat, result: 'disallowed' }); continue; }
    const r = await get(O + p); await sleep(3000);
    if (r.status !== 200 || /captcha|challenge-platform/i.test(r.text.slice(0, 20000))) { res.pages.push({ cat, result: 'HTTP ' + r.status }); if (r.status === 403 || r.status === 429) break; continue; }
    const items = enrich(parseAldi(r.text, { source: cat, baseUrl: O }));
    res.pages.push({ cat, result: items.length + ' items' });
    for (const i of items) res.items.push({ id: i.id, name: i.name, brand: i.brand, size: i.size, price: i.price, was: i.was, perKg: i.perKg, protein: i.protein ?? null, cat, url: i.url });
  }
} catch (e) { res.note = 'Fetch failed: ' + e.message; }
const seen = new Set(); res.items = res.items.filter(i => !seen.has(i.id) && seen.add(i.id));
for (const i of res.items) { const h = [...(old.get(i.id)?.history || [])]; if (!h.length || h[h.length - 1].p !== i.price) h.push({ d: day, p: i.price }); i.history = h.slice(-30); i.last = h.length > 1 ? h[h.length - 2] : null; }
if (res.items.length) res.status = 'live';
else if (prev.stores?.aldi?.items?.length) Object.assign(res, { status: 'stale', items: prev.stores.aldi.items, checked: prev.stores.aldi.checked });
const out = { updated: now, stores: { aldi: res, lidl: { status: 'offers-only', note: 'Lidl publishes prices online for offers only.' } } };
fs.writeFileSync('data/full-prices.json', JSON.stringify(out));
console.log('aldi full prices', res.status, res.items.length, JSON.stringify(res.pages));
// Feed the meal builder: replace curated Aldi typical prices with the cheapest matching live shelf price (scaled to pack).
import { STAPLES } from '../glp1.js';
import { parseGrams } from '../offers.js';
try {
  const pj = JSON.parse(fs.readFileSync('data/prices.json', 'utf8'));
  if (res.status === 'live') for (const it of pj.items) { const s = STAPLES.find(x => x.key === it.key); if (!s) continue;
    const m = res.items.map(i => ({ ...i, grams: parseGrams(i.size) || parseGrams(i.name) })).filter(i => i.grams && s.match.test(i.name) && !(s.exclude && s.exclude.test(i.name))).sort((a, b) => a.price / a.grams - b.price / b.grams)[0];
    if (m) { it.prices.aldi = Math.round(m.price / m.grams * it.pack * 100) / 100; it.full = { aldi: { name: m.name, price: m.price, size: m.size, url: m.url, checked: now } }; } }
  fs.writeFileSync('data/prices.json', JSON.stringify(pj, null, 1)); console.log('prices.json: aldi staples from full range', pj.items.filter(i => i.full).length);
} catch (e) { console.log('prices.json merge skipped', e.message); }
