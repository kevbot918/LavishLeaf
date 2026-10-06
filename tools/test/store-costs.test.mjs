// The owner's private supplier costs: netlify/functions/store-costs.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { cleanRow, setStoreForTests } from '../../netlify/functions/store-costs.mjs';

function fakeStore() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); return { modified: true }; },
  };
}
const post = (body) => new Request('https://lavishleaf.org/.netlify/functions/store-costs', { method: 'POST', body: JSON.stringify(body) });
const row = { sku: 'B-44494-1PK', brand: 'KIRK`S', name: 'KIRKS CASTILE BAR SOAP ( 1 X 4 OZ   )', section: 'BODYCARE > SOAP BARS', pack: '4 OZ', perCase: 1, lb: 0.32, stock: 644, cost: 1.9, list: 2.71, gold: 1.76, map: null, restricted: false, eta: '' };

test('only the owner may read or write', async () => {
  setStoreForTests(fakeStore());
  const res = await handler(post({ action: 'get' }), {}, { admin: null });
  assert.equal(res.status, 403);
});

test('save then get returns the rows keyed by SKU, and drops anything that is not a product', async () => {
  const s = fakeStore(); setStoreForTests(s);
  const saved = await handler(post({ action: 'save', file: 'Bangalla Product Data csv.csv', rows: [row, { sku: 'not-a-sku', cost: 1 }, null, { ...row, sku: 'B-1-6PK', cost: -5, list: 'x' }] }), {}, { admin: { email: 'o@x' } });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).count, 2);
  const got = await (await handler(post({ action: 'get' }), {}, { admin: { email: 'o@x' } })).json();
  assert.equal(got.count, 2);
  assert.equal(got.rows['B-44494-1PK'].cost, 1.9);
  assert.equal(got.rows['B-1-6PK'].cost, null, 'a negative cost is not a cost');
  assert.equal(got.rows['B-1-6PK'].list, null, 'text is not a price');
  assert.equal(got.file, 'Bangalla Product Data csv.csv');
});

test('get before any upload says so instead of failing', async () => {
  setStoreForTests(fakeStore());
  const got = await (await handler(post({ action: 'get' }), {}, { admin: { email: 'o@x' } })).json();
  assert.equal(got.loaded, null);
  assert.deepEqual(got.rows, {});
});

test('an empty or oversized upload is refused with a sentence', async () => {
  setStoreForTests(fakeStore());
  const a = await handler(post({ action: 'save', rows: [] }), {}, { admin: { email: 'o@x' } });
  assert.equal(a.status, 400);
  const b = await handler(post({ action: 'save', rows: Array.from({ length: 6001 }, () => row) }), {}, { admin: { email: 'o@x' } });
  assert.equal(b.status, 400);
});

test('cleanRow keeps text short and flags booleans strictly', () => {
  const c = cleanRow({ ...row, name: 'x'.repeat(500), restricted: 'Y' });
  assert.equal(c.name.length, 200);
  assert.equal(c.restricted, false, 'only true is true');
});
