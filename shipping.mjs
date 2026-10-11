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
//
// BY SUPPLIER (owner, 2026-10-11: "I also don't want to charge Bangalla's
// high shipping costs for other suppliers if they don't have high shipping
// costs"). Each supplier sends its own parcel, so each is charged on its own
// and the order's shipping is the sum. A product says which with "shipFrom":
//   * "bangalla" (and anything without shipFrom): the weight bands above,
//     on that supplier's items only. Bangalla bills its carrier rate by
//     weight, distance and speed (owner, 2026-10-07).
//   * "aliexpress": AliExpress Choice ships free to the US once an order
//     clears a small minimum (about $1.99 to $3.99 of goods, or 3 items) and
//     charges about $1.50 to $3.00 below it (secretali.com 2026 guide, read
//     2026-10-11). So: free at $9.99 of our price or 3 items, else $2.99.

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
  // Per-supplier rules. "bands" = the weight bands above.
  suppliers: {
    bangalla: { rule: 'bands', label: 'US supplier' },
    aliexpress: { rule: 'flat', freeOverCents: 999, freeOverItems: 3, cents: 299, label: 'overseas supplier' },
  },
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
  if (!shipping.length) return { cents: 0, method: 'none', needsAddress: false, label: '', parts: [] };

  if (method === 'ship') {
    // One parcel per supplier, each charged by its own rule.
    const groups = new Map();
    for (const l of shipping) {
      const from = SHIPPING.suppliers[l.product.shipFrom] ? l.product.shipFrom : 'bangalla';
      if (!groups.has(from)) groups.set(from, []);
      groups.get(from).push(l);
    }
    const parts = [];
    for (const [from, group] of groups) {
      const rule = SHIPPING.suppliers[from];
      const subtotal = group.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
      const items = group.reduce((n, { qty }) => n + qty, 0);
      if (rule.rule === 'flat') {
        const free = subtotal >= rule.freeOverCents || items >= rule.freeOverItems;
        parts.push({ from, label: rule.label, cents: free ? 0 : rule.cents });
        continue;
      }
      const oz = group.reduce((sum, { product, qty }) => sum + product.shipOz * qty, 0);
      if (!Number.isFinite(oz) || oz <= 0) throw new ShippingError('Something in your cart has no shipping weight yet. Please email support@lavishleaf.org.');
      const band = SHIPPING.bands.find((x) => oz <= x.upToOz);
      if (!band) throw new ShippingError('This order is over 10 lb, too heavy for our flat rates. Please email support@lavishleaf.org for a shipping quote.');
      parts.push({ from, label: rule.label, cents: band.cents });
    }
    const cents = parts.reduce((n, p) => n + p.cents, 0);
    const label = parts.length > 1
      ? 'Shipping (' + parts.map((p) => p.label + ' ' + (p.cents ? money(p.cents) : 'free')).join(', ') + ')'
      : 'Shipping';
    return { cents, method, needsAddress: true, label, parts };
  }
  if (SHIPPING.pickup[method]) {
    return { cents: 0, method, needsAddress: false, label: `Pickup in ${SHIPPING.pickup[method]}`, parts: [] };
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
