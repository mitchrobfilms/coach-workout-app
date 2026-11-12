// NOT DEPLOYED. Do not deploy this function until the community chat migration is applied
// and the secrets below exist. It sends Web Push for replies, @mentions and admin announcements.
//
// Required Supabase secrets (set in the dashboard; do not invent or commit values):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT       for example mailto:support@glp1life.co.uk
//
// Android FCM is not configured. Native registration is a stub in native.js until a
// Firebase project and google-services.json exist. This function only sends Web Push.
//
// Call with the service role after a qualifying event:
//   { "title": "GLP1 Life", "body": "Priya replied to you", "user_ids": ["..."] }

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!pub || !priv || !subject) {
    return Response.json({ ok: false, error: 'vapid_not_configured' }, { status: 503 });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return Response.json({ ok: false, error: 'service_role_missing' }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.user_ids) ? body.user_ids : [];
  if (!ids.length) return Response.json({ ok: true, sent: 0 });
  webpush.setVapidDetails(subject, pub, priv);
  const sb = createClient(url, key);
  const { data, error } = await sb.from('community_push_subs').select('endpoint,p256dh,auth,kind').in('user_id', ids).eq('kind', 'web');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const payload = JSON.stringify({ title: body.title || 'GLP1 Life', body: body.body || 'New community message', url: body.url || './?tab=community' });
  let sent = 0;
  for (const sub of data || []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent += 1;
    } catch { /* drop expired subscriptions on a later pass */ }
  }
  return Response.json({ ok: true, sent });
});
