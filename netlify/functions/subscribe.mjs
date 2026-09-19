// POST /.netlify/functions/subscribe  { id }
//   -> { approveUrl }   PayPal's page to start the subscription
// Only for a product with an interval and a PayPal plan for the environment in
// use (tools/paypal-plans.mjs creates the plans and writes their ids into
// products.json as paypalPlanId for live, paypalSandboxPlanId for sandbox).
import { catalog } from '../lib/catalog.mjs';
import { CheckoutError, approveLink, call, config, handle, returnUrls, subscriptionBody } from '../lib/paypal.mjs';

export default async (request) =>
  handle(request, async (body) => {
    const cfg = config();
    const p = catalog[typeof body.id === 'string' ? body.id : ''];
    if (!p || !p.active || !p.interval) throw new CheckoutError(400, 'That subscription is not available.');
    // A plan exists in one PayPal environment only: sandbox and live ids differ.
    const plan = cfg.mode === 'live' ? p.paypalPlanId : p.paypalSandboxPlanId;
    if (!plan) throw new CheckoutError(503, 'Sign-up is not set up yet. Please email support@lavishleaf.org.');
    const sub = await call(cfg, '/v1/billing/subscriptions', subscriptionBody({ ...p, paypalPlanId: plan }, returnUrls(request)));
    return { approveUrl: approveLink(sub) };
  });
