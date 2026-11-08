// UK meal planner decisions. No retailer prices and no nutrient figures live here.
// Unknown money or weight is null. It is never treated as zero or as the cheapest price.

export const SHOPS = [
  { id: 'asda', name: 'Asda', href: 'https://www.asda.com/groceries' },
  { id: 'tesco', name: 'Tesco', href: 'https://www.tesco.com/groceries/en-GB' },
  { id: 'aldi', name: 'Aldi', href: 'https://www.aldi.co.uk/' },
  { id: 'lidl', name: 'Lidl', href: 'https://www.lidl.co.uk/' },
  { id: 'sainsburys', name: "Sainsbury's", href: 'https://www.sainsburys.co.uk/' },
  { id: 'morrisons', name: 'Morrisons', href: 'https://groceries.morrisons.com/' },
];

export const SAFETY = {
  leftovers: 'Cool leftovers and put them in the fridge within 1–2 hours. Eat them within 48 hours, or freeze extra portions the same day. Do not keep a whole week of meals in the fridge.',
  rice: 'Cool rice within 1 hour. Refrigerate it for no more than 24 hours, or freeze portions. Reheat rice only once, until it is steaming hot all the way through. Do not use the 48-hour leftover rule for rice.',
  poultry: 'Cook poultry right through. A food thermometer reading is 70°C for 2 minutes, or 75°C for 30 seconds, at the centre. Do not wash raw chicken. Keep raw meat away from food you will not cook.',
  reheat: 'Reheat leftovers only once, until steaming hot. Stir food heated in a microwave and let it stand.',
  sources: [
    'https://www.gov.uk/government/publications/student-guide-to-food-safety-and-hygiene/student-guide-to-food-safety-and-hygiene',
    'https://www.gov.uk/government/publications/cooking-your-food/cooking-your-food',
  ],
};

export const INGREDIENTS = {
  oats: { name: 'Porridge oats', aisle: 'Cereal', unit: 'g', form: 'as-sold', allergens: ['gluten'], labelCheck: [] },
  milk: { name: 'Milk', aisle: 'Dairy', unit: 'ml', form: 'as-sold', allergens: ['dairy'], labelCheck: [] },
  banana: { name: 'Banana', aisle: 'Fruit', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  egg: { name: 'Eggs', aisle: 'Eggs', unit: 'g', form: 'as-sold', allergens: ['egg'], labelCheck: [] },
  bread: { name: 'Bread', aisle: 'Bread', unit: 'g', form: 'as-sold', allergens: ['gluten'], labelCheck: ['dairy'] },
  yoghurt: { name: 'Plain yoghurt', aisle: 'Dairy', unit: 'g', form: 'as-sold', allergens: ['dairy'], labelCheck: [] },
  apple: { name: 'Apple', aisle: 'Fruit', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  beans: { name: 'Baked beans', aisle: 'Tins', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  peanutButter: { name: 'Peanut butter', aisle: 'Store cupboard', unit: 'g', form: 'as-sold', allergens: ['peanut'], labelCheck: [] },
  wrap: { name: 'Wheat wrap', aisle: 'Bread', unit: 'g', form: 'as-sold', allergens: ['gluten'], labelCheck: ['dairy'] },
  spinach: { name: 'Spinach', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  tomato: { name: 'Fresh tomato', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  chickpeas: { name: 'Chickpeas, drained', aisle: 'Tins', unit: 'g', form: 'drained', allergens: [], labelCheck: ['sulphites'] },
  tomatoes: { name: 'Chopped tomatoes', aisle: 'Tins', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  onion: { name: 'Onion', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  potato: { name: 'Potato', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  tuna: { name: 'Tuna in water, drained', aisle: 'Tins', unit: 'g', form: 'drained', allergens: ['fish'], labelCheck: [] },
  sweetcorn: { name: 'Sweetcorn, drained', aisle: 'Tins', unit: 'g', form: 'drained', allergens: [], labelCheck: [] },
  lentils: { name: 'Red lentils, dry', aisle: 'Store cupboard', unit: 'g', form: 'dry', allergens: [], labelCheck: [] },
  carrot: { name: 'Carrot', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  stock: { name: 'Reduced-salt vegetable stock', aisle: 'Store cupboard', unit: 'ml', form: 'as-sold', allergens: [], labelCheck: ['celery', 'gluten'] },
  hummus: { name: 'Hummus', aisle: 'Chilled', unit: 'g', form: 'as-sold', allergens: ['sesame'], labelCheck: [] },
  cucumber: { name: 'Cucumber', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  pitta: { name: 'Pitta', aisle: 'Bread', unit: 'g', form: 'as-sold', allergens: ['gluten'], labelCheck: ['sesame'] },
  cheese: { name: 'Cheddar', aisle: 'Dairy', unit: 'g', form: 'as-sold', allergens: ['dairy'], labelCheck: [] },
  rice: { name: 'Long-grain rice, dry', aisle: 'Store cupboard', unit: 'g', form: 'dry', allergens: [], labelCheck: [] },
  pepper: { name: 'Pepper', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  soySauce: { name: 'Reduced-salt soy sauce', aisle: 'Seasoning', unit: 'ml', form: 'as-sold', allergens: ['gluten', 'soy'], labelCheck: [] },
  lemon: { name: 'Lemon juice', aisle: 'Seasoning', unit: 'ml', form: 'as-sold', allergens: [], labelCheck: [] },
  driedHerbs: { name: 'Dried mixed herbs', aisle: 'Seasoning', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  smokedPaprika: { name: 'Smoked paprika', aisle: 'Seasoning', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  mildChilli: { name: 'Mild chilli powder', aisle: 'Seasoning', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  cumin: { name: 'Ground cumin', aisle: 'Seasoning', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  ginger: { name: 'Fresh ginger', aisle: 'Seasoning', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  blackPepper: { name: 'Black pepper', aisle: 'Seasoning', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  chicken: { name: 'Chicken thigh', aisle: 'Meat', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  broccoli: { name: 'Broccoli', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  oil: { name: 'Vegetable oil', aisle: 'Store cupboard', unit: 'ml', form: 'as-sold', allergens: [], labelCheck: [] },
  mince: { name: 'Beef mince', aisle: 'Meat', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  peas: { name: 'Peas', aisle: 'Frozen', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
  tofu: { name: 'Firm tofu', aisle: 'Chilled', unit: 'g', form: 'as-sold', allergens: ['soy'], labelCheck: [] },
  noodles: { name: 'Rice noodles, dry', aisle: 'Store cupboard', unit: 'g', form: 'dry', allergens: [], labelCheck: [] },
  salmon: { name: 'Salmon fillet', aisle: 'Fish', unit: 'g', form: 'as-sold', allergens: ['fish'], labelCheck: [] },
  pasta: { name: 'Pasta, dry', aisle: 'Store cupboard', unit: 'g', form: 'dry', allergens: ['gluten'], labelCheck: ['egg'] },
  garlic: { name: 'Garlic', aisle: 'Vegetables', unit: 'g', form: 'as-sold', allergens: [], labelCheck: [] },
};

const MEALS = ['breakfast', 'lunch', 'dinner'];

export function ingredientKey(id) {
  const item = INGREDIENTS[id];
  return item ? `${id}:${item.form}` : id;
}

export function usedIngredients(recipe, prefs = {}) {
  const optional = (recipe.optional || []).filter(line => {
    const skip = line.skipWhen || [];
    if (prefs.gentle && skip.includes('gentle')) return false;
    if (prefs.spice === 'mild' && skip.includes('mild')) return false;
    return true;
  });
  return [...recipe.ingredients, ...optional];
}

export function recipeAllergens(recipe, prefs = {}) {
  const found = new Set();
  for (const line of usedIngredients(recipe, prefs)) {
    const item = INGREDIENTS[line.id] || {};
    for (const tag of [...(item.allergens || []), ...(item.labelCheck || [])]) found.add(tag);
  }
  return [...found].sort();
}

export function seasoningSwaps(recipe, prefs = {}) {
  return (recipe.swaps || []).filter(swap => {
    if (swap.when === 'mild') return prefs.spice === 'mild';
    if (swap.when === 'gentle') return prefs.gentle === true;
    return false;
  });
}

export function eligibleRecipes(recipes, prefs = {}) {
  const exclude = new Set(prefs.exclude || []);
  return recipes.filter(recipe => {
    if (prefs.vegetarian && !recipe.vegetarian) return false;
    if (prefs.vegan && !recipe.vegan) return false;
    if (prefs.gentle && !recipe.gentle) return false;
    if (prefs.maxMinutes && recipe.minutes > prefs.maxMinutes) return false;
    return !recipeAllergens(recipe, prefs).some(tag => exclude.has(tag));
  });
}

function hash(seed, index, id) {
  let h = (Number(seed) || 1) * 997 + index * 17;
  for (const ch of id) h = Math.imul(h, 33) + ch.charCodeAt(0);
  return h >>> 0;
}

function assignMeal(pool, days, seed, meal, history) {
  const used = {};
  const chosen = [];
  for (let day = 0; day < days; day++) {
    const prev = chosen[day - 1]?.id;
    const ranked = [...pool].sort((a, b) => {
      const score = id => (used[id] || 0) * 100 + (history.has(id) ? 20 : 0) + (id === prev ? 50 : 0);
      const diff = score(a.id) - score(b.id);
      return diff || (hash(seed, day, a.id) - hash(seed, day, b.id));
    });
    const pick = ranked[0] || null;
    if (!pick) { chosen.push(null); continue; }
    used[pick.id] = (used[pick.id] || 0) + 1;
    chosen.push({ id: pick.id, repeated: used[pick.id] > 1 });
  }
  return chosen;
}

export function buildWeek(recipes, prefs = {}, { history = [], seed = 1, days = 7 } = {}) {
  const pool = eligibleRecipes(recipes, prefs);
  const recent = new Set(history);
  const columns = {};
  for (const meal of MEALS) columns[meal] = assignMeal(pool.filter(recipe => recipe.meal === meal), days, seed, meal, recent);
  const plan = [];
  for (let day = 0; day < days; day++) plan.push({ breakfast: columns.breakfast[day], lunch: columns.lunch[day], dinner: columns.dinner[day] });
  return { days: plan, seed, history: [...history] };
}

export function swapSlot(week, recipes, prefs, day, meal) {
  const pool = eligibleRecipes(recipes, prefs).filter(recipe => recipe.meal === meal);
  const current = week.days[day]?.[meal];
  if (!current || !pool.length) return week;
  const start = Math.max(0, pool.findIndex(recipe => recipe.id === current.id));
  let next = current;
  for (let step = 1; step <= pool.length; step++) {
    const candidate = pool[(start + step) % pool.length];
    const sameDay = new Set(MEALS.map(name => week.days[day][name]?.id).filter(id => id && id !== current.id));
    if (!sameDay.has(candidate.id)) { next = { id: candidate.id, repeated: false }; break; }
  }
  const days = week.days.map((row, index) => index === day ? { ...row, [meal]: next } : row);
  return { ...week, days, history: [...new Set([...(week.history || []), current.id])] };
}

export function scaleAmount(qty, baseServings, portions) {
  const servings = Math.max(1, Number(portions) || baseServings || 1);
  const base = Math.max(1, Number(baseServings) || 1);
  return Math.round((Number(qty) || 0) * servings / base);
}

export function shoppingLines(week, recipes, { portions = 2, pantry = {}, prefs = {} } = {}) {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const totals = new Map();
  for (const day of week?.days || []) {
    for (const meal of MEALS) {
      const slot = day[meal];
      const recipe = slot && byId.get(slot.id);
      if (!recipe) continue;
      for (const line of usedIngredients(recipe, prefs)) {
        const key = ingredientKey(line.id);
        const item = INGREDIENTS[line.id];
        const current = totals.get(key) || { key, id: line.id, name: item?.name || line.id, aisle: item?.aisle || 'Other', unit: item?.unit || 'g', form: item?.form || 'as-sold', qty: 0 };
        current.qty += scaleAmount(line.qty, recipe.servings, portions);
        totals.set(key, current);
      }
    }
  }
  return [...totals.values()].map(line => {
    const have = pantry[line.key] === true;
    return { ...line, needed: have ? 0 : line.qty, inPantry: have };
  }).sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
}

export function parseAmount(value) {
  if (value == null) return null;
  const text = String(value).trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function costLine(line, entry = {}) {
  const pack = parseAmount(entry.pack);
  const price = parseAmount(entry.price);
  const loyalty = parseAmount(entry.loyalty);
  const needed = line.needed;
  if (pack == null || pack <= 0 || price == null) {
    return { packs: null, checkout: null, used: null, loyalty, known: false };
  }
  const packs = needed === 0 ? 0 : Math.ceil(needed / pack);
  return { packs, checkout: packs * price, used: (needed / pack) * price, loyalty, known: true };
}

export function costSummary(lines, prices = {}) {
  const rows = lines.map(line => ({ ...line, ...costLine(line, prices[line.key] || {}) }));
  const known = rows.filter(row => row.known);
  const sum = key => known.length ? known.reduce((total, row) => total + row[key], 0) : null;
  return {
    rows,
    known: known.length,
    total: rows.length,
    checkout: sum('checkout'),
    used: sum('used'),
  };
}

export function cannotCompare(left, right) {
  return left == null || right == null;
}

export function plannerKey(prefix) {
  return `${prefix || 'kova.'}ukPlanner`;
}

export function readPlanner(storage, prefix) {
  try { return JSON.parse(storage.getItem(plannerKey(prefix)) || 'null'); } catch { return null; }
}

export function writePlanner(storage, prefix, data) {
  storage.setItem(plannerKey(prefix), JSON.stringify(data));
}
