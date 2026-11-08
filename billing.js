// Website payments are Stripe. The Play app uses standard Google Play Billing.
// Neither path starts a charge until its own server configuration exists.
import { playConfigStatus } from './play-billing-core.js';
import { stripeCheckoutStatus } from './stripe-billing.js';
import { realEntitlement } from './membership-core.js';

const native = () => !!window.Capacitor?.isNativePlatform?.();
const plugin = () => window.Capacitor?.Plugins?.PlayBilling || null;

export function distribution() {
  return native() ? 'play' : 'web';
}

export function describeSurface(isNative, { configured = false, entitled = null, env = {} } = {}) {
  if (!isNative) {
    const stripe = stripeCheckoutStatus(env);
    return { provider: 'stripe', checkout: 'disabled', stripeLink: false, playBilling: 'not_used', reason: stripe.reason, sandbox: stripe.sandbox, liveRefused: stripe.reason === 'live_key_refused' };
  }
  const active = realEntitlement(entitled);
  if (active) return { provider: 'google_play', checkout: 'already_entitled', playBilling: 'standard', stripeLink: false, source: active.kind, reason: 'This account already has membership. A second subscription is not offered.' };
  const play = playConfigStatus(env);
  if (!configured && play.checkout !== 'ready') {
    return { provider: 'google_play', checkout: 'not_configured', playBilling: 'standard', stripeLink: false, reason: 'Google Play Billing is the payment method for this install. Purchases stay unavailable until the Console subscription id and the server credentials are set.' };
  }
  return { provider: 'google_play', checkout: 'ready', playBilling: 'standard', stripeLink: false, reason: 'Google Play can start a subscription. Access is granted only after this app\'s server verifies the purchase with Google.' };
}

export function paymentSurface(extra = {}) {
  return describeSurface(native(), extra);
}

// Sends the purchase token to the caller-supplied verifier. This function never grants access.
export async function startPlatformPurchase({ productId = '', basePlanId = '', userId = '', verify } = {}) {
  if (!native()) return { ok: false, granted: false, reason: 'web_uses_stripe', provider: 'stripe' };
  const play = plugin();
  if (!play?.purchase) return { ok: false, granted: false, reason: 'plugin_missing', provider: 'google_play' };
  if (!productId || !userId) return { ok: false, granted: false, reason: 'not_configured', provider: 'google_play' };
  const result = await play.purchase({ productId, basePlanId, obfuscatedAccountId: userId });
  if (result?.pending || result?.purchaseState === 'PENDING') return { ok: false, granted: false, reason: 'pending', fixture: result?.fixture === true, provider: 'google_play' };
  if (result?.fixture === true) return { ok: false, granted: false, reason: 'fixture', provider: 'google_play' };
  if (result?.cancelled) return { ok: false, granted: false, reason: 'cancelled', provider: 'google_play' };
  if (!result?.purchaseToken) return { ok: false, granted: false, reason: 'no_token', provider: 'google_play' };
  if (typeof verify !== 'function') return { ok: false, granted: false, reason: 'server_required', provider: 'google_play', purchaseToken: result.purchaseToken };
  const checked = await verify(result.purchaseToken);
  return { ...checked, granted: checked?.granted === true && checked?.fixture !== true, provider: 'google_play' };
}

export async function restorePlatformPurchases({ verify } = {}) {
  if (!native()) return { ok: false, granted: false, reason: 'web_uses_stripe', provider: 'stripe' };
  const play = plugin();
  if (!play?.restore) return { ok: false, granted: false, reason: 'plugin_missing', provider: 'google_play' };
  const result = await play.restore();
  const tokens = (result?.purchaseTokens || []).filter(Boolean);
  if (!tokens.length) return { ok: false, granted: false, reason: 'nothing_to_restore', provider: 'google_play' };
  if (typeof verify !== 'function') return { ok: false, granted: false, reason: 'server_required', provider: 'google_play' };
  const checks = [];
  for (const token of tokens) checks.push(await verify(token));
  return { ok: checks.some(c => c?.granted === true && c?.fixture !== true), granted: checks.some(c => c?.granted === true && c?.fixture !== true), provider: 'google_play', checks };
}
