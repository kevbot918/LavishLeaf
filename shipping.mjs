// Shipping for the Lavish Leaf store: ONE set of rules, used by the cart in
// the browser (cart.js imports this file) and by the checkout and capture
// functions on the server (netlify/functions). The server's answer is the one
// PayPal charges; the browser only shows the same sum in advance.
//
// The rules are the owner's, from docs/SHIPPING.md:
//   * BANGALLA'S OWN TABLE since 2026-10-13 (owner: "lets figure out
//     Bangallas exact weight ratio for calculating shipping costs" instead of
//     "over 10 lb ... email for a quote"): bangalla.com/shipping-returns,
//     "Continental USA, dropship", 26 weight tiers from $5.75 under 0.5 lb to
//     $85.79 at 55 to 59.99 lb; heavier needs Bangalla's own quote. What
//     Bangalla bills us is what the buyer pays: no profit, no loss. The text
//     below about Zone 5 bands is the history of the earlier flat bands.
//   * (before 2026-10-13) flat by the order's packed weight: up to 1 lb $8.95,
//     1 to 3 lb $12.95, 3 to 10 lb $18.95; over 10 lb could not be posted.
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

// Bangalla's dropship table (read 2026-10-13): [under this many lb, cents].
const BANGALLA = [
  [0.5, 575], [0.8, 775], [1, 925], [2, 995], [3, 1145], [4, 1195], [5, 1245], [6, 1325], [7, 1420],
  [8, 1520], [9, 1575], [10, 1615], [11, 1695], [12, 1720], [13, 1765], [15, 1845], [17, 2165],
  [20, 2365], [25, 2795], [30, 3295], [35, 4095], [40, 4395], [45, 5095], [50, 5395], [55, 7999], [60, 8579],
];

export const SHIPPING = {
  // A part weighing less than underOz pays cents. upToOz is the same edge,
  // for the cart's weight meter.
  bands: BANGALLA.map(([lb, cents], i) => ({ fromOz: i ? BANGALLA[i - 1][0] * 16 : 0, underOz: lb * 16, upToOz: lb * 16, cents })),
  // A reduced rate for big orders: null means none (the owner's call, 2026-10-07).
  reducedOverCents: null,
  reducedCents: null,
  pickup: {},
  // Per-supplier rules. "bands" = the weight bands above.
  suppliers: {
    bangalla: { rule: 'bands', label: 'US supplier' },
    aliexpress: { rule: 'flat', freeOverCents: 999, freeOverItems: 3, cents: 299, label: 'direct-ship' },
    // CJ Dropshipping (2026-10-14): each product carries "shipCents", CJ's own
    // cheapest freight for one unit to Stigler, and "shipAddCents", what CJ
    // charges for one more unit, both read when the product is added. A US
    // warehouse parcel and a China warehouse parcel ("shipWarehouse": "CN")
    // are charged apart. Each parcel: the dearest item's freight, plus each
    // further unit's own add-on (addOnCents when a product has none), never
    // more than every unit alone.
    cj: { rule: 'cj', addOnCents: 150, label: 'US warehouse' },
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
      if (rule.rule === 'cj') {
        for (const wh of ['US', 'CN']) {
          const units = group.filter(({ product }) => (product.shipWarehouse === 'CN' ? 'CN' : 'US') === wh)
            .flatMap(({ product, qty }) => Array(qty).fill({ one: Number.isInteger(product.shipCents) ? product.shipCents : 599, add: Number.isInteger(product.shipAddCents) ? product.shipAddCents : rule.addOnCents }));
          if (!units.length) continue;
          units.sort((a, b) => b.one - a.one);
          const alone = units.reduce((n, u) => n + u.one, 0);
          const cents = Math.min(alone, units[0].one + units.slice(1).reduce((n, u) => n + u.add, 0));
          parts.push({ from: from + '-' + wh, label: rule.label, cents, desc: wh === 'CN' ? 'overseas warehouse items' : 'US warehouse items' });
        }
        continue;
      }
      if (rule.rule === 'flat') {
        const free = subtotal >= rule.freeOverCents || items >= rule.freeOverItems;
        parts.push({ from, label: rule.label, cents: free ? 0 : rule.cents, desc: free ? 'direct-ship items' : 'direct-ship items under $9.99' });
        continue;
      }
      const oz = group.reduce((sum, { product, qty }) => sum + product.shipOz * qty, 0);
      if (!Number.isFinite(oz) || oz <= 0) throw new ShippingError('Something in your cart has no shipping weight yet. Please email support@lavishleaf.org.');
      const band = SHIPPING.bands.find((x) => oz < x.underOz);
      if (!band) throw new ShippingError('This order weighs 60 lb or more, past our carrier\'s weight table. Please split it into two orders, or email support@lavishleaf.org for a shipping quote.');
      const i = SHIPPING.bands.indexOf(band);
      const lb = (n) => String(Math.round(n * 100) / 100);
      const desc = i === 0 ? 'by weight, under ' + lb(band.underOz / 16) + ' lb' : 'by weight, ' + lb(band.fromOz / 16) + ' to under ' + lb(band.underOz / 16) + ' lb';
      // oz and upToOz feed the cart's weight meter (owner, 2026-10-11).
      parts.push({ from, label: rule.label, cents: band.cents, desc, oz, upToOz: band.upToOz });
    }
    const cents = parts.reduce((n, p) => n + p.cents, 0);
    // Plain words, no supplier names (owner, 2026-10-11).
    const label = 'Shipping (' + parts.map((p) => p.desc + (parts.length > 1 ? ': ' + (p.cents ? money(p.cents) : 'free') : '')).join(' + ') + ')';
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
