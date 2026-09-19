// POST /.netlify/functions/capture  { orderId }
//   -> { status, orderId, amount }
// Called by the store page when PayPal sends the buyer back. Capturing twice
// is safe: the order id is the idempotency key, so a reload does not charge
// again.
import { CheckoutError, call, config, handle } from '../lib/paypal.mjs';

export default async (request) =>
  handle(request, async (body) => {
    const cfg = config();
    const id = typeof body.orderId === 'string' ? body.orderId : '';
    if (!/^[A-Z0-9]{8,40}$/.test(id)) throw new CheckoutError(400, 'That order could not be found.');
    const done = await call(cfg, `/v2/checkout/orders/${id}/capture`, {}, { requestId: `capture-${id}` });
    const capture = done.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      status: done.status,
      orderId: done.id,
      amount: capture?.amount?.value ?? null,
    };
  });
