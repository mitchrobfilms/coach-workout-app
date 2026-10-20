// Unit tests: progress maths, backup/restore round-trip, GLP-1 builder protein target, offers parsing (saved fixtures).
import fs from 'node:fs';
import { summary, trend, milestones, bmi, stLb, chartSVG } from '../progress.js';
import { makeBackup, parseBackup, restoreInto, backupDue } from '../backup.js';
import { buildGlp1Plan, fitPortion, GLP1_RECIPES, packPrice } from '../glp1.js';
import { parseAldi, parseLidl, enrich, offersFor, isHighProtein, parseGrams, nutritionFor } from '../offers.js';
import { robotsAllows } from '../tools/fetch-offers-lib.mjs';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const D = n => new Date(Date.UTC(2026, 8, 1) + n * 864e5).toISOString();
const w = [{ date: D(0), kg: 100 }, { date: D(10), kg: 97 }, { date: D(23), kg: 95.5 }, { date: D(30), kg: 94 }, { date: D(37), kg: 92.5 }];
const s = summary(w, { goalKg: 80, heightCm: 180 });
ok(s.start === 100 && s.current === 92.5 && s.lost === 7.5 && s.pct === 7.5, 'start/current/lost/% lost');
ok(s.lostStLb.text === '1st 3lb', `kg -> st/lb (${s.lostStLb.text})`);
ok(s.trend7 === -1.5 && s.trend30 === -4.5, `7-day ${s.trend7} and 30-day ${s.trend30} trend`);
ok(s.bmi === 28.5 && bmi(80, 0) === null, 'BMI with height, null without');
ok(s.goal.pct === 38 && s.goal.toGo === 12.5, 'goal progress bar % and to-go');
ok(s.milestones.find(m => m.id === 'p5').done && !s.milestones.find(m => m.id === 'p10').done && s.milestones.find(m => m.id === 'st1').done && s.milestones.find(m => m.id === 'kg5').done, 'milestones 5%, 5 kg, 1 st reached; 10% not');
ok(summary([{ date: D(5), kg: 90 }, { date: D(0), kg: 92 }]).start === 92, 'unsorted entries sorted by date');
ok(trend([{ date: D(0), kg: 90 }, { date: D(2), kg: 89 }], 30) === null, 'no 30-day trend with only 2 days of data');
ok(summary([]) === null && chartSVG([]) === '', 'empty data safe');
ok(/<polyline/.test(chartSVG(w, { goalKg: 80 })) && /Goal/.test(chartSVG(w, { goalKg: 80 })), 'SVG chart with goal line');
ok(stLb(6.35029318).text === '1st 0lb', 'exactly 1 stone');
// backup round-trip
const src = { settings: { name: 'M', goalKg: 80 }, weights: w, sessions: [{ date: D(1), totals: { squats: 10 } }], food: { '2026-09-01': { score: 7 } } };
const b = makeBackup(k => src[k] ?? null, { now: new Date('2026-10-20T08:00:00Z') });
const parsed = parseBackup(JSON.stringify(b)); ok(!parsed.error, 'backup parses');
const dst = { weights: [{ date: D(37), kg: 92.5 }, { date: D(40), kg: 92 }] }; const get = k => dst[k] ?? null, set = (k, v) => { dst[k] = v; };
restoreInto(get, set, parsed.backup);
ok(dst.weights.length === 6 && dst.settings.goalKg === 80 && dst.sessions.length === 1 && dst.food['2026-09-01'].score === 7, 'restore merges weigh-ins (no duplicates) and restores the rest');
ok(parseBackup('nope').error && parseBackup('{"app":"other"}').error && parseBackup({ app: 'reta-coach', version: 99, data: {} }).error, 'bad backups rejected');
ok(backupDue(null) && !backupDue(new Date().toISOString()) && backupDue(new Date(Date.now() - 15 * 864e5).toISOString()) && !backupDue(null, Date.now(), false), 'backup reminder every 2 weeks, only with data');
// GLP-1 builder
const prices = JSON.parse(fs.readFileSync('../tests/fixtures/prices.json', 'utf8'));
for (const store of ['aldi', 'lidl', 'asda', 'mix']) for (const protein of [25, 30, 35, 40]) for (const meals of [2, 3, 4]) {
  const p = buildGlp1Plan({ store, protein, meals, days: 4, prices });
  const bad = p.plan.filter(x => x.protein < x.target - 3 || x.protein > x.target + 12);
  if (bad.length || !(p.total > 0)) ok(false, `${store} ${protein}g ${meals} meals: ${bad.map(x => x.recipe.id + ' ' + x.protein).join(', ')} total ${p.total}`);
}
ok(true, 'builder hits protein target (±3 g) for every store × 25–40 g × 2–4 meals');
const f = buildGlp1Plan({ fussy: true, days: 3, protein: 30 }); ok(f.plan.every(x => x.recipe.fussy), 'fussy toggle only picks fussy-friendly recipes');
const gtl = buildGlp1Plan({ gentle: true, days: 7, meals: 3 }); ok(gtl.plan.every(x => x.recipe.gentle), 'queasy toggle picks gentle recipes');
ok(gtl.plan.filter(x => x.slot === 'lunch').reduce((a, x) => a + x.portions, 0) === 7, '7 days -> 7 lunch portions across fridge-safe batches');
const lidlChicken = packPrice('chicken', 'lidl', { items: [{ key: 'chicken', offers: { lidl: { price: 3.0, grams: 1000, name: 'Chicken breast fillets' } } }] });
ok(lidlChicken.offer && lidlChicken.per === 0.003, 'live offer preferred when cheaper per gram');
const pref = buildGlp1Plan({ store: 'aldi', meals: 3, prefer: ['salmon'] }); ok(pref.plan.some(x => x.recipe.core === 'salmon'), 'Use-in-meal-plan item is preferred');
ok(JSON.stringify(f).match(/dose|dosing|mg\b/i) === null || /not medical or dosing|Ask your prescriber/.test(JSON.stringify(f)), 'no dosing advice in builder output');
// offers parsing (saved fixtures)
const aldi = enrich(parseAldi(fs.readFileSync('../tests/fixtures/aldi-weekly.html', 'utf8')));
ok(aldi.length >= 10, `Aldi weekly parsed (${aldi.length})`);
const mince = aldi.find(o => /Beef and Pork Mince XXL/.test(o.name));
ok(mince && mince.price === 4.99 && mince.was === 5.69 && mince.perKg === 4.99 && /Save 12%/.test(mince.promo) && /aldi\.co\.uk\/product\//.test(mince.url), 'Aldi tile: price, was, per kg, promo, URL');
const six = parseAldi(fs.readFileSync('../tests/fixtures/aldi-super-6.html', 'utf8')); ok(six.find(o => o.name === 'Carrots')?.price === 0.49, 'Aldi Super Six: Carrots 49p');
const lidl = enrich(parseLidl(fs.readFileSync('../tests/fixtures/lidl-pick.html', 'utf8')));
const salmon = lidl.find(o => /Salmon/.test(o.name));
ok(lidl.length >= 10 && salmon && salmon.price === 8.99 && salmon.perKg === 13.62 && salmon.from && salmon.to && salmon.protein === 20, 'Lidl: price, per kg, valid dates, protein');
ok(lidl.find(o => o.name === 'Pomegranate')?.was === 1.29, 'Lidl Plus price with regular (was) price');
ok(offersFor({ stores: { aldi: { items: aldi }, lidl: { items: lidl } } }, { highProtein: true }).every(isHighProtein), 'high-protein filter (10 g+/100 g)');
ok(nutritionFor('Milk Chocolate Seal Biscuit Bars') === null && nutritionFor('Chicken Breast Fillets').protein === 24 && nutritionFor('XXL Caramelised Onion Sausages').tag === 'processed', 'nutrition table');
ok(parseGrams('6 x 110g') === 660 && parseGrams('2.5kg') === 2500 && parseGrams('1 Each') === null, 'pack size parsing');
ok(robotsAllows('User-agent: *\nDisallow: /results$\nDisallow: /*?page=', '/super-6') && !robotsAllows('User-agent: *\nDisallow: /1*', '/1abc') && !robotsAllows('User-agent: *\nDisallow: /', '/x'), 'robots.txt rules respected');
console.log(fail ? `${fail} FAILED` : 'ALL PROGRESS/BACKUP/GLP1/OFFERS UNIT TESTS PASSED'); process.exitCode = fail ? 1 : 0;
