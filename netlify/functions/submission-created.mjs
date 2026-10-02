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
// failure is logged and never lost. Lambda-style so Netlify Blobs connects.
import { loadTemplate, fill, mailConfig, mailReady, sendEmail, textOf, validEmail } from '../lib/mail.mjs';
import { markWelcomed, newsletterStore, subscribe } from '../lib/newsletter.mjs';
import { sendWelcome } from '../lib/welcome.mjs';

const ok = { statusCode: 200, body: 'ok' };

export const handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}').payload || {};
  } catch {
    return ok;
  }
  const form = payload.form_name || (payload.data && payload.data['form-name']) || '';
  const d = payload.data || {};
  const email = String(d.email || payload.email || '').trim();
  const first = String(d['first-name'] || d.first || '').trim();
  if (!validEmail(email)) return ok;
  if (!(await realSubmission(payload))) return ok;

  try {
    // Lambda-style: Blobs (the list, and the mail counter) needs the event.
    (await import('@netlify/blobs')).connectLambda(event);
    if (form === 'newsletter') {
      // The form's "Sign up for news and updates" box is ticked by default;
      // unticked means the person only wanted to leave their details.
      if (String(d.subscribe || '').toLowerCase() !== 'yes') return ok;
      const store = await newsletterStore(event);
      const { record, isNew } = await subscribe(store, {
        email, first, last: d['last-name'] || '', source: pageOf(payload),
      });
      if (isNew && !record.welcomed && mailReady() && mailConfig().postal) {
        await sendWelcome(record);
        await markWelcomed(store, email);
      }
    } else if (form === 'contact' && mailReady()) {
      const tpl = await loadTemplate('contact-reply');
      const html = fill(tpl, { first_name: first || 'there' });
      await sendEmail({ to: email, toName: first, subject: 'We have your message', html, text: textOf(html), kind: 'contact-reply' });
    }
  } catch (e) {
    console.error('[submission-created]', form, e.message);
  }
  return ok;
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
 * Netlify calls this function for each verified submission. When the site
 * has a NETLIFY_API_TOKEN, also ask Netlify that the submission really exists,
 * so a request made straight to this function's address cannot fill the list
 * or send welcome emails to strangers.
 */
async function realSubmission(payload) {
  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) return true;
  const id = String(payload.id || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return false;
  try {
    const res = await fetch(`https://api.netlify.com/api/v1/submissions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return true; // Netlify's API down: the form itself already passed Netlify's spam filter
  }
}
