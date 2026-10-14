// The first-order discount (owner, 2026-10-13): ONE rule, used by the cart in
// the browser (cart.js imports this file) and by the checkout function, like
// shipping.mjs and tax.mjs. The server's answer is the one PayPal charges.
//
// 15% (owner, 2026-10-14; it was 20%) off the store's PRODUCTS on a customer's first order: not shipping,
// not tax, not league registrations, not the pick-up subscriptions. A code
// comes from the store's sign-up pop-up (netlify/functions/discount.mjs),
// once per IP address, email and phone, and only works when the PayPal email
// is the one it was sent to (checked before the payment is captured).

export const DISCOUNT = { percent: 15, label: 'First-order discount (15%)' };

/** Code shape: LL15- (LL20- from the first day, 2026-10-13) and eight letters or digits. */
export const CODE = /^LL(15|20)-[A-HJ-NP-Z2-9]{8}$/;

/** Whether a line can be discounted: a posted product, not a service or registration. */
export function eligible(product) {
  return !!product && product.ship === true && !product.interval && !product.registration;
}

/**
 * The discount on a cart, in cents, and the lines' prices after it (for the
 * tax, which is charged on what the buyer actually pays).
 *   lines: [{ product: { price, ship, ... }, qty }]
 */
export function discountQuote(lines, active = true) {
  if (!active) return { cents: 0, label: DISCOUNT.label, taxLines: lines };
  let base = 0;
  for (const { product, qty } of lines) if (eligible(product)) base += product.price * qty;
  const cents = Math.round((base * DISCOUNT.percent) / 100);
  const taxLines = lines.map((l) => (eligible(l.product)
    ? { ...l, product: { ...l.product, price: (l.product.price * (100 - DISCOUNT.percent)) / 100 } }
    : l));
  return { cents, label: DISCOUNT.label, taxLines };
}
