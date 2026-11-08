// Google Play Billing decisions. A client receipt is never enough.
// Subscription states follow purchases.subscriptionsv2 (Android Publisher API).
// Checked against the Play Billing security guide, 8 November 2026.
// https://developer.android.com/google/play/billing/security
// https://developer.android.com/google/play/billing/integrate

const ENTITLED = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);
const UNTIL_EXPIRY = new Set(['SUBSCRIPTION_STATE_CANCELED']);
const DENY = new Set([
  'SUBSCRIPTION_STATE_UNSPECIFIED', 'SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_PAUSED',
  'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
]);

export function playConfigStatus(env = {}) {
  const missing = ['PLAY_PACKAGE_NAME', 'PLAY_SUBSCRIPTION_ID', 'PLAY_BASE_PLAN_ID', 'GOOGLE_PLAY_SERVICE_ACCOUNT'].filter(k => !env[k]);
  if (missing.length) return { checkout: 'not_configured', reason: 'not_configured', missing };
  return { checkout: 'ready', reason: 'server_credentials_present', missing: [] };
}

function lineItem(resource) {
  const line = resource?.lineItems?.[0] || {};
  return {
    productId: line.productId || resource?.productId || '',
    expiryTime: line.expiryTime || resource?.expiryTime || null,
    basePlanId: line.offerDetails?.basePlanId || resource?.basePlanId || '',
  };
}

export function interpretPlaySubscription(resource, { now = new Date(), packageName = '', productId = '', expectedUser = '' } = {}) {
  if (!resource || resource.clientReceiptOnly || resource.fixture === true) return { action: 'deny', granted: false, reason: 'client_receipt_not_accepted' };
  const token = resource.purchaseToken || '';
  if (!token) return { action: 'deny', granted: false, reason: 'missing_token' };
  const line = lineItem(resource);
  const account = resource.obfuscatedAccountId || resource.externalAccountIdentifiers?.obfuscatedExternalAccountId || '';
  if (packageName && resource.packageName && resource.packageName !== packageName) return { action: 'deny', granted: false, reason: 'package', token };
  if (productId && line.productId && line.productId !== productId) return { action: 'deny', granted: false, reason: 'product', token };
  if (expectedUser && account && account !== expectedUser) return { action: 'deny', granted: false, reason: 'cross_account', token };
  if (resource.revoked || resource.refunded || resource.voided) return { action: 'revoke', granted: false, reason: 'revoked', token, linkedPurchaseToken: resource.linkedPurchaseToken || '' };
  const state = resource.subscriptionState || '';
  const expiry = line.expiryTime ? new Date(line.expiryTime) : null;
  const pendingAck = (resource.acknowledgementState || '') === 'ACKNOWLEDGEMENT_STATE_PENDING';
  if (state === 'SUBSCRIPTION_STATE_PENDING' || resource.purchaseState === 'PENDING') {
    return { action: 'pending', granted: false, reason: 'pending', token, acknowledge: false, state };
  }
  if (DENY.has(state) || state === 'SUBSCRIPTION_STATE_EXPIRED') return { action: 'revoke', granted: false, reason: state || 'denied', token, state };
  const inForce = expiry && expiry.getTime() > +now;
  if (ENTITLED.has(state) || (UNTIL_EXPIRY.has(state) && inForce)) {
    return {
      action: 'grant', granted: true, source: 'play', token, endsAt: expiry ? expiry.toISOString() : null,
      acknowledge: pendingAck, state, linkedPurchaseToken: resource.linkedPurchaseToken || '',
      cancelAtPeriodEnd: state === 'SUBSCRIPTION_STATE_CANCELED', productId: line.productId, basePlanId: line.basePlanId,
    };
  }
  if (UNTIL_EXPIRY.has(state) && !inForce) return { action: 'revoke', granted: false, reason: 'expired', token, state };
  return { action: 'deny', granted: false, reason: state || 'unknown', token };
}

export function googleHttpDecision(status) {
  if (status === 200) return { action: 'use_body', granted: false };
  return { action: 'deny', granted: false, reason: status === 404 ? 'unknown_token' : 'google_rejected', status };
}

// The first authenticated user to present a token owns it. A different account cannot reuse it.
export function claimToken({ token, userId, ownerId = null } = {}) {
  if (!token || !userId) return { ok: false, reason: 'missing' };
  if (ownerId && ownerId !== userId) return { ok: false, granted: false, reason: 'cross_account' };
  return { ok: true, replay: ownerId === userId, granted: false };
}

export function rtdnAction(notificationType) {
  const refresh = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20]);
  return { action: 'refresh', grant: false, type: notificationType, known: refresh.has(notificationType) };
}

export async function authorizeRtdn({ authorization, audience, email, now = new Date(), verify }) {
  const match = /^Bearer\s+(\S+)$/.exec(String(authorization || ''));
  if (!match) return { ok: false, reason: 'missing_token' };
  let claims;
  try { claims = await verify(match[1], { audience }); }
  catch (e) { return { ok: false, reason: e?.reason || 'forged' }; }
  if (!claims || typeof claims !== 'object') return { ok: false, reason: 'forged' };
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') return { ok: false, reason: 'issuer' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience || !aud.includes(audience)) return { ok: false, reason: 'audience' };
  if (email && claims.email !== email) return { ok: false, reason: 'email' };
  if (claims.email_verified !== true) return { ok: false, reason: 'email_unverified' };
  if (!claims.exp || claims.exp * 1000 <= +now) return { ok: false, reason: 'expired' };
  return { ok: true };
}

// messageId dedupes retries. An older publish time never overwrites a newer one, and the payload is not a grant.
export function handleRtdn({ messageId, publishedAt, purchaseToken = '', notificationType, seen = new Set(), watermarks = new Map(), googleResource = null, now = new Date() } = {}) {
  if (!messageId) return { action: 'deny', grant: false, reason: 'missing_message', queried: false };
  if (seen.has(messageId)) return { action: 'duplicate', grant: false, queried: false };
  const at = +new Date(publishedAt);
  const prev = purchaseToken ? watermarks.get(purchaseToken) : null;
  if (purchaseToken && prev != null && at < prev) {
    seen.add(messageId);
    return { action: 'stale', grant: false, queried: false, ignoredType: notificationType };
  }
  seen.add(messageId);
  if (purchaseToken && !Number.isNaN(at)) watermarks.set(purchaseToken, at);
  if (!googleResource) return { action: 'refresh', grant: false, queried: false, reason: 'notification_is_not_a_grant', hint: rtdnAction(notificationType) };
  const decision = interpretPlaySubscription({ ...googleResource, purchaseToken: googleResource.purchaseToken || purchaseToken }, { now });
  return { ...decision, queried: true, fromNotificationType: false, hint: rtdnAction(notificationType) };
}

const seenTokens = new Set();
export function acceptTokenOnce(token, store = seenTokens) {
  if (!token) return false;
  if (store.has(token)) return false;
  store.add(token);
  return true;
}
