// Injection log (LOG ONLY). The app never suggests, calculates, converts or validates doses: the dose is stored exactly as typed.
export const DISCLAIMER = 'Log only. Follow your prescriber\'s instructions. This app does not give dosing advice.';
export const MEDS = ['Retatrutide', 'Semaglutide', 'Tirzepatide', 'Liraglutide', 'Other'];
export const UNITS = ['mg', 'mcg', 'mL'];
export const SITES = ['Abdomen left', 'Abdomen right', 'Thigh left', 'Thigh right', 'Arm left', 'Arm right'];
export const EFFECTS = ['Nausea', 'Low appetite', 'Fatigue', 'Injection-site reaction', 'Other'];
const DAY = 864e5, WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const sortInj = l => (l || []).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
export function makeEntry({ med, custom = '', dose = '', unit = 'mg', at, site = '', effects = [], notes = '' }) {
  return { id: `${Date.parse(at)}-${Math.random().toString(36).slice(2, 7)}`, med: med === 'Other' && custom.trim() ? custom.trim() : med, dose: String(dose).trim(), unit, at: new Date(at).toISOString(), site, effects: effects.slice(), notes: String(notes).trim() };
}
export function lastSite(list) { const l = sortInj(list).filter(e => e.site); return l.length ? l[l.length - 1].site : null; }
// Schedule: { type: 'weekly', weekday: 0-6, time: 'HH:MM' } | { type: 'every', days: N, time: 'HH:MM' }. Times are local.
export function nextDue(schedule, list, now = new Date()) {
  if (!schedule?.type) return null;
  const [h, m] = String(schedule.time || '09:00').split(':').map(Number), last = sortInj(list).slice(-1)[0];
  if (schedule.type === 'weekly') { // first matching weekday/time not already covered by a log (within 2 days)
    const from = last ? Math.max(Date.parse(last.at) + 2 * DAY, now - 6 * DAY) : now - 12 * 36e5;
    const d = new Date(from); d.setHours(h, m, 0, 0); while (d.getDay() !== +schedule.weekday || d < from) { d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); }
    return d;
  }
  const n = Math.max(1, Math.round(+schedule.days || 7)), d = last ? new Date(last.at) : new Date(now);
  if (last) d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d;
}
export const isDue = (schedule, list, now = new Date()) => { const d = nextDue(schedule, list, now); return !!d && d <= now; };
export function describeSchedule(s) { if (!s?.type) return 'No reminder set'; return s.type === 'weekly' ? `Every ${WD[s.weekday]} at ${s.time}` : `Every ${s.days} day${s.days == 1 ? '' : 's'} at ${s.time}`; }
// Recurring calendar event (.ics). The reliable reminder on Android: the calendar app alerts even when Chrome is closed.
export function makeICS(schedule, start = new Date(), uid = 'reta-inject@reta-coach') {
  const [h, m] = schedule.time.split(':').map(Number), d = new Date(start); d.setHours(h, m, 0, 0);
  if (schedule.type === 'weekly') { d.setDate(d.getDate() + (schedule.weekday - d.getDay() + 7) % 7); }
  const p = n => String(n).padStart(2, '0'), local = x => `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}T${p(x.getHours())}${p(x.getMinutes())}00`;
  const rule = schedule.type === 'weekly' ? `RRULE:FREQ=WEEKLY;BYDAY=${['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][schedule.weekday]}` : `RRULE:FREQ=DAILY;INTERVAL=${Math.max(1, Math.round(+schedule.days))}`;
  const end = new Date(d.getTime() + 15 * 60e3), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Reta Coach//Injection reminder//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${local(d)}`, `DTEND:${local(end)}`, rule,
    'SUMMARY:Injection reminder (Reta Coach)', `DESCRIPTION:${DISCLAIMER.replace(/,/g, '\\,')} Log it in Reta Coach.`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Injection reminder', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
