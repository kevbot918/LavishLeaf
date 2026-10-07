// Sales tax for the Lavish Leaf store: ONE set of rules, used by the cart in
// the browser (cart.js imports this file) and by the checkout, capture and
// subscribe functions on the server. Like shipping.mjs, the server's answer
// is the one PayPal charges; the cart only shows the same sum in advance.
//
// The owner's rules, 2026-10-07:
//   * Oklahoma 4.5% plus Pittsburg County 1.5%: 6% in all;
//   * league fees, registrations and the pick-up services are taxable, and
//     they all happen in Oklahoma, so they always carry it;
//   * shipped goods are taxed when they are delivered in Oklahoma, at the
//     same 6%; goods shipped to another state carry no tax, because Lavish
//     Leaf has a physical place in Oklahoma only (and is far below every
//     state's economic-nexus threshold).
// Shipping charges are not taxed here. Two questions for the CPA are in
// docs/SHIPPING.md: whether Oklahoma taxes a separately stated delivery
// charge, and the Tax Commission's rule that an in-state delivery is taxed
// at the rate where the buyer receives it (destination), not ours.

export const TAX = {
  home: 'OK',
  // Basis points: 450 = 4.5%.
  stateBp: 450,
  localBp: 150,
  label: 'Sales tax (Oklahoma 6%)',
};

export const RATE_BP = TAX.stateBp + TAX.localBp;

/** Where a shipped order is going, as the cart asks it: Oklahoma or not. */
export const SHIP_TO = ['OK', 'other'];

export class TaxError extends Error {}

/** Whole cents, half a cent rounding up. */
export const taxOn = (cents) => Math.round((cents * RATE_BP) / 10000);

/**
 * The tax on an order.
 *   lines:  [{ product: { price, ship }, qty }]
 *   shipTo: 'OK' or 'other', required when something in the order ships
 * Returns { cents, taxableCents, shipTo, label }, or throws TaxError.
 */
export function taxQuote(lines, { shipTo } = {}) {
  const posts = lines.some(({ product }) => product && product.ship === true);
  if (posts && !SHIP_TO.includes(shipTo)) {
    throw new TaxError('Please choose whether your order ships to Oklahoma or another state.');
  }
  const taxableCents = lines.reduce((sum, { product, qty }) => {
    const taxed = product.ship === true ? shipTo === 'OK' : true;
    return sum + (taxed ? product.price * qty : 0);
  }, 0);
  return { cents: taxOn(taxableCents), taxableCents, shipTo: posts ? shipTo : '', label: TAX.label };
}

/**
 * Whether the address PayPal collected is where the order was taxed for.
 * Checked on the server before the payment is captured, so an order taxed
 * as out of state cannot be delivered in Oklahoma, and the other way round.
 */
export function taxAddressOk(shipTo, address) {
  if (!shipTo) return { ok: true };
  const inOk = String(address?.admin_area_1 || '').toUpperCase() === TAX.home;
  if ((shipTo === 'OK') === inOk) return { ok: true };
  return {
    ok: false,
    message: inOk
      ? 'This order ships to Oklahoma, so it carries Oklahoma sales tax. Please choose Oklahoma in the cart and check out again. Nothing was charged.'
      : 'This order ships outside Oklahoma, so it carries no Oklahoma sales tax. Please choose "Another state" in the cart and check out again. Nothing was charged.',
  };
}
