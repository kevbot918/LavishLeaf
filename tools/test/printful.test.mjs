// Printful (2026-10-14): apparel shipping at Printful's own cost, order lines
// to sync variants, and the draft order body.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { call, createDraft } from '../../netlify/lib/printful.mjs';
import { printfulItems } from '../../netlify/functions/printful.mjs';
import { quote } from '../../shipping.mjs';

const P = (one, add, qty = 1) => ({ product: { price: 3000, ship: true, shipOz: 7, shipFrom: 'printful', shipCents: one, shipAddCents: add }, qty });

test('apparel ships at cost: the dearest item in full, each further unit its add-on', () => {
  const q = quote([P(475, 220, 2), P(899, 300)], { method: 'ship' });
  assert.equal(q.cents, 899 + 220 + 220);
  assert.equal(q.parts.length, 1);
  assert.match(q.label, /Lavish Leaf apparel/);
});

test('apparel is its own part, apart from direct-ship items', () => {
  const ae = { product: { price: 500, ship: true, shipOz: 3, shipFrom: 'aliexpress' }, qty: 1 };
  const q = quote([P(475, 220), ae], { method: 'ship' });
  assert.deepEqual(q.parts.map((p) => p.cents), [475, 299]);
});

test('order lines map to Printful sync variants, by option or the single variant', () => {
  const cat = {
    'pf-tee': { supplier: { name: 'Printful', sv: '111', optionSv: { 'Black, M': '222', 'Black, L': '333' } } },
    'pf-hat': { supplier: { name: 'Printful', sv: '444', optionSv: null } },
    'ae-x': { supplier: { name: 'AliExpress', item: '9' } },
  };
  const items = printfulItems({ items: [{ sku: 'pf-tee:Black, L', qty: 2 }, { sku: 'pf-hat', qty: 1 }, { sku: 'ae-x', qty: 1 }] }, cat);
  assert.deepEqual(items.map((i) => [i.sv, i.qty]), [['333', 2], ['444', 1]]);
});

test('a draft order: confirm=false, the token as a bearer, the address and sync variants', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ code: 200, result: { id: 77, status: 'draft' } }), { status: 200 }); };
  const r = await createDraft({ id: 'ABC-1', email: 'a@b.c', addr: { name: 'Pat', line1: '1 Main', city: 'Stigler', state: 'OK', zip: '74462' } }, [{ sv: '333', qty: 2 }], { env: { PRINTFUL_API_TOKEN: 't0k' }, fetchImpl });
  assert.equal(r.id, 77);
  assert.match(seen.url, /\/orders\?confirm=false$/);
  assert.equal(seen.init.headers.Authorization, 'Bearer t0k');
  const b = JSON.parse(seen.init.body);
  assert.deepEqual(b.items, [{ sync_variant_id: 333, quantity: 2 }]);
  assert.equal(b.recipient.state_code, 'OK');
});

test('a Printful error is reported in words', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ code: 401, error: { message: 'Invalid token' } }), { status: 401 });
  await assert.rejects(call('/store', { env: { PRINTFUL_API_TOKEN: 'x' }, fetchImpl }), /Invalid token/);
});
