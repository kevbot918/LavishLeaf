// Compost and recycling sign-ups (2026-10-11): the form, the pick-up area
// (25 miles of the farm, plus McAlester, Stigler and Checotah) and the PayPal
// plan override (the store's price, the bucket fee or none).
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUCKET_CENTS, FARM, checkArea, cleanSignup, miles, planOverride } from '../../netlify/lib/pickups.mjs';
import { ownerRows } from '../../netlify/functions/pickups.mjs';

const form = { name: 'Pat Smith', phone: '(918) 555-0142', email: 'pat@example.com', street: '12 Main St', city: 'Stigler', zip: '74462', day: 'Tuesday', notes: 'Bin by the gate', bucket: true };
const census = (match) => async () => new Response(JSON.stringify({ result: { addressMatches: match ? [match] : [] } }));
const at = (lat, lon, city, state = 'OK') => ({ coordinates: { y: lat, x: lon }, addressComponents: { city, state }, matchedAddress: 'X' });

test('the form: every field but instructions, the bucket only where offered', () => {
  const s = cleanSignup(form, { bucket: 1000 });
  assert.equal(s.phone, '9185550142');
  assert.equal(s.bucket, true);
  assert.equal(cleanSignup(form, {}).bucket, false, 'recycling has no bucket');
  assert.throws(() => cleanSignup({ ...form, phone: '555-01' }), /phone/);
  assert.throws(() => cleanSignup({ ...form, day: 'Funday' }), /day/);
  assert.equal(cleanSignup({ ...form, day: 'Sunday' }, {}).day, 'Sunday', 'Sunday is a pick-up day (2026-10-12)');
  assert.throws(() => cleanSignup({ ...form, zip: '7446' }), /ZIP/);
});

test('the area: 25 miles of the farm, or the three towns, or a near ZIP when Census cannot place it', async () => {
  const s = cleanSignup(form, {});
  assert.equal((await checkArea(s, census(at(35.30, -95.40, 'KEOTA')))).how, 'radius');           // about 6 miles
  assert.equal((await checkArea(s, census(at(34.93, -95.77, 'MCALESTER')))).how, 'town');          // 28 miles, but McAlester
  await assert.rejects(checkArea(s, census(at(35.47, -95.0, 'SALLISAW'))), /miles from us/);         // about 31 miles
  await assert.rejects(checkArea(s, census(at(36.15, -95.99, 'TULSA'))), /miles from us/);
  assert.equal((await checkArea(s, census(null))).how, 'zip');
  await assert.rejects(checkArea({ ...s, zip: '74103', city: 'Tulsa' }, census(null)), /could not place/);
  assert.ok(Math.abs(miles(FARM, { lat: 34.932846, lon: -95.768209 }) - 28) < 1.5, 'McAlester is about 28 miles away');
});

test('the plan override: half price on the regular cycle, the bucket as the setup fee', () => {
  const plan = { billing_cycles: [{ tenure_type: 'TRIAL', sequence: 1 }, { tenure_type: 'REGULAR', sequence: 2 }] };
  const o = planOverride(plan, { price: 1500 }, { bucket: true }, '6.00');
  assert.deepEqual(o.billing_cycles[0], { sequence: 2, total_cycles: 0, pricing_scheme: { fixed_price: { value: '15.00', currency_code: 'USD' } } });
  assert.equal(o.payment_preferences.setup_fee.value, (BUCKET_CENTS / 100).toFixed(2));
  assert.equal(planOverride(plan, { price: 1500 }, { bucket: false }, '6.00').payment_preferences.setup_fee.value, '0.00');
  assert.equal(o.taxes.percentage, '6.00');
});

test('the owner gets every detail', () => {
  const rows = Object.fromEntries(ownerRows({ ...cleanSignup(form, { bucket: 1000 }), productName: 'Compost Pick-up', price: 1500, area: { how: 'radius', miles: 6.1, matched: '12 MAIN ST' }, subscriptionId: 'I-ABC123' }));
  assert.equal(rows.Phone, '(918) 555-0142');
  assert.match(rows.Bucket, /\$10/);
  assert.equal(rows['Pick-up day'], 'Tuesday');
  assert.equal(rows.Instructions, 'Bin by the gate');
});

test('every accepted sign-up lands on the route map, even when only its ZIP is known', async () => {
  const s = cleanSignup(form, {});
  const byStreet = await checkArea(s, census(at(35.30, -95.40, 'KEOTA')));
  assert.deepEqual([byStreet.lat, byStreet.lon], [35.30, -95.40]);
  const byZip = await checkArea(s, census(null));
  assert.ok(Number.isFinite(byZip.lat) && Number.isFinite(byZip.lon), 'ZIP centre used');
});

// A one-time pick-up (owner, 2026-10-16): the same form and area check, then a
// one-time PayPal order at "oneTime" (plus the bucket and 6%), filed in
// "pickups" with a pointer from the order for the refund webhook.
test('a one-time pick-up is a one-time PayPal order, filed as a pick-up', async () => {
  const { setPickupsStoreForTests } = await import('../../netlify/lib/pickups.mjs');
  const saved = new Map();
  setPickupsStoreForTests({ setJSON: async (k, v) => saved.set(k, v), get: async (k) => saved.get(k) || null });
  process.env.PAYPAL_CLIENT_ID = 'id';
  process.env.PAYPAL_SECRET = 'secret';
  delete process.env.PAYPAL_ENV;
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('geocoding.geo.census.gov')) return new Response(JSON.stringify({ result: { addressMatches: [at(35.25, -95.12, 'STIGLER')] } }));
    if (String(url).endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'T' }));
    return new Response(JSON.stringify({ id: 'ORDER9', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER9' }] }), { status: 201 });
  };
  try {
    const { default: subscribe } = await import('../../netlify/functions/subscribe.mjs');
    const res = await subscribe(new Request('https://lavishleaf.org/x', { method: 'POST', body: JSON.stringify({ id: 'compost-monthly', once: true, details: form }) }));
    assert.equal(res.status, 200);
    const order = calls.find((c) => c.url.endsWith('/v2/checkout/orders'));
    assert.ok(order, 'an order, not a subscription');
    assert.ok(!calls.some((c) => c.url.includes('/billing/')));
    const unit = JSON.parse(order.init.body).purchase_units[0];
    // $10.00 one time + $10.00 bucket = $20.00, + 6% = $21.20.
    assert.equal(unit.amount.value, '21.20');
    assert.equal(unit.amount.breakdown.tax_total.value, '1.20');
    assert.match(unit.custom_id, /^pk=/);
    const rec = saved.get('s-' + unit.custom_id.slice(3));
    assert.equal(rec.once, true);
    assert.equal(rec.orderId, 'ORDER9');
    assert.equal(saved.get('o-ORDER9').id, rec.id);
    assert.match(ownerRows(rec).map((r) => r.join(' ')).join('\n'), /ONE TIME[\s\S]*PayPal order ORDER9/);
    // Recycling has no bucket; the price alone.
    const r2 = await subscribe(new Request('https://lavishleaf.org/x', { method: 'POST', body: JSON.stringify({ id: 'recycle-monthly', once: true, details: form }) }));
    assert.equal(r2.status, 200);
    const u2 = JSON.parse(calls.filter((c) => c.url.endsWith('/v2/checkout/orders')).pop().init.body).purchase_units[0];
    assert.equal(u2.amount.value, '10.60');
    // Not a pick-up: refused.
    const r3 = await subscribe(new Request('https://lavishleaf.org/x', { method: 'POST', body: JSON.stringify({ id: 'soccer-player-fall', once: true, details: form }) }));
    assert.equal(r3.status, 400);
  } finally {
    globalThis.fetch = realFetch;
    setPickupsStoreForTests(null);
  }
});
