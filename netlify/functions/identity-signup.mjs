// Netlify calls a function by this exact name when somebody creates an
// account (after they confirm their email). Owner, 2026-10-13: every new
// account gets our own welcome email in the receipt's look, is counted for
// the dashboard's "Accounts created" tile (Blobs "signups"), and is kept as
// a contact for the newsletter (with the one-click unsubscribe).
//
// Always answers 204: anything else would block the sign-up, and this is a
// courtesy on top of it. Lambda-style so Netlify Blobs connects.
import { saveContact } from '../lib/newsletter.mjs';
import { sendNotice } from '../lib/notice-mail.mjs';
import { mailReady } from '../lib/mail.mjs';

const done = { statusCode: 204, body: '' };

export const handler = async (event) => {
  let user = {};
  try { user = JSON.parse(event.body || '{}').user || {}; } catch { return done; }
  const email = String(user.email || '').toLowerCase();
  const id = String(user.id || '');
  if (!email || !id) return done;
  try {
    const blobs = await import('@netlify/blobs');
    blobs.connectLambda(event);
    const store = blobs.getStore({ name: 'signups', consistency: 'strong' });
    const key = 'u-' + id.replace(/[^a-z0-9-]/gi, '');
    if (await store.get(key)) return done; // once per account
    await store.setJSON(key, { at: new Date().toISOString() });
    const full = String((user.user_metadata && user.user_metadata.full_name) || '').trim();
    const [first, ...rest] = full.split(/\s+/);
    await saveContact({ email, first: first || '', last: rest.join(' '), source: 'account' });
    if (mailReady()) {
      await sendNotice({
        to: email, name: full, subject: 'Welcome to your Lavish Leaf account', heading: 'Your account is ready',
        paragraphs: [
          'Thank you for creating a Lavish Leaf account! It keeps your cart and your saved lists on every device, and your orders in one place.',
          'Sign in any time at lavishleaf.org with this email address.',
        ],
        links: [['Visit the store', 'https://lavishleaf.org/store.html']],
        kind: 'order',
      });
    }
  } catch (e) {
    console.error('[identity-signup]', e.message);
  }
  return done;
};
