// NOT DEPLOYED. Translates one community message with Groq gpt-oss-20b.
// Uses the existing Supabase secret GROQ_API_KEY. Do not invent or commit a key.
// Refuses text that community_chat_classify would hold, and caps each member at 20 translations
// per London day via claim_community_translate (service role only).

const URL_ = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const KEY = Deno.env.get('GROQ_API_KEY') || '';
const LIMIT = 20;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });
  if (!KEY) return Response.json({ error: 'unavailable', message: 'Translation is not available yet.' }, { status: 503 });
  const auth = req.headers.get('authorization') || '';
  const user = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: auth } }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!user?.id) return Response.json({ error: 'signin' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').slice(0, 500);
  const lang = ['French', 'Spanish', 'Polish', 'Urdu', 'Welsh'].includes(String(body.lang)) ? String(body.lang) : 'French';
  const classified = await fetch(`${URL_}/rest/v1/rpc/community_chat_classify`, { method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ t: text }) }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (classified?.action === 'hold') return Response.json({ error: 'held', message: classified.message }, { status: 422 });
  const claim = await fetch(`${URL_}/rest/v1/rpc/claim_community_translate`, { method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_user: user.id, p_limit: LIMIT }) }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (typeof claim !== 'number') return Response.json({ error: 'not_ready', message: 'Translation is not available yet.' }, { status: 503 });
  if (claim < 0) return Response.json({ error: 'limit', message: `You've used today's ${LIMIT} translations.` }, { status: 429 });
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      messages: [
        { role: 'system', content: `Translate the member's message into ${lang}. Return only the translation. Do not add medical, dosing, or sourcing advice.` },
        { role: 'user', content: text },
      ],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return Response.json({ error: 'model' }, { status: 502 });
  return Response.json({ ok: true, text: String(payload?.choices?.[0]?.message?.content || '').slice(0, 800), remaining: claim });
});
