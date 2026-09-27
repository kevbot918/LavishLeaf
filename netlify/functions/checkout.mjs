// POST /.netlify/functions/checkout  { items: [{id, qty}], note?, waivers? }
//   -> { approveUrl }   the PayPal page to send the buyer to
// Prices come from the catalog, never from the request. See netlify/lib/paypal.mjs.
import { catalog } from '../lib/catalog.mjs';
import { approveLink, call, CheckoutError, config, handle, orderBody, returnUrls, validateCart } from '../lib/paypal.mjs';

export default async (request) =>
  handle(request, async (body) => {
    const cfg = config();
    const lines = validateCart(body.items, catalog);
    // **A waiver is checked here, not only in the browser.** The tick in
    // the cart is a convenience; this is the part a page cannot skip. Every
    // waiver version the cart requires must be in the request, or there is
    // no order.
    const required = [...new Set(lines
      .map(({ product }) => product.waiver && product.waiver.version)
      .filter(Boolean))];
    const accepted = Array.isArray(body.waivers) ? body.waivers.map(String) : [];
    const missing = required.filter((v) => !accepted.includes(v));
    if (missing.length) {
      throw new CheckoutError(400, 'Please accept the waiver before paying.');
    }
    const order = await call(cfg, '/v2/checkout/orders', orderBody(lines, {
      ...returnUrls(request),
      note: body.note,
      waivers: required,
    }));
    return { approveUrl: approveLink(order) };
  });
