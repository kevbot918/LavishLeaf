// What happens to a pick-up sign-up, in one place (2026-10-12): PayPal says
// it is active (the buyer's return or the webhook), it is canceled (by the
// customer in PayPal, or by the owner from the dashboard), a payment is
// refunded, or the owner tells the customer their pick-up day. Each email
// goes once, in the receipt's look (notice-mail.mjs).
import { esc, mailConfig, sendEmail, textOf, validEmail } from './mail.mjs';
import { sendNotice } from './notice-mail.mjs';
import { saveContact } from './newsletter.mjs';

const money = (c) => '$' + (c / 100).toFixed(2);
const phone = (p) => String(p).replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');

/** PayPal's subscription status in our words. */
export function statusFromPayPal(s) {
  return ({ ACTIVE: 'active', APPROVED: 'active', APPROVAL_PENDING: 'pending', SUSPENDED: 'paused', CANCELLED: 'canceled', EXPIRED: 'canceled' })[String(s || '').toUpperCase()] || 'pending';
}

/** The owner's email: every detail of one sign-up. */
export function ownerRows(rec) {
  return [
    ['Service', rec.productName + ', ' + money(rec.price) + (rec.once ? ' ONE TIME (paid' + (rec.totalCents ? ' ' + money(rec.totalCents) + ' with tax' : '') + ')' : ' a month')],
    ['Name', rec.name], ['Phone', phone(rec.phone)], ['Email', rec.email],
    ['Address', `${rec.street}, ${rec.city}, OK ${rec.zip}`],
    ['Checked', rec.area && rec.area.how === 'zip' ? 'by ZIP (the Census could not place the street)' : `${(rec.area && rec.area.matched) || ''}, ${rec.area && rec.area.miles} miles from the farm`],
    ['Pick-up day', rec.day],
    ['Bucket', rec.bucket ? 'Yes: our $10 bucket (setup fee charged)' : 'No: they use their own'],
    ['Instructions', rec.notes || '(none)'],
    rec.once ? ['PayPal order', rec.orderId] : ['PayPal subscription', rec.subscriptionId],
  ];
}

/** Active: the owner's alert and the customer's welcome, once each. Mutates rec. */
export async function activated(rec) {
  if (rec.status !== 'canceled') rec.status = 'active';
  if (rec.alerted) return rec;
  const [first, ...rest] = String(rec.name || '').trim().split(/s+/);
  await saveContact({ email: rec.email, first, last: rest.join(' '), phone: rec.phone, source: 'pickup' });
  try {
    const owner = mailConfig().owner;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222"><p><strong>New pick-up sign-up</strong></p><table>${ownerRows(rec).map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p>Every sign-up is in the dashboard under Pick-ups and routes.</p></div>`;
    if (validEmail(owner)) await sendEmail({ to: owner, subject: `New ${rec.productName}${rec.once ? ' (one time)' : ''} sign-up: ${rec.name}, ${rec.city}`, html, text: textOf(html), kind: 'owner' });
    // No pick-up day yet (owner, 2026-10-12): routes are planned first, and
    // the day goes out in its own email (pickupDay below).
    await sendNotice({
      to: rec.email, name: rec.name, subject: rec.once ? `Your one-time ${rec.productName}` : `Welcome to ${rec.productName}`, heading: rec.once ? 'Your pick-up is booked' : "You're signed up",
      paragraphs: [
        rec.once
          ? `Thank you for booking a one-time ${rec.productName}! Your scraps and recyclables will be put to good use instead of the landfill.`
          : `Thank you for signing up for ${rec.productName}! Your scraps and recyclables will be put to good use instead of the landfill.`,
        (rec.once ? 'We plan our routes by area to keep fuel costs and prices down, so we will email you the day we will come as soon as your route is set.' : 'We plan our routes by area to keep fuel costs and prices down, so we will email you your pick-up day as soon as your route is set.') + (rec.bucket ? ' Your 5 gallon bucket comes with ' + (rec.once ? 'us that day.' : 'the first pick-up.') : '') + (rec.once ? ' Want it every week or two? You can sign up monthly any time at lavishleaf.org/store.' : ''),
      ],
      rows: [['Service', rec.productName + (rec.once ? ' (one time)' : '')], ...(rec.once && rec.totalCents ? [['Paid', money(rec.totalCents) + ' including sales tax']] : []), ['Address', `${rec.street}, ${rec.city}`], ['Day you asked for', rec.day], ['Bucket', rec.bucket ? 'Our 5 gallon bucket' : 'Your own']],
    });
    rec.alerted = new Date().toISOString();
  } catch (e) { console.error('[pickups] welcome', e.message); }
  return rec;
}

/** Canceled (by the customer in PayPal, or by us): the customer is told once. */
export async function canceled(rec, byUs) {
  rec.status = 'canceled';
  rec.canceledAt = rec.canceledAt || new Date().toISOString();
  if (rec.canceledMailed || !rec.alerted) return rec; // never welcomed: nothing to undo
  try {
    await sendNotice({
      to: rec.email, name: rec.name, subject: `Your ${rec.productName} is canceled`, heading: 'Subscription canceled',
      paragraphs: [
        `Your ${rec.productName} subscription has been canceled${byUs ? ' by Lavish Leaf' : ''}. You will not be charged again.`,
        'Thank you for helping keep scraps and recyclables out of the landfill. You are welcome back any time at lavishleaf.org.',
      ],
    });
    rec.canceledMailed = new Date().toISOString();
  } catch (e) { console.error('[pickups] cancel email', e.message); }
  return rec;
}

/** A payment refunded: recorded, and the customer is told. */
export async function refunded(rec, cents, eventId) {
  rec.refunds = rec.refunds || [];
  if (eventId && rec.refunds.some((r) => r.event === eventId)) return rec;
  rec.refunds.push({ cents, at: new Date().toISOString(), event: eventId || null });
  try {
    await sendNotice({
      to: rec.email, name: rec.name, subject: 'Your Lavish Leaf refund', heading: 'Refund issued',
      paragraphs: [
        `We have refunded ${money(cents)} for your ${rec.productName} to your original payment method. PayPal or your bank may take a few days to show it.`,
        rec.once ? 'It was a one-time pick-up, so there is nothing further to cancel.' : rec.status === 'canceled' ? 'Your subscription is canceled, so you will not be charged again.' : 'Your subscription itself is still active; reply to this email if you would like it canceled.',
      ],
    });
  } catch (e) { console.error('[pickups] refund email', e.message); }
  return rec;
}

/** The owner tells the customer their pick-up day (dashboard button). */
export async function pickupDay(rec, note) {
  const day = rec.assignedDay || rec.day;
  await sendNotice({
    to: rec.email, name: rec.name, subject: `Your ${rec.productName} day: ${day}`, heading: 'Your pick-up day',
    paragraphs: [
      rec.once ? `Your route is set! We will come on ${day} for your one-time pick-up at ${rec.street}, ${rec.city}.` : `Your route is set! We will pick up every ${day} at ${rec.street}, ${rec.city}.`,
      ...(note ? [String(note).slice(0, 600)] : []),
      'Please have your ' + (/recycl/i.test(rec.productName) ? 'bin' : 'bucket') + ' out where we can reach it that day.',
    ],
    rows: [['Service', rec.productName], ['Pick-up day', day], ['Address', `${rec.street}, ${rec.city}`]],
  });
  rec.dayMailed = new Date().toISOString();
  rec.dayMailedFor = day;
  return rec;
}
