import { RECIPES, RECIPE_COUNT } from '../planner-recipes.js';
import { eligibleRecipes, buildWeek, swapSlot, scaleAmount, shoppingLines, costLine, costSummary, parseAmount, cannotCompare, readPlanner, writePlanner, recipeAllergens, usedIngredients, INGREDIENTS } from '../planner-core.js';

let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const meals = meal => RECIPES.filter(recipe => recipe.meal === meal);

ok(RECIPE_COUNT === 18 && meals('breakfast').length === 6 && meals('lunch').length === 6 && meals('dinner').length === 6, 'the draft is 18 distinct recipes, six of each meal');
ok(new Set(RECIPES.map(recipe => recipe.id)).size === 18, 'recipe ids are unique');
ok(RECIPES.every(recipe => recipe.steps.length >= 4 && recipe.ingredients.length >= 2 && !('kcal' in recipe)), 'each recipe has steps and no fabricated calories');

const gluten = eligibleRecipes(RECIPES, { exclude: ['gluten'] });
ok(!gluten.some(recipe => recipe.id === 'egg-pepper-rice'), 'soy sauce keeps pepper rice out of a gluten-free week');
ok(!eligibleRecipes(RECIPES, { exclude: ['soy'] }).some(recipe => recipe.id === 'tofu-noodle-broccoli'), 'soy sauce and tofu exclude the noodle dinner');
ok(!eligibleRecipes(RECIPES, { exclude: ['sesame'] }).some(recipe => recipe.id === 'hummus-pitta'), 'hummus is matched as sesame');
ok(!eligibleRecipes(RECIPES, { exclude: ['sulphites'] }).some(recipe => recipe.id === 'chickpea-tomato-spinach'), 'chickpeas stay out when sulphites are excluded, because the label must be checked');
ok(eligibleRecipes(RECIPES, { vegan: true }).every(recipe => recipe.vegan), 'vegan keeps only vegan drafts');
ok(eligibleRecipes(RECIPES, { maxMinutes: 10 }).every(recipe => recipe.minutes <= 10), 'prep time filters long recipes');
ok(eligibleRecipes(RECIPES, { gentle: true }).every(recipe => recipe.gentle) && !eligibleRecipes(RECIPES, { gentle: true }).some(recipe => recipe.id === 'tofu-noodle-broccoli' || recipe.id === 'chickpea-tomato-spinach'), 'gentler meals leave out the ginger-soy tofu and the smoky chilli');
const chilli = RECIPES.find(recipe => recipe.id === 'chickpea-tomato-spinach');
ok(usedIngredients(chilli, {}).some(line => line.id === 'mildChilli') && !usedIngredients(chilli, { spice: 'mild' }).some(line => line.id === 'mildChilli'), 'mild heat drops the chilli powder and keeps the rest of the recipe');
ok(usedIngredients(chilli, { spice: 'mild' }).some(line => line.id === 'smokedPaprika'), 'smoked paprika stays when chilli powder is left out');
const chicken = RECIPES.find(recipe => recipe.id === 'chicken-potato-tray');
ok(chicken.title.includes('Lemon') && usedIngredients(chicken, {}).some(line => line.id === 'lemon' && line.qty === 15), 'lemon and herb chicken keeps a measured amount of lemon juice');
ok(RECIPES.every(recipe => recipe.ingredients.every(line => INGREDIENTS[line.id])), 'every seasoning and ingredient is in the catalogue');

const first = buildWeek(RECIPES, {}, { seed: 3, history: [] });
const dinners = first.days.map(day => day.dinner.id);
ok(dinners.length === 7 && dinners.every((id, index) => index === 0 || id !== dinners[index - 1]), 'seven dinners do not repeat on consecutive days');
ok(new Set(dinners).size === 6, 'six dinner drafts cover seven days with one planned repeat');
const again = buildWeek(RECIPES, {}, { seed: 3, history: [] });
ok(JSON.stringify(again) === JSON.stringify(first), 'the same seed builds the same week');
const swapped = swapSlot(first, RECIPES, {}, 0, 'dinner');
ok(swapped.days[0].dinner.id !== first.days[0].dinner.id, 'swap changes the selected dinner');
ok(JSON.stringify(swapSlot(first, RECIPES, {}, 0, 'dinner')) === JSON.stringify(swapped), 'the same swap is deterministic');
const historyWeek = buildWeek(RECIPES, {}, { seed: 3, history: dinners });
ok(historyWeek.days.some(day => !dinners.includes(day.breakfast.id)), 'history does not erase the other meals');

ok(scaleAmount(80, 2, 4) === 160 && scaleAmount(15, 2, 4) === 30, 'grams and millilitres scale with portions');
const week = { days: [{ breakfast: { id: 'chickpea-tomato-spinach' }, lunch: { id: 'egg-pepper-rice' }, dinner: null }, ...Array(6).fill({ breakfast: null, lunch: null, dinner: null })] };
const lines = shoppingLines(week, RECIPES, { portions: 2, pantry: {} });
ok(lines.some(line => line.key === 'chickpeas:drained') && lines.some(line => line.key === 'rice:dry'), 'drained chickpeas stay separate from dry rice');
ok(!lines.some(line => line.key === 'chickpeas:dry'), 'drained chickpeas are not counted as dry chickpeas');
const chickpeas = lines.find(line => line.key === 'chickpeas:drained');
const rice = lines.find(line => line.key === 'rice:dry');
const priced = costLine({ ...chickpeas, needed: 450 }, { pack: 400, price: 1 });
ok(priced.packs === 2 && priced.checkout === 2 && priced.used === 1.125, 'checkout buys whole packs and used cost counts only the amount cooked');
ok(costLine(rice, { pack: 500 }).checkout == null && costLine(rice, {}).used == null, 'a missing price or pack weight stays unknown');
ok(parseAmount('') == null && parseAmount('0') === 0, 'a blank amount is null and a typed zero stays zero');
const summary = costSummary([chickpeas, rice], { 'chickpeas:drained': { pack: 400, price: 1, loyalty: 0.5 } });
ok(summary.checkout === 1 && summary.known === 1 && summary.total === 2, 'unknown lines are left out of the total instead of being added as zero');
ok(summary.rows[0].loyalty === 0.5 && summary.rows[0].checkout !== 0.5, 'a loyalty price is not used as the ordinary checkout price');
ok(cannotCompare(null, 0.4) && !cannotCompare(0, 0.4), 'an unknown price cannot win a cheapest comparison');
const covered = shoppingLines(week, RECIPES, { portions: 2, pantry: { 'rice:dry': true } });
ok(covered.find(line => line.key === 'rice:dry').needed === 0, 'pantry stock removes that ingredient from the buy quantity');

const storage = new Map();
const local = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
writePlanner(local, 'kova.u.a.', { shop: 'aldi' });
ok(readPlanner(local, 'kova.u.b.') == null && readPlanner(local, 'kova.u.a.').shop === 'aldi', 'one account cannot read another account planner');
ok(recipeAllergens(RECIPES.find(recipe => recipe.id === 'egg-pepper-rice')).includes('gluten'), 'compound soy sauce is part of the allergen list');
ok(INGREDIENTS.chickpeas.form === 'drained' && INGREDIENTS.rice.form === 'dry', 'the catalogue keeps drained and dry forms');

console.log(fail ? `${fail} FAILED` : 'ALL PLANNER CHECKS PASSED');
process.exit(fail ? 1 : 0);
