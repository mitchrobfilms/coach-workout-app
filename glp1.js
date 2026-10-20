// GLP-1 meal prep builder (general healthy-eating guidance only; no medication or dosing advice).
// Priorities for people on GLP-1 medicines (e.g. semaglutide, tirzepatide, retatrutide): protein first (about 25–40 g a meal),
// small portions, fibre, fluids, lower-fat/gentle options if queasy, eat slowly and stop when full.
const S = (key, name, pack, unit, protein, kcal, prices, match, extra = {}) => ({ key, name, pack, unit, protein, kcal, prices, match, ...extra });
// pack: grams (or ml) per pack; prices: typical shelf price per pack (GBP, estimates checked 20 Oct 2026; vary by store/region).
export const STAPLES = [
  S('chicken', 'Chicken breast fillets', 1000, 'g', 24, 110, { aldi: 5.49, lidl: 5.49, asda: 5.97 }, /chicken (breast|fillet|mini)/i, { core: true, lowfat: true }),
  S('turkeymince', 'Turkey breast mince (2% fat)', 500, 'g', 23, 105, { aldi: 3.19, lidl: 3.29, asda: 3.50 }, /turkey.*mince/i, { core: true, lowfat: true }),
  S('beefmince', '5% fat beef mince', 500, 'g', 21, 135, { aldi: 3.49, lidl: 3.49, asda: 3.68 }, /(5%|lean).*beef.*mince|beef mince.*5%|steak mince/i, { core: true }),
  S('porkmince', '5% fat pork mince', 1000, 'g', 21, 140, { aldi: 3.89, lidl: 3.99, asda: 4.25 }, /(5%|lean).*pork mince|pork mince/i, { core: true }),
  S('salmon', 'Salmon fillets', 480, 'g', 20, 200, { aldi: 4.99, lidl: 5.29, asda: 5.50 }, /salmon fillet/i, { core: true }),
  S('cod', 'White fish fillets (cod/basa)', 400, 'g', 18, 80, { aldi: 3.29, lidl: 3.29, asda: 3.75 }, /\bcod\b|basa|haddock|pollock/i, { core: true, lowfat: true }),
  S('prawns', 'King prawns (frozen)', 300, 'g', 18, 70, { aldi: 3.29, lidl: 3.49, asda: 3.75 }, /prawns?/i, { core: true, lowfat: true }),
  S('tuna', 'Tuna chunks in spring water (tins)', 4 * 112, 'g', 25, 110, { aldi: 3.29, lidl: 3.29, asda: 3.60 }, /tuna/i, { core: true, lowfat: true }),
  S('eggs', 'Eggs (15)', 15 * 55, 'g', 13, 140, { aldi: 2.99, lidl: 2.99, asda: 3.20 }, /\beggs?\b/i, { core: true }),
  S('skyr', 'Skyr / high-protein yoghurt', 450, 'g', 11, 65, { aldi: 1.39, lidl: 1.39, asda: 1.65 }, /skyr|high protein yog|quark/i, { core: true, lowfat: true }),
  S('greek', 'Greek-style yoghurt 0% fat', 1000, 'g', 10, 60, { aldi: 2.49, lidl: 2.49, asda: 2.75 }, /greek.*(yog|0%)|fat free.*yog/i, { core: true, lowfat: true }),
  S('cottage', 'Cottage cheese (reduced fat)', 300, 'g', 11, 80, { aldi: 0.99, lidl: 0.99, asda: 1.10 }, /cottage cheese/i, { core: true, lowfat: true }),
  S('tofu', 'Firm tofu', 280, 'g', 13, 120, { aldi: 1.49, lidl: 1.59, asda: 1.75 }, /tofu/i, { core: true, veg: true }),
  S('lentils', 'Red lentils (dry)', 500, 'g', 24, 340, { aldi: 1.15, lidl: 1.15, asda: 1.30 }, /red lentil/i, { veg: true }),
  S('chickpeas', 'Chickpeas (tin)', 240, 'g', 7, 120, { aldi: 0.45, lidl: 0.45, asda: 0.55 }, /chickpea/i, { veg: true }),
  S('oats', 'Porridge oats', 1000, 'g', 11, 370, { aldi: 0.89, lidl: 0.89, asda: 0.95 }, /oats|porridge/i),
  S('rice', 'Microwave brown rice pouches', 4 * 250, 'g', 3, 150, { aldi: 2.40, lidl: 2.40, asda: 3.00 }, /rice/i),
  S('potatoes', 'Potatoes', 2000, 'g', 2, 75, { aldi: 1.15, lidl: 1.15, asda: 1.30 }, /potato/i, { exclude: /crisp|chips|wedges|mash|salad/i }),
  S('wraps', 'Wholemeal wraps (8)', 8 * 62, 'g', 9, 260, { aldi: 1.09, lidl: 1.09, asda: 1.25 }, /wrap|tortilla/i),
  S('frozenveg', 'Frozen mixed veg / broccoli', 1000, 'g', 3, 40, { aldi: 1.05, lidl: 1.05, asda: 1.20 }, /frozen.*(veg|broccoli)|broccoli/i),
  S('spinach', 'Spinach', 200, 'g', 3, 25, { aldi: 0.99, lidl: 0.99, asda: 1.10 }, /spinach/i),
  S('peppers', 'Peppers (3 pack)', 450, 'g', 1, 30, { aldi: 1.19, lidl: 1.19, asda: 1.35 }, /peppers?/i),
  S('carrots', 'Carrots', 1000, 'g', 1, 35, { aldi: 0.49, lidl: 0.49, asda: 0.60 }, /carrots?/i),
  S('tomatoes', 'Chopped tomatoes (tin)', 400, 'g', 1, 25, { aldi: 0.35, lidl: 0.35, asda: 0.40 }, /chopped tomatoes|passata/i),
  S('berries', 'Frozen mixed berries', 500, 'g', 1, 45, { aldi: 1.99, lidl: 1.99, asda: 2.25 }, /berr/i),
  S('banana', 'Bananas (5)', 5 * 120, 'g', 1, 90, { aldi: 0.75, lidl: 0.75, asda: 0.82 }, /banana/i),
  S('milk', 'Semi-skimmed milk (2 pints)', 1136, 'ml', 3.5, 50, { aldi: 1.25, lidl: 1.25, asda: 1.30 }, /semi.?skimmed|skimmed milk/i, { lowfat: true }),
  S('cheese', 'Reduced-fat cheddar', 350, 'g', 28, 310, { aldi: 2.49, lidl: 2.49, asda: 2.80 }, /lighter|reduced fat.*cheddar|cheddar/i),
];
export const STAPLE = Object.fromEntries(STAPLES.map(s => [s.key, s]));
// Recipe ing: [stapleKey, grams per portion]. `core` = protein ingredient the builder scales to hit the protein target.
const R = (id, meal, name, core, ing, steps, o = {}) => ({ id, meal, name, core, ing, steps, fussy: false, veg: false, gentle: false, fridgeDays: 3, ...o });
export const GLP1_RECIPES = [
  R('g-skyrpot', 'breakfast', 'Skyr berry protein pots', 'skyr', [['skyr', 200], ['greek', 0], ['berries', 80], ['oats', 25]], ['Spoon skyr into pots, add berries.', 'Keep oats separate; sprinkle on in the morning.'], { fussy: true, veg: true, gentle: true }),
  R('g-oats', 'breakfast', 'High-protein overnight oats', 'greek', [['oats', 40], ['milk', 120], ['greek', 150], ['berries', 60]], ['Mix oats, milk and yoghurt in jars, top with berries.', 'Fridge overnight. Eat cold or warm.'], { fussy: true, veg: true, gentle: true }),
  R('g-eggmuffin', 'breakfast', 'Egg and veg muffins', 'eggs', [['eggs', 110], ['spinach', 30], ['peppers', 40], ['cheese', 15]], ['Whisk eggs, stir in chopped veg and cheese.', 'Pour into a muffin tin, bake 20 min at 180°C (fan 160°C).', 'Cool, box 2–3 per portion.'], { veg: true }),
  R('g-chickenrice', 'lunch', 'Chicken, rice and veg boxes', 'chicken', [['chicken', 120], ['rice', 100], ['frozenveg', 120]], ['Bake chicken 20–25 min until cooked through; slice.', 'Box with rice and veg (rice: fridge 1 day only, freeze the rest).'], { fussy: true, gentle: true, lowfat: true }),
  R('g-tunapot', 'lunch', 'Tuna and chickpea salad pots', 'tuna', [['tuna', 112], ['chickpeas', 60], ['peppers', 60], ['greek', 30]], ['Mix tuna, chickpeas and chopped pepper.', 'Stir through yoghurt with lemon and pepper. Box up.'], { gentle: true, lowfat: true }),
  R('g-lentilsoup', 'lunch', 'Red lentil soup with skyr swirl', 'lentils', [['lentils', 60], ['carrots', 80], ['tomatoes', 100], ['skyr', 60]], ['Simmer lentils, carrot and tomatoes with stock 25 min.', 'Blend, box, add skyr when serving.'], { veg: true, gentle: true, lowfat: true, fridgeDays: 3 }),
  R('g-turkeychilli', 'dinner', 'Turkey chilli (mild)', 'turkeymince', [['turkeymince', 130], ['tomatoes', 100], ['chickpeas', 40], ['peppers', 50], ['rice', 80]], ['Brown the mince, add peppers, tomatoes and chickpeas.', 'Simmer 20 min. Serve with a small portion of rice.'], { lowfat: true }),
  R('g-chickentray', 'dinner', 'Chicken and potato traybake', 'chicken', [['chicken', 130], ['potatoes', 120], ['carrots', 80], ['frozenveg', 60]], ['Roast chopped potato and carrot 15 min at 200°C.', 'Add chicken, roast 20–25 min until cooked through.'], { fussy: true, gentle: true, lowfat: true }),
  R('g-salmon', 'dinner', 'Salmon, potatoes and greens', 'salmon', [['salmon', 120], ['potatoes', 120], ['frozenveg', 100]], ['Bake salmon 15 min at 200°C.', 'Serve with boiled potatoes and greens. Fridge up to 2 days.'], { fridgeDays: 2 }),
  R('g-beefbolog', 'dinner', 'Lean beef and lentil bolognese', 'beefmince', [['beefmince', 110], ['lentils', 20], ['tomatoes', 120], ['carrots', 60]], ['Brown mince, add grated carrot, lentils and tomatoes.', 'Simmer 25 min. Serve with veg or a small portion of pasta.'], { fussy: true }),
  R('g-tofustir', 'dinner', 'Tofu and veg stir-fry', 'tofu', [['tofu', 200], ['frozenveg', 150], ['rice', 80]], ['Press and cube tofu, fry until golden.', 'Add veg and soy sauce, stir-fry 5 min. Serve with rice.'], { veg: true }),
  R('g-cottage', 'snack', 'Cottage cheese and fruit cups', 'cottage', [['cottage', 150], ['berries', 50]], ['Spoon into small pots with fruit.'], { fussy: true, veg: true, gentle: true }),
  R('g-eggs', 'snack', 'Boiled eggs', 'eggs', [['eggs', 110]], ['Boil 8–9 min, cool, peel. Fridge up to 2 days.'], { fussy: true, veg: true, fridgeDays: 2 }),
];
export const GLP1_TIPS = [
  'Eat protein first at every meal, then veg, then carbs.',
  'Small plates and smaller portions: stop as soon as you feel comfortably full.',
  'Eat slowly. Put your fork down between bites and take about 20 minutes per meal.',
  'Sip water through the day (around 6–8 glasses unless your doctor says otherwise).',
  'If you feel sick, choose plain, low-fat, cold or gentle foods and avoid greasy or very rich meals.',
  'Aim for fibre (veg, oats, lentils, beans) to help with constipation.',
  'This is general healthy-eating guidance, not medical advice. Ask your prescriber about your medicine and doses.',
];
export const MEAL_SLOTS = { 2: ['lunch', 'dinner'], 3: ['breakfast', 'lunch', 'dinner'], 4: ['breakfast', 'lunch', 'dinner', 'snack'] };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
// Price per pack at a store, preferring a live offer (from data/prices.json `offers`).
export function packPrice(key, store, priceData) {
  const st = STAPLE[key], live = priceData?.items?.find(i => i.key === key)?.offers || {};
  const stores = store === 'mix' ? ['aldi', 'lidl', 'asda'] : [store];
  let best = null;
  for (const s of stores) {
    const o = live[s];
    // compare per gram; an offer keeps its own pack size (packG) and pack price
    if (o && o.price && o.grams) { const per = o.price / o.grams; if (!best || per < best.per) best = { store: s, per, packG: o.grams, packPrice: o.price, was: o.was, offer: true, name: `${o.name}${o.size ? ` (${o.size})` : ''}`, url: o.url }; }
    const p = st.prices[s]; if (p != null) { const per = p / st.pack; if (!best || per < best.per) best = { store: s, per, packG: st.pack, packPrice: p, offer: false, name: st.name }; }
  }
  return best;
}
export function portionStats(recipe, grams) {
  let protein = 0, kcal = 0; for (const [k, g] of Object.entries(grams)) { protein += STAPLE[k].protein * g / 100; kcal += STAPLE[k].kcal * g / 100; }
  return { protein: r1(protein), kcal: Math.round(kcal) };
}
// Scale the core protein ingredient so a portion hits the target (capped so portions stay small).
export function fitPortion(recipe, target) {
  const grams = Object.fromEntries(recipe.ing.filter(([, g]) => g > 0).map(([k, g]) => [k, g]));
  let st = portionStats(recipe, grams);
  if (st.protein < target) { const add = (target - st.protein) / STAPLE[recipe.core].protein * 100; grams[recipe.core] = Math.min((grams[recipe.core] || 0) + add, Math.max(250, (grams[recipe.core] || 0) * 2.2)); }
  else if (st.protein > target + 10) { const cut = (st.protein - target - 5) / STAPLE[recipe.core].protein * 100; grams[recipe.core] = Math.max((grams[recipe.core] || 0) - cut, (grams[recipe.core] || 0) * .5); }
  for (const k in grams) grams[k] = Math.round(grams[k] / 5) * 5;
  return { grams, ...portionStats(recipe, grams) };
}
export function buildGlp1Plan({ store = 'aldi', days = 3, meals = 3, protein = 30, fussy = false, veg = false, gentle = false, prices = null, prefer = [] } = {}) {
  days = Math.max(1, Math.min(7, +days || 3)); protein = Math.max(15, Math.min(60, +protein || 30));
  const slots = MEAL_SLOTS[Math.max(2, Math.min(4, +meals || 3))];
  const onOffer = k => !!packPrice(k, store, prices)?.offer, liked = k => prefer.includes(k);
  const plan = [];
  for (const slot of slots) {
    const target = slot === 'snack' ? Math.min(20, protein) : protein;
    let pool = GLP1_RECIPES.filter(r => r.meal === slot && (!fussy || r.fussy) && (!veg || r.veg) && (!gentle || r.gentle));
    if (!pool.length) pool = GLP1_RECIPES.filter(r => r.meal === slot);
    pool = pool.map(r => ({ r, score: r.ing.filter(([k]) => onOffer(k)).length * 3 + (onOffer(r.core) ? 5 : 0) + (r.ing.some(([k]) => liked(k)) ? 20 : 0) + STAPLE[r.core].protein / 10 })).sort((a, b) => b.score - a.score).map(x => x.r);
    // Fridge-safe batches: one recipe covers up to its fridge days; then the next recipe (or the freezer note).
    const batches = []; let left = days, i = 0;
    while (left > 0) { const r = pool[i % pool.length]; const n = Math.min(left, r.fridgeDays); batches.push({ recipe: r, portions: n }); left -= n; i++; }
    for (const b of batches) {
      const fit = fitPortion(b.recipe, target); let cost = 0; const lines = [];
      for (const [k, g] of Object.entries(fit.grams)) { const pp = packPrice(k, store, prices); const c = pp.per * g; cost += c; lines.push({ key: k, name: STAPLE[k].name, g, store: pp.store, offer: pp.offer }); }
      plan.push({ slot, target, recipe: b.recipe, portions: b.portions, grams: fit.grams, protein: fit.protein, kcal: fit.kcal, costPerPortion: r2(cost), lines, onOffer: lines.some(l => l.offer) });
    }
  }
  // Shopping list: total grams per staple -> whole packs, grouped by store.
  const need = {}; for (const p of plan) for (const [k, g] of Object.entries(p.grams)) need[k] = (need[k] || 0) + g * p.portions;
  const shop = {}; let total = 0;
  for (const [k, g] of Object.entries(need)) { const pp = packPrice(k, store, prices), packs = Math.max(1, Math.ceil(g / pp.packG - 0.05)), cost = r2(packs * pp.packPrice); total += cost;
    (shop[pp.store] ||= []).push({ key: k, name: pp.name, packs, need: Math.round(g), unit: STAPLE[k].unit, price: pp.packPrice, was: pp.was || null, cost, offer: pp.offer, url: pp.url || null }); }
  return { store, days, meals: slots.length, protein, plan, shop, total: r2(total), tips: GLP1_TIPS };
}
