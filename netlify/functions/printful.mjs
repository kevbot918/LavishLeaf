// /.netlify/functions/printful   owner only (2026-10-14; netlify/lib/printful.mjs)
//   POST { action: "status" }            -> connected?, the store's name, or why not
//   POST { action: "order", orderId }    -> a DRAFT Printful order for that paid
//        order's apparel lines, to the customer's address. Nothing is charged
//        until the owner confirms it in Printful (Orders). Recorded as o.printful.
import { adminFromRequest, json } from '../lib/admin.mjs';
import { PrintfulError, call, createDraft, printfulReady } from '../lib/printful.mjs';
import { catalog } from '../lib/catalog.mjs';
import { ordersStore } from '../lib/orders.mjs';
import { addressOf } from './cj.mjs';

/** Our order's apparel lines as Printful sync variants. */
export function printfulItems(o, cat = catalog) {
  const items = [];
  for (const i of o.items || []) {
    const [id, ...rest] = String(i.sku || '').split(':');
    const opt = rest.join(':');
    const p = cat[id];
    if (!p || !p.supplier || p.supplier.name !== 'Printful') continue;
    const sv = opt && p.supplier.optionSv ? p.supplier.optionSv[opt] : p.supplier.sv;
    if (sv) items.push({ sv, qty: i.qty, name: i.name, sku: i.sku });
  }
  return items;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
  let body = {};
  try { body = await request.json(); } catch { /* defaults */ }
  try {
    if (body.action === 'status') {
      if (!printfulReady()) return json(200, { connected: false, why: 'PRINTFUL_API_TOKEN is not in Netlify yet.' });
      const s = await call('/store');
      return json(200, { connected: true, store: s && s.name });
    }
    if (body.action === 'order') {
      const store = await ordersStore();
      const key = 'o-' + String(body.orderId || '').replace(/[^A-Z0-9]/gi, '');
      const o = await store.get(key, { type: 'json' });
      if (!o) return json(404, { error: 'No such order.' });
      if (o.printful && o.printful.id) return json(409, { error: 'Already sent to Printful: draft ' + o.printful.id + '.' });
      if (/refunded|reversed|failed/.test(o.status || '')) return json(400, { error: 'This order was refunded or did not pay; it is not sent.' });
      const items = printfulItems(o);
      if (!items.length) return json(400, { error: 'Nothing on this order is Lavish Leaf apparel.' });
      const a = addressOf(o);
      if (!a.line1 || !a.city || !a.state || !a.zip) return json(400, { error: 'The address is incomplete; place it by hand in Printful.' });
      const r = await createDraft({ id: o.id, name: a.name || o.first_last, email: o.email, phone: o.phone, addr: a }, items);
      o.printful = { id: r.id, status: r.status, cost: r.costs && r.costs.total, shipping: r.costs && r.costs.shipping, at: new Date().toISOString() };
      o.ordered = o.ordered || {};
      for (const i of items) o.ordered[i.sku] = o.printful.at;
      await store.setJSON(key, o);
      return json(200, { order: o });
    }
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    if (e instanceof PrintfulError) return json(502, { error: e.message });
    console.error('[printful]', e);
    return json(500, { error: 'Something went wrong: ' + String(e.message).slice(0, 200) });
  }
};
