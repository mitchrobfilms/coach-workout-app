// Google Play Billing decisions. A client receipt is never enough.
// States follow Play Developer API subscriptionsv2 (fetched 2026-11-08).

const ENTITLED = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);
const UNTIL_EXPIRY = new Set(['SUBSCRIPTION_STATE_CANCELED']);
const DENY = new Set([
  'SUBSCRIPTION_STATE_UNSPECIFIED', 'SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_PAUSED',
  'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
]);

export function interpretPlaySubscription(resource, { now = new Date(), packageName = '', productId = '' } = {}) {
  if (!resource || resource.clientReceiptOnly) return { action: 'deny', reason: 'client_receipt_not_accepted' };
  if (!resource.purchaseToken) return { action: 'deny', reason: 'missing_token' };
  if (packageName && resource.packageName && resource.packageName !== packageName) return { action: 'deny', reason: 'package' };
  if (productId && resource.productId && resource.productId !== productId) return { action: 'deny', reason: 'product' };
  if (resource.revoked || resource.refunded || resource.voided) return { action: 'revoke', reason: 'revoked', token: resource.purchaseToken };
  const state = resource.subscriptionState || '';
  const expiry = resource.expiryTime ? new Date(resource.expiryTime) : null;
  const pendingAck = resource.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING';
  if (state === 'SUBSCRIPTION_STATE_PENDING' || resource.purchaseState === 'PENDING') {
    return { action: 'pending', reason: 'pending', token: resource.purchaseToken, acknowledge: false };
  }
  if (DENY.has(state) || state === 'SUBSCRIPTION_STATE_EXPIRED') return { action: 'revoke', reason: state || 'denied', token: resource.purchaseToken };
  const inForce = expiry && expiry.getTime() > +now;
  if (ENTITLED.has(state) || (UNTIL_EXPIRY.has(state) && inForce)) {
    return { action: 'grant', source: 'play', token: resource.purchaseToken, endsAt: expiry ? expiry.toISOString() : null, acknowledge: pendingAck && state !== 'SUBSCRIPTION_STATE_PENDING', state };
  }
  if (UNTIL_EXPIRY.has(state) && !inForce) return { action: 'revoke', reason: 'expired', token: resource.purchaseToken };
  return { action: 'deny', reason: state || 'unknown', token: resource.purchaseToken };
}

// RTDN is a hint to re-query Google. It does not itself grant access.
export function rtdnAction(notificationType) {
  const refresh = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20]);
  return { action: 'refresh', grant: false, type: notificationType, known: refresh.has(notificationType) };
}

const seen = new Set();
export function acceptTokenOnce(token, store = seen) {
  if (!token) return false;
  if (store.has(token)) return false;
  store.add(token);
  return true;
}

export function playConfigStatus(env = {}) {
  const missing = ['PLAY_PACKAGE_NAME', 'PLAY_SUBSCRIPTION_ID', 'PLAY_BASE_PLAN_ID', 'GOOGLE_PLAY_SERVICE_ACCOUNT'].filter(k => !env[k]);
  return { checkout: 'disabled', reason: missing.length ? 'not_configured' : 'not_activated_in_this_build', missing };
}
