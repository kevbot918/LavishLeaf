// Sales tax (tax.mjs): 6% on everything wherever it ships, groceries apart.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RATE_BP, TAX, taxOn, taxQuote } from '../../tax.mjs';
import { orderBody, parseCustomId, subscriptionBody } from '../../netlify/lib/paypal.mjs';
import { quote } from '../../shipping.mjs';

const goods = { id: 'soap', name: 'Soap', price: 1000, ship: true, shipOz: 6 };
const league = { id: 'reg', name: 'Registration', price: 2500, ship: false };
const greens = { id: 'greens', name: 'Salad greens', price: 500, ship: false, grocery: true };

test('6% in all: Oklahoma 4.5% and Pittsburg County 1.5%', () => {
  assert.equal(RATE_BP, 600);
  assert.equal(taxOn(2500), 150);
  assert.equal(taxOn(1999), 120); // 119.94 rounds to 120
  assert.equal(taxOn(1991), 119); // 119.46 rounds to 119
});

test('every product carries the 6%, shipped or not, wherever it goes (owner, 2026-10-07)', () => {
  assert.equal(taxQuote([{ product: league, qty: 2 }]).cents, 300);
  assert.equal(taxQuote([{ product: goods, qty: 1 }]).cents, 60);
  assert.equal(taxQuote([{ product: goods, qty: 1 }, { product: league, qty: 1 }]).cents, 210);
});

test('groceries carry the grocery rate instead', () => {
  assert.equal(taxQuote([{ product: greens, qty: 2 }]).cents, Math.round(1000 * TAX.groceryBp / 10000));
  assert.equal(taxQuote([{ product: greens, qty: 1 }, { product: goods, qty: 1 }]).cents, 60 + Math.round(500 * TAX.groceryBp / 10000));
});

test('tax is its own line on the PayPal order', () => {
  const lines = [{ product: goods, qty: 2 }];
  const shipping = quote(lines, { method: 'ship' });
  const unit = orderBody(lines, { returnUrl: 'r', cancelUrl: 'c', shipping, tax: taxQuote(lines) }).purchase_units[0];
  assert.equal(unit.amount.breakdown.tax_total.value, '1.20');
  assert.equal(unit.amount.value, '30.15'); // 20.00 + 8.95 + 1.20
  assert.equal(parseCustomId(unit.custom_id).t, undefined, 'no ship-to question any more');
});

test('a pick-up subscription carries the 6% on top of the plan', () => {
  const body = subscriptionBody({ paypalPlanId: 'P-1' }, { returnUrl: 'r', cancelUrl: 'c' });
  assert.deepEqual(body.plan.taxes, { percentage: '6.00', inclusive: false });
});
