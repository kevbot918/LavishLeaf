// /.netlify/functions/registrations   owner only
//   POST { action: "list" }               every league registration, newest first
//   POST { action: "remove", orderId }    off the roster (refunded, dropped out);
//                                         the record stays, marked "removed"
//   POST { action: "restore", orderId }   back on the roster
// (netlify/lib/registrations.mjs; written by checkout, marked paid by capture,
// marked refunded by the PayPal webhook)
import { adminFromRequest, json } from '../lib/admin.mjs';
import { registrationsStore } from '../lib/registrations.mjs';

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
  let body = {};
  try { body = await request.json(); } catch { /* below */ }
  const store = await registrationsStore();
  if (body.action === 'list') {
    const { blobs } = await store.list({ prefix: 'o-' });
    const out = [];
    for (const b of blobs) { const r = await store.get(b.key, { type: 'json' }); if (r) out.push(r); }
    out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    return json(200, { registrations: out });
  }
  if (body.action === 'remove' || body.action === 'restore') {
    const key = 'o-' + String(body.orderId || '').replace(/[^A-Z0-9]/gi, '');
    const r = await store.get(key, { type: 'json' });
    if (!r) return json(404, { error: 'No such registration.' });
    if (body.action === 'remove') { r.statusBefore = r.status === 'removed' ? r.statusBefore : r.status; r.status = 'removed'; r.removedAt = new Date().toISOString(); }
    else { r.status = r.statusBefore || 'paid'; delete r.removedAt; }
    await store.setJSON(key, r);
    return json(200, { registration: r });
  }
  return json(400, { error: 'Unknown action.' });
};
