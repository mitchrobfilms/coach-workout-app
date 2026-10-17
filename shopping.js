import { PREP_RECIPES } from './prep.js';
// Recipes with ingredient shopping lists (metric + imperial + pack hints) and store "weekly basics".
// Generic items and store-level wording only: no product names or prices. Availability varies, so check labels.
export const AISLES = ['Proteins', 'Carbs', 'Veg & frozen', 'Fruit', 'Dairy & eggs', 'Tins & cupboard', 'Snacks'];
const toImperial = q => {
  if (q.g != null) return q.g >= 454 ? `${(q.g / 453.6).toFixed(1).replace(/\.0$/, '')} lb` : `${Math.max(1, Math.round(q.g / 28.35))} oz`;
  if (q.ml != null) return q.ml >= 568 ? `${(q.ml / 568).toFixed(1).replace(/\.0$/, '')} pints` : `${Math.round(q.ml / 29.57)} fl oz`;
  return null;
};
export function fmtQty(q) {
  if (q.g != null) return { metric: q.g >= 1000 ? `${q.g / 1000} kg` : `${q.g} g`, imperial: toImperial(q) };
  if (q.ml != null) return { metric: q.ml >= 1000 ? `${q.ml / 1000} litres` : `${q.ml} ml`, imperial: toImperial(q) };
  return { metric: q.n, imperial: null };
}
// i(item, qty, aisle, pack hint)
const i = (item, q, aisle, pack) => ({ item, q, aisle, pack });
export const RECIPES = [
  { id: 'yog-berries', name: 'Greek yoghurt with berries and oats', meal: 'Breakfast', veg: true, serves: 1, protein: '~25g', kcal: '~350', mins: 2,
    ing: [i('Greek-style yoghurt (0–2% fat)', { g: 250 }, 'Dairy & eggs', '500g or 1kg tub'), i('Frozen mixed berries', { g: 80 }, 'Veg & frozen', '500g–1kg frozen bag'), i('Porridge oats', { g: 30 }, 'Carbs', '1kg bag')],
    steps: ['Spoon yoghurt into a bowl.', 'Top with berries (thawed or straight from frozen) and oats.'] },
  { id: 'eggs-toast', name: 'Eggs on wholegrain toast with tomatoes', meal: 'Breakfast', veg: true, serves: 1, protein: '~25g', kcal: '~400', mins: 10,
    ing: [i('Eggs', { n: '3' }, 'Dairy & eggs', '12–15 egg box'), i('Wholegrain or wholemeal bread', { n: '2 slices' }, 'Carbs', '800g loaf'), i('Cherry tomatoes', { g: 100 }, 'Veg & frozen', '250g punnet'), i('Spinach (optional)', { g: 40 }, 'Veg & frozen', '200g bag or frozen portions')],
    steps: ['Scramble or poach the eggs.', 'Toast the bread, top with eggs, tomatoes and spinach.'] },
  { id: 'chicken-rice-veg', name: 'Chicken, rice and veg', meal: 'Lunch or dinner', veg: false, serves: 2, protein: '~40g per portion', kcal: '~500 per portion', mins: 20,
    ing: [i('Chicken breast fillets', { g: 300 }, 'Proteins', '600g–1kg pack (freeze the rest)'), i('Brown rice (dry, or microwave pouches)', { g: 250 }, 'Carbs', '1kg dry bag or 2 × 250g pouches'), i('Frozen mixed veg or broccoli', { g: 300 }, 'Veg & frozen', '1kg frozen bag'), i('Soy sauce or low-salt stock cube', { n: '1 tbsp / 1 cube' }, 'Tins & cupboard', 'bottle / box of cubes')],
    steps: ['Slice and pan-fry the chicken in a little oil, 8–10 min until cooked through.', 'Heat rice and veg, add soy sauce, serve.'] },
  { id: 'lentil-chilli', name: 'Lentil and bean chilli (veggie)', meal: 'Dinner (batch cook)', veg: true, serves: 4, protein: '~25g per portion', kcal: '~450 per portion', mins: 30,
    ing: [i('Red lentils (dry)', { g: 200 }, 'Tins & cupboard', '500g–1kg bag'), i('Tinned kidney beans', { g: 400 }, 'Tins & cupboard', '400g tin'), i('Tinned chopped tomatoes', { g: 800 }, 'Tins & cupboard', '2 × 400g tins'), i('Onion', { n: '1' }, 'Veg & frozen', '1kg net or frozen chopped onion'), i('Frozen peppers', { g: 200 }, 'Veg & frozen', '500g frozen bag'), i('Chilli powder and cumin', { n: '2 tsp each' }, 'Tins & cupboard', 'small jars'), i('Brown rice (dry)', { g: 300 }, 'Carbs', '1kg bag'), i('Greek-style yoghurt (to top)', { g: 120 }, 'Dairy & eggs', '500g tub')],
    steps: ['Soften the onion and peppers, add spices.', 'Add lentils, beans, tomatoes and 300ml water; simmer 20 min.', 'Serve with rice and a spoon of yoghurt. Freeze spare portions.'] },
  { id: 'tuna-wrap', name: 'Tuna salad wrap', meal: 'Lunch', veg: false, serves: 1, protein: '~30g', kcal: '~400', mins: 5,
    ing: [i('Tinned tuna in spring water', { g: 145 }, 'Tins & cupboard', '4-tin multipack'), i('Wholemeal tortilla wraps', { n: '1' }, 'Carbs', 'pack of 8'), i('Light mayo or Greek-style yoghurt', { n: '1 tbsp' }, 'Dairy & eggs', 'jar / tub'), i('Lettuce, cucumber, sweetcorn', { g: 80 }, 'Veg & frozen', 'bagged salad + tin of sweetcorn')],
    steps: ['Mix tuna with mayo or yoghurt.', 'Fill the wrap with salad and tuna, roll up.'] },
  { id: 'hummus-wrap', name: 'Hummus and falafel wrap (veggie)', meal: 'Lunch', veg: true, serves: 1, protein: '~20g', kcal: '~480', mins: 5,
    ing: [i('Falafel', { n: '4' }, 'Proteins', 'chilled pack'), i('Reduced-fat hummus', { g: 50 }, 'Dairy & eggs', '200g pot'), i('Wholemeal tortilla wraps', { n: '1' }, 'Carbs', 'pack of 8'), i('Bagged salad', { g: 50 }, 'Veg & frozen', 'bag')],
    steps: ['Warm the falafel.', 'Spread hummus on the wrap, add salad and falafel.'] },
  { id: 'dal-spinach', name: 'Dal with spinach and chapati (veggie)', meal: 'Dinner', veg: true, serves: 3, protein: '~20g per portion', kcal: '~450 per portion', mins: 30,
    ing: [i('Red lentils (dry)', { g: 250 }, 'Tins & cupboard', '1kg bag'), i('Frozen spinach', { g: 200 }, 'Veg & frozen', '1kg frozen bag'), i('Onion and garlic', { n: '1 onion, 2 cloves' }, 'Veg & frozen', 'net / bulb'), i('Curry powder or garam masala', { n: '2 tsp' }, 'Tins & cupboard', 'jar'), i('Wholemeal chapatis or wraps', { n: '3' }, 'Carbs', 'pack')],
    steps: ['Fry onion, garlic and spices for 3 min.', 'Add lentils and 750ml water, simmer 20 min, stir in spinach.', 'Serve with chapatis.'] },
  { id: 'jacket-beans', name: 'Jacket potato with beans and cheese', meal: 'Lunch or dinner', veg: true, serves: 1, protein: '~25g', kcal: '~550', mins: 12,
    ing: [i('Baking potato', { n: '1 large' }, 'Carbs', '4-pack or loose'), i('Reduced-sugar baked beans', { g: 200 }, 'Tins & cupboard', '400g tin or multipack'), i('Reduced-fat cheddar', { g: 30 }, 'Dairy & eggs', '350–400g block'), i('Side salad or peas', { g: 80 }, 'Veg & frozen', 'bagged salad / 1kg frozen peas')],
    steps: ['Microwave the potato 8–10 min (or oven 1 hr).', 'Top with hot beans and grated cheese; add salad.'] },
  { id: 'omelette', name: 'Veg omelette with side salad', meal: 'Any meal', veg: true, serves: 1, protein: '~25g', kcal: '~380', mins: 10,
    ing: [i('Eggs', { n: '3' }, 'Dairy & eggs', '12–15 egg box'), i('Peppers, mushrooms, onion', { g: 120 }, 'Veg & frozen', 'loose or frozen mixed'), i('Reduced-fat cheddar (optional)', { g: 20 }, 'Dairy & eggs', 'block'), i('Bagged salad', { g: 50 }, 'Veg & frozen', 'bag')],
    steps: ['Soften the veg in a pan.', 'Pour in beaten eggs, cook until set, add cheese, fold.'] },
  { id: 'turkey-pasta', name: 'Simple pasta with lean mince', meal: 'Dinner (fussy-friendly)', veg: false, serves: 3, protein: '~35g per portion', kcal: '~550 per portion', mins: 25,
    ing: [i('Lean beef or turkey mince (5% fat)', { g: 500 }, 'Proteins', '500g pack'), i('Wholewheat pasta (dry)', { g: 240 }, 'Carbs', '500g bag'), i('Passata or tinned tomatoes', { g: 500 }, 'Tins & cupboard', '500g carton / tins'), i('Grated carrot (sneaky veg)', { n: '1 carrot' }, 'Veg & frozen', '1kg bag')],
    steps: ['Brown the mince, drain any fat.', 'Add passata and grated carrot, simmer 15 min.', 'Cook pasta and mix together.'] },
  { id: 'oats-pb', name: 'Overnight oats with milk, chia and banana', meal: 'Breakfast', veg: true, serves: 1, protein: '~20g', kcal: '~420', mins: 3,
    ing: [i('Porridge oats', { g: 50 }, 'Carbs', '1kg bag'), i('Semi-skimmed or soya milk', { ml: 200 }, 'Dairy & eggs', '2-pint / 1-litre bottle'), i('Chia seeds (optional)', { n: '1 tsp' }, 'Tins & cupboard', 'small bag'), i('Banana', { n: '1' }, 'Fruit', 'bunch'), i('Peanut butter', { n: '1 tsp' }, 'Tins & cupboard', 'jar')],
    steps: ['Mix oats, milk and chia in a jar the night before.', 'Top with banana and peanut butter in the morning.'] },
  { id: 'salmon-stirfry', name: 'Salmon or tofu stir-fry with noodles', meal: 'Dinner', veg: false, serves: 2, protein: '~30g per portion', kcal: '~500 per portion', mins: 15,
    ing: [i('Salmon fillets (or firm tofu for veggie)', { g: 240 }, 'Proteins', '2-fillet pack / 280–400g tofu block'), i('Straight-to-wok or dried egg noodles', { g: 300 }, 'Carbs', '2 × 150g packs'), i('Stir-fry veg mix', { g: 300 }, 'Veg & frozen', '300g bag or frozen'), i('Soy sauce', { n: '2 tbsp' }, 'Tins & cupboard', 'bottle')],
    steps: ['Pan-fry the salmon or tofu.', 'Stir-fry veg 3–4 min, add noodles and soy sauce, top with the salmon.'] },
];
const BASE_BASICS = {
  Proteins: [['Chicken breast fillets or thighs', '1kg pack (freeze in portions)'], ['Lean mince (beef or turkey, 5% fat)', '500g pack'], ['Eggs', '12–15 pack'], ['Tinned tuna or salmon', '4-tin multipack'], ['Tofu, falafel or plant mince (veggie)', 'chilled pack'], ['Frozen white fish fillets', 'frozen bag']],
  Carbs: [['Porridge oats', '1kg bag'], ['Brown rice or microwave rice pouches', '1kg bag / 250g pouches'], ['Wholewheat pasta', '500g bag'], ['Wholemeal bread or wraps', '800g loaf / pack of 8'], ['Potatoes or sweet potatoes', '2–2.5kg bag']],
  'Veg & frozen': [['Frozen mixed veg', '1kg bag'], ['Frozen peas', '1kg bag'], ['Frozen spinach', '1kg bag'], ['Frozen berries', '500g–1kg bag'], ['Onions', '1kg net'], ['Carrots', '1kg bag'], ['Bagged salad', 'bag'], ['Tomatoes or cherry tomatoes', 'punnet']],
  'Dairy & eggs': [['Greek-style or high-protein yoghurt', '500g–1kg tub'], ['Semi-skimmed milk (or soya)', '2-pint / 4-pint bottle'], ['Reduced-fat cheddar', '350–400g block'], ['Cottage cheese', '300g tub']],
  'Tins & cupboard': [['Tinned chopped tomatoes / passata', '400g tins / 500g carton'], ['Tinned beans and chickpeas', '400g tins'], ['Red lentils', '500g–1kg bag'], ['Reduced-sugar baked beans', 'multipack'], ['Low-salt stock cubes', 'box'], ['Spices: chilli, cumin, curry powder', 'small jars'], ['Peanut butter', 'jar']],
  Snacks: [['Fruit: bananas, apples, satsumas', 'bag or loose'], ['Rice cakes', 'pack'], ['Unsalted nuts', '200g bag (small handful a day)'], ['Light popcorn', 'multipack of small bags'], ['Dark chocolate (a couple of squares)', 'bar']],
};
export const STORES = {
  lidl: { name: 'Lidl', note: 'Own-label staples, frozen veg and fresh bakery are usually good value. Weekly specials vary.' },
  aldi: { name: 'Aldi', note: 'Own-label staples, multipack tins and frozen veg. Fresh ranges vary by store.' },
  asda: { name: 'Asda', note: 'Own-label and value ranges, large frozen bags and big multipacks.' },
  any: { name: 'Any supermarket', note: 'The same basics are in most supermarkets\' own-label ranges.' },
};
export function storeBasics(store) { return BASE_BASICS; } // same generic staples per store; store notes differ
export const shopKey = s => String(s).toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Merge selected recipes into one list grouped by aisle. */
export function buildList(recipeIds, extra = []) {
  const map = new Map();
  for (const r of [...RECIPES, ...PREP_RECIPES].filter(r => recipeIds.includes(r.id))) for (const g of r.ing) {
    const k = shopKey(g.item), q = fmtQty(g.q), e = map.get(k) || { key: k, item: g.item, aisle: g.aisle, pack: g.pack, uses: [] };
    e.uses.push(`${q.metric}${q.imperial ? ` (${q.imperial})` : ''} for ${r.name}`); map.set(k, e);
  }
  for (const x of extra) { const k = shopKey(x.item); if (!map.has(k)) map.set(k, { key: k, item: x.item, aisle: x.aisle, pack: x.pack, uses: [] }); }
  const out = {}; for (const a of AISLES) out[a] = []; for (const e of map.values()) (out[e.aisle] ||= []).push(e);
  return out;
}
