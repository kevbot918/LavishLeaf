// Google APIs with a service account, for the owner's dashboard
// (docs/DASHBOARD.md). No library: a signed JWT is traded for an access token.
//
// Environment (Netlify, never in this repository):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   ...@....iam.gserviceaccount.com
//   GOOGLE_PRIVATE_KEY             the "private_key" from its JSON key file
//   GA4_PROPERTY_ID                the numbers only, e.g. 412345678
//   GSC_SITE_URL                   "sc-domain:lavishleaf.org" (a Domain
//                                  property) or "https://lavishleaf.org/"
// The service account is added as a Viewer in Google Analytics and as a user
// in Search Console; it can read, never change anything.
import { createSign } from 'node:crypto';

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const tokens = new Map(); // per scope set, for the life of the function instance

export function googleReady(env = process.env) {
  return !!(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);
}

export async function accessToken(scopes, env = process.env, fetchImpl = fetch) {
  const key = scopes.join(' ');
  const hit = tokens.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: key,
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  });
  // Netlify's editor keeps the key's line breaks as "\n" text: put them back.
  const pem = String(env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, '\n');
  const sig = createSign('RSA-SHA256').update(unsigned).sign(pem).toString('base64url');
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Google sign-in failed: ${json.error_description || json.error || res.status}`);
  tokens.set(key, { token: json.access_token, exp: Date.now() + (json.expires_in || 3600) * 1000 });
  return json.access_token;
}

async function post(url, body, scopes, env, fetchImpl) {
  const token = await accessToken(scopes, env, fetchImpl);
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json.error && json.error.message) || `Google said ${res.status}`);
  return json;
}

const GA_SCOPE = ['https://www.googleapis.com/auth/analytics.readonly'];
const GSC_SCOPE = ['https://www.googleapis.com/auth/webmasters.readonly'];

/** One GA4 report, as plain rows: [{ dims: [...], vals: [...] }]. */
export async function gaReport(body, env = process.env, fetchImpl = fetch) {
  const id = String(env.GA4_PROPERTY_ID || '').replace(/^properties\//, '');
  if (!/^\d{5,15}$/.test(id)) throw new Error('GA4_PROPERTY_ID should be the property number only');
  const json = await post(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, body, GA_SCOPE, env, fetchImpl);
  return (json.rows || []).map((r) => ({
    dims: (r.dimensionValues || []).map((d) => d.value),
    vals: (r.metricValues || []).map((m) => Number(m.value) || 0),
  }));
}

/** Search Console rows: [{ keys, clicks, impressions, ctr, position }]. */
export async function gscQuery(body, env = process.env, fetchImpl = fetch) {
  const site = String(env.GSC_SITE_URL || '');
  if (!site) throw new Error('GSC_SITE_URL is not set');
  const json = await post(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body, GSC_SCOPE, env, fetchImpl);
  return json.rows || [];
}
