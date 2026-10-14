// CJ Dropshipping (2026-10-14): the token, US stock, the order lines and
// address, the stock check, and the cart's freight for CJ items.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { accessToken, productFacts, setCjForTests, usStock } from '../../netlify/lib/cj.mjs';
import { addressOf, cjItems } from '../../netlify/functions/cj.mjs';
import { runCheck, outOf } from '../../netlify/lib/stock.mjs';
import { quote } from '../../shipping.mjs';

function fakeStore() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); } };
}

test('a token from the API key, kept and reused until it nears its end', async () => {
  const store = fakeStore(); const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, JSON.parse(init.body || '{}')]); return new Response(JSON.stringify({ code: 200, result: true, data: { accessToken: 'AT1', accessTokenExpiryDate: '2027-04-01T00:00:00Z', refreshToken: 'RT1', refreshTokenExpiryDate: '2027-04-01T00:00:00Z' } })); };
  setCjForTests({ store, fetchImpl });
  const env = { CJ_API_KEY: 'CJ123@api@abc' };
  assert.equal(await accessToken(env, Date.parse('2026-10-14')), 'AT1');
  assert.equal(await accessToken(env, Date.parse('2026-10-15')), 'AT1');
  assert.equal(calls.length, 1, 'one call, then the kept token');
  assert.match(calls[0][0], /authentication\/getAccessToken$/);
  assert.deepEqual(calls[0][1], { apiKey: 'CJ123@api@abc' });
  await assert.rejects(accessToken({}), /CJ_API_KEY/);
  setCjForTests();
});

test('US stock sums only the US warehouses; a removed product is null', async () => {
  assert.equal(usStock({ inventories: [{ countryCode: 'US', totalInventory: 40 }, { countryCode: 'CN', totalInventory: 9000 }, { countryCode: 'us', totalInventory: 2 }] }), 42);
  const store = fakeStore();
  store.m.set('token', JSON.stringify({ accessToken: 'AT', accessTokenExpiryDate: '2099-01-01', refreshToken: 'R', refreshTokenExpiryDate: '2099-01-01' }));
  setCjForTests({ store, fetchImpl: async () => new Response(JSON.stringify({ code: 1600100, result: false, message: 'product not exist' })) });
  process.env.CJ_API_KEY = 'k';
  assert.equal(await productFacts('P1'), null);
  delete process.env.CJ_API_KEY;
  setCjForTests();
});

test("an order's CJ lines become variants; an older order's address is read from its line", () => {
  const cat = {
    tent: { id: 'tent', supplier: { name: 'CJ Dropshipping', pid: 'P1', vid: 'V1', optionVids: null } },
    mat: { id: 'mat', supplier: { name: 'CJ Dropshipping', pid: 'P2', vid: 'V2', optionVids: { Blue: 'V2B', Green: 'V2G' } } },
    soap: { id: 'soap', supplier: { name: 'Bangalla', sku: 'B-1-1PK' } },
  };
  const o = { items: [{ sku: 'tent', qty: 1 }, { sku: 'mat:Green', qty: 2 }, { sku: 'soap', qty: 1 }] };
  assert.deepEqual(cjItems(o, cat).map((i) => [i.vid, i.qty]), [['V1', 1], ['V2G', 2]]);
  assert.deepEqual(addressOf({ shipTo: 'Pat Smith, 1 Main St, Apt 2, Stigler, OK 74462' }), { name: 'Pat Smith', line1: '1 Main St', line2: 'Apt 2', city: 'Stigler', state: 'OK', zip: '74462' });
  assert.equal(addressOf({ addr: { line1: 'x', city: 'c', state: 'OK', zip: '1' } }).line1, 'x');
});

test('the stock check: a CJ variant under 5 in the US is out', async () => {
  const catalog = { tent: { id: 'tent', name: 'Tent', active: true, ship: true, supplier: { name: 'CJ Dropshipping', pid: 'P1', vid: 'V1', optionVids: null } } };
  const st = await runCheck(fakeStore(), { env: {}, catalog, cjCheck: async () => ({ variants: [{ vid: 'V1', us: 3 }] }) });
  assert.deepEqual(outOf(st, catalog).products, ['tent']);
  const ok = await runCheck(fakeStore(), { env: {}, catalog, cjCheck: async () => ({ variants: [{ vid: 'V1', us: 80 }] }) });
  assert.deepEqual(outOf(ok, catalog).products, []);
});

test("the cart's CJ freight: the dearest item, plus $1.50 for each more", () => {
  const C = (c, q = 1) => ({ product: { price: 2000, ship: true, shipOz: 20, shipFrom: 'cj', shipCents: c }, qty: q });
  assert.equal(quote([C(499)], { method: 'ship' }).cents, 499);
  assert.equal(quote([C(499), C(699)], { method: 'ship' }).cents, 849);
  assert.equal(quote([C(100, 3)], { method: 'ship' }).cents, 300, 'never more than each item alone');
});

test('US and overseas CJ parcels are charged apart, each extra unit at its own add-on', () => {
  const C = (c, q, a, w) => ({ product: { price: 2000, ship: true, shipOz: 20, shipFrom: 'cj', shipCents: c, shipAddCents: a, shipWarehouse: w }, qty: q });
  const q = quote([C(0, 1, null), C(604, 2, 120, 'CN')], { method: 'ship' });
  assert.deepEqual(q.parts.map((p) => [p.desc, p.cents]), [['US warehouse items', 0], ['overseas warehouse items', 724]]);
  assert.equal(q.cents, 724);
});

test("the cart's own product data (source.warehouse) is read as well as the catalog's", () => {
  const bottle = { product: { price: 649, ship: true, shipOz: 8, shipFrom: 'cj', shipCents: 687, shipAddCents: 205, source: { warehouse: 'CN' } }, qty: 2 };
  const chair = { product: { price: 4149, ship: true, shipOz: 120, shipFrom: 'cj', shipCents: 0, source: { warehouse: 'US' } }, qty: 1 };
  assert.deepEqual(quote([bottle, chair], { method: 'ship' }).parts.map((p) => [p.desc, p.cents]), [['US warehouse items', 0], ['overseas warehouse items', 892]]);
});
