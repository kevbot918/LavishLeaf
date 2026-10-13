// POST /.netlify/functions/account   (Authorization: Bearer <Identity token>)
//   { action: "get" }                         -> the customer's record
//   { action: "put", lists, cart, shelfOrder } -> saved; orders are untouched
//   { action: "export" }                      -> everything we hold, to download
//   { action: "delete" }                      -> the record AND the sign-in, gone
//
// A modern (Request/Response) function since 2026-10-13: the old
// Lambda-style one made every deploy fail once the site's environment
// variables passed AWS Lambda's 4 KB limit. Who is signed in comes from
// Netlify Identity (lib/identity.mjs); deleting the sign-in uses the admin
// token Netlify gives modern functions (globalThis.netlifyIdentityContext).
// The records live in Netlify Blobs (netlify/lib/accounts.mjs, docs/ACCOUNTS.md).
//
// The first time an account is seen it is counted for the dashboard's
// "Accounts created" tile (Blobs "signups"), kept as a newsletter contact,
// and sent our welcome email (owner, 2026-10-13); identity-signup.mjs does
// the same when Netlify calls it, and whichever runs first does it once.
import { accountsStore, clean, read, write } from '../lib/accounts.mjs';
import { json } from '../lib/admin.mjs';
import { userFromRequest } from '../lib/identity.mjs';
import { welcomeAccount } from '../lib/account-welcome.mjs';

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  const user = await userFromRequest(request);
  if (!user) return json(401, { error: 'Please sign in again.' });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'That request was not understood.' });
  }
  try {
    const store = await accountsStore();
    const id = user.id;
    if (body.action === 'get') {
      await welcomeAccount({ id, email: user.email });
      return json(200, await read(store, id));
    }
    if (body.action === 'put') {
      const rec = await read(store, id);
      // The address is kept with the cart so a forgotten cart can get one
      // reminder (cart-reminders.mjs); the customer can turn that off.
      const next = clean(body);
      const cartChanged = JSON.stringify(next.cart) !== JSON.stringify(rec.cart) ? new Date().toISOString() : rec.cartChanged || null;
      return json(200, await write(store, id, {
        ...rec, ...next, cartChanged,
        email: user.email ? user.email.toLowerCase() : rec.email || '',
      }));
    }
    if (body.action === 'export') {
      return json(200, { email: user.email || '', account: await read(store, id), exported: new Date().toISOString() });
    }
    if (body.action === 'delete') {
      await store.delete(id);
      const identity = globalThis.netlifyIdentityContext;
      if (identity && identity.url && identity.token) {
        const res = await fetch(`${identity.url}/admin/users/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${identity.token}` },
        });
        if (!res.ok && res.status !== 404) {
          console.error('[account] identity delete', res.status);
          return json(502, { error: 'Your saved lists are deleted, but the sign-in could not be removed. Please email support@lavishleaf.org.' });
        }
      } else {
        console.error('[account] no Identity admin token');
        return json(502, { error: 'Your saved lists are deleted, but the sign-in could not be removed. Please email support@lavishleaf.org.' });
      }
      return json(200, { deleted: true });
    }
    return json(400, { error: 'That request was not understood.' });
  } catch (e) {
    console.error('[account] unexpected', e);
    return json(500, { error: 'Your account could not be reached just now. Please try again.' });
  }
};
