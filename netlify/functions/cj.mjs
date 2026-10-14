// /.netlify/functions/cj   owner only (2026-10-14; netlify/lib/cj.mjs)
//   POST { action: "status" }            -> connected?, or why not
//   POST { action: "order", orderId }    -> the CJ order for that paid order's CJ
//        lines, to the customer's address, cheapest US freight, NOT paid: pay
//        it in the CJ account (My CJ, Orders). Recorded on our order (o.cj).
import { adminFromRequest, json } from '../lib/admin.mjs';
import { CjError, accessToken, cjReady, createOrder, freight } from '../lib/cj.mjs';
import { catalog } from '../lib/catalog.mjs';
import { ordersStore } from '../lib/orders.mjs';

/** The address in parts, from the order (or, for an older order, its one line). */
export function addressOf(o) {
  if (o.addr && o.addr.line1) return o.addr;
  // "Name, line1, [line2,] City, ST 12345"
  const parts = String(o.shipTo || '').split(',').map((s) => s.trim());
  const last = parts.pop() || '';
  const city = parts.pop() || '';
  const m = last.match(/^([A-Z]{2})\s+(\d{5})/) || [];
  const [name, line1, line2] = parts;
  return { name: name || o.first_last || '', line1: line1 || '', line2: line2 || '', city, state: m[1] || '', zip: m[2] || '' };
}

/** Our order's CJ lines as CJ variants. */
export function cjItems(o, cat = catalog) {
  const items = [];
  for (const i of o.items || []) {
    const [id, opt] = String(i.sku || '').split(':');
    const p = cat[id];
    if (!p || !p.supplier || !/^cj/i.test(p.supplier.name)) continue;
    const vid = opt && p.supplier.optionVids ? p.supplier.optionVids[opt] : p.supplier.vid;
    if (vid) items.push({ vid, qty: i.qty, name: i.name });
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
      if (!cjReady()) return json(200, { connected: false, why: 'CJ_API_KEY is not in Netlify yet.' });
      await accessToken();
      return json(200, { connected: true });
    }
    if (body.action === 'order') {
      const store = await ordersStore();
      const key = 'o-' + String(body.orderId || '').replace(/[^A-Z0-9]/gi, '');
      const o = await store.get(key, { type: 'json' });
      if (!o) return json(404, { error: 'No such order.' });
      if (o.cj && o.cj.orderId) return json(409, { error: 'Already placed on CJ: CJ order ' + o.cj.orderId + '.' });
      if (/refunded|reversed|failed/.test(o.status || '')) return json(400, { error: 'This order was refunded or did not pay; it is not placed.' });
      const items = cjItems(o);
      if (!items.length) return json(400, { error: 'Nothing on this order comes from CJ.' });
      const a = addressOf(o);
      if (!a.line1 || !a.city || !a.state || !a.zip) return json(400, { error: 'The address is incomplete; place it by hand in CJ.' });
      const options = await freight(items, a.zip);
      if (!options.length) return json(502, { error: 'CJ gave no US shipping option for this address; place it by hand in CJ.' });
      const ship = options[0];
      const r = await createOrder({ id: o.id, name: a.name || o.first_last, phone: o.phone || '', email: o.email, addr: a }, items, ship.name);
      o.cj = { orderId: r.orderId, at: new Date().toISOString(), logistic: ship.name, days: ship.days, freight: ship.usd, amount: r.orderAmount || r.actualPayment || null, status: r.orderStatus || null };
      o.ordered = o.ordered || {};
      for (const i of o.items || []) if (items.some((x) => i.sku && cjItems({ items: [i] }).length)) o.ordered[i.sku] = new Date().toISOString();
      await store.setJSON(key, o);
      return json(200, { order: o });
    }
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    if (e instanceof CjError) return json(502, { error: e.message });
    console.error('[cj]', e);
    return json(500, { error: 'Something went wrong: ' + String(e.message).slice(0, 200) });
  }
};
