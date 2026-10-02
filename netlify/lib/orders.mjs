// What happens after a payment goes through (2026-10-02, docs/EMAIL.md):
//
//   * the order is filed in the Blobs store "orders" (every order, guest or
//     signed in), so the owner's dashboard can count sales;
//   * the customer gets a Lavish Leaf order confirmation
//     (emails/order-confirmation.html), on top of PayPal's own receipt;
//   * the owner gets a short "new order" alert at OWNER_EMAIL.
// Each is done once per order: a reload of the thank-you page captures again
// (safely) and must not send the emails twice.
import { esc, fill, loadTemplate, mailConfig, mailReady, sendEmail, textOf, validEmail } from './mail.mjs';

let testStore = null;
export function setOrdersStoreForTests(s) { testStore = s; }
export async function ordersStore() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore('orders');
}

const money = (v) => '$' + Number(v || 0).toFixed(2);

/** The parts of a captured PayPal order the emails and the dashboard need. */
export function summarise(done, meta = {}) {
  const unit = (done.purchase_units && done.purchase_units[0]) || {};
  const capture = unit.payments && unit.payments.captures && unit.payments.captures[0];
  const items = (unit.items || []).map((i) => ({
    name: String(i.name || '').slice(0, 127),
    sku: String(i.sku || ''),
    qty: Number(i.quantity) || 1,
    each: Number(i.unit_amount && i.unit_amount.value) || 0,
  }));
  const b = (unit.amount && unit.amount.breakdown) || {};
  const addr = unit.shipping && unit.shipping.address;
  return {
    id: String(done.id || ''),
    date: new Date().toISOString(),
    email: String((done.payer && done.payer.email_address) || '').toLowerCase(),
    first: String((done.payer && done.payer.name && done.payer.name.given_name) || ''),
    items,
    itemTotal: Number(b.item_total && b.item_total.value) || items.reduce((s, i) => s + i.each * i.qty, 0),
    shipping: Number(b.shipping && b.shipping.value) || 0,
    total: Number((capture && capture.amount && capture.amount.value) || (unit.amount && unit.amount.value)) || 0,
    delivery: meta.m || 'none',
    waivers: meta.w ? String(meta.w).split(',') : [],
    shipTo: addr ? [unit.shipping.name && unit.shipping.name.full_name, addr.address_line_1, addr.address_line_2, `${addr.admin_area_2 || ''}, ${addr.admin_area_1 || ''} ${addr.postal_code || ''}`].filter(Boolean).join(', ') : '',
    signedIn: !!meta.u,
  };
}

function itemRows(o) {
  const row = (l, r, strong) => `<tr><td style="padding:6px 0;color:#C8CFC8;font-size:15px;${strong ? 'font-weight:700;color:#F2F4F2;' : ''}">${l}</td><td align="right" style="padding:6px 0;color:#F2F4F2;font-size:15px;${strong ? 'font-weight:700;' : ''}">${r}</td></tr>`;
  const lines = o.items.map((i) => row(`${esc(i.name)}${i.qty > 1 ? ' &times; ' + i.qty : ''}`, money(i.each * i.qty)));
  if (o.delivery !== 'none') lines.push(row('Shipping', money(o.shipping)));
  lines.push(row('Total paid', money(o.total), true));
  return lines.join('');
}

/** File the order and send its two emails, each at most once. Never throws. */
export async function afterPayment(o) {
  let store;
  try {
    store = await ordersStore();
    const existing = await store.get('o-' + o.id, { type: 'json' }).catch(() => null);
    const rec = existing || { ...o, mailed: null, alerted: null };
    if (!existing) await store.setJSON('o-' + o.id, rec);
    if (!mailReady()) return rec;

    if (!rec.mailed && validEmail(o.email)) {
      try {
        const tpl = await loadTemplate('order-confirmation');
        const html = fill(tpl, {
          first_name: o.first || 'there',
          order_id: o.id,
          items_html: itemRows(o),
          delivery_text: o.delivery === 'ship'
            ? `We will post it within 2 business days and email you the tracking number. It is going to: ${o.shipTo}.`
            : 'Nothing to post: we will be in touch about your sign-up or registration within 2 business days.',
          waiver_text: o.waivers.length ? 'You accepted the Lavish Leaf liability waiver with this order. A copy is always at lavishleaf.org/waiver.html.' : '',
        });
        await sendEmail({ to: o.email, toName: o.first, subject: `Your Lavish Leaf order ${o.id}`, html, text: textOf(html), kind: 'order' });
        rec.mailed = new Date().toISOString();
      } catch (e) { console.error('[orders] confirmation', e.message); }
    }
    const owner = mailConfig().owner;
    if (!rec.alerted && validEmail(owner)) {
      try {
        const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222"><p><strong>New order ${esc(o.id)}</strong>, ${money(o.total)}</p><table>${o.items.map((i) => `<tr><td>${esc(i.name)}</td><td>&times; ${i.qty}</td></tr>`).join('')}</table><p>Customer: ${esc(o.email)}${o.shipTo ? '<br>Ship to: ' + esc(o.shipTo) : ''}<br>Delivery: ${esc(o.delivery)}${o.waivers.length ? '<br>Waiver accepted: ' + esc(o.waivers.join(', ')) : ''}</p><p>The full record is in PayPal. The dashboard counts it at lavishleaf.org/dashboard.html.</p></div>`;
        await sendEmail({ to: owner, subject: `New order: ${money(o.total)} (${o.items.map((i) => i.name).join(', ').slice(0, 80)})`, html, text: textOf(html), kind: 'owner' });
        rec.alerted = new Date().toISOString();
      } catch (e) { console.error('[orders] owner alert', e.message); }
    }
    await store.setJSON('o-' + o.id, rec);
    return rec;
  } catch (e) {
    console.error('[orders] could not file the order', e.message);
    return null;
  }
}

/** Every filed order, newest first (for the dashboard). */
export async function allOrders(store) {
  const out = [];
  const { blobs } = await store.list({ prefix: 'o-' });
  for (const b of blobs) {
    const r = await store.get(b.key, { type: 'json' }).catch(() => null);
    if (r && r.id) out.push(r);
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
