// Scheduled, once a day: ONE gentle reminder about a cart left behind
// (owner, 2026-10-02: "just not too often").
//
// Only signed-in customers can get one (a guest's cart lives in their
// browser, and we do not have their address). The rules, all of them:
//   * the store is really selling (PayPal keys set), and email is set up;
//   * the cart has something in it and was last changed 1 to 7 days ago;
//   * no order since that change;
//   * at most one reminder per cart (a changed cart can earn one more), and
//     never two within 14 days;
//   * the customer has not turned cart reminders off (the link in the email).
import { accountsStore, read } from '../lib/accounts.mjs';
import { catalog } from '../lib/catalog.mjs';
import { esc, fill, loadTemplate, mailConfig, mailReady, sendEmail, textOf, validEmail } from '../lib/mail.mjs';
import { keyFor, newsletterStore, unsubscribeUrl } from '../lib/newsletter.mjs';

const DAY = 864e5;

export function due(rec, now = Date.now()) {
  if (!rec || !Array.isArray(rec.cart) || !rec.cart.length || !validEmail(rec.email || '')) return false;
  const changed = Date.parse(rec.cartChanged || '');
  if (!changed || now - changed < DAY || now - changed > 7 * DAY) return false;
  if (rec.remindedFor === rec.cartChanged) return false;
  if (rec.lastReminded && now - Date.parse(rec.lastReminded) < 14 * DAY) return false;
  if ((rec.orders || []).some((o) => Date.parse(o.date) >= changed)) return false;
  return rec.cart.some((l) => catalog[l.id] && catalog[l.id].active);
}

export default async () => {
  if (!process.env.PAYPAL_CLIENT_ID || !mailReady() || !mailConfig().postal) {
    return new Response('not selling online yet, or email not set up');
  }
  let sent = 0;
  try {
    const accounts = await accountsStore();
    const list = await newsletterStore();
    const tpl = await loadTemplate('cart-reminder');
    const { blobs } = await accounts.list();
    for (const b of blobs) {
      const rec = await read(accounts, b.key);
      if (!due(rec)) continue;
      const optOut = await list.get('c-' + keyFor(rec.email).slice(2), { type: 'json' }).catch(() => null);
      if (optOut && optOut.optOut) continue;
      const rows = rec.cart.filter((l) => catalog[l.id]).map((l) => {
        const p = catalog[l.id];
        return `<tr><td style="padding:6px 0;color:#F2F4F2;font-size:15px;">${esc(p.name)}${l.qty > 1 ? ' &times; ' + l.qty : ''}</td><td align="right" style="padding:6px 0;color:#C8CFC8;font-size:15px;">$${((p.price * l.qty) / 100).toFixed(2)}</td></tr>`;
      }).join('');
      const unsub = unsubscribeUrl(rec.email, 'cart');
      const html = fill(tpl, { items_html: rows, unsubscribe_url: unsub, postal_address: mailConfig().postal });
      try {
        await sendEmail({ to: rec.email, subject: 'You left something in your cart', html, text: textOf(html), kind: 'cart', unsubscribeUrl: unsub });
        const now = new Date().toISOString();
        await accounts.setJSON(b.key, { ...rec, remindedFor: rec.cartChanged, lastReminded: now });
        sent++;
      } catch (e) {
        console.error('[cart-reminders]', e.message);
        if (/daily email limit/.test(e.message)) break;
      }
    }
  } catch (e) {
    console.error('[cart-reminders] failed', e);
  }
  console.log('[cart-reminders] sent', sent);
  return new Response('ok ' + sent);
};

export const config = { schedule: '@daily' };
