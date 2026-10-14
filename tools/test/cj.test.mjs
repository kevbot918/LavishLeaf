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

test('CJ items ship at the one direct-ship rate, shared with AliExpress, no location named', () => {
  const C = (price, q = 1, w) => ({ product: { price, ship: true, shipOz: 20, shipFrom: 'cj', shipCents: 900, source: { warehouse: w } }, qty: q });
  const A = (price, q = 1) => ({ product: { price, ship: true, shipOz: 4, shipFrom: 'aliexpress' }, qty: q });
  assert.equal(quote([C(499)], { method: 'ship' }).cents, 299);
  assert.equal(quote([C(1299)], { method: 'ship' }).cents, 0, 'free from $9.99');
  assert.equal(quote([C(199, 3, 'CN')], { method: 'ship' }).cents, 0, 'free from 3 items');
  const mixed = quote([C(300, 1, 'US'), A(300), C(200, 1, 'CN')], { method: 'ship' });
  assert.equal(mixed.parts.length, 1, 'one direct-ship part for CJ and AliExpress together');
  assert.equal(mixed.cents, 0);
  assert.doesNotMatch(mixed.label + quote([C(499, 1, 'CN')], { method: 'ship' }).label, /overseas|warehouse|US /i);
});
