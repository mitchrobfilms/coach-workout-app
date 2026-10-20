// shared WhatsApp number normaliser (UK 07… → 447…)
export function normWa(v) { let d = String(v || '').replace(/[^\d+]/g, ''); if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '44' + d.slice(1); return /^\d{8,15}$/.test(d) ? d : null; }
