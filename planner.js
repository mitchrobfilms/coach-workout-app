// UK planner screen. Saved on this phone for the current account. Not synced and not a live shop feed.
import { getAuth } from './auth.js';
import { SHOPS, SAFETY, INGREDIENTS, eligibleRecipes, buildWeek, swapSlot, shoppingLines, costSummary, parseAmount, readPlanner, writePlanner, usedIngredients, seasoningSwaps } from './planner-core.js';
import { RECIPES, RECIPE_COUNT, recipeById } from './planner-recipes.js';
import { SB_URL, SB_KEY } from './cloud.js';
import { rememberGenerated } from './meal-generate-core.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EXCLUDES = ['gluten', 'dairy', 'egg', 'fish', 'peanut', 'soy', 'sesame', 'sulphites', 'celery'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = n => n == null ? 'Price unknown' : `£${n.toFixed(2)}`;
const auth = getAuth();
const blank = () => ({ prefs: { portions: 2, maxMinutes: 60, vegetarian: false, vegan: false, gentle: false, spice: 'as-written', exclude: [] }, shop: 'asda', seed: 1, history: [], week: null, pantry: {}, prices: {} });

function load() {
  return { ...blank(), ...(readPlanner(localStorage, auth.dataPrefix()) || {}) };
}
function save(data) {
  writePlanner(localStorage, auth.dataPrefix(), data);
}

function render() {
  const root = document.getElementById('ukPlanRoot');
  if (!root) return;
  const data = load();
  const week = data.week || buildWeek(RECIPES, data.prefs, data);
  data.week = week;
  const catalogue = [...RECIPES, ...(data.generated || [])];
  const lines = shoppingLines(week, catalogue, { portions: data.prefs.portions, pantry: data.pantry, prefs: data.prefs, extras: data.generated || [] });
  const prices = data.prices[data.shop] || {};
  const summary = costSummary(lines, prices);
  const shop = SHOPS.find(item => item.id === data.shop) || SHOPS[0];
  const days = week.days.map((day, index) => {
    const meals = ['breakfast', 'lunch', 'dinner'].map(meal => {
      const slot = day[meal];
      const recipe = slot && recipeById(slot.id);
      const title = recipe ? esc(recipe.title) : 'No match in this draft';
      const repeat = slot?.repeated ? '<span class="small">Repeated because the matching draft set is smaller than 7.</span>' : '';
      return `<p><b>${meal}</b> ${title} ${repeat}</p><button type="button" data-ukopen="${recipe?.id || ''}" ${recipe ? '' : 'disabled'}>Recipe</button><button type="button" data-ukswap="${index}:${meal}">Swap</button>`;
    }).join('');
    return `<section class="ukday"><h4>${DAYS[index]}</h4>${meals}</section>`;
  }).join('');
  const shops = SHOPS.map(item => `<button type="button" class="chip ${item.id === data.shop ? 'on' : ''}" data-ukshop="${item.id}">${esc(item.name)}</button>`).join('');
  const list = summary.rows.map(row => {
    const entry = prices[row.key] || {};
    const loyalty = row.loyalty != null ? ` Loyalty price typed: £${row.loyalty.toFixed(2)}, not used in the checkout total.` : '';
    return `<div class="ukline"><b>${esc(row.name)}</b> <span class="small">${row.form} · ${row.aisle} · ${row.needed}${row.unit}${row.inPantry ? ' · pantry covers it' : ''}</span>
      <label class="check"><input type="checkbox" data-ukpantry="${esc(row.key)}" ${row.inPantry ? 'checked' : ''}> Already in the pantry</label>
      <label>Pack ${row.unit} <input data-ukpack="${esc(row.key)}" inputmode="decimal" value="${entry.pack ?? ''}" placeholder="Unknown"></label>
      <label>Ordinary £ <input data-ukprice="${esc(row.key)}" inputmode="decimal" value="${entry.price ?? ''}" placeholder="Unknown"></label>
      <label>Loyalty £ <input data-ukloyal="${esc(row.key)}" inputmode="decimal" value="${entry.loyalty ?? ''}" placeholder="Separate"></label>
      <p class="small">Packs to buy: ${row.packs == null ? 'unknown' : row.packs}. Ordinary checkout: ${money(row.checkout)}. Used: ${money(row.used)}.${loyalty}</p></div>`;
  }).join('') || '<p>No ingredients match these choices.</p>';
  const sources = SAFETY.sources.map(href => `<a href="${esc(href)}" target="_blank" rel="noopener">FSA guidance</a>`).join(' · ');
  const excludes = EXCLUDES.map(tag => `<label class="check"><input type="checkbox" data-ukex="${tag}" ${data.prefs.exclude.includes(tag) ? 'checked' : ''}> ${tag}</label>`).join('');
  root.innerHTML = `<p class="ukdraft">Draft planner · ${RECIPE_COUNT} original recipes. AI-assisted drafts, not kitchen-tested and not dietitian-approved. Nutrition is unavailable until it can be checked against CoFID. There is no single GLP-1 diet and no calorie or protein target here.</p>
    <div class="card"><h3>Meal ideas, not a prescription</h3>
      <p class="small">These drafts put a protein food with the meal, in portions you can change. Seasoning is for flavour. It cannot treat nausea, reflux or any other effect of a medicine, and it cannot make an unsuitable meal clinically safe. A lower-salt soy sauce or stock is still not allergen-free. Check the label.</p>
      <p class="small">Guy's and St Thomas' NHS Foundation Trust describes smaller meals, protein foods, and plainer foods when someone feels sick. It also prints a general-population protein range. This planner does not apply that range. <a href="https://www.guysandstthomas.nhs.uk/health-information/lifestyle-advice-people-taking-weight-loss-medicines/food-and-nutrition" target="_blank" rel="noopener">Food and nutrition</a> · <a href="https://www.guysandstthomas.nhs.uk/health-information/lifestyle-advice-people-taking-weight-loss-medicines/managing-side-effects-diet" target="_blank" rel="noopener">Side effects and diet</a>. Reviewed by the Trust in August 2025.</p>
    </div>
    <div class="card ukprefs"><h3>This week</h3>
      <label>Portions <input id="ukPortions" type="number" min="1" max="12" value="${data.prefs.portions}"></label>
      <label>Max prep minutes <input id="ukMinutes" type="number" min="5" max="120" value="${data.prefs.maxMinutes}"></label>
      <label class="check"><input id="ukVeg" type="checkbox" ${data.prefs.vegetarian ? 'checked' : ''}> Vegetarian</label>
      <label class="check"><input id="ukVegan" type="checkbox" ${data.prefs.vegan ? 'checked' : ''}> Vegan</label>
      <label class="check"><input id="ukGentle" type="checkbox" ${data.prefs.gentle ? 'checked' : ''}> Gentler meals (plainer seasoning if you feel sick or have reflux)</label>
      <label class="check"><input id="ukMild" type="checkbox" ${data.prefs.spice === 'mild' ? 'checked' : ''}> Mild heat (leaves out chilli powder; herbs and paprika can stay)</label>
      <fieldset><legend>Leave out</legend>${excludes}</fieldset>
      <button type="button" class="primary" id="ukBuild">Build week</button>
      <button type="button" id="ukRegen">Regenerate</button>
      <button type="button" id="ukGenerate">Generate new meal</button>
      <p class="small" id="ukGenMsg"></p>
      <p class="small muted">Saved on this phone for this account. Not copied to the cloud. Generated meals are kept with it.</p>
    </div>
    <div class="card"><h3>Seven days</h3><p class="small">${esc(SAFETY.leftovers)}</p>
      ${(data.generated || []).map(recipe => `<p><b>Added meal</b> ${esc(recipe.title)} <span class="small">${recipe.member ? 'Member recipe, check ingredients for allergies.' : 'AI-generated, check ingredients for allergies. Not kitchen-tested.'}</span></p><button type="button" data-ukopen="${esc(recipe.id)}">Recipe</button>`).join('')}
      ${days}</div>
    <div class="card" id="ukRecipe"></div>
    <div class="card" id="ukShop"><h3>Shopping</h3>
      <p class="small">Choose a shop, then type a pack weight and the price you saw. An empty price stays unknown. It is not treated as free or as the cheapest. A loyalty price is kept separate from the ordinary price.</p>
      <div class="chips">${shops}</div>
      <p class="small"><a href="${esc(shop.href)}" target="_blank" rel="noopener">Check prices at ${esc(shop.name)}</a>. This opens the shop's own website. It is not a product match, a partnership, or a live price.</p>
      <p id="ukCoverage">${summary.known} of ${summary.total} lines have an ordinary pack price. Checkout estimate ${money(summary.checkout)}. Ingredient-used estimate ${money(summary.used)}. Checkout counts whole packs. Used cost counts only the amount in the recipes. Delivery and missing lines are not included.</p>
      ${list}
      <p class="small muted">Food safety sources: ${sources}. England, Wales and Northern Ireland publications. This is not medical advice.</p>
    </div>`;
  const prefsFromForm = () => ({
    portions: Math.max(1, Number(document.getElementById('ukPortions').value) || 1),
    maxMinutes: Math.max(5, Number(document.getElementById('ukMinutes').value) || 60),
    vegetarian: document.getElementById('ukVeg').checked,
    vegan: document.getElementById('ukVegan').checked,
    gentle: document.getElementById('ukGentle').checked,
    spice: document.getElementById('ukMild').checked ? 'mild' : 'as-written',
    exclude: [...root.querySelectorAll('[data-ukex]:checked')].map(box => box.dataset.ukex),
  });
  const persist = next => { save(next); render(); };
  document.getElementById('ukBuild').onclick = () => { const prefs = prefsFromForm(); persist({ ...data, prefs, week: buildWeek(RECIPES, prefs, data) }); };
  document.getElementById('ukRegen').onclick = () => {
    const prefs = prefsFromForm();
    const seen = [...data.history];
    for (const day of (data.week?.days || [])) for (const meal of ['breakfast', 'lunch', 'dinner']) if (day[meal]?.id) seen.push(day[meal].id);
    persist({ ...data, prefs, seed: data.seed + 1, history: [...new Set(seen)], week: buildWeek(RECIPES, prefs, { history: seen, seed: data.seed + 1 }) });
  };
  root.querySelectorAll('[data-ukswap]').forEach(button => button.onclick = () => {
    const [day, meal] = button.dataset.ukswap.split(':');
    persist({ ...data, week: swapSlot(data.week, RECIPES, data.prefs, Number(day), meal) });
  });
  document.getElementById('ukGenerate').onclick = () => generate(data, prefsFromForm());
  root.querySelectorAll('[data-ukopen]').forEach(button => button.onclick = () => showRecipe(button.dataset.ukopen, data.prefs.portions, data.prefs));
  root.querySelectorAll('[data-ukshop]').forEach(button => button.onclick = () => persist({ ...data, shop: button.dataset.ukshop }));
  root.querySelectorAll('[data-ukpantry]').forEach(box => box.onchange = () => persist({ ...data, pantry: { ...data.pantry, [box.dataset.ukpantry]: box.checked } }));
  const storePrice = (key, field, value) => {
    const shopPrices = { ...(data.prices[data.shop] || {}) };
    const entry = { ...(shopPrices[key] || {}) };
    entry[field] = parseAmount(value);
    shopPrices[key] = entry;
    persist({ ...data, prices: { ...data.prices, [data.shop]: shopPrices } });
  };
  root.querySelectorAll('[data-ukpack]').forEach(input => input.onchange = () => storePrice(input.dataset.ukpack, 'pack', input.value));
  root.querySelectorAll('[data-ukprice]').forEach(input => input.onchange = () => storePrice(input.dataset.ukprice, 'price', input.value));
  root.querySelectorAll('[data-ukloyal]').forEach(input => input.onchange = () => storePrice(input.dataset.ukloyal, 'loyalty', input.value));
  if (!INGREDIENTS.oats || eligibleRecipes(RECIPES, {}).length !== RECIPE_COUNT) return;
}

function findRecipe(id) {
  return recipeById(id) || (load().generated || []).find(recipe => recipe.id === id) || null;
}

async function generate(data, prefs) {
  const message = document.getElementById('ukGenMsg');
  const session = JSON.parse(localStorage.getItem(auth.dataPrefix() + 'cloud.session') || 'null');
  if (!session?.access_token) { if (message) message.textContent = 'Sign in to Cloud backup in Settings before generating a meal. The 18 drafts are still here.'; return; }
  if (message) message.textContent = 'Generating a meal…';
  try {
    const response = await fetch(`${SB_URL}/functions/v1/meal-generate`, { method: 'POST', headers: { apikey: SB_KEY, authorization: 'Bearer ' + session.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ meal: 'dinner', exclude: prefs.exclude, gentle: prefs.gentle }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.recipe) { if (message) message.textContent = payload.message || 'Meal generator is not available yet. The draft recipes are still here.'; return; }
    const next = rememberGenerated({ ...data, prefs }, payload.recipe);
    save(next);
    render();
    const note = document.getElementById('ukGenMsg');
    if (note) note.textContent = 'AI-generated, check ingredients for allergies. Not kitchen-tested or dietitian-approved.';
    showRecipe(payload.recipe.id, prefs.portions, prefs);
  } catch { if (message) message.textContent = 'Meal generator is not available yet. The draft recipes are still here.'; }
}

function showRecipe(id, portions, prefs) {
  const box = document.getElementById('ukRecipe');
  const recipe = findRecipe(id);
  if (!box || !recipe) return;
  const safety = SAFETY[recipe.safety] || '';
  const swaps = seasoningSwaps(recipe, prefs);
  const lessFat = (recipe.swaps || []).filter(swap => swap.when === 'less-fat');
  box.innerHTML = `<h3>${esc(recipe.title)}</h3><p class="small">Original draft · ${recipe.minutes} minutes for the method, not scaled with portions · ${portions} portions · ${recipe.vegetarian ? 'vegetarian' : 'not vegetarian'}${recipe.batch ? ' · batch-friendly if you freeze extra portions the same day' : ''}</p>
    <p class="small">Nutrition unavailable. It needs a checked CoFID mapping and is not estimated here. Seasoning is not a treatment.</p>
    <ul>${usedIngredients(recipe, prefs).map(line => {
      const item = INGREDIENTS[line.id];
      const name = line.name || item?.name || line.id;
      const unit = line.unit || item?.unit || 'g';
      const qty = Math.round(line.qty * portions / recipe.servings);
      const imperial = line.imperial ? ` · ${line.imperial}` : '';
      return `<li>${esc(name)}: ${qty}${esc(unit)}${esc(imperial)} (${esc(line.form || item?.form || 'as-sold')})</li>`;
    }).join('')}</ul>
    ${recipe.member ? `<p class="small">${esc(recipe.proteinLabel || 'Member recipe, check ingredients for allergies.')}</p>` : recipe.ai ? `<p class="small">${esc(recipe.proteinLabel || 'Not calculated.')} AI-generated, check ingredients for allergies.</p>` : ''}
    ${swaps.length ? `<p class="small"><b>For the setting you chose:</b> ${swaps.map(swap => esc(swap.text)).join(' ')}</p>` : ''}
    ${lessFat.length ? `<p class="small"><b>Less added fat, if you want it:</b> ${lessFat.map(swap => esc(swap.text)).join(' ')}</p>` : ''}
    <ol>${recipe.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
    ${safety ? `<p class="small">${esc(safety)}</p>` : ''}`;
  box.scrollIntoView({ block: 'start' });
}

function boot() {
  render();
  (window.__kova ||= {}).renderUkPlan = render;
}
if (document.getElementById('ukPlanRoot')) boot();

export { render };
