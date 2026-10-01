// Shipping for the Lavish Leaf store: ONE set of rules, used by the cart in
// the browser (cart.js imports this file) and by the checkout and capture
// functions on the server (netlify/functions). The server's answer is the one
// PayPal charges; the browser only shows the same sum in advance.
//
// The rules are the owner's, 2026-10-01, from docs/SHIPPING.md:
//   * flat by the order's packed weight: under 1 lb $6.95, 1 to 3 lb $9.95,
//     3 to 10 lb $14.95; over 10 lb is pickup or local delivery only;
//   * any posted order of $100 or more: $4.95 flat;
//   * free pickup in Eufaula or McAlester;
//   * local delivery: free at $50, $5.00 under it, only to LOCAL_ZIPS;
//   * the contiguous United States only.
// A product ships only if products.json gives it "ship": true and a packed
// weight "shipOz". Registrations and the compost service never ship.

export const SHIPPING = {
  bands: [
    { upToOz: 16, cents: 695 },
    { upToOz: 48, cents: 995 },
    { upToOz: 160, cents: 1495 },
  ],
  reducedOverCents: 10000,
  reducedCents: 495,
  // Local delivery runs with the compost route. Edit this list to change
  // where it goes: Eufaula, McAlester.
  localZips: ['74432', '74501', '74502'],
  localFreeOverCents: 5000,
  localCents: 500,
  pickup: { 'pickup-eufaula': 'Eufaula', 'pickup-mcalester': 'McAlester' },
  // Posted orders go to the 48 contiguous states and DC only.
  notPosted: ['AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP', 'AA', 'AE', 'AP'],
};

export class ShippingError extends Error {}

const money = (cents) => '$' + (cents / 100).toFixed(2);
const zip5 = (z) => String(z == null ? '' : z).trim().slice(0, 5);

/** The methods a buyer can pick, in the order the cart lists them. */
export const METHODS = ['ship', 'pickup-eufaula', 'pickup-mcalester', 'local'];

/**
 * The shipping charge for an order.
 *   lines:  [{ product: { price, ship, shipOz }, qty }]
 *   method: one of METHODS (ignored when nothing in the order ships)
 *   zip:    the delivery ZIP, for local delivery
 * Returns { cents, method, needsAddress, label }, or throws ShippingError with
 * a sentence the buyer can act on.
 */
export function quote(lines, { method, zip } = {}) {
  const shipping = lines.filter(({ product }) => product && product.ship === true);
  if (!shipping.length) return { cents: 0, method: 'none', needsAddress: false, label: '' };
  const subtotal = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0);

  if (method === 'ship') {
    const oz = shipping.reduce((sum, { product, qty }) => sum + product.shipOz * qty, 0);
    if (!Number.isFinite(oz) || oz <= 0) throw new ShippingError('Something in your cart has no shipping weight yet. Please email support@lavishleaf.org.');
    const band = SHIPPING.bands.find((b) => oz <= b.upToOz);
    if (!band) throw new ShippingError('This order is too heavy to post. Please choose free pickup or local delivery.');
    if (subtotal >= SHIPPING.reducedOverCents) {
      return { cents: SHIPPING.reducedCents, method, needsAddress: true, label: `Shipping (orders over ${money(SHIPPING.reducedOverCents)})` };
    }
    return { cents: band.cents, method, needsAddress: true, label: 'Shipping' };
  }
  if (SHIPPING.pickup[method]) {
    return { cents: 0, method, needsAddress: false, label: `Pickup in ${SHIPPING.pickup[method]}` };
  }
  if (method === 'local') {
    if (!SHIPPING.localZips.includes(zip5(zip))) {
      throw new ShippingError('Local delivery reaches Eufaula and McAlester for now. Please choose shipping or pickup.');
    }
    const free = subtotal >= SHIPPING.localFreeOverCents;
    return { cents: free ? 0 : SHIPPING.localCents, method, needsAddress: true, label: 'Local delivery' };
  }
  throw new ShippingError('Please choose how you would like to receive your order.');
}

/**
 * Whether the address PayPal collected fits the method chosen. Checked on
 * the server before the payment is captured, so a posted order cannot go to
 * Alaska at a 48-state price, and local delivery cannot go out of town.
 */
export function addressOk(method, address, zip) {
  if (method !== 'ship' && method !== 'local') return { ok: true };
  if (!address || address.country_code !== 'US') {
    return { ok: false, message: 'We ship within the United States only. Nothing was charged.' };
  }
  if (method === 'ship' && SHIPPING.notPosted.includes(String(address.admin_area_1 || '').toUpperCase())) {
    return { ok: false, message: 'We post to the 48 contiguous states for now. Email support@lavishleaf.org and we will quote you. Nothing was charged.' };
  }
  if (method === 'local' && zip5(address.postal_code) !== zip5(zip)) {
    return { ok: false, message: 'That address is outside the ZIP you chose for local delivery. Please check out again with shipping. Nothing was charged.' };
  }
  return { ok: true };
}

/** For the cart's progress line: how far a posted order is from $4.95. */
export function untilReduced(subtotalCents) {
  return Math.max(0, SHIPPING.reducedOverCents - subtotalCents);
}
