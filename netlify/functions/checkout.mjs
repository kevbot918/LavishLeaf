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
import { discountQuote } from '../../discount.mjs';
import { discountsStore, usable } from '../lib/discounts.mjs';
import { outOf, readState, stockStore } from '../lib/stock.mjs';
import { registrationsStore } from '../lib/registrations.mjs';

export default async (request) =>
  handle(request, async (body) => {
    const cfg = config();
    const lines = validateCart(body.items, catalog);
    // What a supplier has run out of is not sold (lib/stock.mjs, 2026-10-13).
    // A failed read of the stock list never blocks a sale.
    try {
      const { products, options } = outOf(await readState(await stockStore()));
      const gone = lines.filter((l) => products.includes(l.product.id) || (l.opt && (options[l.product.id] || []).includes(l.opt)));
      if (gone.length) throw new CheckoutError(400, 'Sorry, ' + gone.map((l) => l.product.name + (l.opt ? ' (' + l.opt + ')' : '')).join(', ') + (gone.length > 1 ? ' are' : ' is') + ' out of stock at our supplier. Please remove ' + (gone.length > 1 ? 'them' : 'it') + ' from your cart; nothing was charged.');
    } catch (e) { if (e instanceof CheckoutError) throw e; console.error('[checkout] stock list', e.message); }
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
    // The first-order code (owner, 2026-10-13): checked here, and the PayPal
    // email is checked against it at capture, before any money moves.
    let code = null;
    if (body.discount) {
      code = await usable(await discountsStore(), body.discount);
      if (!code) throw new CheckoutError(400, 'That discount code is not valid, or it has already been used. Remove it from the cart to pay without it.');
    }
    const off = discountQuote(lines, !!code);
    if (code && !off.cents) throw new CheckoutError(400, 'The 15% code works on store products, and nothing in this cart is one. Remove the code to pay.');
    const tax = taxQuote(off.taxLines);
    const user = await userFromRequest(request);
    const order = await call(cfg, '/v2/checkout/orders', orderBody(lines, {
      ...returnUrls(request),
      note: body.note,
      waivers: required,
      shipping,
      tax,
      discount: code ? { cents: off.cents, code: code.code } : null,
      userId: user ? user.id : '',
    }));
    // League registrations are kept under the PayPal order id (pending until
    // the payment is captured, capture.mjs marks them paid).
    const regs = lines.filter((l) => l.reg).map((l) => ({ product: l.product.id, productName: l.product.name, league: l.product.league || '', ...l.reg }));
    if (regs.length) {
      try {
        await (await registrationsStore()).setJSON('o-' + order.id, { orderId: order.id, created: new Date().toISOString(), status: 'pending', waivers: required, regs });
      } catch (e) { console.error('[checkout] could not keep the registration', e.message); }
    }
    return { approveUrl: approveLink(order) };
  });
