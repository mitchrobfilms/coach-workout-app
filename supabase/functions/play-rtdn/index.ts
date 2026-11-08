// Pub/Sub push for Play real-time notifications. Auth is required. The body is not a grant.
// Durable dedupe uses public.play_notifications after 007_membership.sql is applied. Not deployed.
import { authorizeRtdn, handleRtdn } from '../../../play-billing-core.js';
import { decide, fetchSubscription, playEnv } from '../_shared/play-google.ts';
import { playConfigStatus } from '../../../play-billing-core.js';

const audience = Deno.env.get('PLAY_RTDN_AUDIENCE') || '';
const email = Deno.env.get('PLAY_RTDN_EMAIL') || '';
const URL_ = Deno.env.get('SUPABASE_URL') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function verify(token: string) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!response.ok) { const error = new Error('forged') as Error & { reason?: string }; error.reason = 'forged'; throw error; }
  const claims = await response.json();
  claims.email_verified = claims.email_verified === 'true' || claims.email_verified === true;
  if (claims.exp) claims.exp = Number(claims.exp);
  return claims;
}

Deno.serve(async (req) => {
  const auth = await authorizeRtdn({ authorization: req.headers.get('authorization'), audience, email, verify });
  if (!auth.ok) return json({ ok: false, granted: false, reason: auth.reason }, 401);
  const body = await req.json().catch(() => ({}));
  let data: { packageName?: string; eventTimeMillis?: string; subscriptionNotification?: { notificationType?: number; purchaseToken?: string } } = {};
  try { data = JSON.parse(atob(body?.message?.data || '')); } catch { return json({ ok: false, granted: false, reason: 'bad_message' }, 400); }
  const packageName = playEnv().PLAY_PACKAGE_NAME;
  if (packageName && data.packageName && data.packageName !== packageName) return json({ ok: false, granted: false, reason: 'package' }, 400);
  const messageId = String(body?.message?.messageId || '');
  const publishedAt = body?.message?.publishTime || Number(data.eventTimeMillis || 0);
  const purchaseToken = data.subscriptionNotification?.purchaseToken || '';
  if (URL_ && SERVICE && messageId) {
    const inserted = await fetch(`${URL_}/rest/v1/play_notifications`, { method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify({ message_id: messageId, purchase_token: purchaseToken, published_at: publishedAt }) });
    const rows = await inserted.json().catch(() => []);
    if (Array.isArray(rows) && rows.length === 0) return json({ ok: true, granted: false, action: 'duplicate', google_api_called: false });
    if (purchaseToken) {
      const prior = await fetch(`${URL_}/rest/v1/play_purchases?purchase_token=eq.${encodeURIComponent(purchaseToken)}&select=last_event_at`, { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }).then(r => r.json()).catch(() => []);
      const watermark = prior?.[0]?.last_event_at ? +new Date(prior[0].last_event_at) : null;
      if (watermark != null && +new Date(publishedAt) < watermark) return json({ ok: true, granted: false, action: 'stale', google_api_called: false });
    }
  }
  const local = handleRtdn({ messageId, publishedAt, purchaseToken, notificationType: data.subscriptionNotification?.notificationType });
  if (local.grant) return json({ ok: false, granted: false, reason: 'notification_cannot_grant' }, 500);
  const status = playConfigStatus(playEnv());
  if (status.checkout !== 'ready') return json({ ok: false, granted: false, reason: 'not_configured', action: 'refresh', google_api_called: false }, 503);
  const google = await fetchSubscription(purchaseToken).catch(() => null);
  if (!google?.resource) return json({ ok: false, granted: false, reason: google?.http?.reason || 'google_rejected', action: 'refresh', google_api_called: true }, 502);
  const decision = decide(google.resource, purchaseToken, '');
  if (URL_ && SERVICE && purchaseToken && decision.action) {
    await fetch(`${URL_}/rest/v1/play_purchases?purchase_token=eq.${encodeURIComponent(purchaseToken)}`, { method: 'PATCH', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ state: decision.state || 'SUBSCRIPTION_STATE_EXPIRED', ends_at: decision.endsAt || null, last_event_at: new Date(publishedAt).toISOString(), updated_at: new Date().toISOString() }) });
  }
  return json({ ok: true, granted: false, action: decision.action, state: decision.state || null, source: 'google_api', fromNotificationType: false, google_api_called: true, fixture: false });
});
