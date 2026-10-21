// Food Photo Diary: shared logic (browser app + Supabase Edge Function "food-photo").
// Everything here is an ESTIMATE. Supportive wording only; never "bad"; no medical or dose advice.
export const DAILY_LIMIT = 20;
export const SCORES = ['Protein star', 'Nice balance', 'Fibre boost', 'Light bite', 'Could add protein', 'Could add veg', 'Enjoy it'];
export const SCORE_NOTE = {
  'Protein star': 'Great protein. That helps you feel full and protects muscle.',
  'Nice balance': 'A nice mix of protein, veg and carbs.',
  'Fibre boost': 'Lovely fibre. Good for digestion and keeping you full.',
  'Light bite': 'A lighter plate. Fine when your appetite is small.',
  'Could add protein': 'Could add some protein next time, like eggs, yoghurt, chicken, fish or beans.',
  'Could add veg': 'Could add some veg or salad for extra fibre.',
  'Enjoy it': 'All foods can fit. Enjoy it slowly and stop when you feel satisfied.'
};
export const SAFE_TIPS = [
  'Start with the protein on your plate first.',
  'Eat slowly and stop when you feel comfortably satisfied.',
  'A smaller plate can make smaller portions feel just right.',
  'Add some veg, salad or beans for extra fibre.',
  'Sip water through the day; small sips between meals work well.',
  'Pairing carbs with protein helps keep you fuller for longer.'
];
// words we never show (judgemental, or medical/dose territory)
const BANNED = /\b(bad|junk|unhealthy|naughty|cheat|guilt\w*|sinful|toxic|poison\w*|dose|doses|dosing|dosage|mg|milligram\w*|inject\w*|medication|medicine|ozempic|wegovy|mounjaro|semaglutide|tirzepatide|retatrutide|insulin|diabet\w*|prescri\w*|diagnos\w*|cure|treat(?:ment)?s?)\b|\d\s*mg\b/i;
export const STATES = ['cooked', 'raw', 'dry', 'prepared', 'drink'];
const num = (v, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };
const r1 = n => Math.round(n * 10) / 10;
const txt = (v, max) => String(v ?? '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const isSafeText = t => !BANNED.test(String(t || ''));

export const SCHEMA = {
  type: 'object',
  properties: {
    is_food: { type: 'boolean', description: 'true only if the photo clearly shows food or drink to be eaten' },
    message: { type: 'string', description: 'If not food: one friendly sentence. Otherwise a one-line description of the meal.' },
    portion: { type: 'string', enum: ['small', 'medium', 'large'] },
    items: { type: 'array', maxItems: 12, items: { type: 'object', properties: {
      name: { type: 'string' }, state: { type: 'string', enum: STATES },
      grams: { type: 'number', description: 'edible weight as served on the plate (cooked weight for cooked foods); ml for drinks' },
      kcal: { type: 'number' }, protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' }, fibre_g: { type: 'number' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] } },
      required: ['name', 'state', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'confidence'] } },
    score: { type: 'string', enum: SCORES },
    tips: { type: 'array', maxItems: 2, items: { type: 'string' } }
  },
  required: ['is_food', 'message', 'portion', 'items', 'score', 'tips']
};

export const PROMPT = `You are a friendly UK nutrition-estimate helper inside GLP1 Life, an app for people losing weight (many on GLP-1 medicines with small appetites).
Look at the photo and return JSON only, matching the schema.
1. is_food: false if the photo is not a meal, snack or drink (e.g. a person, pet, screen, document, empty plate). Then items=[], score="Light bite", tips=[], and message is one kind sentence asking for a photo of their meal.
2. List each separate food/drink you can see (max 12), using plain UK names (e.g. "chips", "courgette", "semi-skimmed milk").
3. state: "cooked" for anything cooked (boiled rice/pasta/potatoes, grilled meat), "raw" for raw fruit/veg/salad, "dry" ONLY for uncooked dry goods visibly dry (e.g. dry oats in a bag), "prepared" for packaged/mixed dishes (sandwich, pizza, curry), "drink" for drinks.
4. grams: estimate the EDIBLE weight as served on the plate, using the plate, cutlery and hands for scale. Cooked rice/pasta weigh about 2.5x their dry weight: always use COOKED values for cooked foods (e.g. cooked white rice ~130 kcal/100 g, not dry ~350). For drinks give ml.
5. kcal, protein_g, carbs_g, fat_g, fibre_g: per item for that weight, using typical UK values (McCance & Widdowson style). Include visible oils, butter and sauces as their own items if clearly present.
6. confidence: how sure you are about identity and weight.
7. portion: overall plate size small/medium/large.
8. score: one supportive label: "Protein star" (25 g+ protein), "Nice balance" (protein + veg + some carbs), "Fibre boost" (8 g+ fibre), "Light bite" (small plate, under ~250 kcal), "Could add protein" (under ~15 g protein), "Could add veg" (no veg/fruit), "Enjoy it" (treats, desserts, takeaways).
9. tips: 1-2 short, kind, practical tips (max 18 words each) from these themes: protein first, smaller portions/eat slowly, add fibre/veg, hydration. Never call food good/bad/unhealthy/junk, never mention medicines, doses, injections, conditions or diagnoses, never suggest skipping meals or very low calories.
These are estimates; do your best and never refuse because of uncertainty.`;

export function totals(items) {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 };
  for (const i of items || []) for (const k of Object.keys(t)) t[k] += Number(i[k]) || 0;
  return { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g), fibre_g: r1(t.fibre_g) };
}
// rule-based label from totals (used after the user edits, and as a fallback)
export function scoreFor(t, items = []) {
  const hasVeg = items.some(i => i.state === 'raw' || /veg|salad|broccoli|carrot|pea|bean|spinach|courgette|pepper|tomato|cucumber|lettuce|cabbage|sprout|lentil|fruit|apple|banana|berr|orange|mushroom|onion|leek|kale|sweetcorn/i.test(i.name));
  if (t.protein_g >= 25) return 'Protein star';
  if (t.kcal && t.kcal < 250) return 'Light bite';
  if (t.fibre_g >= 8) return 'Fibre boost';
  if (t.protein_g < 15) return 'Could add protein';
  if (!hasVeg) return 'Could add veg';
  return 'Nice balance';
}
export function cleanItem(i) {
  return { name: txt(i?.name, 60) || 'Food', state: STATES.includes(i?.state) ? i.state : 'prepared', grams: Math.round(num(i?.grams, 3000)),
    kcal: Math.round(num(i?.kcal, 5000)), protein_g: r1(num(i?.protein_g, 400)), carbs_g: r1(num(i?.carbs_g, 600)), fat_g: r1(num(i?.fat_g, 400)), fibre_g: r1(num(i?.fibre_g, 150)),
    confidence: ['low', 'medium', 'high'].includes(i?.confidence) ? i.confidence : 'medium' };
}
// validate + make safe whatever the model returned
export function sanitizeAnalysis(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  if (!o.is_food) return { is_food: false, message: isSafeText(o.message) && txt(o.message, 200) ? txt(o.message, 200) : "We couldn't spot any food in that photo. Try a photo of your plate from above.", items: [], tips: [] };
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 12).map(cleanItem).filter(i => i.grams > 0 || i.kcal > 0);
  if (!items.length) return { is_food: false, message: "We couldn't make out the food clearly. Try again in good light, from above.", items: [], tips: [] };
  const t = totals(items);
  const score = SCORES.includes(o.score) ? o.score : scoreFor(t, items);
  let tips = (Array.isArray(o.tips) ? o.tips : []).map(x => txt(x, 140)).filter(x => x && isSafeText(x)).slice(0, 2);
  if (!tips.length) tips = [t.protein_g < 20 ? SAFE_TIPS[0] : t.fibre_g < 6 ? SAFE_TIPS[3] : SAFE_TIPS[1]];
  const message = isSafeText(o.message) ? txt(o.message, 160) : '';
  return { is_food: true, message, portion: ['small', 'medium', 'large'].includes(o.portion) ? o.portion : 'medium', items, totals: t, score, score_note: SCORE_NOTE[score], tips, estimate: true };
}
// change an item's grams and scale its nutrients in proportion
export function scaleItem(i, grams) {
  const g = Math.max(0, Math.round(Number(grams) || 0)), f = i.grams > 0 ? g / i.grams : 0;
  return { ...i, grams: g, kcal: Math.round(i.kcal * f), protein_g: r1(i.protein_g * f), carbs_g: r1(i.carbs_g * f), fat_g: r1(i.fat_g * f), fibre_g: r1(i.fibre_g * f) };
}
export const scaleAll = (items, factor) => items.map(i => scaleItem(i, i.grams * factor));
// totals per day from diary rows
export function dayTotals(rows) {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0, n: 0 };
  for (const r of rows || []) { t.n++; for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g']) t[k] += Number(r[k]) || 0; }
  return { ...t, kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g), fibre_g: r1(t.fibre_g) };
}
// UK clock meal guess
export function mealFor(h) { return h >= 5 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 17 && h < 22 ? 'dinner' : 'snack'; }
