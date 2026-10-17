// Weight entry parsing. Accepts "85", "85.5", "85,5", "85 kg", "190lb", "13st 4lb", "13 stone 4", "13st".
// Bare numbers use `unit` (kg | lb | st). Returns { kg } or { error }.
export const KG_PER_LB = 0.45359237, KG_PER_ST = 6.35029318;
export const MIN_KG = 25, MAX_KG = 350;
export function parseWeight(input, unit = 'kg') {
  let s = String(input ?? '').trim().toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ');
  if (!s) return { error: 'Please enter your weight.' };
  let kg = null;
  const num = '(\\d+(?:\\.\\d+)?)';
  let m;
  if ((m = s.match(new RegExp(`^${num} ?(?:st|stone|stones)\\b ?(?:and )?(?:${num} ?(?:lb|lbs|pounds?)?)?$`)))) kg = +m[1] * KG_PER_ST + (m[2] ? +m[2] * KG_PER_LB : 0);
  else if ((m = s.match(new RegExp(`^${num} ?(?:kg|kgs|kilo|kilos|kilograms?)$`)))) kg = +m[1];
  else if ((m = s.match(new RegExp(`^${num} ?(?:lb|lbs|pounds?)$`)))) kg = +m[1] * KG_PER_LB;
  else if ((m = s.match(new RegExp(`^${num}$`)))) kg = unit === 'lb' ? +m[1] * KG_PER_LB : unit === 'st' ? +m[1] * KG_PER_ST : +m[1];
  else if ((m = s.match(/^(\d+) (\d+(?:\.\d+)?)$/)) && unit === 'st') kg = +m[1] * KG_PER_ST + +m[2] * KG_PER_LB; // "13 4" in stone mode
  if (kg == null || !isFinite(kg)) return { error: 'I couldn\'t read that. Try 85, 85.5, 190 lb or 13st 4lb.' };
  if (kg < MIN_KG || kg > MAX_KG) return { error: `That looks out of range (${kg.toFixed(1)} kg). Check the number and the unit.` };
  return { kg: Math.round(kg * 10) / 10 };
}
export function fmtWeight(kg, unit = 'kg') {
  if (unit === 'lb') return `${(kg / KG_PER_LB).toFixed(1)} lb`;
  if (unit === 'st') { const lb = kg / KG_PER_LB; let st = Math.floor(lb / 14), r = Math.round(lb - st * 14); if (r === 14) { st++; r = 0; } return `${st}st ${r}lb`; }
  return `${kg.toFixed(1)} kg`;
}
