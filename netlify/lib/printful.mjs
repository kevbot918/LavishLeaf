// Printful (2026-10-14): our own Lavish Leaf apparel, printed and shipped by
// Printful when it sells. API v1, https://developers.printful.com/docs/
//
// Env (Netlify, and .env for tools/printful-import.mjs; never in the repo):
//   PRINTFUL_API_TOKEN   the private token from developers.printful.com
//   PRINTFUL_STORE_ID    only when the token covers more than one store
//
// Orders are created as DRAFTS (confirm=false): nothing is charged until the
// owner presses Confirm in Printful, so a mistake costs nothing.
const BASE = 'https://api.printful.com';

export class PrintfulError extends Error {}

export const printfulReady = (env = process.env) => !!env.PRINTFUL_API_TOKEN;

// An account-wide token needs the store named on every store call. Without
// PRINTFUL_STORE_ID, the store called "Lavish Leaf" is found once and kept
// (the account also has Printful's own "Personal orders" store).
let storeIdCache = null;
async function storeId(env, fetchImpl) {
  if (env.PRINTFUL_STORE_ID) return String(env.PRINTFUL_STORE_ID);
  if (storeIdCache) return storeIdCache;
  const stores = await call('/stores', { env, fetchImpl, noStore: true }).catch(() => null);
  if (!Array.isArray(stores) || !stores.length) return null;
  const s = stores.find((x) => /lavish/i.test(x.name)) || stores.find((x) => !/personal/i.test(x.name)) || stores[0];
  storeIdCache = String(s.id);
  return storeIdCache;
}

export async function call(path, { method = 'GET', body, env = process.env, fetchImpl = fetch, noStore = false } = {}) {
  if (!env.PRINTFUL_API_TOKEN) throw new PrintfulError('PRINTFUL_API_TOKEN is not set.');
  const headers = { Authorization: 'Bearer ' + env.PRINTFUL_API_TOKEN, 'Content-Type': 'application/json' };
  if (!noStore && path !== '/stores') { const id = await storeId(env, fetchImpl); if (id) headers['X-PF-Store-Id'] = id; }
  const r = await fetchImpl(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.code && j.code >= 300)) {
    const msg = (j.error && (j.error.message || j.error.reason)) || j.result || ('HTTP ' + r.status);
    throw new PrintfulError('Printful: ' + String(msg).slice(0, 300));
  }
  return j.result;
}

/** Every product in the store, with its variants (size, color, retail price, mockup, catalog variant). */
export async function storeProducts(opts = {}) {
  const out = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await call(`/store/products?limit=100&offset=${offset}`, opts);
    for (const p of page || []) out.push(await call('/store/products/' + p.id, opts));
    if (!page || page.length < 100) break;
  }
  return out;
}

/** Printful's own shipping to an address for some catalog variants: the cheapest rate, in cents. */
export async function shippingCents(items, recipient, opts = {}) {
  const rates = await call('/shipping/rates', { ...opts, method: 'POST', body: { recipient: { country_code: 'US', ...recipient }, items } });
  const r = (rates || []).map((x) => ({ id: x.id, name: x.name, cents: Math.round(Number(x.rate) * 100) })).sort((a, b) => a.cents - b.cents)[0];
  return r || null;
}

/** A DRAFT Printful order (confirm=false) for our order's Printful lines. */
export async function createDraft(order, items, opts = {}) {
  const a = order.addr;
  return call('/orders?confirm=false', {
    ...opts,
    method: 'POST',
    body: {
      external_id: String(order.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
      shipping: 'STANDARD',
      recipient: {
        name: a.name || order.name || '', address1: a.line1, address2: a.line2 || undefined,
        city: a.city, state_code: a.state, country_code: 'US', zip: a.zip,
        email: order.email || undefined, phone: order.phone || undefined,
      },
      items: items.map((i) => ({ sync_variant_id: Number(i.sv), quantity: i.qty })),
    },
  });
}
