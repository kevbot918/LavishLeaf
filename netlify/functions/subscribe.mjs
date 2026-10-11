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
import { checkArea, cleanSignup, pickupsStore, planOverride } from '../lib/pickups.mjs';
import { RATE_BP } from '../../tax.mjs';

export default async (request) =>
  handle(request, async (body) => {
    const cfg = config();
    const p = catalog[typeof body.id === 'string' ? body.id : ''];
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
      rec = { id: randomUUID(), product: p.id, productName: p.name, price: p.price, ...s, area, status: 'pending', created: new Date().toISOString() };
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
