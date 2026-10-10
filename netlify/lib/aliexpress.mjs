// AliExpress Open Platform, for the dropshipping (DS) lines (2026-10-10, the
// owner created the developer app). Keys live ONLY in the Netlify environment:
//   AE_APP_KEY      the app's App Key
//   AE_APP_SECRET   the app's App Secret (secret)
// The shop's AliExpress buyer account is connected once from the dashboard
// (OAuth): its access token is kept in the Netlify Blobs store "aliexpress",
// never in this public repository.
//
// Two gateways, two signatures (AliExpress "Signature algorithm"):
//   business APIs   https://api-sg.aliexpress.com/sync?method=aliexpress.ds...
//                   sign = HMAC-SHA256(secret, sorted key+value pairs)
//   system APIs     https://api-sg.aliexpress.com/rest/auth/token/create
//                   sign = HMAC-SHA256(secret, api path + sorted pairs)
// Both upper-case hex. Checked against the live gateway on 2026-10-10: a
// signed ds.product.get came back "access_token is not supplied", a wrong
// key came back "InvalidAppKey".
import { createHmac } from 'node:crypto';

const GATEWAY = 'https://api-sg.aliexpress.com';

export function aeConfig(env = process.env) {
  return { key: String(env.AE_APP_KEY || '').trim(), secret: String(env.AE_APP_SECRET || '').trim() };
}
export const aeReady = (env = process.env) => { const c = aeConfig(env); return !!(c.key && c.secret); };

export function sign(params, secret, apiPath = '') {
  const base = apiPath + Object.keys(params).filter((k) => k !== 'sign' && params[k] != null && params[k] !== '').sort().map((k) => k + params[k]).join('');
  return createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

function signed(params, cfg, apiPath, now) {
  const p = { app_key: cfg.key, timestamp: String(now), sign_method: 'sha256', ...params };
  for (const k of Object.keys(p)) if (p[k] == null || p[k] === '') delete p[k];
  p.sign = sign(p, cfg.secret, apiPath);
  return p;
}

async function answer(res) {
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* below */ }
  if (!res.ok || !json) throw new Error(`AliExpress said ${res.status}`);
  const err = json.error_response || (json.code && json.code !== '0' && json.code !== 0 && json.message ? json : null);
  if (err) throw new Error(`AliExpress: ${err.code || ''} ${err.msg || err.message || ''}`.trim());
  return json;
}

/** A business API ("aliexpress.ds.product.get" and so on). */
export async function call(method, params, token, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const p = signed({ method, access_token: token, ...params }, aeConfig(env), '', now);
  return answer(await fetchImpl(`${GATEWAY}/sync?${new URLSearchParams(p)}`, { method: 'POST' }));
}

/** A system API ("/auth/token/create" and so on). */
export async function systemCall(path, params, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const p = signed(params, aeConfig(env), path, now);
  return answer(await fetchImpl(`${GATEWAY}/rest${path}?${new URLSearchParams(p)}`, { method: 'POST' }));
}

/** Where the owner is sent to approve the connection. */
export function authorizeUrl(redirectUri, state, env = process.env) {
  const q = new URLSearchParams({ response_type: 'code', force_auth: 'true', redirect_uri: redirectUri, client_id: aeConfig(env).key, state });
  return `${GATEWAY}/oauth/authorize?${q}`;
}

/** The OAuth "state": the time, signed with the app secret, so a callback
 *  can only finish a connection the owner started in the last 15 minutes. */
export function makeState(env = process.env, now = Date.now()) {
  const t = String(now);
  return t + '.' + createHmac('sha256', aeConfig(env).secret).update('ae-state.' + t).digest('hex').slice(0, 32);
}
export function stateOk(state, env = process.env, now = Date.now()) {
  const [t, mac] = String(state || '').split('.');
  if (!t || !mac || now - Number(t) > 15 * 60e3 || Number(t) > now + 60e3) return false;
  const want = createHmac('sha256', aeConfig(env).secret).update('ae-state.' + t).digest('hex').slice(0, 32);
  return mac.length === want.length && mac === want;
}

/** The token record kept in Blobs, from a token/create or token/refresh answer. */
export function tokenRecord(json, now = Date.now()) {
  const n = (v) => (v == null || v === '' ? null : Number(v));
  // expire_time is an epoch in ms; expires_in is seconds from now.
  const exp = n(json.expire_time) || (n(json.expires_in) ? now + n(json.expires_in) * 1000 : null);
  const refreshExp = n(json.refresh_token_valid_time) || (n(json.refresh_expires_in) ? now + n(json.refresh_expires_in) * 1000 : null);
  return {
    access_token: json.access_token, refresh_token: json.refresh_token || null,
    expires: exp, refreshExpires: refreshExp, account: json.account || json.user_nick || null, saved: now,
  };
}

/** A usable access token: refreshed when it ends within two days. */
export async function accessToken(store, opts = {}) {
  const rec = await store.get('token', { type: 'json' }).catch(() => null);
  if (!rec || !rec.access_token) return null;
  const now = opts.now || Date.now();
  if (rec.expires && rec.expires - now < 2 * 864e5 && rec.refresh_token) {
    try {
      const json = await systemCall('/auth/token/refresh', { refresh_token: rec.refresh_token }, opts);
      const next = tokenRecord(json, now);
      if (next.access_token) { await store.setJSON('token', next); return next.access_token; }
    } catch (e) { console.error('[aliexpress] refresh failed', e.message); }
  }
  return rec.access_token;
}

/** One product's facts for the store: title, prices, images, rating, stock. */
export function productFacts(json) {
  const r = json && (json.aliexpress_ds_product_get_response || json).result;
  if (!r) return null;
  const base = r.ae_item_base_info_dto || {};
  const skus = ((r.ae_item_sku_info_dtos || {}).ae_item_sku_info_d_t_o) || [];
  const prices = skus.map((s) => Number(s.offer_sale_price || s.sku_price)).filter((x) => x > 0);
  const regular = skus.map((s) => Number(s.sku_price)).filter((x) => x > 0);
  const images = String((r.ae_multimedia_info_dto || {}).image_urls || '').split(';').filter(Boolean);
  const stock = skus.reduce((n, s) => n + (Number(s.sku_available_stock) || 0), 0);
  return {
    id: String(base.product_id || ''), title: base.subject || '', currency: base.currency_code || 'USD',
    price: prices.length ? Math.min(...prices) : null, regular: regular.length ? Math.min(...regular) : null,
    rating: base.avg_evaluation_rating || null, sold: base.sales_count || null, stock, images: images.slice(0, 6),
  };
}
