// Customer account records (docs/ACCOUNTS.md).
//
// One record per customer in the Netlify Blobs store "accounts", keyed by the
// Netlify Identity user id:
//
//   { lists:      [{ id, name, items: [productId] }]   wish lists
//     cart:       [{ id, qty }]                         the saved cart
//     shelfOrder: [shelfSlug]                           sidebar and Home order
//     orders:     [{ id, date, total, items, delivery }] written by capture only
//     updated:    ISO time }
//
// The browser may replace lists, cart and shelfOrder (account.mjs), always
// through clean(), which keeps only the shapes above at sensible sizes. It
// can never write orders: only capture.mjs adds one, after PayPal says the
// payment went through.
//
// The data is kept out of Identity on purpose, so the sign-in could move to
// another provider later without moving anybody's lists.

export const STORE_NAME = 'accounts';

const ID = /^[a-z0-9-]{1,80}$/;
const LIST_ID = /^[A-Za-z0-9_-]{1,40}$/;

let testStore = null;
/** Tests hand in a fake store; production uses Netlify Blobs. */
export function setStoreForTests(store) { testStore = store; }

/** The Blobs store. Lambda-style functions call connectLambda(event) first. */
export async function accountsStore(event) {
  if (testStore) return testStore;
  const blobs = await import('@netlify/blobs');
  if (event) blobs.connectLambda(event);
  return blobs.getStore(STORE_NAME);
}

export function emptyRecord() {
  return { lists: [], cart: [], shelfOrder: [], orders: [], updated: null };
}

/** Only what the browser may write, cut to size. */
export function clean(input) {
  const src = input && typeof input === 'object' ? input : {};
  const lists = (Array.isArray(src.lists) ? src.lists : []).slice(0, 50)
    .filter((l) => l && LIST_ID.test(String(l.id)) && typeof l.name === 'string' && l.name.trim())
    .map((l) => ({
      id: String(l.id),
      name: l.name.replace(/[\x00-\x1f<>]/g, ' ').trim().slice(0, 40),
      items: [...new Set((Array.isArray(l.items) ? l.items : []).filter((i) => typeof i === 'string' && ID.test(i)))].slice(0, 500),
    }));
  const cart = (Array.isArray(src.cart) ? src.cart : []).slice(0, 50)
    .filter((c) => c && typeof c.id === 'string' && ID.test(c.id) && Number.isInteger(c.qty) && c.qty > 0)
    .map((c) => ({ id: c.id, qty: Math.min(20, c.qty) }));
  const shelfOrder = [...new Set((Array.isArray(src.shelfOrder) ? src.shelfOrder : [])
    .filter((s) => typeof s === 'string' && ID.test(s)))].slice(0, 100);
  return { lists, cart, shelfOrder };
}

export async function read(store, userId) {
  const rec = await store.get(userId, { type: 'json' });
  return rec && typeof rec === 'object' ? { ...emptyRecord(), ...rec } : emptyRecord();
}

export async function write(store, userId, rec) {
  const out = { ...rec, updated: new Date().toISOString() };
  const size = JSON.stringify(out).length;
  if (size > 256 * 1024) throw new Error('account record too large');
  await store.setJSON(userId, out);
  return out;
}

/** Add one paid order to a customer's history. Safe to call twice. */
export async function addOrder(store, userId, order) {
  const rec = await read(store, userId);
  if (rec.orders.some((o) => o.id === order.id)) return rec;
  rec.orders = [order, ...rec.orders].slice(0, 200);
  return write(store, userId, rec);
}
