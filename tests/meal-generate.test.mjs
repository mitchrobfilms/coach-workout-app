import { validateMealDraft, toPlannerRecipe, imperialFor, rememberGenerated } from '../meal-generate-core.js';
import { shoppingLines } from '../planner-core.js';
import { RECIPES } from '../planner-recipes.js';

let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const good = {
  title: 'Lemon herb chicken bowl',
  meal: 'dinner',
  servings: 2,
  ingredients: [{ name: 'Chicken thigh', quantity: 160, unit: 'g' }, { name: 'Plain yoghurt', quantity: 80, unit: 'g' }],
  seasoning: [{ name: 'Lemon juice', quantity: 15, unit: 'ml' }, { name: 'Dried herbs', quantity: 2, unit: 'g' }],
  steps: ['Heat the oven to 200°C.', 'Cook the chicken until it is cooked through and no longer pink.', 'Serve with the yoghurt and lemon.'],
  milderSwap: 'Leave out the black pepper and use the lemon only.',
  storageNote: 'Cool leftovers within 2 hours and eat them within 48 hours.',
};
ok(validateMealDraft(good).ok, 'a plain chicken draft passes');
ok(!validateMealDraft({ ...good, milderSwap: 'Deglaze with a splash of white wine.' }).ok, 'alcohol in the reflux swap is rejected');
ok(validateMealDraft({ ...good, milderSwap: 'Deglaze with a splash of white wine.' }).errors.includes('alcohol'), 'the alcohol failure is named');
ok(!validateMealDraft({ ...good, title: 'Chicken for £2' }).ok, 'a price in the title is rejected');
ok(!validateMealDraft({ ...good, steps: ['Cook the chicken.', 'Serve it.', 'Eat it.'] }).ok, 'poultry without cooked-through guidance is rejected');
const rice = { ...good, title: 'Egg fried rice', ingredients: [{ name: 'Long grain rice', quantity: 80, unit: 'g' }, { name: 'Egg', quantity: 60, unit: 'g' }] };
ok(!validateMealDraft(rice).ok && validateMealDraft({ ...rice, storageNote: 'Cool rice within 1 hour and eat it within 24 hours.' }).ok, 'rice must use the 24 hour storage rule');
const recipe = toPlannerRecipe(good);
ok(recipe && recipe.proteinLabel.includes('discarded') && !('kcal' in recipe), 'model nutrition is not kept');
ok(recipe.ingredients[0].imperial === imperialFor(160, 'g') && !recipe.ingredients[0].imperial.includes('160'), 'imperial ounces are calculated and do not repeat the gram number');
ok(imperialFor(80, 'g') === '2.8 oz', '80 grams is 2.8 ounces');
const stored = rememberGenerated({ generated: [] }, recipe);
const lines = shoppingLines({ days: [] }, RECIPES, { extras: stored.generated });
ok(lines.some(line => line.name === 'Chicken thigh' && line.qty === 160), 'a generated meal is added to the shopping list');
const fn = (await import('node:fs')).readFileSync(new URL('../supabase/functions/meal-generate/index.ts', import.meta.url), 'utf8');
ok(fn.includes('openai/gpt-oss-20b') && fn.includes('GROQ_API_KEY') && !/gsk_/.test(fn), 'the function names the model and does not contain a key');
ok(fn.includes('claim_meal_generate') && fn.includes('not_ready'), 'the function refuses to call the model when the rate limit is missing');

console.log(fail ? `${fail} FAILED` : 'ALL MEAL GENERATE CHECKS PASSED');
process.exit(fail ? 1 : 0);
