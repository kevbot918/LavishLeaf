// The checkout functions, without PayPal: prices come from the catalog and
// nowhere else, a bad cart is refused in words a buyer can act on, and a
// half-set-up site takes no money.
//   node --test tools/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CheckoutError,
  approveLink,
  cleanNote,
  config,
  orderBody,
  validateCart,
} from '../../netlify/lib/paypal.mjs';

const catalog = {
  shirt: { id: 'shirt', name: 'A shirt', price: 2500, interval: null, active: true, paypalPlanId: null },
  cap: { id: 'cap', name: 'A cap', price: 1299, interval: null, active: true, paypalPlanId: null },
  old: { id: 'old', name: 'Retired', price: 100, interval: null, active: false, paypalPlanId: null },
  compost: { id: 'compost', name: 'Compost', price: 2000, interval: 'month', active: true, paypalPlanId: 'P-ABC123' },
};

const refused = (fn, status, words) =>
  assert.throws(fn, (e) => e instanceof CheckoutError && e.status === status && e.message.includes(words));

// catalog.mjs is GENERATED and committed, the only price check lives in the
// renderer on the owner's machine, and no CI runs it. So the failure worth
// guarding is not a hostile buyer, it is a broken catalog reaching PayPal and
// charging nothing, which looks like a successful sale to everybody.
test('a product with no usable price is refused rather than charged at zero', () => {
  const broken = {
    free: { id: 'free', name: 'Priced wrong', price: 0, interval: null, active: true, paypalPlanId: null },
    missing: { id: 'missing', name: 'No price at all', interval: null, active: true, paypalPlanId: null },
    negative: { id: 'negative', name: 'Below zero', price: -500, interval: null, active: true, paypalPlanId: null },
    fractional: { id: 'fractional', name: 'Not whole cents', price: 12.5, interval: null, active: true, paypalPlanId: null },
  };
  for (const id of Object.keys(broken)) {
    refused(() => validateCart([{ id, qty: 1 }], broken), 500, 'priced correctly');
  }
});

test('orderBody will not build a zero-value order even if it is handed one', () => {
  // Bypasses validateCart deliberately: this is the second line of defence.
  const lines = [{ product: { id: 'x', name: 'X', price: 0 }, qty: 3 }];
  refused(
    () => orderBody(lines, { returnUrl: 'https://x/a', cancelUrl: 'https://x/b' }),
    500,
    'came to nothing',
  );
});

test('the price is the catalog\'s, whatever the browser sends', () => {
  const lines = validateCart([{ id: 'shirt', qty: 2, price: 1 }, { id: 'cap', qty: 1 }], catalog);
  const body = orderBody(lines, { returnUrl: 'https://x/store?paypal=return', cancelUrl: 'https://x/store?paypal=cancel' });
  const unit = body.purchase_units[0];
  assert.equal(unit.amount.value, '62.99');
  assert.equal(unit.amount.breakdown.item_total.value, '62.99');
  assert.deepEqual(unit.items.map((i) => [i.sku, i.quantity, i.unit_amount.value]), [
    ['shirt', '2', '25.00'],
    ['cap', '1', '12.99'],
  ]);
  assert.equal(body.intent, 'CAPTURE');
  assert.equal(body.payment_source.paypal.experience_context.shipping_preference, 'NO_SHIPPING');
});

test('two lines for one product are one line', () => {
  const lines = validateCart([{ id: 'cap', qty: 1 }, { id: 'cap', qty: 2 }], catalog);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 3);
});

test('a bad cart is refused, and says why', () => {
  refused(() => validateCart([], catalog), 400, 'empty');
  refused(() => validateCart('nope', catalog), 400, 'empty');
  refused(() => validateCart([{ id: 'ghost', qty: 1 }], catalog), 400, 'no longer for sale');
  refused(() => validateCart([{ id: 'old', qty: 1 }], catalog), 400, 'no longer for sale');
  refused(() => validateCart([{ id: 'compost', qty: 1 }], catalog), 400, 'subscription');
  refused(() => validateCart([{ id: 'cap', qty: 0 }], catalog), 400, 'at least one');
  refused(() => validateCart([{ id: 'cap', qty: 1.5 }], catalog), 400, 'at least one');
  refused(() => validateCart([{ id: 'cap', qty: 15 }, { id: 'cap', qty: 6 }], catalog), 400, 'At most 20');
});

test('a note is plain, short text', () => {
  assert.equal(cleanNote('  Team  <b>Rovers</b>\n'), 'Team b Rovers /b');
  assert.equal(cleanNote('x'.repeat(300)).length, 127);
  assert.equal(cleanNote(42), '');
  const body = orderBody(validateCart([{ id: 'cap', qty: 1 }], catalog), { returnUrl: 'r', cancelUrl: 'c', note: 'Player: Sam' });
  assert.equal(body.purchase_units[0].description, 'Player: Sam');
});

test('only a PayPal page is ever a place to send the buyer', () => {
  assert.equal(
    approveLink({ links: [{ rel: 'payer-action', href: 'https://www.paypal.com/checkoutnow?token=1' }] }),
    'https://www.paypal.com/checkoutnow?token=1',
  );
  assert.equal(
    approveLink({ links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=1' }] }),
    'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=1',
  );
  assert.throws(() => approveLink({ links: [{ rel: 'approve', href: 'https://paypal.com.evil.example/x' }] }));
  assert.throws(() => approveLink({}));
});

test('no keys, no checkout; and sandbox unless told otherwise', () => {
  refused(() => config({}), 503, 'not set up');
  assert.equal(config({ PAYPAL_CLIENT_ID: 'a', PAYPAL_SECRET: 'b' }).mode, 'sandbox');
  assert.equal(config({ PAYPAL_CLIENT_ID: 'a', PAYPAL_SECRET: 'b', PAYPAL_ENV: 'live' }).base, 'https://api-m.paypal.com');
});

test('the checkout function end to end, against a fake PayPal', async () => {
  process.env.PAYPAL_CLIENT_ID = 'id';
  process.env.PAYPAL_SECRET = 'secret';
  delete process.env.PAYPAL_ENV;
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'T' }));
    return new Response(JSON.stringify({ id: 'ORDER1', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER1' }] }), { status: 201 });
  };
  try {
    const { default: checkout } = await import('../../netlify/functions/checkout.mjs');
    const res = await checkout(new Request('https://lavishleaf.org/.netlify/functions/checkout', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: 'soccer-player-fall', qty: 2 }], note: 'Sam' }),
    }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).approveUrl, 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER1');
    const order = calls.find((c) => c.url.endsWith('/v2/checkout/orders'));
    assert.ok(order.url.startsWith('https://api-m.sandbox.paypal.com'), 'sandbox by default');
    const sent = JSON.parse(order.init.body);
    // 2 x $25.00 from products.json, through the generated catalog.
    assert.equal(sent.purchase_units[0].amount.value, '50.00');
    assert.equal(
      sent.payment_source.paypal.experience_context.return_url,
      'https://lavishleaf.org/store?paypal=return',
    );

    const bad = await checkout(new Request('https://lavishleaf.org/x', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: 'compost-monthly', qty: 1 }] }),
    }));
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /subscription/);

    const get = await checkout(new Request('https://lavishleaf.org/x'));
    assert.equal(get.status, 405);
  } finally {
    globalThis.fetch = realFetch;
  }
});
