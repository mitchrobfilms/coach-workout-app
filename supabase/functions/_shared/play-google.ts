// Server-only Play Developer API calls. Credentials come from the function environment.
import { interpretPlaySubscription, playConfigStatus, googleHttpDecision } from '../../../play-billing-core.js';

export function playEnv() {
  return {
    PLAY_PACKAGE_NAME: Deno.env.get('PLAY_PACKAGE_NAME') || '',
    PLAY_SUBSCRIPTION_ID: Deno.env.get('PLAY_SUBSCRIPTION_ID') || '',
    PLAY_BASE_PLAN_ID: Deno.env.get('PLAY_BASE_PLAN_ID') || '',
    GOOGLE_PLAY_SERVICE_ACCOUNT: Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT') || '',
  };
}

const b64url = (text: string) => btoa(text).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

export async function googleAccessToken(raw: string) {
  const account = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = String(account.private_key || '').replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`)));
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  const assertion = `${header}.${claim}.${b64url(binary)}`;
  const token = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const body = await token.json();
  if (!token.ok || !body.access_token) throw new Error('google_auth');
  return body.access_token as string;
}

export async function fetchSubscription(purchaseToken: string) {
  const env = playEnv();
  const status = playConfigStatus(env);
  if (status.checkout !== 'ready') return { configured: false, status, resource: null, http: null };
  const access = await googleAccessToken(env.GOOGLE_PLAY_SERVICE_ACCOUNT);
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const google = await fetch(url, { headers: { authorization: `Bearer ${access}` } });
  const http = googleHttpDecision(google.status);
  const resource = http.action === 'use_body' ? await google.json() : null;
  return { configured: true, access, env, http, resource };
}

export function decide(resource: Record<string, unknown> | null, purchaseToken: string, userId: string) {
  const env = playEnv();
  if (!resource) return { action: 'deny', granted: false, reason: 'no_google_resource' };
  return interpretPlaySubscription({ ...resource, purchaseToken, packageName: env.PLAY_PACKAGE_NAME }, {
    packageName: env.PLAY_PACKAGE_NAME, productId: env.PLAY_SUBSCRIPTION_ID, expectedUser: userId,
  });
}

export async function acknowledge(access: string, purchaseToken: string) {
  const env = playEnv();
  await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.PLAY_PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(env.PLAY_SUBSCRIPTION_ID)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {
    method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' }, body: '{}',
  });
}
