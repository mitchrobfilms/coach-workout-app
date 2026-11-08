// Platform-aware payment surface. Nothing here starts a charge.
import { playConfigStatus } from './play-billing-core.js';
import { stripeCheckoutStatus } from './stripe-billing.js';

const native = () => !!window.Capacitor?.isNativePlatform?.();

export function distribution() {
  return native() ? 'play' : 'web';
}

export function describeSurface(isNative, { plugin = false, env = {} } = {}) {
  if (isNative) {
    const play = playConfigStatus(env);
    return { provider: 'google_play', checkout: 'disabled', stripeLink: false, plugin, reason: plugin ? play.reason : 'Play Billing plugin is not in this Android shell yet.' };
  }
  const stripe = stripeCheckoutStatus(env);
  return { provider: 'stripe', checkout: 'disabled', stripeLink: false, reason: stripe.reason, sandbox: stripe.sandbox, liveRefused: stripe.reason === 'live_key_refused' };
}

export function paymentSurface() {
  return describeSurface(native(), { plugin: !!window.Capacitor?.Plugins?.PlayBilling });
}

// The shell does not include a billing plugin. This never reports a successful purchase.
export async function startPlatformPurchase() {
  return { ok: false, reason: 'not_configured', provider: distribution() };
}
