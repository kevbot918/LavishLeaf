// POST /.netlify/functions/account   (Authorization: Bearer <Identity token>)
//   { action: "get" }                         -> the customer's record
//   { action: "put", lists, cart, shelfOrder } -> saved; orders are untouched
//   { action: "export" }                      -> everything we hold, to download
//   { action: "delete" }                      -> the record AND the sign-in, gone
//
// A Lambda-style function on purpose: Netlify fills context.clientContext
// with the verified Identity user, and with an admin token for this site's
// Identity, which is what deleting the sign-in itself needs. The records live
// in Netlify Blobs (netlify/lib/accounts.mjs, docs/ACCOUNTS.md).
import { accountsStore, clean, read, write } from '../lib/accounts.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export const handler = async (event, context) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only.' });
  const user = context && context.clientContext && context.clientContext.user;
  if (!user || typeof user.sub !== 'string') return json(401, { error: 'Please sign in again.' });
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'That request was not understood.' });
  }
  try {
    const store = await accountsStore(event);
    const id = user.sub;
    if (body.action === 'get') {
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
        email: typeof user.email === 'string' ? user.email.toLowerCase() : rec.email || '',
      }));
    }
    if (body.action === 'export') {
      return json(200, { email: user.email || '', account: await read(store, id), exported: new Date().toISOString() });
    }
    if (body.action === 'delete') {
      await store.delete(id);
      const identity = context.clientContext.identity;
      if (identity && identity.url && identity.token) {
        const res = await fetch(`${identity.url}/admin/users/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${identity.token}` },
        });
        if (!res.ok && res.status !== 404) {
          console.error('[account] identity delete', res.status);
          return json(502, { error: 'Your saved lists are deleted, but the sign-in could not be removed. Please email support@lavishleaf.org.' });
        }
      }
      return json(200, { deleted: true });
    }
    return json(400, { error: 'That request was not understood.' });
  } catch (e) {
    console.error('[account] unexpected', e);
    return json(500, { error: 'Your account could not be reached just now. Please try again.' });
  }
};
