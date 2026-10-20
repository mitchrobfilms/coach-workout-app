// Steps: Health Connect (GLP1 Life Android app only, via Capacitor @capgo/capacitor-health) + manual entry.
// Read-only: we only read today's step count. Nothing is written to Health Connect.
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
