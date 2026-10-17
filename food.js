// Rule-based food check-in analyser. Text only, runs on device. Not medical advice.
const K = {
  protein: ['egg','eggs','chicken','turkey','beef','steak','lamb','pork','fish','salmon','tuna','cod','sardine','mackerel','prawn','prawns','shrimp','tofu','tempeh','seitan','lentil','lentils','dal','dhal','daal','chickpea','chickpeas','hummus','houmous','bean','beans','edamame','paneer','greek yoghurt','greek yogurt','skyr','yoghurt','yogurt','cottage cheese','quark','cheese','milk','protein','whey','quorn','kidney beans','black beans','falafel','nuts','peanut butter','halloumi','kefir','soy','soya','mince','ham','kebab','burger','burgers','sausage','sausages','bacon','meatballs','duck','biryani','omelette','shakshuka','rajma','chana','tikka'],
  veg: ['salad','spinach','broccoli','carrot','carrots','pepper','peppers','tomato','tomatoes','onion','cucumber','lettuce','kale','cabbage','courgette','zucchini','aubergine','eggplant','peas','green beans','mushroom','mushrooms','cauliflower','sweetcorn','corn','veg','vegetable','vegetables','veggies','stir fry','stir-fry','soup','okra','bok choy','pak choi','sprouts','beetroot','squash','pumpkin','avocado','sweet potato','leek','celery','rocket','coleslaw','sabzi','sambar','kimchi'],
  fruit: ['apple','banana','berries','blueberries','strawberries','raspberries','orange','grapes','pear','mango','pineapple','kiwi','melon','watermelon','fruit','plum','peach','cherries','dates','papaya'],
  fibre: ['oats','porridge','oatmeal','wholegrain','whole grain','wholemeal','wholewheat','whole wheat','brown rice','quinoa','bran','granary','rye','barley','bulgur','buckwheat','lentil','lentils','beans','chickpeas','dal','seeds','chia','flaxseed','muesli','weetabix','shredded wheat'],
  sugaryDrink: ['coke','cola','pepsi','fanta','sprite','lemonade','fizzy','soda','pop','energy drink','red bull','monster','lucozade','juice','smoothie','milkshake','frappuccino','frappe','bubble tea','boba','iced coffee','sweet tea','hot chocolate','squash','irn bru','mocha','latte with syrup','syrup'],
  sugarySnack: ['chocolate','sweets','candy','cake','biscuit','biscuits','cookie','cookies','doughnut','donut','pastry','croissant','muffin','brownie','ice cream','dessert','haribo','cereal bar','flapjack','sugar','gulab jamun','baklava','pain au chocolat','cinnamon roll','sweet'],
  fried: ['chips','fries','crisps','fried','deep fried','deep-fried','kfc','mcdonald','mcdonalds','burger king','takeaway','take away','take-out','takeout','pizza','kebab','doner','nuggets','fish and chips','samosa','pakora','bhaji','tempura','spring roll','onion rings','hash brown','fry up','fry-up','full english','dominos','five guys','fried chicken','wings'],
  alcohol: ['beer','lager','wine','prosecco','cider','vodka','gin','rum','whisky','whiskey','cocktail','pint','pints','shots','alcohol'],
  water: ['water','sparkling water','herbal tea','green tea','black coffee','tea','coffee'],
  big: ['large','huge','massive','extra large','supersize','super size','double','triple','family size','sharing bag','whole pizza','two portions','second helping','seconds','loads','lots of','all you can eat','buffet','big plate','foot long','footlong'],
  skip: ['nothing','none','skipped','skip','didn\'t eat','did not eat','no breakfast','no lunch','no dinner','not hungry','n/a','-'],
};
const has = (txt, list) => list.filter(w => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(txt));

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '🥪' },
  { id: 'dinner', label: 'Dinner', icon: '🍽️' },
  { id: 'snacks', label: 'Snacks', icon: '🍎' },
  { id: 'drinks', label: 'Drinks', icon: '🥤' },
];

const SWAPS = {
  protein: ['Add a protein: 2 eggs, a pot of Greek yoghurt or skyr, a tin of tuna, tofu, or a scoop of beans or lentils.', 'Try cottage cheese or hummus with your bread or crackers.', 'A handful of edamame, chickpeas or a boiled egg makes an easy protein top-up.'],
  sugaryDrink: ['Swap to sparkling water with a squeeze of lime, or a diet/zero-sugar version.', 'If you like juice, try a small glass topped up with fizzy water.', 'Tea or coffee without syrup, or with a dash of milk, is a lighter pick-me-up.'],
  sugarySnack: ['Try Greek yoghurt with berries, or an apple with a spoon of peanut butter.', 'A couple of squares of dark chocolate with a handful of nuts satisfies the sweet craving.', 'Rice cakes with banana slices, or a small bowl of popcorn, work well too.'],
  fried: ['Oven-baked or air-fried versions (potato wedges, chicken) give the crunch with less oil.', 'At a takeaway, go for grilled options, a tikka or tandoori dish, a poke bowl or sushi, with salad or veg on the side.', 'Halve the chips and add a side salad or peas.'],
  big: ['Use a smaller plate and fill half of it with veg first.', 'Eat slowly and pause halfway; you can always have more if you\'re still hungry.', 'Save the second portion for tomorrow\'s lunch.'],
  veg: ['Add a handful of frozen veg or spinach; it cooks in minutes.', 'A side salad or sliced cucumber and tomatoes counts.', 'Stir some peppers, mushrooms or onions into sauces and eggs.'],
  fibre: ['Swap white bread or rice for wholegrain, brown rice or quinoa.', 'Add oats, beans, lentils or a sprinkle of seeds.', 'Leave the skin on potatoes and fruit for extra fibre.'],
  alcohol: ['Alternate each drink with a glass of water.', 'Try an alcohol-free beer or a spritzer with extra soda.'],
  skip: ['Even a small meal helps. Try Greek yoghurt, a protein shake, eggs, or a tuna or bean salad.', 'If you\'re not hungry, small protein-first bites (a boiled egg, cheese, edamame) keep you going.'],
};
export const MEAL_IDEAS = [
  'Greek yoghurt with berries and a sprinkle of oats',
  'Eggs on wholegrain toast with tomatoes or spinach',
  'Chicken, rice and veg (or tofu for a veggie version)',
  'Lentil or bean chilli with brown rice',
  'Tuna salad wrap (or a hummus and falafel wrap, veggie)',
  'Dal with spinach and a wholemeal chapati (veggie)',
  'Overnight oats with milk, chia and banana',
  'Salmon or tofu stir-fry with noodles and plenty of veg',
  'Chickpea and veg curry with brown rice (veggie)',
  'Omelette with peppers, mushrooms and a side salad',
  'Bean burrito bowl: rice, black beans, salsa, lettuce, a little cheese',
  'Shakshuka (eggs in tomato and pepper sauce) with wholegrain bread',
];

/** Analyse one meal's free text. glp1: user flagged appetite-suppressing medication. */
export function analyseMeal(mealId, raw, { glp1 = false } = {}) {
  const txt = ` ${(raw || '').toLowerCase().trim()} `;
  const flags = [], found = {};
  for (const k of Object.keys(K)) found[k] = has(txt, K[k]);
  const empty = !raw || !raw.trim() || (found.skip.length && txt.trim().split(/\s+/).length <= 4);
  if (empty) {
    if (mealId === 'snacks' || mealId === 'drinks') return { flags: [], found, empty: true, ok: true };
    flags.push({ k: 'skip', msg: glp1 ? 'Skipped meal: on a GLP-1-type medication, small protein-rich meals still matter to protect muscle. Follow your prescriber\'s advice.' : 'Skipped meal: that\'s OK sometimes, but regular meals help steady energy and reduce cravings later.' });
    return { flags, found, empty: true, ok: false };
  }
  const isMeal = ['breakfast', 'lunch', 'dinner'].includes(mealId);
  if (isMeal && !found.protein.length) flags.push({ k: 'protein', msg: 'Looks a bit low in protein; protein keeps you fuller and helps your muscles recover.' });
  if (found.sugaryDrink.length && !/(diet|zero|no sugar|sugar free|sugar-free|max)/.test(txt)) flags.push({ k: 'sugaryDrink', msg: `Sugary drink spotted (${found.sugaryDrink[0]}); liquid sugar adds up quickly.` });
  if (found.sugarySnack.length) flags.push({ k: 'sugarySnack', msg: `Sweet treat spotted (${found.sugarySnack[0]}); totally fine now and then.` });
  if (found.fried.length) flags.push({ k: 'fried', msg: `Fried or takeaway food (${found.fried[0]}); fine sometimes, but it's easy to overdo calories.` });
  if (found.big.length) flags.push({ k: 'big', msg: 'Sounds like a big portion; portion size is the easiest lever for a gentle deficit.' });
  if (found.alcohol.length) flags.push({ k: 'alcohol', msg: 'Alcohol adds calories and can affect sleep and recovery.' });
  if ((mealId === 'lunch' || mealId === 'dinner') && !found.veg.length) flags.push({ k: 'veg', msg: 'No veg spotted; aim for half a plate of veg or salad.' });
  if (mealId === 'breakfast' && !found.fibre.length && !found.fruit.length) flags.push({ k: 'fibre', msg: 'Low in fibre; oats, wholegrain or fruit keep you full longer.' });
  return { flags, found, empty: false, ok: flags.length === 0 };
}

export function analyseDay(entries, opts = {}) {
  const dislikes = parseList(opts.dislikes), fussy = !!opts.fussy, country = opts.country || 'OTHER';
  const meals = {}; let score = 10; const tips = [];
  const penalty = { skip: 1.5, protein: 1, sugaryDrink: 1, sugarySnack: 0.5, fried: 1, big: 1, alcohol: 0.75, veg: 0.75, fibre: 0.5 };
  for (const m of MEALS) {
    const r = analyseMeal(m.id, entries[m.id], opts);
    let sw = [...new Set(r.flags.flatMap(f => filterByDislikes(SWAPS[f.k], dislikes).slice(0, r.flags.length > 1 ? 2 : 3)))];
    if (r.flags.some(f => ['fried', 'protein', 'big', 'skip'].includes(f.k)) && ['lunch', 'dinner'].includes(m.id)) sw.splice(1, 0, readyMealTip(country, dislikes));
    if (fussy && r.flags.length) sw.splice(1, 0, `Simple option: ${fussyIdeas(opts, 1)[0] || 'something plain you enjoy, with a protein'}`);
    r.swaps = sw.slice(0, 3);
    meals[m.id] = r;
    for (const f of r.flags) score -= penalty[f.k] || 0.5;
  }
  const anyProtein = MEALS.some(m => meals[m.id].found.protein?.length);
  const anyVeg = MEALS.some(m => meals[m.id].found.veg?.length || meals[m.id].found.fruit?.length);
  if (anyProtein) score += 0.5; if (anyVeg) score += 0.5;
  if (MEALS.some(m => meals[m.id].found.water?.length)) score += 0.25;
  score = Math.max(1, Math.min(10, Math.round(score * 2) / 2));
  const flagged = MEALS.filter(m => meals[m.id].flags.length);
  const pool = fussy ? fussyIdeas(opts, 6) : filterByDislikes(MEAL_IDEAS, dislikes);
  const ideas = flagged.length ? pick(pool.length ? pool : fussyIdeas(opts, 6), 3, entries) : [];
  const headline = score >= 8.5 ? 'Brilliant day of eating, really well balanced.' : score >= 6.5 ? 'Good day! A couple of small tweaks could make it even better.' : score >= 4.5 ? 'Thanks for checking in. A few easy swaps would help a lot.' : 'Thanks for being honest, that\'s the hardest part. Let\'s pick one or two easy swaps for tomorrow.';
  tips.push('Aim for a gentle deficit: protein and veg at each meal, smaller portions of the rest. No need for extreme diets or very low calories.');
  return { meals, score, headline, ideas, tips };
}
function pick(list, n, seedObj) { // deterministic per day text, so ideas don't jump around on re-render
  let h = 0; for (const c of JSON.stringify(seedObj)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const out = [], idx = list.map((_, i) => i);
  while (out.length < n && idx.length) { const j = h % idx.length; out.push(list[idx.splice(j, 1)[0]]); h = (h * 1103515245 + 12345) >>> 0; }
  return out;
}

export function dayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function streak(history, today = new Date()) { // consecutive days with a check-in, ending today or yesterday
  const days = new Set(Object.keys(history || {}));
  let n = 0; const d = new Date(today);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- Fussy-eater mode: plain, familiar meals, filtered by dislikes ---------- */
export const PICKER_FOODS = ['chicken','turkey','ham','beef mince','fish','tuna','salmon','eggs','cheese','yoghurt','milk','beans','lentils','chickpeas','tofu','rice','pasta','potato','bread','oats','peanut butter','banana','apple','berries','carrots','peas','sweetcorn','broccoli','spinach','peppers','tomatoes','cucumber','mushrooms','onions','salad'];
export const FUSSY_MEALS = [
  { t: 'Plain chicken and rice (add a little soy sauce or gravy if you like)', i: ['chicken','rice'] },
  { t: 'Jacket potato with baked beans and grated cheese', i: ['potato','beans','cheese'] },
  { t: 'Simple cheese omelette with toast', i: ['eggs','cheese','bread'] },
  { t: 'Turkey or ham wrap with a little cheese', i: ['turkey','ham','bread','cheese'], any: ['turkey','ham'] },
  { t: 'Simple pasta with lean beef mince in tomato sauce', i: ['pasta','beef mince','tomatoes'] },
  { t: 'Yoghurt with a sliced banana', sweet: true, i: ['yoghurt','banana'] },
  { t: 'Toast with peanut butter (and banana if you like)', sweet: true, i: ['bread','peanut butter'] },
  { t: 'Scrambled eggs on toast', i: ['eggs','bread'] },
  { t: 'Tuna mayo jacket potato (go light on the mayo)', i: ['tuna','potato'] },
  { t: 'Porridge made with milk, topped with banana', sweet: true, i: ['oats','milk','banana'] },
  { t: 'Plain grilled fish with potatoes and peas', i: ['fish','potato','peas'] },
  { t: 'Cheese and beans on toast', i: ['cheese','beans','bread'] },
];
const VEG_LIKES = ['carrots','peas','sweetcorn','broccoli','spinach','peppers','tomatoes','cucumber','mushrooms','onions','salad'];
const norm = s => (s || '').toLowerCase().trim();
export function parseList(s) { return (Array.isArray(s) ? s : String(s || '').split(',')).map(norm).filter(Boolean); }
// any text that mentions a disliked food is dropped
const SYN = { 'beef mince': ['mince','beef'], eggs: ['egg','eggs','omelette','shakshuka'], yoghurt: ['yoghurt','yogurt','skyr'], potato: ['potato','potatoes','wedges','chips'], bread: ['bread','toast','wrap','chapati','sandwich'], fish: ['fish','cod','salmon','tuna','sushi','poke'], beans: ['bean','beans','burrito'], lentils: ['lentil','lentils','dal'], tomatoes: ['tomato','tomatoes','salsa'], peppers: ['pepper','peppers'], mushrooms: ['mushroom','mushrooms'], salad: ['salad','lettuce'], cheese: ['cheese','halloumi','paneer','cottage'], milk: ['milk'], chickpeas: ['chickpea','chickpeas','hummus','falafel'] };
const words = f => SYN[f] || [f, f.replace(/s$/, '')];
export const mentionsDisliked = (text, dislikes) => { const t = ` ${norm(text)} `; return dislikes.some(d => words(d).some(w => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t))); };
export function filterByDislikes(list, dislikes) { return dislikes.length ? list.filter(x => !mentionsDisliked(typeof x === 'string' ? x : x.t, dislikes)) : list; }
export function fussyIdeas({ likes = [], dislikes = [] } = {}, n = 4) {
  likes = parseList(likes); dislikes = parseList(dislikes);
  let ok = FUSSY_MEALS.filter(m => !mentionsDisliked(m.t, dislikes));
  ok.sort((a, b) => b.i.filter(x => likes.includes(x)).length - a.i.filter(x => likes.includes(x)).length);
  const veg = likes.filter(l => VEG_LIKES.includes(l));
  return ok.slice(0, n).map((m, k) => veg.length && !m.sweet ? `${m.t}. Sneaky upgrade: add a handful of ${veg[k % veg.length]}, which you already like.` : m.t);
}

/* ---------- Ready / premade meals by market: generic types and store-level ranges only ---------- */
export const LABEL_GUIDE = [
  'Protein: aim for roughly 25g or more per meal.',
  'Calories: roughly 300 to 550 kcal for a main meal while you\'re in a gentle deficit.',
  'Salt: check the salt line. Ready meals can be high, so aim for green or amber on front-of-pack labels where shown.',
  'Check the label is for the whole pack, not "per 100g" or half a pack.',
  'Availability varies, so check labels. Ranges and recipes change.',
];
export const COUNTRIES = { UK: 'United Kingdom', IE: 'Ireland', US: 'United States', CA: 'Canada', AU: 'Australia', OTHER: 'Other / not listed' };
export const READY_MEALS = {
  UK: { stores: 'Supermarket "healthy" or calorie-counted ranges at stores such as Tesco, Sainsbury\'s, M&S and Aldi (and similar at Asda, Morrisons, Lidl and Co-op).', types: [
    'Chilled calorie-counted ready meals: chicken tikka or jalfrezi with rice, chilli con carne, or a lean beef or lentil cottage pie',
    'High-protein meal-deal style picks: chicken or egg sandwiches or wraps, protein pots (egg and spinach, chicken and quinoa)',
    'Fresh soups with lentils, chicken or beans, plus a wholemeal roll',
    'Chilled fish dishes (e.g. salmon with veg) or prawn and chicken stir-fry kits',
    'Pots of Greek-style yoghurt or skyr, and ready-cooked chicken pieces to add to a bagged salad',
  ] },
  IE: { stores: 'Supermarket own-brand healthy or "lighter" ranges at stores such as Tesco, Dunnes Stores, SuperValu, Aldi and Lidl.', types: [
    'Chilled calorie-counted ready meals: chicken curry with rice, lean lasagne, cottage pie',
    'Deli-counter or chilled high-protein salads and chicken wraps',
    'Fresh soups with lentils, chicken or beans',
    'Ready-cooked chicken, eggs or tuna pots to add to bagged salad',
  ] },
  US: { stores: 'Grocery-store frozen "lean" or "balanced" meal lines and fresh prepared-food counters at major supermarkets, warehouse clubs and pharmacies.', types: [
    'Frozen protein bowls: grilled chicken with rice and vegetables, turkey chili, burrito bowls with beans',
    'Fresh prepared-foods counter: rotisserie or grilled chicken, salad bowls, grain bowls',
    'Refrigerated high-protein snack packs: hard-boiled eggs, cheese, turkey; Greek yogurt or cottage cheese cups',
    'Ready-to-heat soups with chicken, lentils or beans (check the sodium)',
  ] },
  CA: { stores: 'Supermarket own-brand healthier frozen and fresh lines at major grocery chains, plus the prepared-foods counter.', types: [
    'Frozen balanced meals: chicken and vegetable rice bowls, turkey or bean chili',
    'Prepared-foods counter: grilled or rotisserie chicken, salads and grain bowls',
    'Greek yogurt, cottage cheese and hard-boiled egg packs',
    'Lentil, bean or chicken soups (check the sodium)',
  ] },
  AU: { stores: 'Supermarket fresh and frozen "healthy" or calorie-controlled ready-meal ranges at stores such as Woolworths, Coles and Aldi.', types: [
    'Fresh chilled ready meals: chicken with rice and veg, beef and broccoli, lean bolognese',
    'Frozen calorie-controlled meals with a protein focus',
    'Ready-cooked chicken, tinned tuna pouches, and high-protein yoghurt',
    'Soups with lentils, beans or chicken',
  ] },
  OTHER: { stores: 'Most supermarkets have a chilled or frozen "lighter" or "high-protein" ready-meal section and a prepared-foods counter.', types: [
    'Grilled or rotisserie chicken with a bag of salad or microwave veg',
    'Ready meals that are chicken, fish, lentil or bean based, with rice or veg',
    'Yoghurt, eggs, tuna or cheese as quick protein add-ons',
    'Lentil, bean or chicken soups',
  ] },
};
export function detectCountry(lang = (typeof navigator !== 'undefined' && navigator.language) || '', tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '') {
  const reg = (lang.split(/[-_]/)[1] || '').toUpperCase();
  if (/^Europe\/(London|Belfast)|^Europe\/(Jersey|Guernsey|Isle_of_Man)/.test(tz)) return 'UK';
  if (/^Europe\/Dublin/.test(tz)) return 'IE';
  if (/^Australia\//.test(tz)) return 'AU';
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Whitehorse|Yellowknife|Iqaluit)/.test(tz)) return 'CA';
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana|Kentucky|Boise)|^Pacific\/Honolulu/.test(tz)) return 'US';
  if (reg === 'GB') return 'UK';
  if (READY_MEALS[reg]) return reg;
  return 'OTHER';
}
export function readyMealTip(country, dislikes = []) { const c = READY_MEALS[country] || READY_MEALS.OTHER; const ty = filterByDislikes(c.types, parseList(dislikes))[0] || 'a chicken, bean or lentil based ready meal with veg'; return `Short on time? Try a ready meal: ${ty.charAt(0).toLowerCase() + ty.slice(1)}. Aim for about 25g+ protein and 300 to 550 kcal; availability varies, so check labels.`; }
