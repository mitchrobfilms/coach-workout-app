// Meal prep: batch-cook recipes for 3–4 days, by meal. Generic ingredients, no prices or product names.
// Food safety basics (UK FSA/NHS-style guidance): cool leftovers quickly (within 1–2 hours), keep the fridge at 5°C or
// below, eat within the stated time, reheat hot dishes only once until steaming hot all the way through (cold dishes are eaten cold).
const i = (item, q, aisle, pack) => ({ item, q, aisle, pack });
export const SAFETY = [
  'Cool cooked food quickly (within 1–2 hours), then cover and refrigerate at 5°C or below.',
  'Cooked rice: cool within 1 hour, keep in the fridge for 1 day only, or freeze portions straight away. Reheat once until steaming hot.',
  'Cooked chicken and mince dishes: fridge up to 3 days, or freeze.',
  'Hot dishes: reheat only once, until steaming hot all the way through. Cold dishes (oats, yoghurt pots, salads, snack pots): eat cold. Defrost frozen portions in the fridge overnight.',
  'Label boxes with the date. If in doubt, throw it out.',
];
import { GLP1_RECIPES } from './recipes-glp1.js';
export const PREP_RECIPES = [
  /* ---------------- Breakfast ---------------- */
  { id: 'p-oats', meal: 'breakfast', name: 'Overnight oats jars', makes: 4, kcal: 380, protein: 22, mins: 10, veg: true, fussy: true,
    ing: [i('Porridge oats', { g: 200 }, 'Carbs', '1kg bag'), i('Semi-skimmed or soya milk', { ml: 600 }, 'Dairy & eggs', '2-pint / 1-litre bottle'), i('Greek-style yoghurt (0–2% fat)', { g: 400 }, 'Dairy & eggs', '500g–1kg tub'), i('Chia seeds (optional)', { n: '4 tsp' }, 'Tins & cupboard', 'small bag'), i('Frozen mixed berries', { g: 300 }, 'Veg & frozen', '500g–1kg frozen bag')],
    steps: ['Split oats, milk, yoghurt and chia between 4 jars or boxes; stir.', 'Top with berries (straight from frozen is fine).', 'Lid on, fridge overnight. Grab one each morning.'],
    store: { fridge: 'Up to 3 days', freezer: 'Not recommended', reheat: 'Eat cold. Keep in the fridge and eat within 2–3 days.' },
    glp1: 'Easy to eat when appetite is low. Half a jar still gives about 11g protein.' },
  { id: 'p-eggbake', meal: 'breakfast', name: 'Egg and veg breakfast traybake', makes: 4, kcal: 300, protein: 24, mins: 35, veg: true, fussy: false,
    ing: [i('Eggs', { n: '10' }, 'Dairy & eggs', '12–15 egg box'), i('Frozen peppers or 2 fresh peppers', { g: 200 }, 'Veg & frozen', '500g frozen bag'), i('Spinach (fresh or frozen)', { g: 100 }, 'Veg & frozen', '200g bag / 1kg frozen'), i('Reduced-fat cheddar', { g: 80 }, 'Dairy & eggs', '350–400g block'), i('Semi-skimmed milk', { ml: 100 }, 'Dairy & eggs', 'bottle')],
    steps: ['Heat the oven to 180°C (fan 160°C). Lightly oil any oven dish.', 'Whisk eggs and milk; stir in veg and most of the cheese.', 'Pour into the dish, top with the rest of the cheese, bake 25–30 min until set.', 'Cool, cut into 4, box up.'],
    store: { fridge: 'Up to 3 days', freezer: 'Up to 2 months (wrap slices)', reheat: 'Microwave 60–90 sec until steaming hot' },
    glp1: 'Eggs are gentle and protein-dense. Small slices work well if you feel full quickly.' },
  { id: 'p-yogpots', meal: 'breakfast', name: 'Greek yoghurt protein pots', makes: 4, kcal: 330, protein: 25, mins: 10, veg: true, fussy: true,
    ing: [i('Greek-style yoghurt (0–2% fat)', { g: 1000 }, 'Dairy & eggs', '1kg tub'), i('Frozen mixed berries', { g: 400 }, 'Veg & frozen', '500g–1kg frozen bag'), i('Porridge oats or low-sugar granola', { g: 160 }, 'Carbs', '1kg bag / box'), i('Mixed seeds (optional)', { n: '4 tbsp' }, 'Tins & cupboard', 'bag')],
    steps: ['Spoon 250g yoghurt into each of 4 pots and add berries.', 'Keep the oats or granola in a separate bag so it stays crunchy; add each morning.'],
    store: { fridge: 'Up to 3 days (within the yoghurt\'s use-by)', freezer: 'Not recommended', reheat: 'Eat cold. Keep in the fridge and eat within 2–3 days.' },
    glp1: 'Cold, smooth and high in protein. A good option on low-appetite days.' },
  { id: 'p-burrito', meal: 'breakfast', name: 'Freezer breakfast burritos', makes: 4, kcal: 420, protein: 26, mins: 25, veg: true, fussy: false,
    ing: [i('Eggs', { n: '8' }, 'Dairy & eggs', '12–15 egg box'), i('Tinned black beans or kidney beans', { g: 400 }, 'Tins & cupboard', '400g tin'), i('Wholemeal tortilla wraps', { n: '4' }, 'Carbs', 'pack of 8'), i('Reduced-fat cheddar', { g: 80 }, 'Dairy & eggs', 'block'), i('Salsa or chopped tomatoes', { g: 150 }, 'Tins & cupboard', 'jar / tin')],
    steps: ['Scramble the eggs; warm the drained beans.', 'Fill each wrap with eggs, beans, cheese and salsa; roll tightly.', 'Cool, wrap each in foil or a freezer bag.'],
    store: { fridge: 'Up to 2 days', freezer: 'Up to 1 month', reheat: 'Defrost overnight in the fridge, then microwave (out of foil) until steaming hot' },
    glp1: 'Eat half now and half later if a whole one is too much.' },
  /* ---------------- Lunch ---------------- */
  { id: 'p-chickenrice', meal: 'lunch', name: 'Chicken, rice and veg boxes', makes: 4, kcal: 500, protein: 42, mins: 30, veg: false, fussy: true,
    ing: [i('Chicken breast fillets', { g: 600 }, 'Proteins', '600g–1kg pack'), i('Brown rice (dry, or microwave pouches)', { g: 280 }, 'Carbs', '1kg dry bag or 4 × 250g pouches'), i('Frozen mixed veg or broccoli', { g: 600 }, 'Veg & frozen', '1kg frozen bag'), i('Soy sauce or low-salt stock cube', { n: '2 tbsp / 1 cube' }, 'Tins & cupboard', 'bottle / box')],
    steps: ['Season and bake or pan-fry the chicken until cooked through (no pink, juices clear). Slice.', 'Cook the rice, then spread it out to cool within 1 hour.', 'Box chicken and veg. Rice: day-1 portion in the fridge, freeze the other portions straight away (or use a microwave pouch fresh each day).'],
    store: { fridge: 'Chicken and veg up to 3 days; cooked rice 1 day only', freezer: 'Rice and chicken portions up to 1 month', reheat: 'Once, until steaming hot. Defrost in the fridge overnight.' },
    glp1: 'Eat the chicken first. Smaller boxes (or half portions) are fine; protein matters most.' },
  { id: 'p-lentilsoup', meal: 'lunch', name: 'Red lentil and veg soup (veggie)', makes: 4, kcal: 330, protein: 20, mins: 35, veg: true, fussy: false,
    ing: [i('Red lentils (dry)', { g: 250 }, 'Tins & cupboard', '500g–1kg bag'), i('Carrots', { n: '3' }, 'Veg & frozen', '1kg bag'), i('Onion', { n: '1' }, 'Veg & frozen', '1kg net or frozen chopped onion'), i('Tinned chopped tomatoes', { g: 400 }, 'Tins & cupboard', '400g tin'), i('Low-salt vegetable stock cubes', { n: '2' }, 'Tins & cupboard', 'box'), i('Frozen spinach', { g: 150 }, 'Veg & frozen', '1kg frozen bag'), i('Greek-style yoghurt (to serve)', { g: 200 }, 'Dairy & eggs', '500g tub')],
    steps: ['Soften chopped onion and carrot for 5 min.', 'Add lentils, tomatoes, stock cubes and 1.2 litres of water; simmer 20–25 min.', 'Stir in spinach, blend if you like it smooth. Cool and box. Top with yoghurt to serve.'],
    store: { fridge: 'Up to 3 days', freezer: 'Up to 3 months', reheat: 'Once, until piping hot' },
    glp1: 'Soup is easy to sip in small amounts. The yoghurt adds protein.' },
  { id: 'p-greeksalad', meal: 'lunch', name: 'Greek chicken and chickpea salad boxes', makes: 4, kcal: 450, protein: 40, mins: 25, veg: false, fussy: false,
    ing: [i('Chicken breast fillets', { g: 500 }, 'Proteins', '600g–1kg pack'), i('Tinned chickpeas', { g: 400 }, 'Tins & cupboard', '400g tin'), i('Cucumber', { n: '1' }, 'Veg & frozen', 'loose'), i('Cherry tomatoes', { g: 250 }, 'Veg & frozen', '250g punnet'), i('Reduced-fat feta-style cheese', { g: 100 }, 'Dairy & eggs', '200g pack'), i('Lemon and olive oil (dressing)', { n: '1 lemon, 2 tbsp oil' }, 'Tins & cupboard', 'bottle')],
    steps: ['Cook the chicken until cooked through; cool and slice.', 'Box chickpeas, chopped cucumber, tomatoes, feta and chicken.', 'Keep the dressing in a small pot; add just before eating.'],
    store: { fridge: 'Up to 3 days', freezer: 'Not recommended (salad)', reheat: 'Eat cold. Keep in the fridge and eat within 2–3 days.' },
    glp1: 'Cold, fresh and high in protein. Start with the chicken and chickpeas.' },
  { id: 'p-tofunoodles', meal: 'lunch', name: 'Tofu, edamame and noodle boxes (veggie)', makes: 4, kcal: 480, protein: 28, mins: 25, veg: true, fussy: false,
    ing: [i('Firm tofu', { g: 560 }, 'Proteins', '2 × 280g blocks'), i('Frozen edamame beans', { g: 300 }, 'Veg & frozen', '500g frozen bag'), i('Egg or wholewheat noodles (dry)', { g: 250 }, 'Carbs', '250–300g pack'), i('Stir-fry veg mix', { g: 600 }, 'Veg & frozen', '2 × 300g bags or frozen'), i('Soy sauce and sweet chilli sauce', { n: '4 tbsp total' }, 'Tins & cupboard', 'bottles')],
    steps: ['Press and cube the tofu; pan-fry until golden.', 'Cook noodles and edamame; stir-fry the veg 3–4 min.', 'Toss everything with the sauces, cool quickly and box.'],
    store: { fridge: 'Up to 3 days', freezer: 'Up to 1 month (texture softens)', reheat: 'Once, until steaming hot, or eat cold' },
    glp1: 'Tofu and edamame give plant protein. Small portions are fine.' },
  /* ---------------- Dinner ---------------- */
  { id: 'p-chilli', meal: 'dinner', name: 'Lentil and bean chilli (veggie)', makes: 4, kcal: 450, protein: 25, mins: 40, veg: true, fussy: false,
    ing: [i('Red lentils (dry)', { g: 200 }, 'Tins & cupboard', '500g–1kg bag'), i('Tinned kidney beans', { g: 800 }, 'Tins & cupboard', '2 × 400g tins'), i('Tinned chopped tomatoes', { g: 800 }, 'Tins & cupboard', '2 × 400g tins'), i('Onion', { n: '1' }, 'Veg & frozen', '1kg net'), i('Frozen peppers', { g: 300 }, 'Veg & frozen', '500g frozen bag'), i('Chilli powder and cumin', { n: '2 tsp each' }, 'Tins & cupboard', 'small jars'), i('Greek-style yoghurt (to top)', { g: 200 }, 'Dairy & eggs', '500g tub')],
    steps: ['Soften onion and peppers, add spices for 1 min.', 'Add lentils, beans, tomatoes and 400ml water; simmer 25 min.', 'Cool quickly and box. Serve with microwave rice or a jacket potato, and a spoon of yoghurt.'],
    store: { fridge: 'Up to 3 days', freezer: 'Up to 3 months', reheat: 'Once, until piping hot. Cook rice fresh, or use a pouch.' },
    glp1: 'High fibre can feel filling; a smaller portion with yoghurt on top is fine.' },
  { id: 'p-bolognese', meal: 'dinner', name: 'Lean mince bolognese with hidden veg', makes: 4, kcal: 550, protein: 38, mins: 35, veg: false, fussy: true,
    ing: [i('Lean beef or turkey mince (5% fat)', { g: 500 }, 'Proteins', '500g pack'), i('Passata', { g: 700 }, 'Tins & cupboard', '500g cartons × 2'), i('Carrots (grated)', { n: '2' }, 'Veg & frozen', '1kg bag'), i('Onion', { n: '1' }, 'Veg & frozen', '1kg net'), i('Wholewheat pasta (dry)', { g: 320 }, 'Carbs', '500g bag')],
    steps: ['Brown the mince with the onion; drain any fat.', 'Add grated carrot and passata; simmer 20 min (blend the sauce smooth for fussy eaters).', 'Box the sauce. Cook pasta fresh each night (10 min), or keep cooked pasta in the fridge up to 2 days.'],
    store: { fridge: 'Sauce up to 3 days', freezer: 'Sauce up to 3 months', reheat: 'Once, until piping hot' },
    glp1: 'Have more sauce and less pasta. The mince is the protein.' },
  { id: 'p-tikka', meal: 'dinner', name: 'Chicken tikka-style traybake with sweet potato', makes: 4, kcal: 480, protein: 40, mins: 45, veg: false, fussy: false,
    ing: [i('Chicken breast or skinless thigh fillets', { g: 700 }, 'Proteins', '1kg pack'), i('Sweet potatoes', { g: 800 }, 'Carbs', '1kg bag'), i('Peppers and red onion', { n: '3 peppers, 1 onion' }, 'Veg & frozen', 'pack / net'), i('Greek-style yoghurt (marinade)', { g: 150 }, 'Dairy & eggs', '500g tub'), i('Curry powder or tikka spice', { n: '2 tbsp' }, 'Tins & cupboard', 'jar')],
    steps: ['Heat the oven to 200°C (fan 180°C). Coat chicken in yoghurt and spice.', 'Spread chunks of sweet potato, peppers and onion on a tray with the chicken.', 'Roast 30–35 min until the chicken is cooked through. Cool quickly and box.'],
    store: { fridge: 'Up to 3 days', freezer: 'Up to 2 months', reheat: 'Once, until steaming hot' },
    glp1: 'Mild spice; eat the chicken first and leave some potato if you\'re full.' },
  { id: 'p-chickpeacurry', meal: 'dinner', name: 'Chickpea and spinach curry (veggie)', makes: 4, kcal: 450, protein: 20, mins: 30, veg: true, fussy: false,
    ing: [i('Tinned chickpeas', { g: 800 }, 'Tins & cupboard', '2 × 400g tins'), i('Tinned chopped tomatoes', { g: 400 }, 'Tins & cupboard', '400g tin'), i('Frozen spinach', { g: 300 }, 'Veg & frozen', '1kg frozen bag'), i('Onion and garlic', { n: '1 onion, 2 cloves' }, 'Veg & frozen', 'net / bulb'), i('Curry powder or garam masala', { n: '2 tbsp' }, 'Tins & cupboard', 'jar'), i('Greek-style yoghurt (to serve)', { g: 200 }, 'Dairy & eggs', '500g tub')],
    steps: ['Soften onion and garlic, add spices for 1 min.', 'Add chickpeas, tomatoes and 200ml water; simmer 15 min, stir in spinach.', 'Cool quickly and box. Serve with a microwave rice pouch or wholemeal chapati, plus yoghurt.'],
    store: { fridge: 'Up to 3 days', freezer: 'Up to 3 months', reheat: 'Once, until piping hot' },
    glp1: 'Add a side of yoghurt or edamame to lift the protein.' },
  /* ---------------- Snacks (optional) ---------------- */
  { id: 'p-eggs', meal: 'snack', name: 'Boiled eggs (snack pack)', makes: 6, kcal: 75, protein: 6, mins: 12, veg: true, fussy: true,
    ing: [i('Eggs', { n: '6' }, 'Dairy & eggs', '12–15 egg box')],
    steps: ['Boil 9–10 min, cool in cold water, keep in their shells.'],
    store: { fridge: 'Up to 4 days, in the shell', freezer: 'No', reheat: 'Eat cold. Keep in the fridge and eat within 2–3 days.' },
    glp1: 'A small, protein-first snack.' },
  { id: 'p-hummus', meal: 'snack', name: 'Hummus and veg stick pots', makes: 4, kcal: 150, protein: 6, mins: 10, veg: true, fussy: false,
    ing: [i('Reduced-fat hummus', { g: 200 }, 'Dairy & eggs', '200g pot'), i('Carrots and cucumber', { n: '3 carrots, 1 cucumber' }, 'Veg & frozen', 'bag / loose')],
    steps: ['Cut veg into sticks, pack with a spoon of hummus.'],
    store: { fridge: 'Up to 3 days', freezer: 'No', reheat: 'Eat cold. Keep in the fridge and eat within 2–3 days.' },
    glp1: 'Light and crunchy.' },
  { id: 'p-cottage', meal: 'snack', name: 'Cottage cheese and fruit pots', makes: 3, kcal: 160, protein: 14, mins: 5, veg: true, fussy: true,
    ing: [i('Cottage cheese', { g: 300 }, 'Dairy & eggs', '300g tub'), i('Pineapple chunks or berries', { g: 200 }, 'Fruit', 'tin in juice / frozen bag')],
    steps: ['Split cottage cheese into 3 pots, top with fruit.'],
    store: { fridge: 'Up to 2 days', freezer: 'No', reheat: 'Eat cold. Keep in the fridge and eat within 2–3 days.' },
    glp1: 'High protein in a small portion.' },
  ...GLP1_RECIPES,
];
export const MEAL_SECTIONS = [['breakfast', '🌅 Breakfast'], ['lunch', '🥗 Lunch'], ['dinner', '🍲 Dinner'], ['snack', '🍎 Snacks (optional)'], ['batch', '📦 Batch prep']];
// Store notes: helpful, store-level only. No prices, no product names.
export const PREP_STORE_NOTES = {
  lidl: ['Discount layout with a smaller, rotating range: buy staples (oats, tins, frozen veg) and check the week\'s fresh offers for chicken or mince.', 'Big bags of frozen veg and berries make prep cheap and stop waste.', 'In-store bakery often has wholemeal rolls; the weekly non-food aisle sometimes has food boxes and storage tubs.'],
  aldi: ['Discount layout like Lidl: own-label staples, multipacks of tins and large frozen bags.', 'Meat packs are usually sized for batch cooking; freeze what you won\'t use in 3 days.', 'The weekly special-buys aisle sometimes has meal prep boxes; the core range is the same week to week.'],
  asda: ['Bigger range and larger value packs: good for 1kg chicken packs, 1kg yoghurt tubs and multipack tins.', 'The world foods aisle often sells lentils, chickpeas, rice and spices in bigger bags.', 'Heavy tins and jars are easier with online delivery or click & collect where available.'],
  any: ['Look for own-label or value tins, big frozen veg bags and multipacks.', 'Check reduced-to-clear meat and freeze it the same day.', 'Compare price per kg on the shelf label rather than the pack price.'],
};
/** Pick one breakfast, lunch and dinner for the prep days, respecting dislikes (and fussy preference). */
export function buildWeek({ dislikes = [], fussy = false, veg = false, seed = Date.now(), mentionsDisliked = () => false } = {}) {
  let h = seed >>> 0; const rnd = n => { h = (h * 1103515245 + 12345) >>> 0; return h % n; };
  const pick = meal => {
    let pool = PREP_RECIPES.filter(r => r.meal === meal && (!veg || r.veg) && !mentionsDisliked(r.name + ' ' + r.ing.map(g => g.item).join(' '), dislikes));
    if (fussy && pool.some(r => r.fussy)) pool = pool.filter(r => r.fussy);
    return pool.length ? pool[rnd(pool.length)] : null;
  };
  return { breakfast: pick('breakfast'), lunch: pick('lunch'), dinner: pick('dinner') };
}
