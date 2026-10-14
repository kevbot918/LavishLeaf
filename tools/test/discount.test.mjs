// The first-order offer (2026-10-13; 15% since 10-14): what it takes off, how PayPal's
// totals still add up, and one claim per IP address, email and phone.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discountQuote, eligible, CODE } from '../../discount.mjs';
import { taxQuote } from '../../tax.mjs';
import { quote } from '../../shipping.mjs';
import { orderBody, parseCustomId } from '../../netlify/lib/paypal.mjs';
import { alreadyClaimed, claim, markUsed, newCode, usable } from '../../netlify/lib/discounts.mjs';

function fakeStore() {
  const m = new Map();
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    set: async (k, v) => { m.set(k, String(v)); },
  };
}
const soap = { id: 'soap', name: 'Soap', price: 1000, ship: true, shipOz: 6, shipFrom: 'bangalla' };
const reg = { id: 'reg', name: 'Player Registration', price: 1500, ship: false, registration: 'player' };
const pickup = { id: 'compost', name: 'Compost', price: 1500, ship: false, interval: 'month' };

test('15% off store products only, and the tax is on what is paid', () => {
  assert.equal(eligible(soap), true);
  assert.equal(eligible(reg), false);
  assert.equal(eligible(pickup), false);
  const lines = [{ product: soap, qty: 2 }, { product: reg, qty: 1 }];
  const d = discountQuote(lines);
  assert.equal(d.cents, 300);
  assert.equal(taxQuote(d.taxLines).cents, Math.round(1700 * 0.06) + Math.round(1500 * 0.06));
  assert.equal(discountQuote(lines, false).cents, 0);
});

test("PayPal's order adds up with the discount line, and carries the code", () => {
  const lines = [{ product: soap, qty: 2 }];
  const d = discountQuote(lines);
  const tax = taxQuote(d.taxLines);
  const shipping = quote(lines, { method: 'ship' });
  const unit = orderBody(lines, { returnUrl: 'r', cancelUrl: 'c', shipping, tax, discount: { cents: d.cents, code: 'LL20-ABCDEFGH' } }).purchase_units[0];
  const b = unit.amount.breakdown;
  const sum = Number(b.item_total.value) + Number(b.shipping.value) + Number(b.tax_total.value) - Number(b.discount.value);
  assert.equal(unit.amount.value, sum.toFixed(2));
  assert.equal(b.discount.value, '3.00');
  assert.equal(parseCustomId(unit.custom_id).d, 'LL20-ABCDEFGH');
});

test('one claim per IP, per email and per phone; a code is used once', async () => {
  const s = fakeStore();
  const env = { NEWSLETTER_SECRET: 'test-secret-long-enough' };
  assert.equal(await alreadyClaimed(s, { email: 'a@b.co', phone: '9185550101', ip: '1.2.3.4' }, env), null);
  const rec = await claim(s, { email: 'A@b.co', phone: '(918) 555-0101', ip: '1.2.3.4' }, env);
  assert.match(rec.code, CODE);
  assert.equal(await alreadyClaimed(s, { email: 'new@b.co', phone: '9185550199', ip: '1.2.3.4' }, env), 'ip', 'a new email from the same connection');
  assert.equal(await alreadyClaimed(s, { email: 'a@b.co', phone: '9185550199', ip: '5.6.7.8' }, env), 'email');
  assert.equal(await alreadyClaimed(s, { email: 'x@b.co', phone: '+1 918 555 0101', ip: '5.6.7.8' }, env), 'phone');
  assert.ok(![...s.m.keys()].some((k) => k.includes('1.2.3.4')), 'the IP address itself is never stored');
  assert.equal((await usable(s, rec.code.toLowerCase())).email, 'a@b.co');
  await markUsed(s, rec.code, 'ORDER1');
  assert.equal(await usable(s, rec.code), null);
  assert.equal(await usable(s, 'LL20-NOPE'), null);
  assert.match(newCode(), CODE);
});
