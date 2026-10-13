// A new store account (owner, 2026-10-13): counted for the dashboard's
// "Accounts created" tile (Blobs "signups"), kept as a newsletter contact,
// and sent our welcome email in the receipt's look. Once per account,
// whichever of account.mjs (first sign-in) and identity-signup.mjs (Netlify's
// sign-up event) gets there first. Never throws.
import { mailReady } from './mail.mjs';
import { saveContact } from './newsletter.mjs';
import { sendNotice } from './notice-mail.mjs';

let testStore = null;
export function setSignupsStoreForTests(s) { testStore = s; }

async function signupsStore() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'signups', consistency: 'strong' });
}

export async function welcomeAccount({ id, email, name = '' }) {
  email = String(email || '').toLowerCase();
  id = String(id || '');
  if (!email || !id) return false;
  try {
    const store = await signupsStore();
    const key = 'u-' + id.replace(/[^a-z0-9-]/gi, '');
    if (await store.get(key)) return false;
    await store.setJSON(key, { at: new Date().toISOString() });
    const full = String(name || '').trim();
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
    return true;
  } catch (e) {
    console.error('[account welcome]', e.message);
    return false;
  }
}
