// /.netlify/functions/donate   our own donation checkout (owner, 2026-10-13:
// count "Donations Raised" on the dashboard and send our own thank-you email).
// It replaces PayPal's hosted donate button, which told us nothing.
//
//   POST { action: "create", amount, division, name? }  -> { approve }  PayPal page
//   POST { action: "capture", orderId }                  -> { status, amount }
//        captured once (the order id is the idempotency key), filed in Blobs
//        "donations", the donor thanked in the receipt's look, kept as a
//        contact, and the owner told.
//   POST { action: "list" }  owner only                  -> { donations, total }
//
// Lavish Leaf is a for-profit company: gifts are not tax-deductible, and the
// page and the email say so.
import { adminFromRequest } from '../lib/admin.mjs';
import { CheckoutError, approveLink, call, config, reply } from '../lib/paypal.mjs';
import { esc, mailConfig, mailReady, sendEmail, textOf, validEmail } from '../lib/mail.mjs';
import { saveContact } from '../lib/newsletter.mjs';
import { sendNotice } from '../lib/notice-mail.mjs';

export const DIVISIONS = { general: 'Lavish Leaf', symphonymph: 'Symphonymph', farms: 'Lavish Leaf Farms', sports: 'Rec Sports', gaming: 'Gaming' };
export const MIN = 1, MAX = 5000;

/** Dollars from the page, checked: whole cents between $1 and $5,000. */
export function cleanAmount(v) {
  const n = Math.round(Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')) * 100) / 100;
  if (!Number.isFinite(n) || n < MIN || n > MAX) throw new CheckoutError(400, `Please choose an amount from $${MIN} to $${MAX.toLocaleString('en-US')}.`);
  return n;
}

export function donationBody(amount, division, { returnUrl, cancelUrl }) {
  const who = DIVISIONS[division] || DIVISIONS.general;
  const value = amount.toFixed(2);
  return {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: 'donation',
      custom_id: 'donation:' + (DIVISIONS[division] ? division : 'general'),
      description: `Donation to ${who} (not tax-deductible)`,
      amount: { currency_code: 'USD', value, breakdown: { item_total: { currency_code: 'USD', value } } },
      items: [{ name: `Donation to ${who}`, quantity: '1', category: 'DONATION', unit_amount: { currency_code: 'USD', value } }],
    }],
    payment_source: { paypal: { experience_context: {
      brand_name: 'Lavish Leaf', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
      return_url: returnUrl, cancel_url: cancelUrl,
    } } },
  };
}

async function store() {
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'donations', consistency: 'strong' });
}

export async function allDonations(s) {
  const out = [];
  const { blobs } = await s.list({ prefix: 'd-' });
  for (const b of blobs) { const r = await s.get(b.key, { type: 'json' }).catch(() => null); if (r) out.push(r); }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export default async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });
  let body = {};
  try { body = await request.json(); } catch { return reply(400, { error: 'That request was not understood.' }); }
  try {
    if (body.action === 'list') {
      if (!(await adminFromRequest(request))) return reply(403, { error: 'Owner only.' });
      const donations = await allDonations(await store());
      const total = Math.round(donations.filter((d) => !d.refunded).reduce((s, d) => s + d.amount, 0) * 100) / 100;
      return reply(200, { donations: donations.slice(0, 200), total, count: donations.length });
    }

    if (body.action === 'create') {
      const amount = cleanAmount(body.amount);
      const division = DIVISIONS[body.division] ? body.division : 'general';
      const origin = new URL(request.url).origin;
      const urls = { returnUrl: `${origin}/donate.html?paypal=return&for=${division}`, cancelUrl: `${origin}/donate.html?paypal=cancel&for=${division}` };
      const order = await call(config(), '/v2/checkout/orders', donationBody(amount, division, urls));
      return reply(200, { approve: approveLink(order) });
    }

    if (body.action === 'capture') {
      const id = typeof body.orderId === 'string' ? body.orderId : '';
      if (!/^[A-Z0-9]{8,40}$/.test(id)) throw new CheckoutError(400, 'That donation could not be found.');
      const cfg = config();
      const order = await call(cfg, `/v2/checkout/orders/${id}`, null, { method: 'GET' });
      const unit = (order.purchase_units && order.purchase_units[0]) || {};
      if (!String(unit.custom_id || '').startsWith('donation:')) throw new CheckoutError(400, 'That donation could not be found.');
      const done = order.status === 'COMPLETED' ? order : await call(cfg, `/v2/checkout/orders/${id}/capture`, {}, { requestId: `donate-${id}` });
      const cap = done.purchase_units && done.purchase_units[0] && done.purchase_units[0].payments && done.purchase_units[0].payments.captures && done.purchase_units[0].payments.captures[0];
      const amount = Number((cap && cap.amount && cap.amount.value) || (unit.amount && unit.amount.value)) || 0;
      if (done.status === 'COMPLETED') await afterDonation(done, unit, amount);
      return reply(200, { status: done.status, amount });
    }
    return reply(400, { error: 'Unknown action.' });
  } catch (e) {
    if (e instanceof CheckoutError) return reply(e.status, { error: e.message });
    console.error('[donate]', e);
    return reply(500, { error: 'Something went wrong on our side. Nothing was charged.' });
  }
};

/** File it, thank the donor, keep them as a contact, tell the owner. Once each. */
async function afterDonation(done, unit, amount) {
  try {
    const s = await store();
    const key = 'd-' + done.id;
    const old = await s.get(key, { type: 'json' }).catch(() => null);
    const payer = done.payer || {};
    const division = String(unit.custom_id || '').split(':')[1] || 'general';
    const rec = old || {
      id: done.id, date: new Date().toISOString(), amount, division, divisionName: DIVISIONS[division] || DIVISIONS.general,
      email: String(payer.email_address || '').toLowerCase(),
      name: [payer.name && payer.name.given_name, payer.name && payer.name.surname].filter(Boolean).join(' '),
      capture: (done.purchase_units[0].payments.captures[0] || {}).id || null,
    };
    if (!old) {
      await s.setJSON(key, rec);
      await saveContact({ email: rec.email, first: (payer.name && payer.name.given_name) || '', last: (payer.name && payer.name.surname) || '', source: 'donation' });
    }
    if (!rec.thanked && mailReady() && validEmail(rec.email)) {
      try {
        await sendNotice({
          to: rec.email, name: rec.name, subject: 'Thank you for your donation', heading: 'Thank you',
          paragraphs: [
            `Thank you for your gift of $${amount.toFixed(2)} to ${rec.divisionName}! It goes straight into the work: composting, recycling, community sports, and free tools like Symphonymph.`,
            'Lavish Leaf Inc is a for-profit company, so this gift is not tax-deductible. PayPal also sends its own receipt.',
          ],
          rows: [['Donation', '$' + amount.toFixed(2)], ['For', rec.divisionName], ['PayPal reference', done.id]],
          kind: 'order',
        });
        rec.thanked = new Date().toISOString();
      } catch (e) { console.error('[donate] thank-you', e.message); }
    }
    const owner = mailConfig().owner;
    if (!rec.alerted && mailReady() && validEmail(owner)) {
      try {
        const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222"><p><strong>New donation: $${amount.toFixed(2)}</strong> to ${esc(rec.divisionName)}</p><p>From ${esc(rec.name || 'a donor')} (${esc(rec.email)}). PayPal order ${esc(done.id)}. The dashboard's Donations raised tile counts it.</p></div>`;
        await sendEmail({ to: owner, subject: `New donation: $${amount.toFixed(2)} (${rec.divisionName})`, html, text: textOf(html), kind: 'owner' });
        rec.alerted = new Date().toISOString();
      } catch (e) { console.error('[donate] owner alert', e.message); }
    }
    await s.setJSON(key, rec);
  } catch (e) {
    console.error('[donate] could not file the donation', e.message);
  }
}
