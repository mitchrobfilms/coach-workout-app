// Signed Stripe webhooks only. Membership is not granted from a browser success redirect.
// This function does not call Stripe and does not write the live database in this build.
import { verifyStripeSignature, entitlementFromStripeEvent } from '../../../stripe-billing.js';

Deno.serve(async (req) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
  const prices = (Deno.env.get('STRIPE_PRICE_PREMIUM') || '').split(',').map(s => s.trim()).filter(Boolean);
  const payload = await req.text();
  const header = req.headers.get('stripe-signature') || '';
  const verified = await verifyStripeSignature({ payload, header, secret });
  if (!verified.ok) return new Response(JSON.stringify({ ok: false, reason: verified.reason }), { status: 400, headers: { 'content-type': 'application/json' } });
  let event: { id?: string; type?: string; data?: { object?: unknown } };
  try { event = JSON.parse(payload); } catch { return new Response(JSON.stringify({ ok: false, reason: 'bad_json' }), { status: 400 }); }
  const decision = entitlementFromStripeEvent(event, prices);
  return new Response(JSON.stringify({ ok: true, stored: false, decision }), { status: 200, headers: { 'content-type': 'application/json' } });
});
