// Shipping for the Lavish Leaf store: ONE set of rules, used by the cart in
// the browser (cart.js imports this file) and by the checkout and capture
// functions on the server (netlify/functions). The server's answer is the one
// PayPal charges; the browser only shows the same sum in advance.
//
// The rules are the owner's, from docs/SHIPPING.md:
//   * flat by the order's packed weight: up to 1 lb $8.95, 1 to 3 lb $12.95,
//     3 to 10 lb $18.95; over 10 lb cannot be posted (email for a quote).
//     The owner, 2026-10-07: "I don't want us to make money on shipping, I
//     just don't want to lose money on shipping", and not to scare buyers
//     off. So each band is what the order costs to post to the MIDDLE of the
//     country (Zone 5, USPS Ground Advantage commercial, effective 4 Oct
//     2026): nearer orders pay a little over cost, the far coasts a little
//     under, and it evens out. (A first try that day covered Zone 8 and he
//     called it far too high.) Check against the supplier's real charges;
//   * no reduced rate over $100 any more (removed the same day: $4.95 on a
//     heavy order lost money on every one);
//   * NO pickup and NO local delivery for now (owner, 2026-10-02: nothing is
//     in stock; goods would have to be shipped to him first, at his cost).
//     Add a pickup back here, e.g. { 'pickup-eufaula': 'Eufaula' }, once
//     there is stock in storage; cart.js offers whatever is listed;
//   * no local delivery (owner, 2026-10-01: "We don't do any delivery
//     really, at least not yet"; the compost service is its own thing);
//   * the contiguous United States only.
// A product ships only if products.json gives it "ship": true and a packed
// weight "shipOz". Registrations and the compost service never ship.

export const SHIPPING = {
  bands: [
    { upToOz: 16, cents: 895 },    // Zone 5: $8.24 under 1 lb, $9.29 at 1 lb
    { upToOz: 48, cents: 1295 },   // Zone 5: $9.29 to $12.12 (1 to 3 lb)
    { upToOz: 160, cents: 1895 },  // Zone 5: $12.12 to $17.81 (3 to 10 lb)
  ],
  // A reduced rate for big orders: null means none (the owner's call, 2026-10-07).
  reducedOverCents: null,
  reducedCents: null,
  pickup: {},
  // Posted orders go to the 48 contiguous states and DC only.
  notPosted: ['AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP', 'AA', 'AE', 'AP'],
};

export class ShippingError extends Error {}

const money = (cents) => '$' + (cents / 100).toFixed(2);

/** The methods a buyer can pick, in the order the cart lists them. */
export const METHODS = ['ship'];

/**
 * The shipping charge for an order.
 *   lines:  [{ product: { price, ship, shipOz }, qty }]
 *   method: one of METHODS (ignored when nothing in the order ships)
 * Returns { cents, method, needsAddress, label }, or throws ShippingError with
 * a sentence the buyer can act on.
 */
export function quote(lines, { method } = {}) {
  const shipping = lines.filter(({ product }) => product && product.ship === true);
  if (!shipping.length) return { cents: 0, method: 'none', needsAddress: false, label: '' };
  const subtotal = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0);

  if (method === 'ship') {
    const oz = shipping.reduce((sum, { product, qty }) => sum + product.shipOz * qty, 0);
    if (!Number.isFinite(oz) || oz <= 0) throw new ShippingError('Something in your cart has no shipping weight yet. Please email support@lavishleaf.org.');
    const band = SHIPPING.bands.find((b) => oz <= b.upToOz);
    if (!band) throw new ShippingError('This order is over 10 lb, too heavy for our flat rates. Please email support@lavishleaf.org for a shipping quote.');
    if (SHIPPING.reducedOverCents != null && subtotal >= SHIPPING.reducedOverCents) {
      return { cents: SHIPPING.reducedCents, method, needsAddress: true, label: `Shipping (orders over ${money(SHIPPING.reducedOverCents)})` };
    }
    return { cents: band.cents, method, needsAddress: true, label: 'Shipping' };
  }
  if (SHIPPING.pickup[method]) {
    return { cents: 0, method, needsAddress: false, label: `Pickup in ${SHIPPING.pickup[method]}` };
  }
  throw new ShippingError('Please choose how you would like to receive your order.');
}

/**
 * Whether the address PayPal collected fits the method chosen. Checked on
 * the server before the payment is captured, so a posted order cannot go to
 * Alaska at a 48-state price.
 */
export function addressOk(method, address) {
  if (method !== 'ship') return { ok: true };
  if (!address || address.country_code !== 'US') {
    return { ok: false, message: 'We ship within the United States only. Nothing was charged.' };
  }
  if (SHIPPING.notPosted.includes(String(address.admin_area_1 || '').toUpperCase())) {
    return { ok: false, message: 'We post to the 48 contiguous states for now. Email support@lavishleaf.org and we will quote you. Nothing was charged.' };
  }
  return { ok: true };
}

/** For the cart's progress line: how far a posted order is from the reduced rate (0 when there is none). */
export function untilReduced(subtotalCents) {
  if (SHIPPING.reducedOverCents == null) return 0;
  return Math.max(0, SHIPPING.reducedOverCents - subtotalCents);
}
