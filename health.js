// Steps: Health Connect (GLP1 Life Android app only, via Capacitor @capgo/capacitor-health) + manual entry.
// Writing a workout is behind healthConnectWrite and is off unless that flag is set. The default Android build
// still removes every health permission except READ_STEPS. See docs/fitness-studio.md.
import { healthWritePlan } from './fitness-core.js';
const HC = () => window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.Health;
export const healthConnectAvailable = async () => { const h = HC(); if (!h) return false; try { return !!(await h.isAvailable()).available; } catch { return false; } };
export async function healthConnectSteps(day = new Date()) {
  const h = HC(); if (!h) throw new Error('Health Connect needs the GLP1 Life Android app');
  await h.requestAuthorization({ read: ['steps'], write: [] });
  const s = new Date(day); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(e.getDate() + 1);
  // Aggregated sum: Health Connect de-duplicates overlapping sources (phone + watch).
  const { samples = [] } = await h.queryAggregated({ dataType: 'steps', startDate: s.toISOString(), endDate: (e > new Date() ? new Date() : e).toISOString(), bucket: 'day', aggregation: 'sum' });
  return Math.round(samples.reduce((a, x) => a + (+x.value || 0), 0));
}
// Writes only when `enabled` is true. @capgo/capacitor-health 8 can save a calorie sample. It cannot insert an
// exercise session unless a plugin method named saveWorkout is present. This function does not invent either.
export async function writeWorkoutSample(entry, { enabled = false } = {}) {
  const h = HC();
  const plan = healthWritePlan({ enabled: !!enabled, native: !!h, canSaveWorkout: typeof h?.saveWorkout === 'function', canSaveSample: typeof h?.saveSample === 'function' });
  if (!plan.call) return plan;
  const kcal = Math.max(1, Math.round(Number(entry?.kcal) || 0));
  const startDate = entry?.start || new Date(Date.now() - (entry?.minutes || 10) * 60000).toISOString();
  const endDate = entry?.end || new Date().toISOString();
  await h.requestAuthorization?.({ read: ['steps'], write: plan.call === 'saveWorkout' ? ['workouts'] : ['calories'] });
  if (plan.call === 'saveWorkout') await h.saveWorkout({ activityType: 'other', startDate, endDate, calories: kcal, metadata: { title: String(entry?.title || 'GLP1 Life'), source: 'GLP1 Life' } });
  else await h.saveSample({ dataType: 'calories', value: kcal, unit: 'kilocalorie', startDate, endDate, metadata: { title: String(entry?.title || 'GLP1 Life'), source: 'GLP1 Life' } });
  return plan;
}
