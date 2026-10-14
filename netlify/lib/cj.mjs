// CJ Dropshipping (owner, 2026-10-14: "I do want to use CJ dropshipping ...
// We can use them for our Recreation and Outdoor section"). lavishleaf.org is
// its own site, not a Shopify-type store, so it connects through CJ's open
// API 2.0 (developers.cjdropshipping.com):
//   * an access token from the owner's API key (CJ_API_KEY in Netlify; My CJ,
//     Authorization, API, Add API, type API Key), kept in Blobs "cj" and
//     refreshed before its 180 days run out;
//   * product facts: price, and US-warehouse stock per variant (stock check);
//   * freight to a ZIP (the cheapest US line);
//   * an order for a paid customer order, created WITHOUT paying (payType 3):
//     the owner reviews and pays it in his CJ account (the dashboard's
//     "Place on CJ" button).
// CJ allows one call a second per account; calls here wait their turn.

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

let testStore = null, testFetch = null;
export function setCjForTests({ store, fetchImpl } = {}) { testStore = store || null; testFetch = fetchImpl || null; }

async function cjStore() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'cj', consistency: 'strong' });
}

export const cjReady = (env = process.env) => !!String(env.CJ_API_KEY || '').trim();

export class CjError extends Error {}

let last = 0;
async function turn() {
  const wait = last + 1100 - Date.now();
  if (wait > 0 && !testFetch) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

async function raw(path, { method = 'GET', query = null, body = null, token = null } = {}) {
  await turn();
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  const res = await (testFetch || fetch)(BASE + path + qs, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'CJ-Access-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.result === false || (json.code != null && json.code !== 200)) {
    throw new CjError(`CJ said ${json.code || res.status}: ${String(json.message || '').slice(0, 200)}`);
  }
  return json.data;
}

/** A working access token: the cached one, refreshed, or a new one from the key. */
export async function accessToken(env = process.env, now = Date.now()) {
  if (!cjReady(env)) throw new CjError('CJ is not connected yet: add CJ_API_KEY in Netlify (docs/OWNER-STEPS.md, "CJ Dropshipping").');
  const store = await cjStore();
  const rec = await store.get('token', { type: 'json' }).catch(() => null);
  const exp = (d) => Date.parse(d) || 0;
  if (rec && rec.accessToken && exp(rec.accessTokenExpiryDate) - now > 3 * 864e5) return rec.accessToken;
  let data = null;
  if (rec && rec.refreshToken && exp(rec.refreshTokenExpiryDate) > now) {
    try { data = await raw('/authentication/refreshAccessToken', { method: 'POST', body: { refreshToken: rec.refreshToken } }); } catch { data = null; }
  }
  if (!data) data = await raw('/authentication/getAccessToken', { method: 'POST', body: { apiKey: String(env.CJ_API_KEY).trim() } });
  await store.setJSON('token', { ...data, saved: new Date(now).toISOString() });
  return data.accessToken;
}

export async function call(path, opts = {}) {
  return raw(path, { ...opts, token: await accessToken() });
}

/** US stock of one variant from a product/query answer (CJ's own US warehouse plus verified ones). */
export function usStock(variant) {
  const inv = (variant && variant.inventories) || [];
  return inv.filter((i) => String(i.countryCode).toUpperCase() === 'US').reduce((n, i) => n + (Number(i.totalInventory) || 0), 0);
}

/** One country's stock (US, or CN for the China warehouses) from a
 * stock/queryByVid answer (2026-10-14, measured: product/query carries no
 * inventories; this call gives each warehouse's count). */
export function usFromStock(rows, country = 'US') {
  return (Array.isArray(rows) ? rows : []).filter((r) => String(r.countryCode).toUpperCase() === country).reduce((n, r) => n + (Number(r.totalInventoryNum) || 0), 0);
}

/**
 * One product: its variants with price, and the US stock of the variants
 * asked for (one call each). Null when CJ no longer has the product.
 */
export async function productFacts(pid, vids = null, country = 'US') {
  let d;
  try { d = await call('/product/query', { query: { pid, countryCode: 'US' } }); }
  catch (e) { if (/not ?exist|not ?found|offline|removed|delist/i.test(e.message)) return null; throw e; }
  if (!d) return null;
  const variants = (d.variants || []).map((v) => ({ vid: v.vid, sku: v.variantSku, key: v.variantKey || v.variantNameEn || '', price: Number(v.variantSellPrice) || null, us: usStock(v) }));
  for (const v of variants) {
    if (vids && !vids.includes(v.vid)) continue;
    v.us = usFromStock(await call('/product/stock/queryByVid', { query: { vid: v.vid } }).catch(() => []), country);
  }
  return { pid: d.pid, name: d.productNameEn, sku: d.productSku, sellPrice: Number(d.sellPrice) || null, variants };
}

/** Freight options from a warehouse (US, or CN) to a US ZIP, cheapest first. */
export async function freight(items, zip, from = 'US') {
  const d = await call('/logistic/freightCalculate', { method: 'POST', body: { startCountryCode: from, endCountryCode: 'US', zip: String(zip || '').slice(0, 5), products: items.map((i) => ({ vid: i.vid, quantity: i.qty })) } });
  return (d || []).map((x) => ({ name: x.logisticName, days: x.logisticAging, usd: Number(x.totalPostageFee || x.logisticPrice) || 0 })).sort((a, b) => a.usd - b.usd);
}

/**
 * A CJ order for one of our paid orders, created but NOT paid (payType 3):
 * the owner pays it in his CJ account. order: { id, name, phone, email,
 * addr: { line1, line2, city, state, zip } }, items: [{ vid, qty }].
 */
export async function createOrder(order, items, logisticName, from = 'US') {
  const a = order.addr;
  return call('/shopping/order/createOrderV2', {
    method: 'POST',
    body: {
      orderNumber: String(order.id).slice(0, 50),
      shippingCountryCode: 'US', shippingCountry: 'United States',
      shippingProvince: a.state, shippingCity: a.city, shippingZip: a.zip,
      shippingAddress: a.line1, shippingAddress2: a.line2 || '',
      shippingCustomerName: order.name, shippingPhone: order.phone || '', email: order.email || '',
      logisticName, fromCountryCode: from, payType: 3,
      products: items.map((i) => ({ vid: i.vid, quantity: i.qty })),
    },
  });
}
