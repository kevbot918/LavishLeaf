// POST /.netlify/functions/capture  { orderId }
//   -> { status, orderId, amount }
// Called by the store page when PayPal sends the buyer back. Capturing twice
// is safe: the order id is the idempotency key, so a reload does not charge
// again.
//
// Before any money moves, the order is read back and the address PayPal
// collected is checked against the delivery method chosen (shipping.mjs):
// a posted order stays in the 48 states. After
// it is paid, a signed-in customer's order goes into their account history,
// and the confirmation and owner emails go out (netlify/lib/orders.mjs).
import { accountsStore, addOrder } from '../lib/accounts.mjs';
import { CheckoutError, call, config, handle, parseCustomId } from '../lib/paypal.mjs';
import { addressOk } from '../../shipping.mjs';
import { afterPayment, summarise } from '../lib/orders.mjs';
import { registrationsPaid } from '../lib/registration-mail.mjs';
import { discountsStore, markUsed } from '../lib/discounts.mjs';

export default async (request) =>
  handle(request, async (body) => {
    const cfg = config();
    const id = typeof body.orderId === 'string' ? body.orderId : '';
    if (!/^[A-Z0-9]{8,40}$/.test(id)) throw new CheckoutError(400, 'That order could not be found.');

    const order = await call(cfg, `/v2/checkout/orders/${id}`, null, { method: 'GET' });
    const unit = order.purchase_units?.[0] || {};
    const meta = parseCustomId(unit.custom_id);
    if (order.status !== 'COMPLETED' && meta.m) {
      const ok = addressOk(meta.m, unit.shipping?.address);
      if (!ok.ok) throw new CheckoutError(400, ok.message);
    }

    // A first-order code works only with the email it was sent to, and only
    // once (owner, 2026-10-13). Checked BEFORE capture: nothing is charged.
    if (order.status !== 'COMPLETED' && meta.d) {
      const rec = await (await discountsStore()).get('c-' + meta.d, { type: 'json' }).catch(() => null);
      const payer = String((order.payer && order.payer.email_address) || '').toLowerCase();
      if (!rec || rec.used) throw new CheckoutError(400, 'That discount code has already been used, so this order was not charged. Remove the code from your cart and check out again.');
      if (rec.email !== payer) throw new CheckoutError(400, 'Your 20% code was sent to ' + rec.email.replace(/^(.).*(@.*)$/, '$1***$2') + ', but this PayPal account uses a different email, so nothing was charged. Pay with the PayPal account for that email, or remove the code from your cart and check out again.');
    }

    const done = order.status === 'COMPLETED'
      ? order
      : await call(cfg, `/v2/checkout/orders/${id}/capture`, {}, { requestId: `capture-${id}` });
    const capture = done.purchase_units?.[0]?.payments?.captures?.[0];

    if (done.status === 'COMPLETED' && meta.u) {
      // The history is a convenience: the payment has gone through whatever
      // happens here, so a storage hiccup is logged, never shown as a failure.
      try {
        const store = await accountsStore();
        await addOrder(store, meta.u, {
          id: done.id,
          date: new Date().toISOString(),
          total: capture?.amount?.value ?? unit.amount?.value ?? null,
          items: (unit.items || []).map((i) => ({ name: String(i.name || '').slice(0, 127), qty: Number(i.quantity) || 1 })),
          delivery: meta.m || 'none',
        });
      } catch (e) {
        console.error('[capture] could not file the order in the account', e);
      }
    }

    // Filed for the dashboard, the customer's confirmation and the owner's
    // alert (netlify/lib/orders.mjs). Each happens once; none can fail the
    // payment, which has already gone through.
    if (done.status === 'COMPLETED' && meta.d) {
      try { await markUsed(await discountsStore(), meta.d, done.id); } catch (e) { console.error('[capture] mark code used', e.message); }
    }
    if (done.status === 'COMPLETED') await afterPayment(summarise(done, meta));
    // League registrations on this order: paid, and the owner gets the roster.
    if (done.status === 'COMPLETED') await registrationsPaid(done.id, done.payer);

    return {
      status: done.status,
      orderId: done.id,
      amount: capture?.amount?.value ?? null,
    };
  });
