// Sales tax (tax.mjs): what is taxed, at what rate, and the address check.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RATE_BP, taxAddressOk, taxOn, taxQuote } from '../../tax.mjs';
import { orderBody, parseCustomId, subscriptionBody } from '../../netlify/lib/paypal.mjs';
import { quote } from '../../shipping.mjs';

const goods = { id: 'soap', name: 'Soap', price: 1000, ship: true, shipOz: 6 };
const league = { id: 'reg', name: 'Registration', price: 2500, ship: false };

test('6% in all: Oklahoma 4.5% and Pittsburg County 1.5%', () => {
  assert.equal(RATE_BP, 600);
  assert.equal(taxOn(2500), 150);
  assert.equal(taxOn(1999), 120); // 119.94 rounds to 120
  assert.equal(taxOn(1991), 119); // 119.46 rounds to 119
});

test('registrations and services are always taxed; shipped goods only into Oklahoma', () => {
  assert.equal(taxQuote([{ product: league, qty: 2 }]).cents, 300);
  assert.equal(taxQuote([{ product: goods, qty: 1 }], { shipTo: 'OK' }).cents, 60);
  assert.equal(taxQuote([{ product: goods, qty: 1 }], { shipTo: 'other' }).cents, 0);
  const mixed = taxQuote([{ product: goods, qty: 1 }, { product: league, qty: 1 }], { shipTo: 'other' });
  assert.deepEqual([mixed.cents, mixed.taxableCents], [150, 2500]);
});

test('a shipped order must say where it goes before it is taxed', () => {
  assert.throws(() => taxQuote([{ product: goods, qty: 1 }], {}), /Oklahoma or another state/);
  assert.equal(taxQuote([{ product: league, qty: 1 }], {}).shipTo, '', 'nothing ships, nothing to ask');
});

test('the address PayPal collected must match where the order was taxed for', () => {
  assert.equal(taxAddressOk('OK', { admin_area_1: 'OK' }).ok, true);
  assert.equal(taxAddressOk('other', { admin_area_1: 'TX' }).ok, true);
  assert.equal(taxAddressOk('other', { admin_area_1: 'ok' }).ok, false);
  assert.equal(taxAddressOk('OK', { admin_area_1: 'KS' }).ok, false);
  assert.equal(taxAddressOk('', null).ok, true);
});

test('tax is its own line on the PayPal order and travels in custom_id', () => {
  const lines = [{ product: goods, qty: 2 }];
  const shipping = quote(lines, { method: 'ship' });
  const tax = taxQuote(lines, { shipTo: 'OK' });
  const unit = orderBody(lines, { returnUrl: 'r', cancelUrl: 'c', shipping, tax }).purchase_units[0];
  assert.equal(unit.amount.breakdown.tax_total.value, '1.20');
  assert.equal(unit.amount.value, '33.15'); // 20.00 + 11.95 + 1.20
  assert.equal(parseCustomId(unit.custom_id).t, 'OK');
  const out = orderBody(lines, { returnUrl: 'r', cancelUrl: 'c', shipping, tax: taxQuote(lines, { shipTo: 'other' }) }).purchase_units[0];
  assert.equal(out.amount.breakdown.tax_total, undefined, 'no zero tax line');
  assert.equal(out.amount.value, '31.95');
});

test('a pick-up subscription carries the 6% on top of the plan', () => {
  const body = subscriptionBody({ paypalPlanId: 'P-1' }, { returnUrl: 'r', cancelUrl: 'c' });
  assert.deepEqual(body.plan.taxes, { percentage: '6.00', inclusive: false });
});
