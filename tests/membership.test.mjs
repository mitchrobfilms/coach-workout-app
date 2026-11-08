import fs from 'fs';
import { validateCodeCreate, evaluateRedemption, withPreview, assertAdmin, hasRealPremium } from '../membership-core.js';
import { verifyStripeSignature, entitlementFromStripeEvent, stripeCheckoutStatus } from '../stripe-billing.js';
import { interpretPlaySubscription, rtdnAction, acceptTokenOnce, playConfigStatus } from '../play-billing-core.js';
import { describeSurface } from '../billing.js';

let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const now = new Date('2026-11-08T12:00:00Z');

ok(!validateCodeCreate({ maxRedemptions: 10 }).ok, 'duration is required');
ok(!validateCodeCreate({ lifetime: true, durationDays: 30, maxRedemptions: 10 }).ok, 'lifetime and days together are rejected');
ok(!validateCodeCreate({ durationDays: 30 }).ok, 'redemption limit is required');
ok(validateCodeCreate({ durationDays: 30, maxRedemptions: 5, now }).ok, 'explicit 30 day code is accepted');
ok(validateCodeCreate({ lifetime: true, maxRedemptions: 1, now }).lifetime, 'lifetime only when explicitly chosen');
ok(!validateCodeCreate({ durationDays: 30, maxRedemptions: 2, redeemBy: '2020-01-01', now }).ok, 'past redeem-by is rejected');

const offer = { active: true, lifetime: false, durationDays: 14, maxRedemptions: 1 };
ok(evaluateRedemption({ offer, usedCount: 0, now }).ok, 'first redemption allowed');
ok(evaluateRedemption({ offer, alreadyRedeemed: true, now }).reason === 'replay', 'same account cannot redeem twice');
ok(evaluateRedemption({ offer, usedCount: 1, now }).reason === 'limit', 'limit is enforced');
ok(evaluateRedemption({ offer: { ...offer, redeemBy: '2026-11-01' }, now }).reason === 'expired', 'redeem-by is enforced');
ok(evaluateRedemption({ offer: { ...offer, revoked: true }, now }).reason === 'invalid', 'revoked code is rejected');
const life = evaluateRedemption({ offer: { active: true, lifetime: true, maxRedemptions: 2 }, now });
ok(life.ok && life.lifetime && life.endsAt == null && life.kind === 'complimentary', 'lifetime grant is complimentary and not a subscription');

const ent = { kind: 'complimentary', endsAt: '2026-12-01T00:00:00Z', active: true };
const viewed = withPreview({ entitlement: ent, previewMode: 'free', isAdmin: true });
ok(viewed.preview === 'free' && viewed.entitlement === ent && viewed.livePaywall === false, 'preview does not change the real entitlement');
ok(withPreview({ entitlement: ent, previewMode: 'premium', isAdmin: false }).preview == null, 'a non-admin cannot turn preview on');
let escalated = false; try { assertAdmin(false); escalated = true; } catch (e) { ok(e.code === 'admin_only', 'non-admin create is rejected'); }
ok(!escalated, 'non-admin does not continue');

const secret = 'whsec_test_fixture_only';
const payload = JSON.stringify({ id: 'evt_fixture', type: 'invoice.paid', data: { object: { subscription: 'sub_fixture', lines: { data: [{ price: { id: 'price_sandbox_fixture' } }] } } } });
const t = String(Math.floor(Date.now() / 1000));
const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(`${t}.${payload}`)))].map(b => b.toString(16).padStart(2, '0')).join('');
ok((await verifyStripeSignature({ payload, header: `t=${t},v1=${mac}`, secret })).ok, 'signed webhook is accepted');
ok(!(await verifyStripeSignature({ payload, header: `t=${t},v1=${'0'.repeat(mac.length)}`, secret })).ok, 'bad signature is rejected');
ok((await verifyStripeSignature({ payload, header: `t=1,v1=${mac}`, secret })).reason === 'stale', 'old signed webhook is rejected');
ok((await verifyStripeSignature({ payload, header: `t=${t},v1=${mac}`, secret: '' })).reason === 'not_configured', 'webhook without a secret is rejected');
const event = JSON.parse(payload);
ok(entitlementFromStripeEvent(event, ['price_sandbox_fixture']).action === 'grant', 'paid invoice for the server price can grant');
ok(entitlementFromStripeEvent({ id: 'evt_redirect', type: 'checkout.session.completed', data: { object: { payment_status: 'paid' } } }, ['price_sandbox_fixture']).reason === 'session_completed_is_not_enough', 'checkout success is not a grant');
ok(stripeCheckoutStatus({ STRIPE_SECRET_KEY: 'sk_live_nope' }).reason === 'live_key_refused', 'live Stripe key is refused');
ok(stripeCheckoutStatus({}).checkout === 'disabled', 'checkout stays off without sandbox config');

ok(interpretPlaySubscription({ clientReceiptOnly: true, purchaseToken: 'tok' }).reason === 'client_receipt_not_accepted', 'client receipt does not grant');
ok(interpretPlaySubscription({ purchaseToken: 'tok', subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }).action === 'pending', 'pending Play purchase does not grant');
ok(interpretPlaySubscription({ purchaseToken: 'tok', subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', expiryTime: '2026-12-01T00:00:00Z', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }, { now }).acknowledge === true, 'active purchase can be granted and then acknowledged');
ok(interpretPlaySubscription({ purchaseToken: 'tok', subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', revoked: true }).action === 'revoke', 'revoked purchase removes access');
ok(rtdnAction(2).grant === false, 'a Play renewal notice only asks the server to refresh');
const tokens = new Set();
ok(acceptTokenOnce('tok', tokens) && !acceptTokenOnce('tok', tokens), 'the same Play token is stored once');
ok(playConfigStatus({}).checkout === 'disabled', 'Play billing stays off without Console setup');

const play = describeSurface(true);
ok(play.provider === 'google_play' && play.checkout === 'disabled' && play.playBilling === 'inactive' && play.stripeLink === false && !/https?:\/\//.test(play.reason), 'Play purchases stay inactive and do not link to Stripe');
const web = describeSurface(false);
ok(web.provider === 'stripe' && web.checkout === 'disabled' && web.stripeLink === false, 'web checkout stays off');
ok(hasRealPremium(ent, now) && !hasRealPremium({ kind: 'none' }, now), 'real premium is separate from preview');

const sql = fs.readFileSync(new URL('../supabase/007_membership.sql', import.meta.url), 'utf8');
ok(sql.includes("raise exception 'admin only'") && sql.includes('for update') && sql.includes('unique (code_id, user_id)'), 'SQL checks admin, locks the code and blocks replay');
ok(!/insert into public\.access_codes[\s\S]*values\s*\(\s*'[A-Z0-9]/i.test(sql), 'SQL does not insert a ready-made code');
ok(sql.includes('code_hash') && !sql.includes('sk_live_') && !sql.includes('sk_test_'), 'codes are hashed and no Stripe secret is stored');
ok(fs.readFileSync(new URL('../supabase/functions/stripe-checkout/index.ts', import.meta.url), 'utf8').includes("checkout: 'disabled'"), 'checkout function does not start a charge');

console.log(fail ? `${fail} FAILED` : 'ALL MEMBERSHIP CHECKS PASSED');
process.exit(fail ? 1 : 0);
