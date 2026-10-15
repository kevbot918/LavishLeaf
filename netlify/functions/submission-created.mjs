// Runs on every verified Netlify Forms submission (Netlify calls a function
// by this exact name; spam that Netlify filters never reaches it).
//
//   newsletter  -> the person joins our list (netlify/lib/newsletter.mjs) and,
//                  the first time, gets the welcome email (emails/welcome.html)
//   contact     -> an automatic "we have your message" reply
//                  (emails/contact-reply.html); the message itself still
//                  reaches the inbox through Netlify's form notifications
//
// Whatever happens here, the submission is already saved in Netlify, so a
// failure is logged and never lost. Modern (Request/Response) format since
// 2026-10-13: Lambda-style functions broke every deploy once the site's
// environment variables passed AWS Lambda's 4 KB limit.
import { loadTemplate, fill, mailConfig, mailReady, sendEmail, textOf, validEmail } from '../lib/mail.mjs';
import { optOutHtml } from '../lib/notice-mail.mjs';
import { addContact, markWelcomed, newsletterStore, subscribe } from '../lib/newsletter.mjs';
import { sendWelcome } from '../lib/welcome.mjs';

const ok = () => new Response('ok');

export default async (request) => {
  let payload;
  try {
    payload = (await request.json()).payload || {};
  } catch {
    return ok();
  }
  // With a NETLIFY_API_TOKEN, what is used is Netlify's own copy of the
  // submission, so a request sent straight to this function cannot add
  // strangers or email them.
  const real = await realSubmission(payload);
  if (!real) return ok();
  const form = real.form_name || '';
  const d = real.data || {};
  const email = String(d.email || '').trim();
  const first = String(d['first-name'] || d.first || '').trim();
  if (!validEmail(email)) return ok();

  try {
    const store = await newsletterStore();
    const details = { email, first, last: d['last-name'] || '', phone: d.phone || '', source: form || 'form', sms: String(d.sms || '').toLowerCase() === 'yes' };
    // Volunteer event alerts (Social page, 2026-10-15): a newsletter sign-up
    // tagged "volunteer", so the contacts list shows who wants event news.
    if (form === 'volunteer') { d.subscribe = 'yes'; details.source = 'volunteer'; }
    if (form === 'newsletter' || form === 'volunteer') {
      // The form's "Sign up for news and updates" box is ticked by default;
      // unticked means the person only wanted to leave their details, which
      // are kept as a contact (never re-adding somebody who unsubscribed).
      if (String(d.subscribe || '').toLowerCase() !== 'yes') { await addContact(store, { ...details, declined: true }); return ok(); }
      const { record, isNew } = await subscribe(store, {
        email, first, last: d['last-name'] || '', source: form === 'volunteer' ? 'volunteer' : pageOf(real),
      });
      await addContact(store, details); // the phone number, kept with them
      if (isNew && !record.welcomed && mailReady() && mailConfig().postal) {
        await sendWelcome(record);
        await markWelcomed(store, email);
      }
    } else if (form === 'contact') {
      // Everyone who writes in is a contact too (owner, 2026-10-13).
      await addContact(store, details);
      if (!mailReady()) return ok();
      // One automatic reply per address per day, however many messages.
      const { getStore } = await import('@netlify/blobs');
      const seen = getStore('mail');
      const key = 'reply-' + new Date().toISOString().slice(0, 10) + '-' + Buffer.from(email.toLowerCase()).toString('base64url').slice(0, 80);
      if (await seen.get(key)) return ok();
      await seen.set(key, '1');
      const tpl = await loadTemplate('contact-reply');
      const html = fill(tpl, { first_name: first || 'there', optout_html: optOutHtml(email) });
      await sendEmail({ to: email, toName: first, subject: 'We have your message', html, text: textOf(html), kind: 'contact-reply' });
    }
  } catch (e) {
    console.error('[submission-created]', form, e.message);
  }
  return ok();
};

/** Which page the form was sent from, when Netlify says. */
function pageOf(payload) {
  try {
    return new URL(String((payload.data && payload.data.referrer) || '')).pathname;
  } catch {
    return 'form';
  }
}

/**
 * The submission to act on. Netlify calls this function for each verified
 * submission. With NETLIFY_API_TOKEN set, the submission is read back from
 * Netlify by its id and that copy is used (form name and fields), and
 * anything Netlify does not know is refused. Without the token, the payload
 * Netlify sent is used as it is (docs/EMAIL.md recommends the token).
 */
async function realSubmission(payload) {
  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) return { form_name: payload.form_name || (payload.data && payload.data['form-name']) || '', data: payload.data || {} };
  const id = String(payload.id || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  try {
    const res = await fetch(`https://api.netlify.com/api/v1/submissions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const sub = await res.json();
    return { form_name: sub.form_name || (sub.data && sub.data['form-name']) || '', data: sub.data || {} };
  } catch {
    return null; // not confirmed, not acted on; the submission itself is still in Netlify
  }
}
