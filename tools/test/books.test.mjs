// The corporation's books (2026-10-21): PayPal money events become rows in
// the Books sheet, once each, never in sandbox, and a failed write waits in
// the queue instead of breaking a payment.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  CAT, appendRows, chicagoDate, clawbackRows, donationRows, filedParts, flushQueue, isService,
  orderRows, record, recordSafely, refundRows, saleRefundRows, saleRows, setBooksQueueForTests,
} from '../../netlify/lib/books.mjs';
import { handleEvent, setWebhookForTests } from '../../netlify/functions/paypal-webhook.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = {
  PAYPAL_ENV: 'live', BOOKS_SHEET_ID: '1hzTESTSHEETidThatIsLongEnough_xx',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'books@example.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

function fakeStore() {
  const m = new Map();
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    set: async (k, v) => { m.set(k, String(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}

/**
 * A Sheets API stand-in: rows keyed by number, column A to L. J and K hold
 * formulas down to row 5000 the way the real sheet does, which is why an
 * append would land after them.
 */
function fakeSheet({ rows = {}, failWrites = false } = {}) {
  const sheet = { rows: { ...rows }, calls: [], failWrites };
  const col = (c) => {
    const out = [];
    const last = Math.max(1, ...Object.keys(sheet.rows).map(Number).filter((n) => sheet.rows[n][c]));
    for (let n = 2; n <= last; n++) out.push((sheet.rows[n] && sheet.rows[n][c]) || '');
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  };
  sheet.fetch = async (url, opts = {}) => {
    sheet.calls.push({ url, opts });
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'tok', expires_in: 3600 });
    if (url.includes(':batchGet')) {
      assert.match(decodeURIComponent(url), /Transactions!A2:A.*Transactions!L2:L/);
      return ok({ valueRanges: [{ values: [col('A')] }, { values: [col('L')] }] });
    }
    if (url.includes(':batchUpdate')) {
      if (sheet.failWrites) return { ok: false, status: 503, json: async () => ({ error: { message: 'backend error' } }) };
      const body = JSON.parse(opts.body);
      assert.equal(body.valueInputOption, 'USER_ENTERED');
      for (const d of body.data) {
        const m = d.range.match(/^Transactions!([A-L])(\d+)(?::([A-L])\d+)?$/);
        assert.ok(m, 'range ' + d.range);
        assert.ok(!/[JK]/.test(m[1]) && !(m[3] && m[1] <= 'J' && m[3] >= 'J'), 'never writes J or K');
        const n = Number(m[2]);
        sheet.rows[n] = sheet.rows[n] || {};
        d.values[0].forEach((v, i) => { sheet.rows[n][String.fromCharCode(m[1].charCodeAt(0) + i)] = v; });
      }
      return ok({});
    }
    throw new Error('unexpected fetch ' + url);
  };
  return sheet;
}

// A mixed cart: a posted product with the first-order discount, a league
// registration (a service), shipping and tax.
const capture = (over = {}) => ({
  id: '5O190127TN364715T',
  purchase_units: [{
    amount: { value: '69.24', breakdown: { item_total: { value: '68.00' }, shipping: { value: '5.75' }, tax_total: { value: '3.99' }, discount: { value: '8.50' } } },
    items: [
      { sku: 'pf-trucker-cap', quantity: '2', unit_amount: { value: '24.00' } },
      { sku: 'soccer-player-fall', quantity: '1', unit_amount: { value: '20.00' } },
    ],
    payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', create_time: '2026-11-02T03:30:00Z', amount: { value: '69.24' }, seller_receivable_breakdown: { paypal_fee: { value: '2.90' } } }] },
  }],
  payer: { email_address: 'buyer@example.com', name: { given_name: 'Pat' } },
  ...over,
});

test('services are the unshipped products; apparel on the same shelf is a product', () => {
  assert.equal(isService('soccer-player-fall'), true);
  assert.equal(isService('compost-monthly:once'), true);
  assert.equal(isService('compost-monthly:bucket'), true);
  assert.equal(isService('pf-trucker-cap'), false);
  assert.equal(isService('no-such-thing'), false);
});

test('a mixed cart splits into product, service, shipping, tax and fee rows, dated in Oklahoma', () => {
  const rows = orderRows(capture());
  assert.deepEqual(rows.map((r) => [r.category, r.in, r.out, r.source]), [
    [CAT.product, '39.50', '', 'pp:CAP1:product'],
    [CAT.service, '20.00', '', 'pp:CAP1:service'],
    [CAT.shipping, '5.75', '', 'pp:CAP1:shipping'],
    [CAT.tax, '3.99', '', 'pp:CAP1:tax'],
    [CAT.fee, '', '2.90', 'pp:CAP1:fee'],
  ]);
  assert.ok(rows.every((r) => r.date === '2026-11-01'), '03:30 UTC is still the evening before in Chicago');
  assert.ok(rows.every((r) => r.description === 'Order 5O190127TN364715T'));
  assert.ok(rows.every((r) => !r.notes), 'the parts add up to what was paid');
  assert.ok(!JSON.stringify(rows).match(/buyer@|Pat/), 'no customer details');
});

test('parts that do not add up to the capture are flagged for the accountant', () => {
  const c = capture(); c.purchase_units[0].payments.captures[0].amount.value = '70.00';
  assert.match(orderRows(c)[0].notes, /check: parts 69\.24 vs paid 70\.00/);
});

test('a pending capture writes nothing', () => {
  const c = capture(); c.purchase_units[0].payments.captures[0].status = 'PENDING';
  assert.deepEqual(orderRows(c), []);
});

test('a donation is income plus its fee', () => {
  const rows = donationRows({ id: 'DON1', purchase_units: [{ payments: { captures: [{ id: 'CAPD', status: 'COMPLETED', create_time: '2026-11-02T18:00:00Z', amount: { value: '25.00' }, seller_receivable_breakdown: { paypal_fee: { value: '1.36' } } }] } }] });
  assert.deepEqual(rows.map((r) => [r.category, r.in, r.out, r.description]), [[CAT.donation, '25.00', '', 'Donation DON1'], [CAT.fee, '', '1.36', 'Donation DON1']]);
});

test('a monthly pick-up payment separates the 6% tax and the fee', () => {
  const rows = saleRows({ id: 'SALE1', billing_agreement_id: 'I-ABC', create_time: '2026-11-05T15:00:00Z', amount: { total: '31.80' }, transaction_fee: { value: '1.60' } });
  assert.deepEqual(rows.map((r) => [r.category, r.in, r.out]), [[CAT.service, '30.00', ''], [CAT.tax, '1.80', ''], [CAT.fee, '', '1.60']]);
  const back = saleRefundRows({ id: 'R1', sale_id: 'SALE1', amount: { total: '31.80' }, refund_from_transaction_fee: { value: '0.60' } });
  assert.deepEqual(back.map((r) => [r.category, r.in, r.out]), [[CAT.service, '', '30.00'], [CAT.tax, '', '1.80'], [CAT.fee, '0.60', '']]);
});

test('a partial refund on a mixed order takes back its share of tax and splits the rest', () => {
  const parts = filedParts({ items: [{ sku: 'pf-trucker-cap', each: 24, qty: 2 }, { sku: 'soccer-player-fall', each: 20, qty: 1 }], discount: 8.5, shipping: 5.75, tax: 3.99 });
  assert.deepEqual(parts, { product: 3950, service: 2000, shipping: 575, tax: 399 });
  const rows = refundRows({ id: 'REF1', amount: { value: '34.62' }, seller_payable_breakdown: { paypal_fee: { value: '0.50' } } }, { kind: 'order', orderId: '5O19', parts });
  const by = Object.fromEntries(rows.map((r) => [r.category, r]));
  assert.equal(by[CAT.tax].out, '2.00');
  assert.equal(Math.round(Number(by[CAT.product].out) * 100) + Math.round(Number(by[CAT.service].out) * 100) + 200, 3462, 'every cent accounted for');
  assert.equal(by[CAT.fee].in, '0.50');
  assert.equal(by[CAT.product].description, 'Refund on order 5O19');
});

test('a refund with no order details estimates the tax at 6% and says so', () => {
  const rows = refundRows({ id: 'REF2', amount: { value: '10.60' } }, { kind: 'order', orderId: 'X' });
  assert.deepEqual(rows.map((r) => [r.category, r.out]), [[CAT.product, '10.00'], [CAT.tax, '0.60']]);
  assert.match(rows[0].notes, /estimated/);
  const don = refundRows({ id: 'REF3', amount: { value: '25.00' } }, { kind: 'donation', orderId: 'DON1' });
  assert.deepEqual(don.map((r) => [r.category, r.out]), [[CAT.donation, '25.00']]);
});

test('a dispute and its reversal share one Source ID', () => {
  const a = clawbackRows({ captureId: 'CAP1', amountCents: 6924, note: 'dispute PP-D-1' });
  const b = clawbackRows({ captureId: 'CAP1', amountCents: 6924, note: 'reversal CAP1' });
  assert.equal(a[0].source, b[0].source);
  assert.equal(a[0].out, '69.24');
});

test('rows go after the last date, never into J or K, and a Source ID is written once', async () => {
  const sheet = fakeSheet({ rows: { 1: { A: 'Date', L: 'Source ID' }, 2: { A: '2026-10-01', L: 'bank:1' }, 3: { A: '2026-10-02', L: 'pp:CAP1:product' } } });
  for (let n = 2; n <= 5000; n++) { sheet.rows[n] = sheet.rows[n] || {}; sheet.rows[n].J = '=formula'; sheet.rows[n].K = '=formula'; }
  const r = await appendRows(orderRows(capture()), ENV, sheet.fetch);
  assert.deepEqual(r, { written: 4, skipped: 1 });
  assert.equal(sheet.rows[4].D, CAT.service, 'first new row is row 4, not 5001');
  assert.equal(sheet.rows[4].B, 'PayPal Business');
  assert.equal(sheet.rows[4].L, 'pp:CAP1:service');
  assert.equal(sheet.rows[7].L, 'pp:CAP1:fee');
  assert.equal(sheet.rows[7].F, '2.90');
  assert.equal(sheet.rows[4].J, '=formula', 'formulas untouched');
  const again = await appendRows(orderRows(capture()), ENV, sheet.fetch);
  assert.deepEqual(again, { written: 0, skipped: 5 });
});

test('sandbox writes nothing and asks Google for nothing', async () => {
  const sheet = fakeSheet();
  const r = await record(orderRows(capture()), { env: { ...ENV, PAYPAL_ENV: 'sandbox' }, fetchImpl: sheet.fetch });
  assert.deepEqual(r, { skipped: 'not live' });
  assert.equal(sheet.calls.length, 0);
  assert.deepEqual(await recordSafely(() => { throw new Error('must not run'); }, 'x', { PAYPAL_ENV: 'sandbox' }), { skipped: 'not live' });
});

test('a failed write is queued, never thrown, and the daily retry writes it', async () => {
  const q = fakeStore(); setBooksQueueForTests(q);
  const sheet = fakeSheet({ failWrites: true });
  const r = await record(orderRows(capture()), { env: ENV, fetchImpl: sheet.fetch });
  assert.deepEqual(r, { queued: 5 });
  assert.equal(q.m.size, 1);
  const first = await flushQueue({ env: ENV, fetchImpl: sheet.fetch });
  assert.equal(first.failed, 1);
  assert.equal(JSON.parse([...q.m.values()][0]).tries, 1);
  sheet.failWrites = false;
  const second = await flushQueue({ env: ENV, fetchImpl: sheet.fetch });
  assert.deepEqual(second, { batches: 1, written: 5, failed: 0 });
  assert.equal(q.m.size, 0);
  // A live site without BOOKS_SHEET_ID yet keeps its rows too.
  const r2 = await record(orderRows(capture()), { env: { ...ENV, BOOKS_SHEET_ID: '' }, fetchImpl: sheet.fetch });
  assert.deepEqual(r2, { queued: 5 });
  setBooksQueueForTests(null);
});

test('the webhook still works in sandbox with the books wired in', async () => {
  setWebhookForTests({ alerts: [] });
  const out = await handleEvent({ id: 'WH-B1', event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { dispute_id: 'PP-D-1', dispute_amount: { value: '10.00' }, disputed_transactions: [{ seller_transaction_id: 'CAP1' }] } }, {});
  assert.equal(out.did, 'dispute alert');
  setWebhookForTests(null);
});

test('dates are Chicago calendar days', () => {
  assert.equal(chicagoDate('2026-07-01T04:59:00Z'), '2026-06-30');
  assert.equal(chicagoDate('2026-07-01T05:00:00Z'), '2026-07-01');
});
