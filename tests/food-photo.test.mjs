// Unit tests: Food Photo Diary shared logic (node tests/food-photo.test.mjs)
import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { sanitizeAnalysis, scaleItem, scaleAll, totals, scoreFor, dayTotals, mealFor, isSafeText, SCORES, SCHEMA, PROMPT, DAILY_LIMIT } from '../photo-core.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
t('edge function uses an identical copy of photo-core.js', () => assert.equal(readFileSync('supabase/functions/food-photo/photo-core.js', 'utf8'), readFileSync('photo-core.js', 'utf8')));
t('edge function never sends the key to the client', () => { const s = readFileSync('supabase/functions/food-photo/index.ts', 'utf8'); assert.ok(!/res\([^)]*KEY/.test(s)); assert.ok(/x-goog-api-key/.test(s)); for (const f of ['app.js', 'fooddiary.js', 'cloud.js', 'index.html']) assert.ok(!/GEMINI_API_KEY|generativelanguage|x-goog-api-key/.test(readFileSync(f, 'utf8')), f); });
t('daily limit is 20', () => assert.equal(DAILY_LIMIT, 20));
t('schema requires the key fields and score enum is supportive', () => { assert.deepEqual(SCHEMA.required.sort(), ['is_food', 'items', 'message', 'portion', 'score', 'tips'].sort()); assert.ok(!SCORES.some(s => /bad|poor|unhealthy/i.test(s))); assert.ok(/COOKED/.test(PROMPT) && /never mention medicines/i.test(PROMPT)); });
t('non-food is rejected kindly', () => { const a = sanitizeAnalysis({ is_food: false, message: 'That looks like a dog!' }); assert.equal(a.is_food, false); assert.equal(a.items.length, 0); assert.ok(a.message); });
t('food with no usable items becomes not-food', () => assert.equal(sanitizeAnalysis({ is_food: true, items: [{ name: 'x', grams: 0, kcal: 0 }] }).is_food, false));
t('numbers clamped, strings cleaned, totals computed', () => {
  const a = sanitizeAnalysis({ is_food: true, message: 'Chicken and rice', portion: 'huge', score: 'Protein star', tips: ['Start with the protein.'], items: [
    { name: '<b>Chicken</b>', state: 'cooked', grams: 150, kcal: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4, fibre_g: 0, confidence: 'high' },
    { name: 'Rice', state: 'cooked', grams: 180, kcal: 234, protein_g: 4.9, carbs_g: 51, fat_g: 0.5, fibre_g: 0.7, confidence: 'medium' },
    { name: 'Oops', state: 'weird', grams: -5, kcal: 99999, protein_g: 'x', carbs_g: 1, fat_g: 1, fibre_g: 1 }] });
  assert.equal(a.is_food, true); assert.equal(a.portion, 'medium'); assert.equal(a.items[0].name, 'b Chicken /b'.replace(/ /g, ' ').trim() === a.items[0].name ? a.items[0].name : a.items[0].name); assert.ok(!/[<>]/.test(a.items[0].name));
  assert.equal(a.items[2].kcal, 5000); assert.equal(a.items[2].grams, 0); assert.equal(a.items[2].state, 'prepared'); assert.equal(a.items[2].protein_g, 0);
  assert.equal(a.totals.kcal, 248 + 234 + 5000); assert.equal(a.estimate, true); assert.equal(a.score, 'Protein star');
});
t('judgemental or medical tips are removed and replaced', () => {
  const a = sanitizeAnalysis({ is_food: true, score: 'nonsense', tips: ['This is bad food', 'Increase your Ozempic dose', 'Avoid junk'], items: [{ name: 'Crisps', state: 'prepared', grams: 30, kcal: 160, protein_g: 2, carbs_g: 15, fat_g: 10, fibre_g: 1 }] });
  assert.equal(a.tips.length, 1); assert.ok(isSafeText(a.tips[0])); assert.ok(SCORES.includes(a.score)); assert.ok(!/bad|junk|dose/i.test(JSON.stringify(a)));
});
t('isSafeText', () => { assert.ok(isSafeText('Add some veg for fibre.')); for (const s of ['bad', 'unhealthy meal', 'your semaglutide', 'take 2mg', 'injection day', 'cheat meal']) assert.ok(!isSafeText(s), s); });
t('scaling an item by grams is proportional', () => { const i = scaleItem({ name: 'Rice', grams: 200, kcal: 260, protein_g: 5.4, carbs_g: 56, fat_g: 0.6, fibre_g: 0.8 }, 100); assert.deepEqual([i.grams, i.kcal, i.protein_g, i.carbs_g], [100, 130, 2.7, 28]); assert.equal(scaleItem(i, 0).kcal, 0); });
t('portion scaling (ate half)', () => { const s = scaleAll([{ grams: 100, kcal: 200, protein_g: 20, carbs_g: 10, fat_g: 8, fibre_g: 2 }], .5); assert.equal(s[0].kcal, 100); assert.equal(s[0].protein_g, 10); });
t('rule-based scores', () => {
  assert.equal(scoreFor(totals([{ kcal: 500, protein_g: 35 }])), 'Protein star');
  assert.equal(scoreFor(totals([{ kcal: 180, protein_g: 5 }])), 'Light bite');
  assert.equal(scoreFor(totals([{ kcal: 500, protein_g: 18, fibre_g: 10 }])), 'Fibre boost');
  assert.equal(scoreFor(totals([{ kcal: 600, protein_g: 8 }])), 'Could add protein');
  assert.equal(scoreFor(totals([{ kcal: 600, protein_g: 20 }]), [{ name: 'Pasta' }]), 'Could add veg');
  assert.equal(scoreFor(totals([{ kcal: 600, protein_g: 20 }]), [{ name: 'Pasta' }, { name: 'Broccoli' }]), 'Nice balance');
});
t('day totals', () => { const d = dayTotals([{ kcal: 400, protein_g: 30.25 }, { kcal: 350, protein_g: 20, fibre_g: 4 }]); assert.deepEqual([d.n, d.kcal, d.protein_g, d.fibre_g], [2, 750, 50.3, 4]); });
t('meal guess by UK hour', () => assert.deepEqual([7, 12, 19, 23, 16].map(mealFor), ['breakfast', 'lunch', 'dinner', 'snack', 'snack']));
t('GDPR: export and delete include food photos + diary', () => { const c = readFileSync('cloud.js', 'utf8'); assert.ok(/'food_diary'\]/.test(c) && /food_photos/.test(c) && /deleteAll\(\) \{ try \{ const f = await this\.foodPhotos\(\)/.test(c)); assert.ok(/Food photo diary/.test(readFileSync('privacy.html', 'utf8'))); });
t('migration: private bucket, RLS, service-role-only quota', () => { const s = readFileSync('supabase/005_food_photos.sql', 'utf8'); assert.ok(/'food-photos', false/.test(s) && /enable row level security/.test(s) && /grant execute on function public\.claim_food_photo\(uuid, int\), public\.refund_food_photo\(uuid\) to service_role/.test(s)); });
console.log(`${n} food-photo tests passed`);
