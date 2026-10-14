// The stock check (2026-10-13): Bangalla's feed in any shape, options by their
// own SKUs, AliExpress items gone or low, and a broken feed hides nothing.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MIN_STOCK, outOf, parseFeed, runCheck } from '../../netlify/lib/stock.mjs';

function fakeStore() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); } };
}
const catalog = {
  flour: { id: 'flour', name: 'Flour', active: true, ship: true, supplier: { name: 'Bangalla', sku: 'B-81741-4PK', item: null, optionSkus: null } },
  soap: { id: 'soap', name: 'Soap', active: true, ship: true, supplier: { name: 'Bangalla', sku: 'B-1-1PK', item: null, optionSkus: { Almond: 'B-1-1PK', Jasmine: 'B-2-1PK' } } },
  gone: { id: 'gone', name: 'Gone', active: true, ship: true, supplier: { name: 'Bangalla', sku: 'B-9-1PK', item: null, optionSkus: null } },
  buds: { id: 'buds', name: 'Earbuds', active: true, ship: true, supplier: { name: 'AliExpress', sku: null, item: '3256805035815142', optionSkus: null } },
  low: { id: 'low', name: 'Low', active: true, ship: true, supplier: { name: 'AliExpress', sku: null, item: '111111', optionSkus: null } },
  pull: { id: 'pull', name: 'Pulled', active: true, ship: true, supplier: { name: 'AliExpress', sku: null, item: '222222', optionSkus: null } },
  reg: { id: 'reg', name: 'Registration', active: true, ship: false, supplier: null },
};
const filler = Array.from({ length: 60 }, (_, i) => `B-F${i}-1PK,10`).join('\n');

test('the feed is read as CSV, tab-separated or JSON, by column name', () => {
  assert.equal(parseFeed('SKU,Title,Quantity\nB-1-1PK,"Soap, almond",12\n').get('B-1-1PK'), 12);
  assert.equal(parseFeed('Item Number\tQty Available\nb-2-1pk\t3\n').get('B-2-1PK'), 3);
  assert.equal(parseFeed(JSON.stringify([{ sku: 'B-3', quantity: 7 }])).get('B-3'), 7);
  assert.equal(parseFeed('no,columns\n1,2').size, 0);
});

test('Bangalla: missing or under 5 is out; one option out leaves the product on', async () => {
  const s = fakeStore();
  const feed = 'SKU,Quantity\nB-81741-4PK,973\nB-1-1PK,40\nB-2-1PK,2\n' + filler;
  const st = await runCheck(s, { env: { BANGALLA_FEED_URL: 'https://x/feed.csv' }, fetchImpl: async () => new Response(feed), catalog });
  assert.equal(st.items.flour.out, false);
  assert.equal(st.items.gone.out, true);
  assert.match(st.items.gone.why, /not in/);
  assert.equal(st.items.soap.out, false);
  assert.deepEqual(outOf(st), { products: ['gone'], options: { soap: ['Jasmine'] } });
  assert.equal(MIN_STOCK, 5);
});

test('AliExpress: gone or low is out; an API error changes nothing', async () => {
  const s = fakeStore();
  const aeCheck = async (id) => {
    if (id === '222222') return null;
    if (id === '111111') return { stock: 3 };
    return { stock: 900 };
  };
  const st = await runCheck(s, { env: {}, aeCheck, catalog });
  assert.equal(st.items.buds.out, false);
  assert.equal(st.items.low.out, true);
  assert.equal(st.items.pull.out, true);
  const st2 = await runCheck(s, { env: {}, aeCheck: async () => { throw new Error('timeout'); }, catalog });
  assert.equal(st2.items.buds.out, false, 'kept from the last good check');
});

test('a feed that comes back empty or broken hides nothing', async () => {
  const s = fakeStore();
  const st = await runCheck(s, { env: { BANGALLA_FEED_URL: 'https://x/feed.csv' }, fetchImpl: async () => new Response('SKU,Quantity\n'), catalog });
  assert.equal(st.bangalla.ok, false);
  assert.deepEqual(outOf(st).products, []);
});

// 2026-10-14: Bangalla has no feed link, so the owner's uploaded file is used;
// a SKU missing from it is unknown (an older upload kept only some rows), and
// a paused supplier takes every one of its products off.
test("the uploaded Bangalla file: low is out, missing is left alone; pause takes all off", async () => {
  const s = fakeStore();
  const costsFile = { loaded: '2026-10-14T12:00:00Z', rows: { 'B-81741-4PK': { sku: 'B-81741-4PK', stock: 2 }, 'B-1-1PK': { sku: 'B-1-1PK', stock: 30 } } };
  const st = await runCheck(s, { env: {}, catalog, costsFile });
  assert.equal(st.bangalla.from, 'file');
  assert.equal(st.items.flour.out, true);
  assert.equal(st.items.gone, undefined, 'not in the file: not judged');
  assert.equal(st.items.soap.out, false);
  assert.deepEqual(outOf(st, catalog).products, ['flour']);
  const paused = outOf({ ...st, paused: { bangalla: true } }, catalog).products.sort();
  assert.deepEqual(paused, ['flour', 'gone', 'soap']);
});
