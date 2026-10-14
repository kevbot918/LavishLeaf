// Product options (scent, colour, size), 2026-10-11: the server refuses a
// line without a real option, keeps options apart, and names them for PayPal.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateCart, orderBody } from '../../netlify/lib/paypal.mjs';
import { clean } from '../../netlify/lib/accounts.mjs';

const catalog = {
  soap: { id: 'soap', name: 'Hand Soap', price: 599, active: true, ship: true, shipOz: 12, options: { label: 'Scent', values: ['Almond', 'Jasmine'] } },
  cloth: { id: 'cloth', name: 'Cloth', price: 795, active: true, ship: true, shipOz: 3, options: null },
};

test('a product with options needs one of its own', () => {
  assert.throws(() => validateCart([{ id: 'soap', qty: 1 }], catalog), /choose a scent/);
  assert.throws(() => validateCart([{ id: 'soap', qty: 1, opt: 'Rose' }], catalog), /choose a scent/);
  assert.throws(() => validateCart([{ id: 'cloth', qty: 1, opt: 'Blue' }], catalog), /changed/);
});

test('two scents are two lines, the same scent merges', () => {
  const lines = validateCart([{ id: 'soap', qty: 1, opt: 'Almond' }, { id: 'soap', qty: 2, opt: 'Jasmine' }, { id: 'soap', qty: 1, opt: 'Almond' }, { id: 'cloth', qty: 1 }], catalog);
  assert.deepEqual(lines.map((l) => [l.product.id, l.opt || '', l.qty]), [['soap', 'Almond', 2], ['soap', 'Jasmine', 2], ['cloth', '', 1]]);
});

test('PayPal sees the option in the item name and sku', () => {
  const lines = validateCart([{ id: 'soap', qty: 1, opt: 'Jasmine' }], catalog);
  const item = orderBody(lines, { returnUrl: 'r', cancelUrl: 'c' }).purchase_units[0].items[0];
  assert.equal(item.name, 'Hand Soap (Scent: Jasmine)');
  assert.equal(item.sku, 'soap:Jasmine');
});

test('a signed-in cart keeps its option', () => {
  assert.deepEqual(clean({ cart: [{ id: 'soap', qty: 2, opt: 'Almond<b>' }, { id: 'cloth', qty: 1 }] }).cart, [{ id: 'soap', qty: 2, opt: 'Almondb' }, { id: 'cloth', qty: 1 }]);
});

import { quote } from '../../shipping.mjs';
test('the cart weight meter gets the weight and the band limit', () => {
  const part = quote([{ product: { price: 599, ship: true, shipOz: 3.5, shipFrom: 'bangalla' }, qty: 1 }], { method: 'ship' }).parts[0];
  assert.deepEqual([part.oz, part.upToOz, part.cents], [3.5, 8, 575]);
});
