// Google Play purchase verification. A client receipt is not accepted.
// Not configured: no Play Console service account, subscription id or RTDN topic in this environment.
Deno.serve(async (req) => {
  const missing = ['PLAY_PACKAGE_NAME', 'PLAY_SUBSCRIPTION_ID', 'PLAY_BASE_PLAN_ID', 'GOOGLE_PLAY_SERVICE_ACCOUNT', 'PLAY_RTDN_AUDIENCE'].filter(k => !Deno.env.get(k));
  const body = await req.json().catch(() => ({}));
  if (body?.purchaseToken || body?.receipt) {
    return new Response(JSON.stringify({ ok: false, reason: 'client_receipt_not_accepted', missing }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: false, reason: 'not_configured', missing, google_api_called: false }), { status: 503, headers: { 'content-type': 'application/json' } });
});
