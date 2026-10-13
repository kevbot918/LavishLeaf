// /.netlify/functions/orders-admin   owner only (2026-10-12)
//   POST { action: "list" }                         the last 100 orders, every field
//   POST { action: "ordered", id, sku, done }       tick a line as placed with its supplier
//   POST { action: "ship", id, carrier?, tracking?, note? }
//        emails the customer that the order is on its way (once per call) and
//        records it on the order
import { adminFromRequest, json } from '../lib/admin.mjs';
import { allOrders, ordersStore } from '../lib/orders.mjs';
import { sendNotice } from '../lib/notice-mail.mjs';

const clean = (s, n) => String(s == null ? '' : s).replace(/[<>\x00-\x1f]/g, ' ').trim().slice(0, n);

export function trackingUrl(carrier, number) {
  const n = encodeURIComponent(number);
  if (/usps/i.test(carrier)) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  if (/ups/i.test(carrier)) return `https://www.ups.com/track?tracknum=${n}`;
  if (/fedex/i.test(carrier)) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  return `https://parcelsapp.com/en/tracking/${n}`; // AliExpress (Cainiao) and others
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
  let body = {};
  try { body = await request.json(); } catch { /* below */ }
  const store = await ordersStore();

  if (body.action === 'list') {
    const orders = (await allOrders(store)).slice(0, 100);
    return json(200, { orders });
  }

  const key = 'o-' + clean(body.id, 40).replace(/[^A-Z0-9]/gi, '');
  const o = await store.get(key, { type: 'json' });
  if (!o) return json(404, { error: 'No such order.' });

  if (body.action === 'ordered') {
    o.ordered = o.ordered || {};
    const sku = clean(body.sku, 160);
    if (body.done) o.ordered[sku] = new Date().toISOString(); else delete o.ordered[sku];
    await store.setJSON(key, o);
    return json(200, { order: o });
  }

  if (body.action === 'ship') {
    const carrier = clean(body.carrier, 40), tracking = clean(body.tracking, 60), note = clean(body.note, 500);
    const lines = (o.items || []).map((i) => `${i.name}${i.qty > 1 ? ' x' + i.qty : ''}`).join('; ');
    try {
      await sendNotice({
        to: o.email, name: o.first, subject: `Your Lavish Leaf order is on its way`, heading: 'Your order shipped',
        paragraphs: [
          `Good news: your order ${o.id} is on its way to ${o.shipTo || 'you'}.`,
          ...(tracking ? [`Track it here: ${trackingUrl(carrier, tracking)}`] : []),
          ...(note ? [note] : []),
          'Items can come in separate packages, since some ship from different suppliers.',
        ],
        rows: [['Order', o.id], ['Items', lines], ...(carrier ? [['Carrier', carrier]] : []), ...(tracking ? [['Tracking number', tracking]] : [])],
      });
    } catch (e) {
      return json(502, { error: 'The email did not send: ' + e.message });
    }
    o.shipments = o.shipments || [];
    o.shipments.push({ at: new Date().toISOString(), carrier, tracking, note });
    await store.setJSON(key, o);
    return json(200, { order: o });
  }

  return json(400, { error: 'Unknown action.' });
};
