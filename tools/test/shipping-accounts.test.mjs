// Shipping (shipping.mjs) and customer accounts (netlify/lib/accounts.mjs),
// and the capture function that joins them, without PayPal or Netlify.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SHIPPING, ShippingError, addressOk, quote, untilReduced } from '../../shipping.mjs';
import { clean, setStoreForTests, addOrder, read } from '../../netlify/lib/accounts.mjs';
import { customId, orderBody, parseCustomId } from '../../netlify/lib/paypal.mjs';

const P = (price, shipOz, ship = true) => ({ id: 'x' + price, name: 'Item', price, ship, shipOz });
const line = (product, qty = 1) => ({ product, qty });

test('nothing posted, nothing charged and no address asked for', () => {
  const q = quote([line(P(2500, null, false))], { method: 'ship' });
  assert.deepEqual([q.cents, q.method, q.needsAddress], [0, 'none', false]);
});

test('the weight bands, and the $4.95 rate at $100', () => {
  assert.equal(quote([line(P(800, 6))], { method: 'ship' }).cents, 695);      // 6 oz
  assert.equal(quote([line(P(800, 16))], { method: 'ship' }).cents, 695);     // exactly 1 lb
  assert.equal(quote([line(P(800, 20))], { method: 'ship' }).cents, 995);     // 1 lb 4 oz
  assert.equal(quote([line(P(800, 30), 2)], { method: 'ship' }).cents, 1495); // 3 lb 12 oz
  assert.equal(quote([line(P(5000, 10), 2)], { method: 'ship' }).cents, 495); // $100.00 exactly
  assert.equal(quote([line(P(9999, 10))], { method: 'ship' }).cents, 695);    // a cent short
  assert.equal(untilReduced(7500), 2500);
});

test('over 10 lb is never posted', () => {
  assert.throws(() => quote([line(P(2000, 161))], { method: 'ship' }), ShippingError);
  assert.equal(quote([line(P(2000, 400))], { method: 'pickup-eufaula' }).cents, 0);
});

test('there is no local delivery (owner, 2026-10-01): only shipping and Eufaula pickup', () => {
  assert.throws(() => quote([line(P(2000, 10))], { method: 'local', zip: '74432' }), /choose/);
  assert.throws(() => quote([line(P(2000, 10))], { method: 'pickup-mcalester' }), /choose/);
  assert.equal(SHIPPING.pickup['pickup-eufaula'], 'Eufaula');
});

test('no method chosen is a question, not a guess', () => {
  assert.throws(() => quote([line(P(2000, 10))], {}), /choose/);
});

test('the address is checked against the method before money moves', () => {
  assert.equal(addressOk('ship', { country_code: 'US', admin_area_1: 'OK' }).ok, true);
  assert.equal(addressOk('ship', { country_code: 'US', admin_area_1: 'HI' }).ok, false);
  assert.equal(addressOk('ship', { country_code: 'CA', admin_area_1: 'ON' }).ok, false);
  assert.equal(addressOk('pickup-eufaula', undefined).ok, true);
});

test('shipping is its own line on the PayPal order, and asks PayPal for the address', () => {
  const product = { id: 'cloth', name: 'Cloth', price: 795, ship: true, shipOz: 3 };
  const lines = [{ product, qty: 2 }];
  const shipping = quote(lines, { method: 'ship' });
  const body = orderBody(lines, { returnUrl: 'r', cancelUrl: 'c', shipping, userId: '1234abcd-0000' });
  const unit = body.purchase_units[0];
  assert.equal(unit.amount.value, '22.85'); // 15.90 + 6.95
  assert.equal(unit.amount.breakdown.shipping.value, '6.95');
  assert.equal(unit.items[0].category, 'PHYSICAL_GOODS');
  assert.equal(body.payment_source.paypal.experience_context.shipping_preference, 'GET_FROM_FILE');
  assert.deepEqual(parseCustomId(unit.custom_id), { m: 'ship', u: '1234abcd-0000' });
});

test('custom_id round trips and stays inside PayPal\'s 127 characters', () => {
  const s = customId({ waivers: ['2026-09'], shipping: { method: 'local', zip: '74432' }, userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
  assert.ok(s.length <= 127);
  assert.deepEqual(parseCustomId(s), { w: '2026-09', m: 'local', z: '74432', u: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
});

test('an account record keeps only what the browser may write', () => {
  const out = clean({
    lists: [{ id: 'l1', name: 'Garden <b>', items: ['demo-a', 'demo-a', 'BAD ID', 7] }, { id: 'bad id!', name: 'x' }],
    cart: [{ id: 'cloth', qty: 99 }, { id: 'cloth', qty: 0 }],
    shelfOrder: ['cleaning', 'cleaning', '../etc'],
    orders: [{ id: 'FAKE', total: '0.01' }],
  });
  assert.deepEqual(out.lists, [{ id: 'l1', name: 'Garden  b', items: ['demo-a'] }]);
  assert.deepEqual(out.cart, [{ id: 'cloth', qty: 20 }]);
  assert.deepEqual(out.shelfOrder, ['cleaning']);
  assert.equal('orders' in out, false, 'the browser can never write an order');
});

function fakeStore() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
  };
}

test('an order is filed once, however often capture runs', async () => {
  const store = fakeStore();
  await addOrder(store, 'u1', { id: 'O1', total: '10.00' });
  await addOrder(store, 'u1', { id: 'O1', total: '10.00' });
  assert.equal((await read(store, 'u1')).orders.length, 1);
});

test('capture: checks the address, charges, and files the order for a signed-in buyer', async () => {
  process.env.PAYPAL_CLIENT_ID = 'id';
  process.env.PAYPAL_SECRET = 'secret';
  const store = fakeStore();
  setStoreForTests(store);
  const realFetch = globalThis.fetch;
  let captured = 0;
  let address = { country_code: 'US', admin_area_1: 'OK', postal_code: '74432' };
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'T' }));
    if (init.method === 'GET') {
      return new Response(JSON.stringify({
        id: 'ORDER12345', status: 'APPROVED',
        purchase_units: [{ custom_id: 'm=ship;u=user-0001', shipping: { address }, amount: { value: '22.85' }, items: [{ name: 'Cloth', quantity: '2' }] }],
      }));
    }
    captured++;
    return new Response(JSON.stringify({
      id: 'ORDER12345', status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ amount: { value: '22.85' } }] } }],
    }), { status: 201 });
  };
  try {
    const { default: capture } = await import('../../netlify/functions/capture.mjs');
    const post = () => capture(new Request('https://lavishleaf.org/x', { method: 'POST', body: JSON.stringify({ orderId: 'ORDER12345' }) }));

    address = { country_code: 'US', admin_area_1: 'AK', postal_code: '99501' };
    const refused = await post();
    assert.equal(refused.status, 400);
    assert.equal(captured, 0, 'nothing is charged for an address we do not post to');

    address = { country_code: 'US', admin_area_1: 'OK', postal_code: '74432' };
    const ok = await post();
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).status, 'COMPLETED');
    assert.equal(captured, 1);
    const rec = await read(store, 'user-0001');
    assert.equal(rec.orders.length, 1);
    assert.deepEqual(rec.orders[0].items, [{ name: 'Cloth', qty: 2 }]);
  } finally {
    globalThis.fetch = realFetch;
    setStoreForTests(null);
  }
});

test('the account function: signed out is refused, a put cannot forge an order, delete removes both', async () => {
  const store = fakeStore();
  setStoreForTests(store);
  const realFetch = globalThis.fetch;
  const deleted = [];
  globalThis.fetch = async (url, init) => { deleted.push([url, init.method]); return new Response(null, { status: 204 }); };
  try {
    const { handler } = await import('../../netlify/functions/account.mjs');
    const ctx = { clientContext: { user: { sub: 'user-0002', email: 'a@b.c' }, identity: { url: 'https://id.example/.netlify/identity', token: 'ADMIN' } } };
    const call = (body, c = ctx) => handler({ httpMethod: 'POST', body: JSON.stringify(body) }, c);

    assert.equal((await call({ action: 'get' }, {})).statusCode, 401);
    const put = await call({ action: 'put', lists: [{ id: 'l1', name: 'Mine', items: ['demo-a'] }], orders: [{ id: 'FORGED' }] });
    assert.equal(put.statusCode, 200);
    const got = JSON.parse((await call({ action: 'get' })).body);
    assert.equal(got.lists[0].name, 'Mine');
    assert.deepEqual(got.orders, []);

    const del = await call({ action: 'delete' });
    assert.equal(del.statusCode, 200);
    assert.equal(store.m.has('user-0002'), false);
    assert.deepEqual(deleted, [['https://id.example/.netlify/identity/admin/users/user-0002', 'DELETE']]);
  } finally {
    globalThis.fetch = realFetch;
    setStoreForTests(null);
  }
});
