// Generates one UK meal draft with Groq. GROQ_API_KEY stays in the function secret.
// If the rate-limit function is missing, this does not call Groq.
import { DAILY_LIMIT, toPlannerRecipe, validateMealDraft } from '../../../meal-generate-core.js';

const URL_ = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const KEY = Deno.env.get('GROQ_API_KEY') || '';
const LIMIT = DAILY_LIMIT;
const ORIGINS = ['https://glp1life.co.uk', 'https://www.glp1life.co.uk', 'https://glp1life.uk', 'https://localhost', 'capacitor://localhost', 'http://localhost'];
const cors = (o: string | null) => ({ 'access-control-allow-origin': o && (ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)) ? o : ORIGINS[0],
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' });

const SYSTEM = `You write one original UK home-cooking recipe as JSON only. Use ordinary UK supermarket ingredients. Keep portions small, include a protein food, and keep added fat low. Quantities are metric grams or millilitres only. Do not include prices, brand names, alcohol, wine, beer, or nutrition numbers. Poultry, mince and fish steps must say the food is cooked through. Storage: leftovers within 48 hours, or rice within 24 hours. The milder swap must not use alcohol.`;

function prompt(body: Record<string, unknown>, errors: string[]) {
  const meal = ['breakfast', 'lunch', 'dinner'].includes(String(body.meal)) ? String(body.meal) : 'dinner';
  const avoid = Array.isArray(body.exclude) ? body.exclude.map(item => String(item).slice(0, 24)).slice(0, 8).join(', ') : '';
  const fix = errors.length ? `The previous JSON failed these checks: ${errors.join(', ')}. Fix them.` : '';
  return `Meal type: ${meal}. Leave out: ${avoid || 'none'}. ${body.gentle ? 'Use a mild swap for someone who feels sick or has reflux, without alcohol.' : ''} ${fix}
Return JSON with title, meal, servings (1-4), ingredients [{name, quantity, unit}], seasoning [{name, quantity, unit}], steps (array of strings), milderSwap, storageNote.`;
}

async function ask(user: string) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error('model');
  const text = payload?.choices?.[0]?.message?.content || '';
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'content-type': 'application/json' };
  const send = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  const auth = req.headers.get('authorization') || '';
  const user = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: auth } }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!user?.id) return send({ error: 'signin', message: 'Sign in to Cloud backup before generating a meal.' }, 401);
  if (!KEY) return send({ error: 'unavailable', message: 'Meal generator is not available yet.' }, 503);
  if (req.method === 'GET') return send({ ready: true, limit: LIMIT });
  if (req.method !== 'POST') return send({ error: 'method' }, 405);
  const claim = await fetch(`${URL_}/rest/v1/rpc/claim_meal_generate`, { method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_user: user.id, p_limit: LIMIT }) }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (typeof claim !== 'number') return send({ error: 'not_ready', message: 'Meal generator is not available yet.' }, 503);
  if (claim < 0) return send({ error: 'limit', message: `You've used today's ${LIMIT} generated meals. The draft recipes are still here.`, remaining: 0 }, 429);
  const body = await req.json().catch(() => ({}));
  let errors: string[] = [];
  let recipe = null;
  for (let attempt = 0; attempt < 2 && !recipe; attempt++) {
    try {
      const raw = await ask(prompt(body, errors));
      const check = validateMealDraft(raw);
      if (!check.ok) { errors = check.errors; continue; }
      recipe = toPlannerRecipe(raw);
    } catch { errors = ['json']; }
  }
  if (!recipe) {
    await fetch(`${URL_}/rest/v1/rpc/refund_meal_generate`, { method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_user: user.id }) }).catch(() => null);
    return send({ error: 'invalid', message: 'That meal did not pass the safety checks. Please try again.' }, 422);
  }
  return send({ ok: true, recipe, remaining: claim, note: 'AI-generated, check ingredients for allergies' });
});
