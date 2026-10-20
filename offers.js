// Offers + prices: parsing (used by the daily GitHub Action, tools/fetch-offers.mjs) and app-side helpers.
// Only parses PUBLIC offer pages. No logins, no bot-protection bypass. Nutrition from a curated table (per 100 g, typical UK values).
export const NUTRITION = [ // [regex, protein g/100g, kcal/100g, tag]
  [/biryani|jalfrezi|madras|curry|rogan|korma|tikka masala|lasagne|\bpie\b|fish & chips|pizza|ready meal/i, 7, 140, 'ready'], [/sausage|boerewors|chorizo|salami|burger/i, 14, 250, 'processed'],
  [/ribs?\b|rib rack|pork belly/i, 18, 260, 'pork'], [/(5%|lean).*pork mince|pork mince/i, 21, 140, 'pork'], [/hog roast|pulled pork|pork/i, 20, 200, 'pork'],
  [/whey|protein powder/i, 75, 380, 'protein'], [/tuna/i, 25, 110, 'fish'], [/chicken breast|chicken fillet|mini fillet|chicken mini/i, 24, 110, 'chicken'],
  [/turkey (breast|steak|mince)|turkey/i, 22, 120, 'turkey'], [/\bprawns?\b/i, 18, 70, 'fish'], [/salmon/i, 20, 200, 'fish'], [/\bcod\b|haddock|basa|pollock|white fish/i, 18, 80, 'fish'],
  [/(5|5%) ?fat.*mince|lean.*mince|extra lean/i, 21, 135, 'beef'], [/beef.*mince|mince.*beef|steak mince/i, 19, 220, 'beef'], [/pork.*mince|beef and pork mince/i, 18, 230, 'pork'],
  [/steak/i, 22, 150, 'beef'], [/ham\b|gammon/i, 19, 110, 'pork'], [/pork loin|pork steak|pork medallion/i, 22, 140, 'pork'], [/chicken (thigh|drum|leg)|whole chicken|roast chicken/i, 19, 180, 'chicken'],
  [/chicken/i, 20, 150, 'chicken'], [/quorn|meat ?free|mycoprotein/i, 14, 100, 'veg-protein'], [/tofu/i, 13, 120, 'veg-protein'], [/tempeh/i, 19, 190, 'veg-protein'],
  [/skyr|quark/i, 11, 65, 'dairy'], [/greek.*yog|yog.*greek|high protein yog/i, 9, 75, 'dairy'], [/cottage cheese/i, 11, 80, 'dairy'], [/feta/i, 16, 260, 'dairy'],
  [/mozzarella.*light|light.*mozzarella/i, 20, 170, 'dairy'], [/cheddar|cheese/i, 25, 400, 'dairy'], [/\beggs?\b/i, 13, 140, 'eggs'], [/edamame/i, 11, 120, 'veg-protein'],
  [/lentil/i, 9, 115, 'pulse'], [/chickpea/i, 7, 120, 'pulse'], [/(kidney|black|baked|butter|cannellini|mixed) beans?/i, 6, 90, 'pulse'], [/peanut butter/i, 25, 600, 'nuts'],
  [/almond|cashew|peanut|walnut|mixed nuts/i, 20, 600, 'nuts'], [/milk\b/i, 3.5, 50, 'dairy'], [/yog(h)?urt/i, 4, 80, 'dairy'], [/oats|porridge/i, 11, 370, 'carb'],
  [/rice\b/i, 3, 130, 'carb'], [/pasta|spaghetti|penne|fusilli/i, 12, 350, 'carb'], [/bread|wrap|tortilla|bagel/i, 9, 250, 'carb'],
  [/broccoli|spinach|peas\b|sprouts|kale/i, 3, 35, 'veg'], [/pepper|carrot|onion|tomato|cucumber|courgette|mushroom|lettuce|cabbage|cauliflower|parsnip|leek|sweetcorn/i, 1, 30, 'veg'],
  [/apple|banana|berr|orange|pear|grape|melon|mango|pomegranate|satsuma|clementine|kiwi|plum|pineapple|avocado/i, 1, 55, 'fruit'],
];
const NON_FOOD = /wine|beer|cider|gin\b|vodka|whisky|prosecco|champagne|lager|crisps|chocolate|sweets|biscuits?\b|cake|candy|halloween|pumpkin carving|toy|jacket|sock|candle|plant\b|flowers?\b/i;
export function nutritionFor(name) {
  if (NON_FOOD.test(name)) return null;
  for (const [re, protein, kcal, tag] of NUTRITION) if (re.test(name)) return { protein, kcal, tag };
  return null;
}
export const HIGH_PROTEIN = 10; // g per 100 g
export const isHighProtein = o => (o?.protein ?? 0) >= HIGH_PROTEIN;
const unesc = s => String(s).replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ');
const money = s => { if (s == null) return null; const t = String(s); let m = t.match(/£\s?(\d+(?:\.\d+)?)/); if (m) return +m[1]; m = t.match(/(\d+(?:\.\d+)?)\s?p\b/); return m ? Math.round(+m[1]) / 100 : null; };
// "(£4.99/1 KG)" -> 4.99 per kg ; "(£0.69/1 Each)" -> null
function perKg(s) { const m = String(s || '').match(/£\s?(\d+(?:\.\d+)?)\s?\/\s?(\d+(?:\.\d+)?)?\s?(kg|g|l|ml|100g|100ml)/i); if (!m) return null; const v = +m[1], q = +(m[2] || 1), u = m[3].toLowerCase(); const kg = u === 'kg' || u === 'l' ? q : u === '100g' || u === '100ml' ? .1 * q : q / 1000; return Math.round(v / kg * 100) / 100; }

/* ---------- Aldi UK: /super-6 and /super-weekly-offers product tiles ---------- */
export function parseAldi(html, { source = 'Aldi', baseUrl = 'https://www.aldi.co.uk' } = {}) {
  const out = [], seen = new Set();
  for (const chunk of html.split('id="product-tile-').slice(1)) {
    const id = chunk.match(/^(\d+)/)?.[1]; if (!id || seen.has(id)) continue; seen.add(id);
    const name = unesc(chunk.match(/product-tile__name"[^>]*><p[^>]*>([^<]+)</)?.[1] || chunk.match(/title="([^"]+)"/)?.[1] || '').trim();
    if (!name) continue;
    const brand = unesc(chunk.match(/product-tile__brandname"[^>]*><p[^>]*>([^<]+)</)?.[1] || '').trim();
    const size = unesc(chunk.match(/product-tile__unit-of-measurement"><p>([^<]+)</)?.[1] || '').trim();
    const comp = chunk.match(/product-tile__comparison-price"><p>([^<]+)</)?.[1] || '';
    const disc = chunk.match(/Discounted price: (£[\d.]+)/)?.[1];
    const reg = chunk.match(/base-price__regular"><span>(£[\d.]+)</)?.[1];
    const was = chunk.match(/Original price: (£[\d.]+)/)?.[1];
    const price = money(disc || reg); if (price == null) continue;
    const href = chunk.match(/href="(\/product\/[^"]+)"/)?.[1];
    const promo = [chunk.match(/aria-label="(Save \d+%)"/)?.[1], unesc(chunk.match(/on-sale-label"><!--\[--><!--\]-->([^<]+)</)?.[1] || '').trim()].filter(Boolean).join(' · ');
    out.push({ store: 'aldi', source, id, name: brand && !/^(nature's pick|everyday essentials)$/i.test(brand) ? `${name}` : name, brand, size, price, was: money(was), perKg: perKg(comp), promo: promo || source, url: href ? baseUrl + href : baseUrl, from: null, to: null });
  }
  return out;
}

/* ---------- Lidl GB: /c/pick-of-the-week/* and Lidl Plus offers pages (data-grid-data JSON on each tile) ---------- */
export function parseLidl(html, { source = 'Lidl', baseUrl = 'https://www.lidl.co.uk' } = {}) {
  const out = [], seen = new Set();
  for (const m of html.matchAll(/data-grid-data="([^"]*)"/g)) {
    let d; try { d = JSON.parse(unesc(m[1])); } catch { continue; }
    const id = String(d.productId || d.itemId || ''); if (!id || seen.has(id)) continue; seen.add(id);
    const lp = d.lidlPlus?.[0]?.price, p = d.price || {};
    const price = typeof p.price === 'number' ? p.price : typeof lp?.price === 'number' ? lp.price : null; if (price == null) continue;
    const pk = typeof p.price === 'number' ? p : lp;
    const was = pk.oldPrice ? pk.oldPrice : money(pk.packaging?.text?.match(/regular price.*$/i)?.[0]);
    const base = pk.basePrice?.text || '';
    const promo = [d.lidlPlus?.length && typeof p.price !== 'number' ? 'Lidl Plus price' : '', pk.discount?.discountText || d.lidlPlus?.[0]?.highlightText || ''].filter(Boolean).join(' · ');
    const iso = t => t ? new Date(t * 1000).toISOString().slice(0, 10) : null;
    out.push({ store: 'lidl', source, id, name: unesc(d.fullTitle || d.title || '').trim(), brand: '', size: d.keyfacts?.supplementalDescription || pk.packaging?.text?.replace(/regular price.*$/i, '').trim() || '', price, was: was && was > price ? was : null, perKg: perKg(base.replace(/^(\d+(?:\.\d+)?)p/, (_, n) => '£' + (n / 100))), promo: promo || source, url: d.canonicalUrl ? baseUrl + d.canonicalUrl : baseUrl, from: iso(d.storeStartDate), to: iso(d.storeEndDate) });
  }
  return out;
}
export function enrich(items) {
  return items.map(o => { const n = nutritionFor(o.name); return { ...o, protein: n?.protein ?? null, kcal100: n?.kcal ?? null, tag: n?.tag ?? null }; });
}
/* ---------- app helpers ---------- */
export const STORE_NAMES = { aldi: 'Aldi', lidl: 'Lidl', asda: 'Asda' };
export function offersFor(data, { store = 'all', highProtein = false } = {}) {
  const list = Object.values(data?.stores || {}).flatMap(s => s.items || []);
  return list.filter(o => (store === 'all' || o.store === store) && (!highProtein || isHighProtein(o)))
    .sort((a, b) => (b.protein ?? -1) - (a.protein ?? -1) || a.price - b.price);
}
export const fmtGBP = v => v == null ? '' : v < 1 ? `${Math.round(v * 100)}p` : `£${v.toFixed(2)}`;
export const fmtChecked = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
// Pack size in grams/ml from text like "2.5kg", "6 x 110g", "500 g", "1 Litre". null if unknown (e.g. "1 Each").
export function parseGrams(size) {
  const s = String(size || '').toLowerCase().replace(/,/g, '.');
  let m = s.match(/(\d+)\s?x\s?(\d+(?:\.\d+)?)\s?(kg|g|ml|l)\b/); if (m) return Math.round(+m[1] * +m[2] * (m[3] === 'kg' || m[3] === 'l' ? 1000 : 1));
  m = s.match(/(\d+(?:\.\d+)?)\s?(kg|g|ml|l|litres?)\b/); if (m) return Math.round(+m[1] * (/^(kg|l|litre)/.test(m[2]) ? 1000 : 1));
  return null;
}
