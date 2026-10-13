// The PayPal webhook (2026-10-12): refunds and cancellations update our own
// records, and an unverified event changes nothing.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleEvent, setWebhookForTests } from '../../netlify/functions/paypal-webhook.mjs';
import webhook from '../../netlify/functions/paypal-webhook.mjs';
import { setPickupsStoreForTests } from '../../netlify/lib/pickups.mjs';
import { setOrdersStoreForTests } from '../../netlify/lib/orders.mjs';
import { setRegistrationsStoreForTests } from '../../netlify/lib/registrations.mjs';
import { statusFromPayPal } from '../../netlify/lib/pickup-events.mjs';

function fakeStore(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    set: async (k, v) => { m.set(k, String(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}
const pickup = { id: 'p1', subscriptionId: 'I-ABC123456', productName: 'Compost Pick-up', price: 1500, name: 'Pat Smith', email: 'pat@example.com', status: 'active', alerted: 'x', street: '1 Main', city: 'Stigler' };
const cfg = {};

test('a subscription canceled in PayPal is canceled here', async () => {
  const pickups = fakeStore({ 's-p1': pickup }); setPickupsStoreForTests(pickups);
  const out = await handleEvent({ id: 'WH-1', event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-ABC123456', custom_id: 'p1' } }, cfg);
  assert.equal(out.did, 'pick-up canceled');
  assert.equal(JSON.parse(pickups.m.get('s-p1')).status, 'canceled');
});

test('a refunded pick-up payment is recorded on the sign-up', async () => {
  const pickups = fakeStore({ 's-p1': pickup }); setPickupsStoreForTests(pickups);
  await handleEvent({ id: 'WH-2', event_type: 'PAYMENT.SALE.REFUNDED', resource: { billing_agreement_id: 'I-ABC123456', amount: { total: '15.90' } } }, cfg);
  assert.deepEqual(JSON.parse(pickups.m.get('s-p1')).refunds.map((r) => r.cents), [1590]);
});

test('a full refund marks the order and takes the registration off the roster', async () => {
  setWebhookForTests({ donations: fakeStore(), alerts: [] });
  const orders = fakeStore({ 'o-ORDER1': { id: 'ORDER1', total: 15.9, email: 'pat@example.com', first: 'Pat', items: [] } }); setOrdersStoreForTests(orders);
  const regs = fakeStore({ 'o-ORDER1': { orderId: 'ORDER1', status: 'paid', regs: [] } }); setRegistrationsStoreForTests(regs);
  const out = await handleEvent({ id: 'WH-3', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { amount: { value: '15.90' }, supplementary_data: { related_ids: { order_id: 'ORDER1' } } } }, cfg);
  assert.equal(out.did, 'order refunded');
  assert.equal(JSON.parse(orders.m.get('o-ORDER1')).status, 'refunded');
  assert.equal(JSON.parse(regs.m.get('o-ORDER1')).status, 'refunded');
});

test('a part refund marks the order partly refunded and leaves the roster alone', async () => {
  setWebhookForTests({ donations: fakeStore(), alerts: [] });
  const orders = fakeStore({ 'o-ORDER2': { id: 'ORDER2', total: 30, email: 'pat@example.com', items: [] } }); setOrdersStoreForTests(orders);
  const regs = fakeStore({ 'o-ORDER2': { orderId: 'ORDER2', status: 'paid', regs: [] } }); setRegistrationsStoreForTests(regs);
  await handleEvent({ id: 'WH-4', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { amount: { value: '10.00' }, supplementary_data: { related_ids: { order_id: 'ORDER2' } } } }, cfg);
  assert.equal(JSON.parse(orders.m.get('o-ORDER2')).status, 'partly refunded');
  assert.equal(JSON.parse(regs.m.get('o-ORDER2')).status, 'paid');
});

test('an unverified event changes nothing, and a repeat is acted on once', async () => {
  process.env.PAYPAL_CLIENT_ID = 'id'; process.env.PAYPAL_SECRET = 's';
  const pickups = fakeStore({ 's-p1': pickup }); setPickupsStoreForTests(pickups);
  const seen = fakeStore();
  const ev = { id: 'WH-5', event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-ABC123456', custom_id: 'p1' } };
  const post = () => webhook(new Request('https://lavishleaf.org/x', { method: 'POST', body: JSON.stringify(ev) }));
  setWebhookForTests({ verify: async () => false, seen });
  assert.equal((await post()).status, 400);
  assert.equal(JSON.parse(pickups.m.get('s-p1')).status, 'active');
  setWebhookForTests({ verify: async () => true, seen });
  assert.equal((await post()).status, 200);
  assert.equal(JSON.parse(pickups.m.get('s-p1')).status, 'canceled');
  assert.deepEqual(await (await post()).json(), { duplicate: true });
  setWebhookForTests(null);
});

test('PayPal statuses in our words', () => {
  assert.deepEqual(['ACTIVE', 'CANCELLED', 'SUSPENDED', 'APPROVAL_PENDING', 'EXPIRED'].map(statusFromPayPal), ['active', 'canceled', 'paused', 'pending', 'canceled']);
});

// 2026-10-13: donations, disputes, chargebacks and failed payments.
test('a refunded donation is marked refunded and the orders are left alone', async () => {
  const donations = fakeStore({ 'd-DON1': { id: 'DON1', amount: 25 } });
  setWebhookForTests({ donations, alerts: [] });
  const orders = fakeStore(); setOrdersStoreForTests(orders);
  const out = await handleEvent({ id: 'WH-6', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { amount: { value: '25.00' }, supplementary_data: { related_ids: { order_id: 'DON1' } } } }, cfg);
  assert.equal(out.did, 'donation refunded');
  assert.equal(JSON.parse(donations.m.get('d-DON1')).refundedCents, 2500);
  setWebhookForTests(null);
});

test('a chargeback marks the order reversed and alerts the owner', async () => {
  const alerts = [];
  setWebhookForTests({ donations: fakeStore(), alerts });
  const orders = fakeStore({ 'o-ORDER7': { id: 'ORDER7', total: 20, items: [] } }); setOrdersStoreForTests(orders);
  const out = await handleEvent({ id: 'WH-7', event_type: 'PAYMENT.CAPTURE.REVERSED', resource: { id: 'CAP7', amount: { value: '20.00' }, supplementary_data: { related_ids: { order_id: 'ORDER7' } } } }, cfg);
  assert.equal(out.did, 'order reversed');
  assert.equal(JSON.parse(orders.m.get('o-ORDER7')).status, 'reversed');
  assert.equal(alerts.length, 1);
  setWebhookForTests(null);
});

test('a dispute alerts the owner; a failed pick-up payment is marked', async () => {
  const alerts = [];
  setWebhookForTests({ donations: fakeStore(), alerts });
  await handleEvent({ id: 'WH-8', event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', dispute_amount: { value: '12.00' }, disputed_transactions: [{ seller_transaction_id: 'T1' }] } }, cfg);
  assert.match(alerts[0].subject, /dispute/);
  const pickups = fakeStore({ 's-p1': pickup }); setPickupsStoreForTests(pickups);
  const out = await handleEvent({ id: 'WH-9', event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', resource: { id: 'I-ABC123456', custom_id: 'p1' } }, cfg);
  assert.equal(out.did, 'pick-up payment failed');
  assert.ok(JSON.parse(pickups.m.get('s-p1')).paymentFailed);
  assert.equal(alerts.length, 2);
  setWebhookForTests(null);
});
