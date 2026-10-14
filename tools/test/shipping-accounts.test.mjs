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

test("the weight bands are Bangalla's own table, and there is no reduced rate (2026-10-13)", () => {
  assert.equal(quote([line(P(800, 6))], { method: 'ship' }).cents, 575);      // 6 oz
  assert.equal(quote([line(P(800, 16))], { method: 'ship' }).cents, 995);     // exactly 1 lb
  assert.equal(quote([line(P(800, 20))], { method: 'ship' }).cents, 995);     // 1 lb 4 oz
  assert.equal(quote([line(P(800, 30), 2)], { method: 'ship' }).cents, 1195);  // 3 lb 12 oz
  assert.equal(quote([line(P(5000, 10), 3)], { method: 'ship' }).cents, 995); // $150, 1 lb 14 oz: full rate
  assert.equal(untilReduced(7500), 0);
  // Bangalla's own dropship table (bangalla.com/shipping-returns, read
  // 2026-10-13): what Bangalla bills is what the buyer pays.
  for (const [oz, cents] of [[7.9, 575], [8, 775], [12.8, 925], [15.9, 925], [16, 995], [47.9, 1145], [160, 1695], [161, 1695], [959, 8579]]) {
    assert.equal(quote([line(P(2000, oz))], { method: 'ship' }).cents, cents, oz + ' oz');
  }
});

test('over 10 lb now has a real rate; 60 lb and over asks for a quote', () => {
  assert.equal(quote([line(P(2000, 200))], { method: 'ship' }).cents, 1765); // 12.5 lb
  assert.throws(() => quote([line(P(2000, 960))], { method: 'ship' }), /email/);
});

test('shipping only for now (owner, 2026-10-02): no pickup, no local delivery', () => {
  for (const method of ['local', 'pickup-eufaula', 'pickup-mcalester']) {
    assert.throws(() => quote([line(P(2000, 10))], { method }), /choose/);
  }
  assert.deepEqual(SHIPPING.pickup, {});
});

test('no method chosen is a question, not a guess', () => {
  assert.throws(() => quote([line(P(2000, 10))], {}), /choose/);
});

test('the address is checked against the method before money moves', () => {
  assert.equal(addressOk('ship', { country_code: 'US', admin_area_1: 'OK' }).ok, true);
  assert.equal(addressOk('ship', { country_code: 'US', admin_area_1: 'HI' }).ok, false);
  assert.equal(addressOk('ship', { country_code: 'CA', admin_area_1: 'ON' }).ok, false);
});

test('shipping is its own line on the PayPal order, and asks PayPal for the address', () => {
  const product = { id: 'cloth', name: 'Cloth', price: 795, ship: true, shipOz: 3 };
  const lines = [{ product, qty: 2 }];
  const shipping = quote(lines, { method: 'ship' });
  const body = orderBody(lines, { returnUrl: 'r', cancelUrl: 'c', shipping, userId: '1234abcd-0000' });
  const unit = body.purchase_units[0];
  assert.equal(unit.amount.value, '21.65'); // 15.90 + 5.75
  assert.equal(unit.amount.breakdown.shipping.value, '5.75');
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
  // Modern function (2026-10-13): Identity's /user answers for the good
  // token; the admin token comes from globalThis.netlifyIdentityContext.
  globalThis.fetch = async (url, init = {}) => {
    if (/\/\.netlify\/identity\/user$/.test(url)) {
      return init.headers.Authorization === 'Bearer GOOD-TOKEN-0123456789abcdef'
        ? new Response(JSON.stringify({ id: 'abcd-0002', email: 'a@b.c', app_metadata: {} }), { status: 200 })
        : new Response('{}', { status: 401 });
    }
    deleted.push([url, init.method]);
    return new Response(null, { status: 204 });
  };
  globalThis.netlifyIdentityContext = { url: 'https://id.example/.netlify/identity', token: 'ADMIN' };
  const { setSignupsStoreForTests } = await import('../../netlify/lib/account-welcome.mjs');
  const signups = fakeStore();
  setSignupsStoreForTests(signups);
  try {
    const { default: account } = await import('../../netlify/functions/account.mjs');
    const call = (body, tok = 'GOOD-TOKEN-0123456789abcdef') => account(new Request('https://lavishleaf.org/.netlify/functions/account', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));

    assert.equal((await call({ action: 'get' }, 'BAD-TOKEN-0123456789abcdefg')).status, 401);
    const put = await call({ action: 'put', lists: [{ id: 'l1', name: 'Mine', items: ['demo-a'] }], orders: [{ id: 'FORGED' }] });
    assert.equal(put.status, 200);
    const got = await (await call({ action: 'get' })).json();
    assert.equal(got.lists[0].name, 'Mine');
    assert.deepEqual(got.orders, []);
    assert.ok(signups.m.has('u-abcd-0002'), 'the first sign-in is counted once for the dashboard');

    const del = await call({ action: 'delete' });
    assert.equal(del.status, 200);
    assert.equal(store.m.has('abcd-0002'), false);
    assert.deepEqual(deleted, [['https://id.example/.netlify/identity/admin/users/abcd-0002', 'DELETE']]);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.netlifyIdentityContext;
    setSignupsStoreForTests(null);
    setStoreForTests(null);
  }
});

test('each supplier ships and is charged on its own (owner, 2026-10-11)', () => {
  const B = (price, oz, qty = 1) => ({ product: { price, ship: true, shipOz: oz, shipFrom: 'bangalla' }, qty });
  const A = (price, qty = 1) => ({ product: { price, ship: true, shipOz: 6, shipFrom: 'aliexpress' }, qty });
  const q = (lines) => quote(lines, { method: 'ship' });
  assert.equal(q([A(549)]).cents, 299, 'one small overseas item pays the small fee');
  assert.equal(q([A(999)]).cents, 0, 'free from $9.99 of overseas items');
  assert.equal(q([A(549, 3)]).cents, 0, 'free from 3 overseas items');
  assert.equal(q([B(649, 10), A(999)]).cents, 775, 'the Bangalla band covers only Bangalla items');
  assert.equal(q([B(649, 10), A(549)]).cents, 775 + 299);
  assert.equal(q([B(3299, 106), B(649, 10)]).cents, 1520, 'Bangalla items share one band by their total weight');
  assert.equal(q([B(649, 10), A(549)]).label, 'Shipping (by weight, 0.5 to under 0.8 lb: $7.75 + direct-ship items under $9.99: $2.99)');
  assert.doesNotMatch(q([B(649, 10), A(549)]).label, /overseas|supplier/i, 'no supplier talk (owner, 2026-10-11)');
  assert.equal(q([{ product: { price: 500, ship: true, shipOz: 5 }, qty: 1 }]).cents, 575, 'no shipFrom: the bands');
});
