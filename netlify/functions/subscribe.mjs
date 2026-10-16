// POST /.netlify/functions/subscribe  { id, details? }
//   -> { approveUrl }   PayPal's page to start the subscription
// Only for a product with an interval and a PayPal plan for the environment in
// use (tools/paypal-plans.mjs creates the plans and writes their ids into
// products.json as paypalPlanId for live, paypalSandboxPlanId for sandbox).
//
// Pick-up services ("pickup": true, 2026-10-11) also need the sign-up form
// (netlify/lib/pickups.mjs): the address is checked against the pick-up area
// BEFORE PayPal is asked, the sign-up is kept in Blobs "pickups" with its id
// on the subscription, and the subscription carries the store's price and the
// bucket fee (or none) as a plan override.
import { randomUUID } from 'node:crypto';
import { catalog } from '../lib/catalog.mjs';
import { CheckoutError, approveLink, call, config, handle, returnUrls, subscriptionBody } from '../lib/paypal.mjs';
import { BUCKET_CENTS, checkArea, cleanSignup, pickupsStore, planOverride } from '../lib/pickups.mjs';
import { RATE_BP, taxOn } from '../../tax.mjs';

// A ONE-TIME pick-up (owner, 2026-10-16: "for those that may not want to
// subscribe monthly"): the same form and area check, then a one-time PayPal
// order instead of a subscription, at the product's "oneTime" price (plus the
// bucket and 6%). custom_id "pk=<sign-up id>" tells capture.mjs it is a
// pick-up, so it is filed in "pickups", never as a store order.
async function oneTime(request, cfg, p, body) {
  if (!p.pickup || !Number.isInteger(p.oneTime) || p.oneTime <= 0) throw new CheckoutError(400, 'A one-time pick-up is not offered for that service.');
  const s = cleanSignup(body.details, p);
  const area = await checkArea(s);
  const items = [{ name: `${p.name} (one time)`.slice(0, 127), sku: p.id + ':once', quantity: '1', unit_amount: { currency_code: 'USD', value: money(p.oneTime) }, category: 'DIGITAL_GOODS' }];
  if (s.bucket) items.push({ name: '5 gallon bucket', sku: p.id + ':bucket', quantity: '1', unit_amount: { currency_code: 'USD', value: money(BUCKET_CENTS) }, category: 'PHYSICAL_GOODS' });
  const cents = p.oneTime + (s.bucket ? BUCKET_CENTS : 0);
  const tax = taxOn(cents);
  const rec = { id: randomUUID(), once: true, product: p.id, productName: p.name, price: p.oneTime, ...s, area, lat: area.lat, lon: area.lon, assignedDay: null, status: 'pending', created: new Date().toISOString() };
  const { returnUrl, cancelUrl } = returnUrls(request);
  const order = await call(cfg, '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      custom_id: 'pk=' + rec.id,
      description: `${p.name}, one time, ${s.city}`.slice(0, 127),
      amount: { currency_code: 'USD', value: money(cents + tax), breakdown: { item_total: { currency_code: 'USD', value: money(cents) }, tax_total: { currency_code: 'USD', value: money(tax) } } },
      items,
    }],
    payment_source: { paypal: { experience_context: { brand_name: 'Lavish Leaf', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', return_url: returnUrl, cancel_url: cancelUrl } } },
  });
  rec.orderId = String(order.id || '');
  rec.totalCents = cents + tax;
  const store = await pickupsStore();
  await store.setJSON('s-' + rec.id, rec);
  // The refund webhook finds a one-time pick-up by its PayPal order.
  if (rec.orderId) await store.setJSON('o-' + rec.orderId, { id: rec.id });
  return { approveUrl: approveLink(order) };
}
const money = (c) => (c / 100).toFixed(2);

export default async (request) =>
  handle(request, async (body) => {
    const cfg = config();
    const p = catalog[typeof body.id === 'string' ? body.id : ''];
    if (p && p.active && body.once === true) return oneTime(request, cfg, p, body);
    if (!p || !p.active || !p.interval) throw new CheckoutError(400, 'That subscription is not available.');
    // A plan exists in one PayPal environment only: sandbox and live ids differ.
    const plan = cfg.mode === 'live' ? p.paypalPlanId : p.paypalSandboxPlanId;
    if (!plan) throw new CheckoutError(503, 'Sign-up is not set up yet. Please email support@lavishleaf.org.');
    const subBody = subscriptionBody({ ...p, paypalPlanId: plan }, returnUrls(request));
    let rec = null;
    if (p.pickup) {
      const s = cleanSignup(body.details, p);
      const area = await checkArea(s);
      const planInfo = await call(cfg, `/v1/billing/plans/${plan}`, null, { method: 'GET' });
      subBody.plan = planOverride(planInfo, p, s, (RATE_BP / 100).toFixed(2));
      // lat/lon put the stop on the route planner (routes.mjs, dashboard).
      rec = { id: randomUUID(), product: p.id, productName: p.name, price: p.price, ...s, area, lat: area.lat, lon: area.lon, assignedDay: null, status: 'pending', created: new Date().toISOString() };
      subBody.custom_id = rec.id;
      const [first, ...rest] = s.name.split(' ');
      subBody.subscriber = { name: { given_name: first.slice(0, 140), ...(rest.length ? { surname: rest.join(' ').slice(0, 140) } : {}) }, email_address: s.email };
    }
    const sub = await call(cfg, '/v1/billing/subscriptions', subBody);
    if (rec) {
      rec.subscriptionId = String(sub.id || '');
      await (await pickupsStore()).setJSON('s-' + rec.id, rec);
    }
    return { approveUrl: approveLink(sub) };
  });
