// Supabase Edge Function: food-photo
// GET  -> { ready, limit, remaining }  (ready = the Gemini key works)
// POST { path?, text? } -> analysis JSON for the user's own photo in the private "food-photos" bucket, guided by the
//   member's typed description (text is the main hint). Text-only (no path) is analysed the same way. Both count towards the daily limit.
// The Gemini key lives only in the GEMINI_API_KEY secret; it never reaches the browser.
import { PROMPT, SCHEMA, sanitizeAnalysis, DAILY_LIMIT, hintPrompt, cleanNote, HINT_MAX } from './photo-core.js';

const URL_ = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY = Deno.env.get('GEMINI_API_KEY') || '';
const MODELS = (Deno.env.get('FOOD_PHOTO_MODELS') || 'gemini-3.1-flash-lite,gemini-3.6-flash').split(',').map(s => s.trim()).filter(Boolean);
const LIMIT = +(Deno.env.get('FOOD_PHOTO_DAILY_LIMIT') || DAILY_LIMIT);
const ORIGINS = ['https://glp1life.co.uk', 'https://www.glp1life.co.uk', 'https://glp1life.uk', 'https://localhost', 'capacitor://localhost', 'http://localhost'];
const cors = (o: string | null) => ({ 'access-control-allow-origin': o && (ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)) ? o : ORIGINS[0],
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' });
let keyOk: { ok: boolean; at: number } | null = null;

async function keyWorks() {
  if (!KEY) return false;
  if (keyOk && Date.now() - keyOk.at < 10 * 60e3) return keyOk.ok;
  try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[0]}`, { headers: { 'x-goog-api-key': KEY } }); keyOk = { ok: r.ok, at: Date.now() }; }
  catch { keyOk = { ok: false, at: Date.now() }; }
  return keyOk.ok;
}
const rpc = (fn: string, body: unknown) => fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const b64 = (buf: ArrayBuffer) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

async function gemini(img: string | null, mime: string, text: string) {
  let last = '';
  for (const model of MODELS) {
    const gen: Record<string, unknown> = { responseMimeType: 'application/json', responseJsonSchema: SCHEMA, temperature: 0.2, maxOutputTokens: 2048 };
    if (/gemini-3/.test(model)) gen.thinkingConfig = { thinkingLevel: 'low' };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [...(img ? [{ inline_data: { mime_type: mime, data: img } }] : []), { text: PROMPT }, ...(text ? [{ text: hintPrompt(text, !!img) }] : [])] }], generationConfig: gen }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { last = `${model}: ${r.status} ${j?.error?.status || ''}`; console.warn('gemini', last, j?.error?.message?.slice(0, 200)); continue; }
    const t = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    try { return { model, usage: j.usageMetadata, out: JSON.parse(t) }; } catch { last = `${model}: bad json`; continue; }
  }
  throw new Error(last || 'no model');
}

Deno.serve(async req => {
  const h = { ...cors(req.headers.get('origin')), 'content-type': 'application/json' };
  const res = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: h });
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  const auth = req.headers.get('authorization') || '';
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, authorization: auth } }).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!u?.id) return res({ error: 'signin', message: 'Please sign in again.' }, 401);
  const usage = async () => { const r = await fetch(`${URL_}/rest/v1/food_photo_usage?select=n&user_id=eq.${u.id}&day=eq.${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })}`, { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }).then(r => r.json()).catch(() => []); return Math.max(0, LIMIT - (r?.[0]?.n || 0)); };
  if (req.method === 'GET') return res({ ready: await keyWorks(), limit: LIMIT, remaining: await usage() });
  if (req.method !== 'POST') return res({ error: 'method' }, 405);
  if (!(await keyWorks())) return res({ error: 'unavailable', message: 'Photo analysis is coming soon.' }, 503);
  const body = await req.json().catch(() => ({}));
  const path = String(body?.path || ''), text = cleanNote(body?.text, HINT_MAX);
  if (!path && !text) return res({ error: 'empty', message: 'Add a photo or type what you ate.' }, 400);
  let buf: ArrayBuffer | null = null;
  if (path) {
    if (!new RegExp(`^${u.id}/[\\w-]{8,64}\\.(jpg|webp)$`).test(path)) return res({ error: 'path', message: 'That photo could not be found.' }, 400);
    // download with the USER's token so storage RLS proves ownership
    const img = await fetch(`${URL_}/storage/v1/object/authenticated/food-photos/${path}`, { headers: { apikey: ANON, authorization: auth } });
    if (!img.ok) return res({ error: 'path', message: 'That photo could not be found.' }, 404);
    buf = await img.arrayBuffer();
    if (buf.byteLength > 800 * 1024) return res({ error: 'size', message: 'That photo is too large.' }, 413);
  }
  const left = await rpc('claim_food_photo', { p_user: u.id, p_limit: LIMIT }).then(r => r.json()).catch(() => null);
  if (typeof left !== 'number') return res({ error: 'server', message: 'Something went wrong. Please try again.' }, 500);
  if (left < 0) return res({ error: 'limit', message: `You've used today's ${LIMIT} meal checks. You can still add meals by hand, and checks reset at midnight.`, remaining: 0 }, 429);
  try {
    const g = await gemini(buf ? b64(buf) : null, path.endsWith('.webp') ? 'image/webp' : 'image/jpeg', text);
    const a = sanitizeAnalysis(g.out);
    if (!a.is_food) await rpc('refund_food_photo', { p_user: u.id }); // non-food photos/text don't use up the allowance
    console.log(JSON.stringify({ ev: 'analysed', model: g.model, food: a.is_food, photo: !!buf, hint: text.length, in: g.usage?.promptTokenCount, out: g.usage?.candidatesTokenCount, think: g.usage?.thoughtsTokenCount }));
    return res({ ...a, model: g.model, remaining: a.is_food ? left : left + 1 });
  } catch (e) {
    await rpc('refund_food_photo', { p_user: u.id });
    console.error('analyse failed', String(e));
    return res({ error: 'busy', message: 'The meal checker is busy. Please try again in a moment.' }, 502);
  }
});
