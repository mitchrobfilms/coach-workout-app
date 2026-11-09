// Verifies a Play purchase token with Google. Not deployed. Missing credentials never grant access.
import { claimToken } from '../../../play-billing-core.js';
import { acknowledge, decide, fetchSubscription, playEnv } from '../_shared/play-google.ts';
import { playConfigStatus } from '../../../play-billing-core.js';

const URL_ = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const db = (path: string, method = 'GET', body?: unknown) => fetch(`${URL_}/rest/v1/${path}`, {
  method, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
  body: body ? JSON.stringify(body) : undefined,
});

Deno.serve(async (req) => {
  const status = playConfigStatus(playEnv());
  if (req.method === 'GET') return json({ ok: false, granted: false, checkout: status.checkout, reason: status.reason, missing: status.missing, google_api_called: false, fixture: false }, status.checkout === 'ready' ? 200 : 503);
  if (status.checkout !== 'ready') return json({ ok: false, granted: false, reason: 'not_configured', missing: status.missing, google_api_called: false, fixture: false }, 503);
  const auth = req.headers.get('authorization') || '';
  const user = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: auth } }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!user?.id) return json({ ok: false, granted: false, reason: 'signin' }, 401);
  const body = await req.json().catch(() => ({}));
  const token = String(body?.purchaseToken || '');
  if (!token || body?.receipt || body?.fixture === true) return json({ ok: false, granted: false, reason: 'client_receipt_not_accepted', google_api_called: false }, 400);
  const google = await fetchSubscription(token).catch(() => null);
  if (!google?.configured || !google.http) return json({ ok: false, granted: false, reason: 'not_configured', google_api_called: false }, 503);
  if (google.http.action !== 'use_body') return json({ ok: false, granted: false, reason: google.http.reason, google_api_called: true }, 502);
  const decision = decide(google.resource, token, user.id);
  const owned = await db(`play_purchases?purchase_token=eq.${encodeURIComponent(token)}&select=user_id`).then(r => r.json()).catch(() => []);
  const claim = claimToken({ token, userId: user.id, ownerId: owned?.[0]?.user_id || null });
  if (!claim.ok) return json({ ok: false, granted: false, reason: claim.reason, google_api_called: true }, 409);
  if (decision.action !== 'grant') return json({ ok: false, granted: false, action: decision.action, reason: decision.reason, google_api_called: true });
  const env = playEnv();
  await db('play_purchases?on_conflict=purchase_token', 'POST', { purchase_token: token, user_id: user.id, package_name: env.PLAY_PACKAGE_NAME, product_id: decision.productId || env.PLAY_SUBSCRIPTION_ID, base_plan_id: decision.basePlanId || env.PLAY_BASE_PLAN_ID, state: decision.state, ends_at: decision.endsAt, acknowledged: false, obfuscated_account_id: user.id, linked_purchase_token: decision.linkedPurchaseToken || null, updated_at: new Date().toISOString() });
  if (decision.linkedPurchaseToken) await db(`play_purchases?purchase_token=eq.${encodeURIComponent(decision.linkedPurchaseToken)}`, 'PATCH', { state: 'SUBSCRIPTION_STATE_EXPIRED' });
  if (decision.acknowledge && google.access) await acknowledge(google.access, token);
  return json({ ok: true, granted: true, fixture: false, source: 'google_api', action: decision.action, state: decision.state, ends_at: decision.endsAt, replay: claim.replay, google_api_called: true });
});
