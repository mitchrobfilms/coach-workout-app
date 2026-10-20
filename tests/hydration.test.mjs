import { waterMl, migrateDaily, addWater, litres, imperial } from '../hydration.js';
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${a} !== ${b}`); console.log('ok', m); };
const d = { '2026-10-19': { water: 6 }, '2026-10-20': { waterMl: 1000 } };
eq(migrateDaily(d), 1, 'migrates one old day'); eq(d['2026-10-19'].waterMl, 1500, '6 glasses -> 1500 ml'); eq(migrateDaily(d), 0, 'idempotent');
const t = {}; eq(addWater(t, 500), 500, '+500'); eq(addWater(t, 500), 1000, '+500 again'); eq(addWater(t, -500), 500, '-500 undo'); eq(addWater(t, -500), 0, 'floor'); eq(addWater(t, -500), 0, 'never negative');
eq(t.water, 0, 'glasses mirror'); eq(waterMl({ water: 2 }), 500, 'legacy read');
eq(litres(1500), '1.5', 'litres'); eq(imperial(2500), '4.4 pints · 88 fl oz', 'pints/fl oz');
console.log('ALL HYDRATION TESTS PASSED');
