// POST /.netlify/functions/checkout
//   { items: [{id, qty}], note?, waivers?, shipMethod? }
//   -> { approveUrl }   the PayPal page to send the buyer to
// Prices, shipping AND tax come from the catalog, shipping.mjs and tax.mjs, never from the
// request. See netlify/lib/paypal.mjs. A signed-in customer (Authorization:
// Bearer, Netlify Identity) has the order filed in their account at capture.
import { catalog } from '../lib/catalog.mjs';
import { userFromRequest } from '../lib/identity.mjs';
import { approveLink, call, CheckoutError, config, handle, orderBody, returnUrls, validateCart } from '../lib/paypal.mjs';
import { quote, ShippingError } from '../../shipping.mjs';
import { taxQuote } from '../../tax.mjs';

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
    let shipping;
    try {
      shipping = quote(lines, { method: body.shipMethod });
    } catch (e) {
      if (e instanceof ShippingError) throw new CheckoutError(400, e.message);
      throw e;
    }
    const tax = taxQuote(lines);
    const user = await userFromRequest(request);
    const order = await call(cfg, '/v2/checkout/orders', orderBody(lines, {
      ...returnUrls(request),
      note: body.note,
      waivers: required,
      shipping,
      tax,
      userId: user ? user.id : '',
    }));
    return { approveUrl: approveLink(order) };
  });
