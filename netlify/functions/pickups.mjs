// /.netlify/functions/pickups   compost and recycling sign-ups (2026-10-11)
//   POST { action: "confirm", subscriptionId }  the buyer's return from PayPal:
//        marks the sign-up active once PayPal says so and emails the owner
//        every detail (and the customer a short note), once.
//   POST { action: "list" }                     owner only: every sign-up.
//   POST { action: "update", id, assignedDay?, status?, ownerNote? }
//        owner only: the day we actually come (routes), active/paused/cancelled.
import { adminFromRequest, json } from '../lib/admin.mjs';
import { CheckoutError, call, config } from '../lib/paypal.mjs';
import { DAYS, pickupsStore } from '../lib/pickups.mjs';
import { esc, mailConfig, sendEmail, textOf, validEmail } from '../lib/mail.mjs';

const money = (c) => '$' + (c / 100).toFixed(2);
const phone = (p) => String(p).replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');

/** The owner's email: every detail of one sign-up. */
export function ownerRows(rec) {
  return [
    ['Service', rec.productName + ', ' + money(rec.price) + ' a month'],
    ['Name', rec.name], ['Phone', phone(rec.phone)], ['Email', rec.email],
    ['Address', `${rec.street}, ${rec.city}, OK ${rec.zip}`],
    ['Checked', rec.area && rec.area.how === 'zip' ? 'by ZIP (the Census could not place the street)' : `${(rec.area && rec.area.matched) || ''}, ${rec.area && rec.area.miles} miles from the farm`],
    ['Pick-up day', rec.day],
    ['Bucket', rec.bucket ? 'Yes: our $10 bucket (setup fee charged)' : 'No: they use their own'],
    ['Instructions', rec.notes || '(none)'],
    ['PayPal subscription', rec.subscriptionId],
  ];
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  let body = {};
  try { body = await request.json(); } catch { /* below */ }
  const store = await pickupsStore();

  if (body.action === 'list') {
    if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
    const { blobs } = await store.list({ prefix: 's-' });
    const out = [];
    for (const b of blobs) { const r = await store.get(b.key, { type: 'json' }); if (r) out.push(r); }
    out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    return json(200, { signups: out });
  }

  if (body.action === 'update') {
    if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
    const key = 's-' + String(body.id || '').replace(/[^a-z0-9-]/gi, '');
    const rec = await store.get(key, { type: 'json' });
    if (!rec) return json(404, { error: 'No such sign-up.' });
    if ('assignedDay' in body) rec.assignedDay = DAYS.includes(body.assignedDay) ? body.assignedDay : null;
    if ('status' in body && ['pending', 'active', 'approved', 'paused', 'cancelled'].includes(body.status)) rec.status = body.status;
    if ('ownerNote' in body) rec.ownerNote = String(body.ownerNote || '').replace(/[<>]/g, '').slice(0, 300);
    rec.updated = new Date().toISOString();
    await store.setJSON(key, rec);
    return json(200, { signup: rec });
  }

  if (body.action === 'confirm') {
    const sid = String(body.subscriptionId || '');
    if (!/^I-[A-Z0-9]{6,30}$/.test(sid)) return json(400, { error: 'Unknown sign-up.' });
    try {
      const sub = await call(config(), `/v1/billing/subscriptions/${sid}`, null, { method: 'GET' });
      const key = 's-' + String(sub.custom_id || '');
      const rec = await store.get(key, { type: 'json' });
      if (!rec || rec.subscriptionId !== sid) return json(200, { status: String(sub.status || '').toLowerCase() });
      rec.status = String(sub.status || 'unknown').toLowerCase();
      if (['active', 'approved'].includes(rec.status) && !rec.alerted) {
        try {
          const owner = mailConfig().owner;
          const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222"><p><strong>New pick-up sign-up</strong></p><table>${ownerRows(rec).map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p>Every sign-up is also listed in the dashboard.</p></div>`;
          if (validEmail(owner)) await sendEmail({ to: owner, subject: `New ${rec.productName} sign-up: ${rec.name}, ${rec.city} (${rec.day})`, html, text: textOf(html), kind: 'owner' });
          const mine = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222"><p>Hi ${esc(rec.name.split(' ')[0])},</p><p>Thank you for signing up for ${esc(rec.productName)}. Your pick-up day is <strong>${esc(rec.day)}</strong> at ${esc(rec.street)}, ${esc(rec.city)}.${rec.bucket ? ' We will bring your 5 gallon bucket on the first pick-up.' : ''} To keep fuel costs and prices down we group pick-ups by area, so we may suggest a different day; we will call or text ${esc(phone(rec.phone))} to confirm your day before the first pick-up.</p><p>Questions: reply to this email or write to support@lavishleaf.org.</p><p>Lavish Leaf</p></div>`;
          await sendEmail({ to: rec.email, toName: rec.name, subject: `Your ${rec.productName} sign-up`, html: mine, text: textOf(mine), kind: 'order' });
          rec.alerted = new Date().toISOString();
        } catch (e) { console.error('[pickups] email', e.message); }
      }
      await store.setJSON(key, rec);
      return json(200, { status: rec.status, day: rec.day });
    } catch (e) {
      if (e instanceof CheckoutError) return json(e.status || 502, { error: e.message });
      console.error('[pickups] confirm', e.message);
      return json(502, { error: 'Could not check the sign-up just now. PayPal will email your confirmation.' });
    }
  }
  return json(400, { error: 'Unknown action.' });
};
