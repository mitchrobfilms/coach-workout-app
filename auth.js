// Pluggable auth. The app only uses this interface:
//   signUp({ name, email, secret }) -> user     signIn({ email, secret }) -> user
//   signOut()                                   currentUser() -> user | null  (sync)
//   listAccounts() -> [{ id, name, email }]     resetAccount(id)  (wipes that account + its data)
//   dataPrefix(user) -> localStorage key prefix for that user's data
// Default: LocalAuth, phone-only accounts. Nothing leaves the device. A FirebaseAuth with the same
// shape can replace it later (setAuthProvider(new FirebaseAuth(...))).
const ACC = 'kova.auth.accounts', CUR = 'kova.auth.current';
const ITER = 150000;
const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function hashSecret(secret, saltB64, iterations = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations }, key, 256);
  return b64(bits);
}
const sameStr = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
export const normEmail = e => String(e || '').trim().toLowerCase();
export function validate({ name, email, secret }) {
  if (!String(name || '').trim()) return 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(email))) return 'Please enter a valid email address.';
  const s = String(secret || '');
  if (!/^\d{4}$/.test(s) && s.length < 8) return 'Use a 4-digit PIN or a password of at least 8 characters.';
  return null;
}
export class LocalAuth {
  constructor(storage = globalThis.localStorage) { this.s = storage; }
  _all() { try { return JSON.parse(this.s.getItem(ACC)) || []; } catch { return []; } }
  _save(a) { this.s.setItem(ACC, JSON.stringify(a)); }
  _pub(a) { return a && { id: a.id, name: a.name, email: a.email, kind: a.kind, created: a.created }; }
  listAccounts() { return this._all().map(a => this._pub(a)); }
  currentUser() { const id = this.s.getItem(CUR); return this._pub(this._all().find(a => a.id === id)) || null; }
  dataPrefix(user = this.currentUser()) { return user ? `kova.u.${user.id}.` : 'kova.'; }
  async signUp({ name, email, secret }) {
    const err = validate({ name, email, secret }); if (err) throw new Error(err);
    const all = this._all(); email = normEmail(email);
    if (all.some(a => a.email === email)) throw new Error('There\'s already an account with that email on this phone. Log in instead.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const acc = { id: crypto.randomUUID ? crypto.randomUUID() : b64(crypto.getRandomValues(new Uint8Array(12))).replace(/[^a-z0-9]/gi, ''), name: name.trim(), email, salt, iter: ITER, hash: await hashSecret(String(secret), salt), kind: /^\d{4}$/.test(secret) ? 'pin' : 'password', created: new Date().toISOString() };
    all.push(acc); this._save(all);
    if (all.length === 1) this._migrateLegacy(acc); // data saved before accounts existed belongs to the first account
    this.s.setItem(CUR, acc.id); return this._pub(acc);
  }
  async signIn({ email, secret }) {
    const acc = this._all().find(a => a.email === normEmail(email));
    if (!acc || !sameStr(await hashSecret(String(secret || ''), acc.salt, acc.iter), acc.hash)) throw new Error('That email and PIN/password don\'t match.');
    this.s.setItem(CUR, acc.id); return this._pub(acc);
  }
  signOut() { this.s.removeItem(CUR); }
  resetAccount(id) { // "Forgot PIN": there's no server to verify you, so the account and its data are wiped
    const p = `kova.u.${id}.`;
    for (let i = this.s.length - 1; i >= 0; i--) { const k = this.s.key(i); if (k && k.startsWith(p)) this.s.removeItem(k); }
    this._save(this._all().filter(a => a.id !== id));
    if (this.s.getItem(CUR) === id) this.s.removeItem(CUR);
  }
  _migrateLegacy(acc) {
    for (const k of ['settings', 'sessions', 'food', 'weights']) { const v = this.s.getItem('kova.' + k); if (v != null) { this.s.setItem(`kova.u.${acc.id}.${k}`, v); this.s.removeItem('kova.' + k); } }
  }
}
let provider = null;
export function getAuth() { return provider ||= new LocalAuth(); }
export function setAuthProvider(p) { provider = p; }
