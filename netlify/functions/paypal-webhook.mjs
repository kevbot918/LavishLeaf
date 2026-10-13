// POST /.netlify/functions/paypal-webhook   PayPal tells us what happened
// (owner, 2026-10-12: "make this list update when we issue a refund or a user
// cancels ... only if it is 100% accurate").
//
// Accuracy: every event is checked with PayPal itself
// (/v1/notifications/verify-webhook-signature, using PAYPAL_WEBHOOK_ID); an
// event that does not verify changes nothing. Each event is acted on once
// (Blobs "webhooks"), because PayPal retries until it gets a 200.
//
//   BILLING.SUBSCRIPTION.ACTIVATED            pick-up active, welcome email
//   BILLING.SUBSCRIPTION.CANCELLED / EXPIRED  pick-up canceled, customer told
//   BILLING.SUBSCRIPTION.SUSPENDED            pick-up paused
//   PAYMENT.SALE.COMPLETED                    a monthly payment arrived
//   PAYMENT.SALE.REFUNDED                     a pick-up payment refunded, customer told
//   PAYMENT.CAPTURE.REFUNDED                  a store order refunded: order marked,
//                                             a league registration marked refunded,
//                                             customer told; a donation marked refunded
// Added 2026-10-13 (owner: "analyze to see if we need to use any more"):
//   CUSTOMER.DISPUTE.CREATED                  a buyer opened a dispute or claim: the
//                                             owner is emailed at once (10 days to answer)
//   PAYMENT.CAPTURE.REVERSED                  a chargeback took the money back: order
//                                             marked "reversed", owner emailed
//   PAYMENT.CAPTURE.DENIED                    a pending payment (eCheck) failed: order
//                                             marked "payment failed", owner emailed
//   BILLING.SUBSCRIPTION.PAYMENT.FAILED       a monthly pick-up payment failed: marked on
//                                             the sign-up, owner emailed
import { json } from '../lib/admin.mjs';
import { call, config } from '../lib/paypal.mjs';
import { pickupsStore } from '../lib/pickups.mjs';
import { activated, canceled, refunded as pickupRefunded } from '../lib/pickup-events.mjs';
import { ordersStore } from '../lib/orders.mjs';
import { registrationsStore } from '../lib/registrations.mjs';
import { sendNotice } from '../lib/notice-mail.mjs';
import { esc, mailConfig, mailReady, sendEmail, textOf, validEmail } from '../lib/mail.mjs';

let testHooks = null;
export function setWebhookForTests(h) { testHooks = h; }

async function donationsStore() {
  if (testHooks && testHooks.donations) return testHooks.donations;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'donations', consistency: 'strong' });
}

/** A plain alert to the owner (testHooks.alerts collects them in tests). */
async function alertOwner(subject, lines) {
  if (testHooks && testHooks.alerts) { testHooks.alerts.push({ subject, lines }); return; }
  const owner = mailConfig().owner;
  if (!mailReady() || !validEmail(owner)) return;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
  try { await sendEmail({ to: owner, subject, html, text: textOf(html), kind: 'owner' }); } catch (e) { console.error('[webhook] alert', e.message); }
}

/** The store order a capture belongs to. */
async function orderOfCapture(cfg, capId, res) {
  let orderId = res && res.supplementary_data && res.supplementary_data.related_ids && res.supplementary_data.related_ids.order_id;
  if (!orderId && capId) {
    const cap = await call(cfg, `/v2/payments/captures/${capId}`, null, { method: 'GET' });
    orderId = cap.supplementary_data && cap.supplementary_data.related_ids && cap.supplementary_data.related_ids.order_id;
  }
  return orderId || null;
}

async function seenStore() {
  if (testHooks && testHooks.seen) return testHooks.seen;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'webhooks', consistency: 'strong' });
}

export async function verify(request, event, cfg) {
  if (testHooks && testHooks.verify) return testHooks.verify(event);
  const id = process.env.PAYPAL_WEBHOOK_ID;
  if (!id) return false;
  const h = (n) => request.headers.get(n) || '';
  const r = await call(cfg, '/v1/notifications/verify-webhook-signature', {
    auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
    transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'),
    webhook_id: id, webhook_event: event,
  });
  return r && r.verification_status === 'SUCCESS';
}

async function pickupBySubscription(store, sid) {
  const { blobs } = await store.list({ prefix: 's-' });
  for (const b of blobs) { const r = await store.get(b.key, { type: 'json' }); if (r && r.subscriptionId === sid) return [b.key, r]; }
  return [null, null];
}

const cents = (amount) => Math.round(Number(amount && (amount.value || amount.total) || 0) * 100);

export async function handleEvent(event, cfg) {
  const type = String(event.event_type || '');
  const res = event.resource || {};
  const out = { type, did: 'nothing' };

  if (type.startsWith('BILLING.SUBSCRIPTION.')) {
    const store = await pickupsStore();
    let key = res.custom_id ? 's-' + String(res.custom_id).replace(/[^a-z0-9-]/gi, '') : null;
    let rec = key ? await store.get(key, { type: 'json' }) : null;
    if (!rec || rec.subscriptionId !== res.id) [key, rec] = await pickupBySubscription(store, res.id);
    if (!rec) return out;
    if (type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
      rec.paymentFailed = new Date().toISOString();
      rec.updated = rec.paymentFailed;
      await store.setJSON(key, rec);
      await alertOwner(`Pick-up payment failed: ${rec.name}`, [`PayPal could not collect this month's ${rec.productName} payment from ${rec.name} (${rec.email}).`, 'PayPal retries and emails the customer itself; if it keeps failing PayPal suspends the subscription and the dashboard shows it as paused.']);
      out.did = 'pick-up payment failed';
      return out;
    }
    if (type === 'BILLING.SUBSCRIPTION.ACTIVATED') await activated(rec);
    else if (type === 'BILLING.SUBSCRIPTION.CANCELLED' || type === 'BILLING.SUBSCRIPTION.EXPIRED') await canceled(rec, false);
    else if (type === 'BILLING.SUBSCRIPTION.SUSPENDED') rec.status = 'paused';
    else return out;
    rec.updated = new Date().toISOString();
    await store.setJSON(key, rec);
    out.did = 'pick-up ' + rec.status;
    return out;
  }

  if (type === 'PAYMENT.SALE.COMPLETED' || type === 'PAYMENT.SALE.REFUNDED') {
    let sid = res.billing_agreement_id;
    if (!sid && res.sale_id) {
      const sale = await call(cfg, `/v1/payments/sale/${res.sale_id}`, null, { method: 'GET' });
      sid = sale.billing_agreement_id;
    }
    if (!sid) return out;
    const store = await pickupsStore();
    const [key, rec] = await pickupBySubscription(store, sid);
    if (!rec) return out;
    if (type === 'PAYMENT.SALE.COMPLETED') {
      rec.lastPaid = new Date().toISOString();
      rec.payments = (rec.payments || 0) + 1;
      if (rec.status === 'pending') await activated(rec);
      out.did = 'pick-up paid';
    } else {
      await pickupRefunded(rec, cents(res.amount), event.id);
      out.did = 'pick-up refunded';
    }
    await store.setJSON(key, rec);
    return out;
  }

  if (type === 'PAYMENT.CAPTURE.REFUNDED') {
    // The refund names its capture; the capture names its order.
    const up = (res.links || []).find((l) => l.rel === 'up');
    const capId = up ? String(up.href).split('/').pop() : null;
    const orderId = await orderOfCapture(cfg, capId, res);
    if (!orderId) return out;
    const amount = cents(res.amount);
    const dons = await donationsStore();
    const don = await dons.get('d-' + orderId, { type: 'json' });
    if (don) {
      don.refunded = new Date().toISOString();
      don.refundedCents = (don.refundedCents || 0) + amount;
      await dons.setJSON('d-' + orderId, don);
      out.did = 'donation refunded';
      return out;
    }
    const orders = await ordersStore();
    const o = await orders.get('o-' + orderId, { type: 'json' });
    let full = false;
    if (o) {
      o.refunds = o.refunds || [];
      if (!o.refunds.some((r) => r.event === event.id)) o.refunds.push({ cents: amount, at: new Date().toISOString(), event: event.id });
      const back = o.refunds.reduce((s, r) => s + r.cents, 0);
      full = back >= Math.round(o.total * 100) - 1;
      o.status = full ? 'refunded' : 'partly refunded';
      await orders.setJSON('o-' + orderId, o);
    }
    const regs = await registrationsStore();
    const r = await regs.get('o-' + orderId, { type: 'json' });
    if (r && (full || !o)) { r.status = 'refunded'; r.refundedAt = new Date().toISOString(); await regs.setJSON('o-' + orderId, r); }
    const to = (o && o.email) || (r && r.payerEmail);
    if (to && !(o && o.refundMailedFor === event.id)) {
      try {
        await sendNotice({
          to, name: (o && o.first) || '', subject: 'Your Lavish Leaf refund', heading: 'Refund issued',
          paragraphs: [
            `We have refunded $${(amount / 100).toFixed(2)} for order ${orderId} to your original payment method. PayPal or your bank may take a few days to show it.`,
            ...(r && (full || !o) ? ['Your league registration on this order has been removed from the roster.'] : []),
          ],
        });
        if (o) { o.refundMailedFor = event.id; await orders.setJSON('o-' + orderId, o); }
      } catch (e) { console.error('[webhook] refund email', e.message); }
    }
    out.did = 'order ' + (full ? 'refunded' : 'partly refunded');
    return out;
  }

  if (type === 'PAYMENT.CAPTURE.REVERSED' || type === 'PAYMENT.CAPTURE.DENIED') {
    const orderId = await orderOfCapture(cfg, res.id, res);
    const label = type === 'PAYMENT.CAPTURE.REVERSED' ? 'reversed' : 'payment failed';
    if (orderId) {
      const orders = await ordersStore();
      const o = await orders.get('o-' + orderId, { type: 'json' });
      if (o) { o.status = label; o.statusAt = new Date().toISOString(); await orders.setJSON('o-' + orderId, o); }
    }
    await alertOwner(`PayPal: payment ${label}${orderId ? ' on order ' + orderId : ''}`, [
      type === 'PAYMENT.CAPTURE.REVERSED'
        ? `PayPal took back $${(cents(res.amount) / 100).toFixed(2)} (a chargeback or reversal)${orderId ? ' on order ' + orderId : ''}. Do not ship it if it has not gone out yet.`
        : `A pending payment${orderId ? ' for order ' + orderId : ''} failed, so no money arrived. Do not place or ship it.`,
      'Details are in PayPal under Activity. The dashboard marks the order.',
    ]);
    out.did = 'order ' + label;
    return out;
  }

  if (type === 'CUSTOMER.DISPUTE.CREATED') {
    const t = (res.disputed_transactions || [])[0] || {};
    const amt = res.dispute_amount ? '$' + Number(res.dispute_amount.value).toFixed(2) : 'an amount';
    await alertOwner(`PayPal dispute opened: ${amt}`, [
      `A buyer opened a PayPal ${String(res.reason || 'dispute').toLowerCase().replace(/_/g, ' ')} for ${amt}${t.seller_transaction_id ? ' (transaction ' + t.seller_transaction_id + ')' : ''}.`,
      'Answer it in PayPal (Resolution Center) within 10 days, with tracking or proof of delivery if it was shipped, or the buyer wins by default.',
    ]);
    out.did = 'dispute alert';
    return out;
  }
  return out;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  let event;
  try { event = await request.json(); } catch { return json(400, { error: 'Not JSON.' }); }
  let cfg;
  try { cfg = config(); } catch { return json(503, { error: 'PayPal is not set up.' }); }
  let ok = false;
  try { ok = await verify(request, event, cfg); } catch (e) { console.error('[webhook] verify', e.message); }
  if (!ok) return json(400, { error: 'Not verified.' });
  const seen = await seenStore();
  const key = 'e-' + String(event.id || '').replace(/[^A-Za-z0-9-]/g, '');
  if (await seen.get(key)) return json(200, { duplicate: true });
  const out = await handleEvent(event, cfg);
  await seen.set(key, JSON.stringify({ at: new Date().toISOString(), ...out }));
  return json(200, out);
};
