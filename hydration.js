// Hydration in millilitres. Old data stored glasses (x.water, 0-8); 1 glass = 250 ml.
export const GLASS_ML = 250, STEP_ML = 500, DEFAULT_GOAL_ML = 2500, ML_PER_PINT = 568.261, ML_PER_FLOZ = 28.4131; // UK pint / fl oz
export const waterMl = day => !day ? 0 : Number.isFinite(day.waterMl) ? day.waterMl : (day.water || 0) * GLASS_ML;
export function migrateDaily(daily) { let n = 0; for (const v of Object.values(daily || {})) if (v && !Number.isFinite(v.waterMl) && v.water) { v.waterMl = v.water * GLASS_ML; n++; } return n; }
export function addWater(day, delta) { const ml = Math.max(0, Math.min(10000, waterMl(day) + delta)); day.waterMl = ml; day.water = Math.round(ml / GLASS_ML); return ml; }
export const litres = ml => `${(Math.round(ml / 100) / 10).toFixed(1)}`;
export const imperial = ml => `${(ml / ML_PER_PINT).toFixed(1)} pints · ${Math.round(ml / ML_PER_FLOZ)} fl oz`;
