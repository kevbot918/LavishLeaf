// The corporation's books (2026-10-21, the owner through the accounting
// session): every real PayPal money event on the site becomes dated rows in
// the Google Sheet "Lavish Leaf Inc: Books", tab "Transactions", so the
// statements build themselves. docs/BOOKS.md has the owner's setup steps.
//
// Columns: A Date (YYYY-MM-DD, America/Chicago) | B Account | C Description |
// D Category | E Money In | F Money Out | G Owner repays? | H Receipt saved? |
// I Notes | J Type | K Cash? | L Source ID. J and K are ARRAYFORMULAs that
// fill down to row 5000, so nothing here appends: the next row is found from
// column A and written with values.batchUpdate, and J and K are never
// touched. Column L makes every row idempotent: a Source ID already in the
// sheet is skipped, so a retried webhook or a replayed order writes nothing.
//
// No customer name, email, phone or address ever goes in the sheet: an order
// is "Order <PayPal order id>" and nothing more.
//
// Written only when PAYPAL_ENV is "live". A Sheets failure never reaches the
// buyer or PayPal: the rows wait in the Blobs store "books-queue" and the
// daily books-retry function writes them later.
//
// Environment (Netlify, never in this repository):
//   BOOKS_SHEET_ID   the spreadsheet id
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY   the dashboard's service
//                    account (google.mjs); the sheet is shared with it as Editor
import { accessToken, googleReady } from './google.mjs';
import { catalog } from './catalog.mjs';
import { RATE_BP } from '../../tax.mjs';

export const ACCOUNT = 'PayPal Business';
export const TAB = 'Transactions';
// The Accounts tab owns this list; these names must match it exactly.
export const CAT = {
  product: 'Product Sales',
  service: 'Service & Registration Sales',
  shipping: 'Shipping Collected',
  tax: 'Sales Tax Collected',
  fee: 'Payment Processing Fees',
  donation: 'Donations Received',
};
const SCOPE = ['https://www.googleapis.com/auth/spreadsheets'];

let testQueue = null;
export function setBooksQueueForTests(s) { testQueue = s; }
async function queueStore() {
  if (testQueue) return testQueue;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'books-queue', consistency: 'strong' });
}

const cents = (v) => Math.round(Number((v && (v.value ?? v.total)) ?? v ?? 0) * 100) || 0;
const dollars = (c) => (c / 100).toFixed(2);

/** A date as the books want it: YYYY-MM-DD in Oklahoma. */
export function chicagoDate(when = Date.now()) {
  const d = new Date(when);
  // From the parts: a locale's own layout differs between ICU builds (en-CA
  // is 06/30/2026 on some Node versions).
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(Number.isNaN(d.getTime()) ? new Date() : d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Pick-ups and league registrations (the services on the Lavish Leaf shelf)
 * are the products that are never shipped; the apparel on the same shelf is
 * shipped, so it counts as Product Sales. A one-time pick-up's lines carry
 * "id:once" and "id:bucket".
 */
export function isService(sku) {
  const p = catalog[String(sku || '').split(':')[0]];
  return !!p && p.ship === false;
}

/** A sale's tax share when only the tax-inclusive total is known (6% on top). */
export const taxShare = (totalCents) => Math.round((totalCents * RATE_BP) / (10000 + RATE_BP));

/** The parts of an order, in cents, from PayPal's purchase unit. */
export function orderParts(unit) {
  const b = (unit && unit.amount && unit.amount.breakdown) || {};
  let product = 0, service = 0;
  for (const i of (unit && unit.items) || []) {
    const c = cents(i.unit_amount) * (Number(i.quantity) || 1);
    if (isService(i.sku)) service += c; else product += c;
  }
  // The first-order discount only ever comes off shipped products (discount.mjs eligible).
  const discount = Math.min(cents(b.discount), product);
  return { product: product - discount, service, shipping: cents(b.shipping), tax: cents(b.tax_total) };
}

/** The same parts from our own filed order (orders.mjs summarise). */
export function filedParts(o) {
  let product = 0, service = 0;
  for (const i of (o && o.items) || []) {
    const c = Math.round((Number(i.each) || 0) * 100) * (Number(i.qty) || 1);
    if (isService(i.sku)) service += c; else product += c;
  }
  const discount = Math.min(Math.round((Number(o && o.discount) || 0) * 100), product);
  return { product: product - discount, service, shipping: Math.round((Number(o && o.shipping) || 0) * 100), tax: Math.round((Number(o && o.tax) || 0) * 100) };
}

const row = (date, description, category, inC, outC, source, notes = '') =>
  ({ date, description, category, in: inC > 0 ? dollars(inC) : '', out: outC > 0 ? dollars(outC) : '', notes, source });

/** A captured order (store order or one-time pick-up): sales, shipping, tax and the fee. */
export function orderRows(done) {
  const unit = (done && done.purchase_units && done.purchase_units[0]) || {};
  const cap = unit.payments && unit.payments.captures && unit.payments.captures[0];
  if (!cap || cap.status !== 'COMPLETED') return [];
  const date = chicagoDate(cap.create_time || Date.now());
  const desc = 'Order ' + done.id;
  const p = orderParts(unit);
  const paid = cents(cap.amount);
  const sum = p.product + p.service + p.shipping + p.tax;
  const check = sum !== paid ? `check: parts ${dollars(sum)} vs paid ${dollars(paid)}` : '';
  const out = [];
  if (p.product) out.push(row(date, desc, CAT.product, p.product, 0, `pp:${cap.id}:product`, check));
  if (p.service) out.push(row(date, desc, CAT.service, p.service, 0, `pp:${cap.id}:service`, out.length ? '' : check));
  if (p.shipping) out.push(row(date, desc, CAT.shipping, p.shipping, 0, `pp:${cap.id}:shipping`));
  if (p.tax) out.push(row(date, desc, CAT.tax, p.tax, 0, `pp:${cap.id}:tax`));
  const fee = cents(cap.seller_receivable_breakdown && cap.seller_receivable_breakdown.paypal_fee);
  if (fee) out.push(row(date, desc, CAT.fee, 0, fee, `pp:${cap.id}:fee`));
  return out;
}

/** A captured donation: income (not a charity receipt) and the fee. */
export function donationRows(done) {
  const unit = (done && done.purchase_units && done.purchase_units[0]) || {};
  const cap = unit.payments && unit.payments.captures && unit.payments.captures[0];
  if (!cap || cap.status !== 'COMPLETED') return [];
  const date = chicagoDate(cap.create_time || Date.now());
  const desc = 'Donation ' + done.id;
  const out = [row(date, desc, CAT.donation, cents(cap.amount), 0, `pp:${cap.id}:donation`)];
  const fee = cents(cap.seller_receivable_breakdown && cap.seller_receivable_breakdown.paypal_fee);
  if (fee) out.push(row(date, desc, CAT.fee, 0, fee, `pp:${cap.id}:fee`));
  return out;
}

/** A monthly pick-up payment (PAYMENT.SALE.COMPLETED). */
export function saleRows(res) {
  if (!res || !res.id) return [];
  const date = chicagoDate(res.create_time || Date.now());
  const desc = 'Pick-up subscription ' + (res.billing_agreement_id || res.id);
  const total = cents(res.amount);
  const details = (res.amount && res.amount.details) || {};
  const tax = details.tax != null ? cents(details.tax) : taxShare(total);
  const out = [row(date, desc, CAT.service, total - tax, 0, `pp:${res.id}:service`)];
  if (tax) out.push(row(date, desc, CAT.tax, tax, 0, `pp:${res.id}:tax`));
  const fee = cents(res.transaction_fee);
  if (fee) out.push(row(date, desc, CAT.fee, 0, fee, `pp:${res.id}:fee`));
  return out;
}

/** A refunded monthly pick-up payment (PAYMENT.SALE.REFUNDED). */
export function saleRefundRows(res) {
  if (!res || !res.id) return [];
  const date = chicagoDate(res.create_time || Date.now());
  const desc = 'Pick-up refund ' + (res.sale_id || res.billing_agreement_id || res.id);
  const total = cents(res.amount);
  const tax = taxShare(total);
  const out = [row(date, desc, CAT.service, 0, total - tax, `pp:${res.id}:service`)];
  if (tax) out.push(row(date, desc, CAT.tax, 0, tax, `pp:${res.id}:tax`));
  const back = cents(res.refund_from_transaction_fee);
  if (back) out.push(row(date, desc, CAT.fee, back, 0, `pp:${res.id}:fee`));
  return out;
}

/**
 * A refunded capture (PAYMENT.CAPTURE.REFUNDED).
 *   kind   "donation" | "pickup" | "order"
 *   parts  the order's parts (orderParts / filedParts), for the tax share and
 *          the product/service split; without them the tax share is worked
 *          out at 6% and the row says so.
 */
export function refundRows(res, { kind = 'order', orderId = '', parts = null } = {}) {
  if (!res || !res.id) return [];
  const date = chicagoDate(res.create_time || Date.now());
  const desc = (kind === 'donation' ? 'Donation refund ' : 'Refund on order ') + (orderId || res.id);
  const total = cents(res.amount);
  const out = [];
  if (kind === 'donation') {
    out.push(row(date, desc, CAT.donation, 0, total, `pp:${res.id}:donation`));
  } else {
    let tax, note = '';
    const whole = parts ? parts.product + parts.service + parts.shipping + parts.tax : 0;
    if (parts && whole > 0) tax = Math.min(total, Math.round((total * parts.tax) / whole));
    else { tax = taxShare(total); if (kind !== 'pickup') note = 'tax share estimated at 6%: order details not found'; }
    const rest = total - tax;
    let service = kind === 'pickup' ? rest : 0;
    if (kind !== 'pickup' && parts && parts.product + parts.service > 0) service = Math.round((rest * parts.service) / (parts.product + parts.service));
    const product = rest - service;
    if (product) out.push(row(date, desc, CAT.product, 0, product, `pp:${res.id}:product`, note));
    if (service) out.push(row(date, desc, CAT.service, 0, service, `pp:${res.id}:service`, product ? '' : note));
    if (tax) out.push(row(date, desc, CAT.tax, 0, tax, `pp:${res.id}:tax`));
  }
  const back = cents(res.seller_payable_breakdown && res.seller_payable_breakdown.paypal_fee);
  if (back) out.push(row(date, desc, CAT.fee, back, 0, `pp:${res.id}:fee`));
  return out;
}

/**
 * Money a dispute or chargeback takes back. A dispute and the reversal that
 * may follow it share one Source ID (the capture's), so the money is only
 * ever taken out once.
 */
export function clawbackRows({ captureId, amountCents, category = CAT.product, note, when = Date.now(), orderId = '' }) {
  if (!captureId || !amountCents) return [];
  return [row(chicagoDate(when), 'Order ' + (orderId || captureId), category, 0, amountCents, `pp:${captureId}:clawback`, note)];
}

/** The sales category a whole order belongs to, for a clawback. */
export const salesCategory = (parts) => (parts && parts.service > 0 && parts.product === 0 ? CAT.service : CAT.product);

/** Writes rows to the sheet now; throws when it cannot. Returns { written, skipped }. */
export async function appendRows(rows, env = process.env, fetchImpl = fetch) {
  const id = String(env.BOOKS_SHEET_ID || '');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) throw new Error('BOOKS_SHEET_ID is not set');
  if (!googleReady(env)) throw new Error('the Google service account is not set');
  const token = await accessToken(SCOPE, env, fetchImpl);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values`;
  const auth = { Authorization: `Bearer ${token}` };
  const ranges = [`${TAB}!A2:A`, `${TAB}!L2:L`].map((r) => 'ranges=' + encodeURIComponent(r)).join('&');
  const got = await fetchImpl(`${base}:batchGet?${ranges}&majorDimension=COLUMNS`, { headers: auth });
  const gj = await got.json().catch(() => ({}));
  if (!got.ok) throw new Error((gj.error && gj.error.message) || `Sheets said ${got.status}`);
  const [colA, colL] = (gj.valueRanges || []).map((v) => (v.values && v.values[0]) || []);
  const seen = new Set((colL || []).map(String));
  // values.get trims trailing blanks, so this is the row after the last date.
  let next = (colA || []).length + 2;
  const data = [];
  let skipped = 0;
  for (const r of rows) {
    if (!r || !r.source || seen.has(r.source)) { skipped++; continue; }
    seen.add(r.source);
    data.push({ range: `${TAB}!A${next}:I${next}`, values: [[r.date, ACCOUNT, r.description, r.category, r.in, r.out, '', '', r.notes || '']] });
    data.push({ range: `${TAB}!L${next}`, values: [[r.source]] });
    next++;
  }
  if (!data.length) return { written: 0, skipped };
  const put = await fetchImpl(`${base}:batchUpdate`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
  const pj = await put.json().catch(() => ({}));
  if (!put.ok) throw new Error((pj.error && pj.error.message) || `Sheets said ${put.status}`);
  return { written: data.length / 2, skipped };
}

/**
 * The one call the functions make. Never throws: a sandbox event is only
 * logged, and a failed write waits in "books-queue" for books-retry.
 */
export async function record(rows, { env = process.env, fetchImpl = fetch } = {}) {
  if (!rows || !rows.length) return { skipped: 'nothing to write' };
  if (env.PAYPAL_ENV !== 'live') {
    console.log(`[books] ${rows.length} row(s) not written: PayPal is not live`);
    return { skipped: 'not live' };
  }
  try {
    return await appendRows(rows, env, fetchImpl);
  } catch (e) {
    console.error('[books] queued for retry:', e.message);
    try {
      const q = await queueStore();
      await q.setJSON('q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), { rows, at: new Date().toISOString(), error: String(e.message).slice(0, 300), tries: 0 });
    } catch (e2) { console.error('[books] could not queue', e2.message, JSON.stringify(rows.map((r) => r.source))); }
    return { queued: rows.length };
  }
}

/** Rows waiting in the queue, for the dashboard. */
export async function queueCount() {
  const q = await queueStore();
  const { blobs } = await q.list({ prefix: 'q-' });
  let n = 0;
  for (const b of blobs) { const item = await q.get(b.key, { type: 'json' }).catch(() => null); n += (item && item.rows && item.rows.length) || 0; }
  return n;
}

/**
 * The dashboard's "Test the connection": reads the Transactions header row
 * and counts the rows written so far. Writes nothing. Each failure names the
 * setup step that fixes it (docs/BOOKS.md).
 */
export async function checkSheet(env = process.env, fetchImpl = fetch) {
  const id = String(env.BOOKS_SHEET_ID || '');
  if (!id) return { ok: false, step: 3, error: 'BOOKS_SHEET_ID is not in Netlify yet.' };
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) return { ok: false, step: 3, error: 'BOOKS_SHEET_ID does not look like a sheet id: copy only the part between /d/ and /edit.' };
  if (!googleReady(env)) return { ok: false, step: 0, error: 'The Google service account (GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY) is not in Netlify.' };
  let token;
  try { token = await accessToken(SCOPE, env, fetchImpl); } catch (e) { return { ok: false, step: 0, error: 'Google refused the service account key: ' + e.message }; }
  const res = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?ranges=${encodeURIComponent(TAB + '!A1:L1')}&ranges=${encodeURIComponent(TAB + '!L2:L')}&majorDimension=COLUMNS`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (j.error && j.error.message) || `Sheets said ${res.status}`;
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return { ok: false, step: 1, error: 'The Google Sheets API is not turned on for the service account\'s project yet.' };
    if (res.status === 403) return { ok: false, step: 2, error: 'The sheet is not shared with the service account as Editor yet.' };
    if (res.status === 404) return { ok: false, step: 3, error: 'No sheet with that id: check BOOKS_SHEET_ID.' };
    if (/Unable to parse range/i.test(msg)) return { ok: false, step: 3, error: `The sheet has no tab named "${TAB}".` };
    return { ok: false, error: msg };
  }
  const [head, srcCol] = (j.valueRanges || []).map((v) => v.values || []);
  return { ok: true, header: (head || []).map((c) => c[0] || ''), written: ((srcCol && srcCol[0]) || []).filter((s) => String(s).startsWith('pp:')).length };
}

/** Writes everything waiting in the queue (books-retry, daily). */
export async function flushQueue({ env = process.env, fetchImpl = fetch } = {}) {
  const q = await queueStore();
  const { blobs } = await q.list({ prefix: 'q-' });
  const out = { batches: blobs.length, written: 0, failed: 0 };
  for (const b of blobs) {
    const item = await q.get(b.key, { type: 'json' }).catch(() => null);
    if (!item) { await q.delete(b.key); continue; }
    try {
      const r = await appendRows(item.rows, env, fetchImpl);
      out.written += r.written;
      await q.delete(b.key);
    } catch (e) {
      out.failed++;
      await q.setJSON(b.key, { ...item, tries: (item.tries || 0) + 1, error: String(e.message).slice(0, 300), last: new Date().toISOString() });
    }
  }
  return out;
}

/**
 * What the functions call: works out the rows (make may be async and may ask
 * PayPal for details) only when PayPal is live, then records them. Never throws.
 */
export async function recordSafely(make, label, env = process.env) {
  if (env.PAYPAL_ENV !== 'live') return { skipped: 'not live' };
  try { return await record(await make(), { env }); } catch (e) { console.error('[books]', label, e.message); return { error: e.message }; }
}
