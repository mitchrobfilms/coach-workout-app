// Stripe Checkout is not called. The connected Pepvexia context is live-only (acct_1LKefrExfE48MyWq).
// A sandbox secret key, sandbox price id and webhook secret are still required before this can be enabled.
// automatic_tax is not set. The older on-screen £5 / £45 preview is not a Stripe price.
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  const key = Deno.env.get('STRIPE_SECRET_KEY') || '';
  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PREMIUM'].filter(k => !Deno.env.get(k));
  const body = {
    checkout: 'disabled',
    automatic_tax: false,
    sandbox: key.startsWith('sk_test_'),
    live_key_refused: key.startsWith('sk_live_'),
    missing,
    note: 'No Stripe API call is made. Complimentary codes are separate and do not start a subscription.',
  };
  return new Response(JSON.stringify(body), { status: 503, headers: { 'content-type': 'application/json' } });
});
