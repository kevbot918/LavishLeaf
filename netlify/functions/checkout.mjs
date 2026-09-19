// POST /.netlify/functions/checkout  { items: [{id, qty}], note? }
//   -> { approveUrl }   the PayPal page to send the buyer to
// Prices come from the catalog, never from the request. See netlify/lib/paypal.mjs.
import { catalog } from '../lib/catalog.mjs';
import { approveLink, call, config, handle, orderBody, returnUrls, validateCart } from '../lib/paypal.mjs';

export default async (request) =>
  handle(request, async (body) => {
    const cfg = config();
    const lines = validateCart(body.items, catalog);
    const order = await call(cfg, '/v2/checkout/orders', orderBody(lines, { ...returnUrls(request), note: body.note }));
    return { approveUrl: approveLink(order) };
  });
