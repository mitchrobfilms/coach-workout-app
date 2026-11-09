// Checks an AI meal draft before it can be shown. Nutrition from the model is discarded.
// Imperial amounts are calculated here. The model is not asked for them.

export const DAILY_LIMIT = 20;

const ALCOHOL = /\b(alcohol|alcoholic|beer|cider|wine|prosecco|champagne|sherry|port|brandy|whisky|whiskey|vodka|rum|gin|liqueur|marsala|vermouth|sake|mirin)\b/i;
const PRICE = /[£$€]|\b(?:price|priced|cost|costs|pence)\b/i;
const MEATS = /\b(chicken|turkey|duck|mince|beef|pork|lamb|salmon|cod|haddock|prawn|fish|tuna)\b/i;
const COOKED = /cooked through|no longer pink|piping hot|steaming hot|75\s*°?\s*c|70\s*°?\s*c|flakes|opaque/i;
const RICE = /\brice\b/i;

export function imperialFor(quantity, unit) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n < 0) return '';
  if (unit === 'g') {
    if (n >= 454) {
      const lb = Math.floor(n / 453.59237);
      const oz = (n - lb * 453.59237) / 28.349523125;
      return `${lb} lb ${oz.toFixed(1)} oz`;
    }
    return `${(n / 28.349523125).toFixed(1)} oz`;
  }
  if (unit === 'ml') return `${(n / 28.4130625).toFixed(1)} fl oz`;
  return '';
}

function lines(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    name: String(item?.name || '').trim(),
    quantity: Number(item?.quantity),
    unit: String(item?.unit || '').trim().toLowerCase(),
  }));
}

function textOf(draft, rows) {
  return [draft?.title, draft?.milderSwap, draft?.storageNote, ...(draft?.steps || []), ...rows.map(row => row.name)].join('\n');
}

export function validateMealDraft(raw) {
  const errors = [];
  const draft = raw && typeof raw === 'object' ? raw : {};
  const title = String(draft.title || '').trim();
  const meal = String(draft.meal || '').trim().toLowerCase();
  const servings = Number(draft.servings);
  const steps = Array.isArray(draft.steps) ? draft.steps.map(step => String(step || '').trim()).filter(Boolean) : [];
  const ingredients = lines(draft.ingredients);
  const seasoning = lines(draft.seasoning);
  const milderSwap = String(draft.milderSwap || '').trim();
  const storageNote = String(draft.storageNote || '').trim();
  if (title.length < 3 || title.length > 80) errors.push('title');
  if (!['breakfast', 'lunch', 'dinner'].includes(meal)) errors.push('meal');
  if (!Number.isInteger(servings) || servings < 1 || servings > 4) errors.push('servings');
  if (ingredients.length < 2 || ingredients.some(row => row.name.length < 2 || !Number.isFinite(row.quantity) || row.quantity <= 0 || !['g', 'ml'].includes(row.unit))) errors.push('ingredients');
  if (seasoning.length < 1 || seasoning.some(row => row.name.length < 2 || !Number.isFinite(row.quantity) || row.quantity <= 0 || !['g', 'ml'].includes(row.unit))) errors.push('seasoning');
  if (steps.length < 3) errors.push('steps');
  if (milderSwap.length < 8) errors.push('milder');
  const blob = textOf({ title, milderSwap, storageNote, steps }, [...ingredients, ...seasoning]);
  if (ALCOHOL.test(blob)) errors.push('alcohol');
  if (PRICE.test(blob)) errors.push('price');
  const names = [...ingredients, ...seasoning].map(row => row.name).join(' ');
  if (MEATS.test(names) && !COOKED.test(steps.join(' '))) errors.push('cooking');
  if (RICE.test(names) || RICE.test(title)) {
    if (!/24\s*hours?/i.test(storageNote)) errors.push('rice-storage');
  } else if (!/48\s*hours?/i.test(storageNote)) errors.push('storage');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function slug(name, index) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'item';
  return `ai-${base}-${index}`;
}

export function toPlannerRecipe(raw) {
  const check = validateMealDraft(raw);
  if (!check.ok) return null;
  const ingredients = [...lines(raw.ingredients), ...lines(raw.seasoning)].map((row, index) => ({
    id: slug(row.name, index),
    name: row.name,
    qty: row.quantity,
    unit: row.unit,
    aisle: index < lines(raw.ingredients).length ? 'AI meal' : 'Seasoning',
    form: 'as-sold',
    imperial: imperialFor(row.quantity, row.unit),
  }));
  const rice = RICE.test(ingredients.map(row => row.name).join(' ') + raw.title);
  return {
    id: `ai-${Date.now().toString(36)}-${ingredients[0].id}`,
    title: String(raw.title).trim(),
    meal: String(raw.meal).trim().toLowerCase(),
    minutes: 25,
    servings: Number(raw.servings),
    vegetarian: false,
    vegan: false,
    gentle: false,
    spice: 'none',
    ai: true,
    optional: [],
    swaps: [{ when: 'gentle', text: String(raw.milderSwap).trim() }],
    ingredients,
    steps: raw.steps.map(step => String(step).trim()),
    storageNote: String(raw.storageNote).trim(),
    safety: rice ? 'rice' : 'leftovers',
    proteinLabel: 'Not calculated. Nutrition figures from the model are discarded.',
  };
}

export function rememberGenerated(data, recipe) {
  const generated = [...(data?.generated || [])];
  if (recipe?.id && !generated.some(item => item.id === recipe.id)) generated.push(recipe);
  return { ...(data || {}), generated };
}
