// Local mocks. No Google call, no service account, and no live product id.
import { interpretPlaySubscription, googleHttpDecision, claimToken, authorizeRtdn, handleRtdn, rtdnAction } from '../play-billing-core.js';
import { startPlatformPurchase } from '../billing.js';

let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const now = new Date('2026-11-08T12:00:00Z');
const active = { purchaseToken: 'tok-real', subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', expiryTime: '2026-12-01T00:00:00Z', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', lineItems: [{ productId: 'console-product', expiryTime: '2026-12-01T00:00:00Z', offerDetails: { basePlanId: 'monthly' } }], externalAccountIdentifiers: { obfuscatedExternalAccountId: 'user-a' } };

ok(interpretPlaySubscription({ clientReceiptOnly: true, purchaseToken: 'tok' }).granted === false, 'a client receipt does not grant');
ok(interpretPlaySubscription({ fixture: true, purchaseToken: 'tok', subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }).reason === 'client_receipt_not_accepted', 'a fixture cannot grant');
ok(interpretPlaySubscription({ ...active, purchaseToken: '' }).reason === 'missing_token', 'a body without a token does not grant');
ok(googleHttpDecision(404).reason === 'unknown_token' && googleHttpDecision(401).granted === false, 'a forged or unknown token from Google does not grant');
const good = interpretPlaySubscription(active, { now, packageName: 'com.glp1life.app', productId: 'console-product', expectedUser: 'user-a' });
ok(good.granted === true && good.acknowledge === true && good.productId === 'console-product', 'an active Google resource can be granted and then acknowledged');
ok(interpretPlaySubscription(active, { now, expectedUser: 'user-b' }).reason === 'cross_account', 'a token bound to another account is rejected');
ok(claimToken({ token: 'tok-real', userId: 'user-b', ownerId: 'user-a' }).reason === 'cross_account', 'a stored token cannot be reused by another account');
ok(claimToken({ token: 'tok-real', userId: 'user-a', ownerId: 'user-a' }).replay === true, 'the same account presenting the same token is a replay');
ok(interpretPlaySubscription({ purchaseToken: 'tok', subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }, { now }).granted === false, 'pending does not entitle');
ok(interpretPlaySubscription({ purchaseToken: 'tok', subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', expiryTime: '2026-12-01T00:00:00Z' }, { now }).cancelAtPeriodEnd === true, 'cancel keeps access until expiry');
ok(interpretPlaySubscription({ purchaseToken: 'tok', subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', expiryTime: '2026-11-01T00:00:00Z' }, { now }).reason === 'expired', 'a cancelled subscription grants nothing after expiry');
ok(interpretPlaySubscription({ purchaseToken: 'tok', subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', revoked: true }, { now }).action === 'revoke', 'a refund or revoke removes access');
ok(rtdnAction(2).grant === false, 'a renewal notification is not itself a grant');

const seen = new Set(), marks = new Map();
const first = handleRtdn({ messageId: 'm1', publishedAt: '2026-11-08T12:00:00Z', purchaseToken: 'tok-real', notificationType: 2, seen, watermarks: marks });
ok(first.grant === false && first.reason === 'notification_is_not_a_grant', 'a notification without a fresh Google resource does not grant');
ok(handleRtdn({ messageId: 'm1', publishedAt: '2026-11-08T12:00:00Z', purchaseToken: 'tok-real', notificationType: 2, seen, watermarks: marks }).action === 'duplicate', 'the same notification is ignored');
const stale = handleRtdn({ messageId: 'm0', publishedAt: '2026-11-07T12:00:00Z', purchaseToken: 'tok-real', notificationType: 12, seen, watermarks: marks, googleResource: { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' } });
ok(stale.action === 'stale' && stale.grant === false && stale.queried === false, 'an older notification does not revoke a newer state');
const renewed = handleRtdn({ messageId: 'm2', publishedAt: '2026-11-08T13:00:00Z', purchaseToken: 'tok-real', notificationType: 2, seen, watermarks: marks, googleResource: active, now });
ok(renewed.queried === true && renewed.granted === true && renewed.fromNotificationType === false, 'a newer notification grants only from the Google resource');

const forged = await authorizeRtdn({ authorization: 'Bearer forged', audience: 'aud', email: 'play@example.com', now, verify: async () => { const e = new Error('bad'); e.reason = 'forged'; throw e; } });
ok(forged.reason === 'forged', 'a bearer token that fails verification is rejected');
const authed = await authorizeRtdn({ authorization: 'Bearer good', audience: 'aud', email: 'play@example.com', now, verify: async () => ({ iss: 'https://accounts.google.com', aud: 'aud', email: 'play@example.com', email_verified: true, exp: Math.floor(+now / 1000) + 60 }) });
ok(authed.ok === true, 'a verified Google identity is accepted');
ok((await authorizeRtdn({ authorization: '', audience: 'aud', email: 'play@example.com', now, verify: async () => ({}) })).reason === 'missing_token', 'a notification without a bearer token is rejected');

globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: { PlayBilling: { purchase: async () => ({ pending: true, fixture: true, purchaseToken: 'fixture-token' }) } } } };
const pending = await startPlatformPurchase({ productId: 'fixture.not.a.console.id', userId: 'user-a', verify: async () => ({ granted: true }) });
ok(pending.reason === 'pending' && pending.granted === false, 'the client does not grant when the purchase is pending');

const fs = await import('node:fs');
const verifySrc = fs.readFileSync(new URL('../supabase/functions/play-verify/index.ts', import.meta.url), 'utf8') + fs.readFileSync(new URL('../supabase/functions/_shared/play-google.ts', import.meta.url), 'utf8');
ok(verifySrc.includes('subscriptionsv2') && verifySrc.includes('google_api_called: false') && !/premium_monthly|price_/.test(verifySrc), 'the server verifies with Google and has no invented product id');
const rtdnSrc = fs.readFileSync(new URL('../supabase/functions/play-rtdn/index.ts', import.meta.url), 'utf8');
ok(rtdnSrc.includes('authorizeRtdn') && rtdnSrc.includes('fromNotificationType: false'), 'notifications are authenticated and are not treated as the grant');

console.log(fail ? `${fail} FAILED` : 'ALL PLAY SECURITY CHECKS PASSED');
process.exit(fail ? 1 : 0);
