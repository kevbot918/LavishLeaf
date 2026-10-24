// POST /.netlify/functions/books-admin   (owner only; netlify/lib/books.mjs, docs/BOOKS.md)
//   { action: "status" }    -> what is set in Netlify, rows waiting in the queue
//   { action: "test" }      -> reads the Transactions header row with the service
//                              account (writes nothing), so the owner can see the
//                              three setup steps worked
//   { action: "retry" }     -> writes whatever is waiting in the queue now
//   { action: "backfill", write: false | true }
//                           -> the paid orders, one-time pick-ups and donations
//                              filed before the feed went live, replayed from
//                              PayPal (the same rows the live functions write).
//                              write:false is a preview with the counts (the
//                              accounting session checks it first); write:true
//                              writes, skipping any Source ID already there.
//                              Runs on the server with Netlify's own keys, so
//                              no key ever goes on the owner's computer.
import { adminFromRequest, json } from '../lib/admin.mjs';
import { appendRows, checkSheet, donationRows, flushQueue, orderRows, queueCount } from '../lib/books.mjs';
import { call, config } from '../lib/paypal.mjs';

async function all(name, prefix) {
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name, consistency: 'strong' });
  const { blobs } = await s.list({ prefix });
  const out = [];
  for (const b of blobs) { const r = await s.get(b.key, { type: 'json' }).catch(() => null); if (r) out.push(r); }
  return out;
}

async function backfill(write) {
  const cfg = config();
  const ids = [];
  for (const o of await all('orders', 'o-')) if (o.id) ids.push(['order', o.id]);
  for (const p of await all('pickups', 's-')) if (p.once && p.orderId && p.payments) ids.push(['order', p.orderId]);
  for (const d of await all('donations', 'd-')) if (d.id) ids.push(['donation', d.id]);
  const rows = [], skipped = [];
  for (const [kind, id] of ids.slice(0, 60)) {
    try {
      const done = await call(cfg, `/v2/checkout/orders/${id}`, null, { method: 'GET' });
      const r = kind === 'donation' ? donationRows(done) : orderRows(done);
      if (!r.length) skipped.push(id + ': no completed payment');
      rows.push(...r);
    } catch (e) { skipped.push(id + ': PayPal lookup failed'); }
  }
  const byCategory = {};
  for (const r of rows) {
    const c = byCategory[r.category] || (byCategory[r.category] = { rows: 0, in: 0, out: 0 });
    c.rows++; c.in += Number(r.in || 0); c.out += Number(r.out || 0);
  }
  for (const c of Object.values(byCategory)) { c.in = Math.round(c.in * 100) / 100; c.out = Math.round(c.out * 100) / 100; }
  const out = { records: ids.length, more: ids.length > 60, rows: rows.length, byCategory, skipped, preview: rows.map((r) => [r.date, r.description, r.category, r.in, r.out, r.notes, r.source]) };
  if (write) out.written = await appendRows(rows);
  return out;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Only the owner can do that. Please sign in.' });
  let body = {};
  try { body = await request.json(); } catch { /* status */ }
  const env = process.env;
  const status = {
    sheetId: !!env.BOOKS_SHEET_ID,
    serviceAccount: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: !!env.GOOGLE_PRIVATE_KEY,
    live: env.PAYPAL_ENV === 'live',
    queued: await queueCount().catch(() => null),
  };
  try {
    if (body.action === 'test') return json(200, { ...status, test: await checkSheet() });
    if (body.action === 'retry') return json(200, { ...status, retry: await flushQueue(), queued: await queueCount().catch(() => null) });
    if (body.action === 'backfill') {
      if (!status.live) return json(200, { ...status, backfill: { error: 'PayPal is not live, so there are no real payments to copy.' } });
      return json(200, { ...status, backfill: await backfill(body.write === true) });
    }
    return json(200, status);
  } catch (e) {
    return json(200, { ...status, [body.action === 'backfill' ? 'backfill' : 'test']: { ok: false, error: e.message } });
  }
};
