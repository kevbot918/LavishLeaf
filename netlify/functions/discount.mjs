// /.netlify/functions/discount   the store's 20% first-order offer (owner,
// 2026-10-13)
//   POST { action: "claim", email, phone, sms? }  -> { code }  and the email
//        One claim per IP address, email and phone, and none for somebody
//        who has already ordered. The person joins the newsletter (the
//        pop-up says so; one-click unsubscribe in every email). "sms" records
//        their separate consent to marketing texts; nothing is texted yet.
//   POST { action: "status" }  -> { claimed }  whether this connection has claimed
//   POST { action: "check", code }  -> { ok, percent }  the cart's Apply button
//        (says nothing about whose code it is)
import { allOrders, ordersStore } from '../lib/orders.mjs';
import { alreadyClaimed, claim, discountsStore, normEmail, normPhone, usable } from '../lib/discounts.mjs';
import { mailReady, validEmail } from '../lib/mail.mjs';
import { saveContact } from '../lib/newsletter.mjs';
import { sendNotice } from '../lib/notice-mail.mjs';
import { DISCOUNT } from '../../discount.mjs';
import { json } from '../lib/admin.mjs';

export default async (request, context) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'That request was not understood.' }); }
  try {
    const store = await discountsStore();

    // The pop-up asks first, so a connection that has claimed is never shown it again.
    if (body.action === 'status') {
      const ip = (context && context.ip) || request.headers.get('x-nf-client-connection-ip') || '';
      return json(200, { claimed: !!(ip && await alreadyClaimed(store, { email: '', phone: '', ip }) === 'ip') });
    }

    if (body.action === 'check') {
      const rec = await usable(store, body.code);
      return rec ? json(200, { ok: true, percent: DISCOUNT.percent, code: rec.code })
        : json(400, { error: 'That code is not valid, or it has already been used.' });
    }

    if (body.action === 'claim') {
      const email = normEmail(body.email);
      const phone = normPhone(body.phone);
      if (!validEmail(email)) return json(400, { error: 'Please enter your email address.' });
      if (phone.length !== 10) return json(400, { error: 'Please enter a 10-digit phone number.' });
      const ip = (context && context.ip) || request.headers.get('x-nf-client-connection-ip') || '';
      const taken = await alreadyClaimed(store, { email, phone, ip });
      if (taken) return json(409, { error: 'This offer has already been claimed' + (taken === 'ip' ? ' from this connection' : taken === 'phone' ? ' with this phone number' : ' with this email') + '. It is one per customer, on a first order.' });
      const ordered = (await allOrders(await ordersStore())).some((o) => o.email === email && !/refunded|reversed|failed/.test(o.status || ''));
      if (ordered) return json(409, { error: 'This offer is for a first order, and this email has ordered before. Thank you for coming back!' });
      const rec = await claim(store, { email, phone, ip, sms: body.sms === true });
      await saveContact({ email, phone, source: 'discount' });
      if (mailReady()) {
        try {
          await sendNotice({
            to: email, subject: 'Your 20% off code for Lavish Leaf', heading: 'Your 20% off',
            paragraphs: [
              `Here is your code for 20% off the products in your first order: ${rec.code}`,
              `Important: pay with this same email address (${email}) in PayPal. The code only works when the PayPal email matches the one it was sent to; with any other email the checkout will stop before anything is charged.`,
              'Enter the code in the cart and press Apply. It takes 20% off products; shipping, sales tax, league registrations and pick-up subscriptions are not discounted. One code per customer, for one order.',
            ],
            rows: [['Your code', rec.code], ['Use it with', email]],
            links: [['Shop the store', 'https://lavishleaf.org/store.html']],
            kind: 'order',
          });
        } catch (e) { console.error('[discount] email', e.message); }
      }
      return json(200, { code: rec.code, percent: DISCOUNT.percent });
    }
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    console.error('[discount]', e);
    return json(500, { error: 'Something went wrong on our side. Please try again in a minute.' });
  }
};
