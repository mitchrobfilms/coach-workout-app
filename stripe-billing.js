// Stripe scaffolding. Checkout is not called. Live keys are refused.
// Signature check follows Stripe's signed webhook scheme: HMAC-SHA256 over `${t}.${payload}`, v1 only, 5 minute tolerance.
const enc = new TextEncoder();

function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifyStripeSignature({ payload, header, secret, now = Date.now(), toleranceSec = 300 } = {}) {
  if (!secret) return { ok: false, reason: 'not_configured' };
  if (secret.startsWith('sk_')) return { ok: false, reason: 'wrong_secret_kind' };
  if (!header || payload == null) return { ok: false, reason: 'missing' };
  const bits = String(header).split(',').map(s => s.trim());
  const t = bits.find(s => s.startsWith('t='))?.slice(2);
  const sigs = bits.filter(s => s.startsWith('v1=')).map(s => s.slice(3));
  if (!t || !sigs.length || !/^\d+$/.test(t)) return { ok: false, reason: 'malformed' };
  const age = Math.abs(now / 1000 - Number(t));
  if (age > toleranceSec) return { ok: false, reason: 'stale' };
  const mac = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some(s => sameHex(s, mac)) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

// A browser success redirect is not an event and never grants access.
export function entitlementFromStripeEvent(event, allowedPriceIds = []) {
  if (!event || !event.id || !event.type) return { action: 'ignore', reason: 'not_an_event' };
  if (event.type === 'checkout.session.completed') return { action: 'ignore', reason: 'session_completed_is_not_enough' };
  if (!allowedPriceIds.length) return { action: 'ignore', reason: 'no_price_allowlist' };
  const obj = event.data?.object || {};
  if (event.type === 'customer.subscription.deleted') {
    return priceAllowed(obj, allowedPriceIds) ? { action: 'revoke', source: 'stripe', eventId: event.id } : { action: 'ignore', reason: 'price' };
  }
  if (event.type === 'customer.subscription.updated') {
    const status = obj.status;
    if (!priceAllowed(obj, allowedPriceIds)) return { action: 'ignore', reason: 'price' };
    if (status === 'active' || status === 'trialing') return { action: 'grant', source: 'stripe', eventId: event.id, status, endsAt: periodEnd(obj) };
    if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') return { action: 'revoke', source: 'stripe', eventId: event.id, status };
    return { action: 'pending', source: 'stripe', eventId: event.id, status: status || 'unknown' };
  }
  if (event.type === 'invoice.paid') {
    if (!obj.subscription) return { action: 'ignore', reason: 'not_a_subscription_invoice' };
    if (!priceAllowed(obj, allowedPriceIds)) return { action: 'ignore', reason: 'price' };
    return { action: 'grant', source: 'stripe', eventId: event.id, status: 'active' };
  }
  return { action: 'ignore', reason: 'unhandled' };
}

function priceAllowed(obj, allowed) {
  const ids = [];
  const item = obj.items?.data?.[0]?.price?.id || obj.lines?.data?.[0]?.price?.id;
  if (item) ids.push(item);
  if (obj.price?.id) ids.push(obj.price.id);
  return ids.some(id => allowed.includes(id));
}
function periodEnd(obj) {
  const end = obj.current_period_end;
  return typeof end === 'number' ? new Date(end * 1000).toISOString() : null;
}

// Sandbox only. A live secret is refused. Missing pieces stay disabled. This does not call Stripe.
export function stripeCheckoutStatus(env = {}) {
  const key = env.STRIPE_SECRET_KEY || '';
  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PREMIUM'].filter(k => !env[k]);
  const live = key.startsWith('sk_live_');
  const test = key.startsWith('sk_test_');
  const enabled = env.STRIPE_CHECKOUT_ENABLED === 'true';
  if (live) return { checkout: 'disabled', reason: 'live_key_refused', missing, sandbox: false };
  if (!enabled || !test || missing.length) return { checkout: 'disabled', reason: 'sandbox_not_configured', missing, sandbox: test };
  return { checkout: 'disabled', reason: 'not_activated_in_this_build', missing, sandbox: true };
}
