// PayPal for lavishleaf.org's cart: the pieces the three checkout functions
// share. Nothing in here trusts the browser. A cart arrives as product ids and
// quantities only; every price, name and total is read from the catalog that
// tools/render-store.mjs generates from products.json, so nobody can pay less
// by editing a page.
//
// Credentials come from the Netlify environment and never leave the server:
//   PAYPAL_ENV        "live" or "sandbox" (default sandbox, so a half-set-up
//                     site can never take real money by accident)
//   PAYPAL_CLIENT_ID  and  PAYPAL_SECRET   for that environment
// With either missing, every function answers 503 "not set up yet".

const API = {
  live: 'https://api-m.paypal.com',
  sandbox: 'https://api-m.sandbox.paypal.com',
};

/** The most of one thing a single order may hold. A typo, not a policy. */
export const MAX_QTY = 20;

/** PayPal's limits on the free-text fields this site fills. */
const NOTE_MAX = 127;

export class CheckoutError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Which PayPal, with which keys, or a 503 when the site is not set up. */
export function config(env = process.env) {
  const mode = env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
  const id = env.PAYPAL_CLIENT_ID;
  const secret = env.PAYPAL_SECRET;
  if (!id || !secret) {
    throw new CheckoutError(503, 'Checkout is not set up yet. Please email support@lavishleaf.org.');
  }
  return { base: API[mode], mode, id, secret };
}

const money = (cents) => (cents / 100).toFixed(2);

/** Plain text PayPal will accept in a short field: no tags, no control characters. */
export function cleanNote(note) {
  if (typeof note !== 'string') return '';
  return note.replace(/[\x00-\x1f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

/**
 * The cart, checked against the catalog. Throws a 400 with a sentence a buyer
 * can act on. Two lines for one product are merged.
 */
export function validateCart(cart, catalog) {
  if (!Array.isArray(cart) || cart.length === 0) throw new CheckoutError(400, 'Your cart is empty.');
  if (cart.length > 50) throw new CheckoutError(400, 'That cart is too long for one order.');
  const merged = new Map();
  for (const line of cart) {
    const id = line && typeof line.id === 'string' ? line.id : '';
    const qty = line ? line.qty : undefined;
    const p = catalog[id];
    if (!p || !p.active) throw new CheckoutError(400, 'Something in your cart is no longer for sale. Remove it and try again.');
    if (p.interval) throw new CheckoutError(400, `${p.name} is a subscription and is signed up for on its own.`);
    if (!Number.isInteger(qty) || qty < 1) throw new CheckoutError(400, 'Each item needs a quantity of at least one.');
    // The price is never taken from the browser, so this is not about a
    // hostile buyer: it is about catalog.mjs drifting from products.json.
    // catalog.mjs is a GENERATED file that is committed, the only price check
    // lives in the renderer on the owner's machine, and there is no CI to run
    // it. A missing or zero price would otherwise sail through and PayPal
    // would be asked to charge $0.00 for a $250 team registration.
    if (!Number.isInteger(p.price) || p.price <= 0) {
      throw new CheckoutError(500, 'That item is not priced correctly yet. Please let us know and we will fix it.');
    }
    const total = (merged.get(id) || 0) + qty;
    if (total > MAX_QTY) throw new CheckoutError(400, `At most ${MAX_QTY} of one item per order.`);
    merged.set(id, total);
  }
  return [...merged].map(([id, qty]) => ({ product: catalog[id], qty }));
}

/** The body of PayPal's "create order" call for a validated cart. */
export function orderBody(lines, { returnUrl, cancelUrl, note = '', waivers = [] }) {
  const items = lines.map(({ product, qty }) => ({
    name: product.name.slice(0, 127),
    sku: product.id,
    quantity: String(qty),
    unit_amount: { currency_code: 'USD', value: money(product.price) },
    category: 'DIGITAL_GOODS',
  }));
  const cents = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
  // Belt and braces behind validateCart: never ask PayPal to create a
  // zero-value order. An order that charges nothing looks like a successful
  // sale to everyone involved, which is the worst way for a pricing bug to
  // fail.
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new CheckoutError(500, 'That order came to nothing. Please let us know and we will fix it.');
  }
  const unit = {
    amount: {
      currency_code: 'USD',
      value: money(cents),
      breakdown: { item_total: { currency_code: 'USD', value: money(cents) } },
    },
    items,
  };
  const clean = cleanNote(note);
  if (clean) unit.description = clean;
  // What was agreed to, on the order itself. PayPal shows custom_id on the
  // transaction and returns it at capture, so an order is its own record of
  // the waiver the buyer accepted.
  if (waivers.length) {
    unit.custom_id = ('waiver:' + waivers.join(',')).slice(0, 127);
  }
  return {
    intent: 'CAPTURE',
    purchase_units: [unit],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: 'Lavish Leaf',
          // Registrations and pick-ups: nothing is shipped.
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      },
    },
  };
}

/** The body of PayPal's "create subscription" call for one plan. */
export function subscriptionBody(product, { returnUrl, cancelUrl }) {
  return {
    plan_id: product.paypalPlanId,
    application_context: {
      brand_name: 'Lavish Leaf',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'SUBSCRIBE_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };
}

/** Where PayPal wants the buyer sent next, from a create reply. */
export function approveLink(reply) {
  const links = Array.isArray(reply && reply.links) ? reply.links : [];
  const link = links.find((l) => l.rel === 'payer-action') || links.find((l) => l.rel === 'approve');
  if (!link || !/^https:\/\/([a-z0-9-]+\.)*paypal\.com\//.test(link.href)) {
    throw new CheckoutError(502, 'PayPal did not return a checkout page. Please try again.');
  }
  return link.href;
}

/** An OAuth token for this environment. */
export async function token(cfg, fetchImpl = fetch) {
  const res = await fetchImpl(`${cfg.base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${cfg.id}:${cfg.secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new CheckoutError(502, 'PayPal could not be reached. Please try again in a minute.');
  const json = await res.json();
  return json.access_token;
}

/** One authenticated PayPal call; the reply as JSON, or a 502. */
export async function call(cfg, path, body, { fetchImpl = fetch, requestId } = {}) {
  const auth = await token(cfg, fetchImpl);
  const res = await fetchImpl(`${cfg.base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The detail goes to the function log for the owner; the buyer gets a
    // sentence they can act on.
    console.error(`[paypal] ${path} -> ${res.status}`, JSON.stringify(json).slice(0, 500));
    throw new CheckoutError(502, 'PayPal refused that request. Nothing was charged; please try again.');
  }
  return json;
}

/** Where to send the buyer back to on this site. */
export function returnUrls(request, page = '/store') {
  const origin = new URL(request.url).origin;
  return {
    returnUrl: `${origin}${page}?paypal=return`,
    cancelUrl: `${origin}${page}?paypal=cancel`,
  };
}

/** A JSON reply for a Netlify Function. */
export function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Runs a handler, turning a CheckoutError into its reply. */
export async function handle(request, fn) {
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });
  try {
    const body = await request.json().catch(() => {
      throw new CheckoutError(400, 'That request was not understood.');
    });
    return reply(200, await fn(body));
  } catch (e) {
    if (e instanceof CheckoutError) return reply(e.status, { error: e.message });
    console.error('[checkout] unexpected', e);
    return reply(500, { error: 'Something went wrong on our side. Nothing was charged.' });
  }
}
