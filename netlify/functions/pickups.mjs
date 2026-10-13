// /.netlify/functions/pickups   compost and recycling sign-ups (2026-10-11)
//   POST { action: "confirm", subscriptionId }  the buyer's return from PayPal:
//        active once PayPal says so; the owner's alert and the customer's
//        welcome, once (the webhook does the same if the buyer never returns).
//   Owner only:
//   POST { action: "list" }                      every sign-up (unpaid ones over
//        30 days old are deleted here)
//   POST { action: "update", id, assignedDay?, status?, ownerNote? }
//   POST { action: "cancel", id }                cancels the PayPal subscription
//        (no more charges) and tells the customer
//   POST { action: "emailDay", id, note? }       emails the customer their day
//   POST { action: "remove", id }                deletes a sign-up that is not
//        active (an "active" one is checked with PayPal first: canceled there
//        means canceled here, and it goes)
//
// 2026-10-13: a subscription the customer (or the owner) canceled inside
// PayPal before the webhook existed still read "active" here, so it showed
// no Remove button and could not be removed. The list now asks PayPal for
// the real status of every active or paused sign-up (canceledInPayPal).
import { adminFromRequest, json } from '../lib/admin.mjs';
import { CheckoutError, call, config } from '../lib/paypal.mjs';
import { DAYS, pickupsStore } from '../lib/pickups.mjs';
import { activated, canceled, pickupDay, statusFromPayPal } from '../lib/pickup-events.mjs';

export { ownerRows } from '../lib/pickup-events.mjs';

const STALE_MS = 30 * 24 * 3600 * 1000;

/**
 * PayPal's own word on a sign-up we think is live. Returns the record,
 * updated (status canceled or paused) when PayPal disagrees; never throws.
 */
async function syncWithPayPal(rec) {
  if (!rec.subscriptionId || !['active', 'approved', 'paused'].includes(rec.status)) return { rec, changed: false };
  try {
    const sub = await call(config(), `/v1/billing/subscriptions/${rec.subscriptionId}`, null, { method: 'GET' });
    const st = statusFromPayPal(sub.status);
    if (st === 'canceled') { rec.status = 'canceled'; rec.canceledAt = rec.canceledAt || sub.status_update_time || new Date().toISOString(); rec.canceledIn = 'PayPal'; return { rec, changed: true }; }
    if (st === 'paused' && rec.status !== 'paused') { rec.status = 'paused'; return { rec, changed: true }; }
    if (st === 'active' && rec.status === 'paused') { rec.status = 'active'; return { rec, changed: true }; }
  } catch (e) { console.error('[pickups] PayPal check', rec.subscriptionId, e.message); }
  return { rec, changed: false };
}
const keyOf = (id) => 's-' + String(id || '').replace(/[^a-z0-9-]/gi, '');

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  let body = {};
  try { body = await request.json(); } catch { /* below */ }
  const store = await pickupsStore();

  if (body.action === 'confirm') {
    const sid = String(body.subscriptionId || '');
    if (!/^I-[A-Z0-9]{6,30}$/.test(sid)) return json(400, { error: 'Unknown sign-up.' });
    try {
      const sub = await call(config(), `/v1/billing/subscriptions/${sid}`, null, { method: 'GET' });
      const key = keyOf(sub.custom_id);
      const rec = await store.get(key, { type: 'json' });
      if (!rec || rec.subscriptionId !== sid) return json(200, { status: statusFromPayPal(sub.status) });
      const st = statusFromPayPal(sub.status);
      if (st === 'active') await activated(rec); else rec.status = st;
      await store.setJSON(key, rec);
      return json(200, { status: rec.status });
    } catch (e) {
      if (e instanceof CheckoutError) return json(e.status || 502, { error: e.message });
      console.error('[pickups] confirm', e.message);
      return json(502, { error: 'Could not check the sign-up just now. PayPal will email your confirmation.' });
    }
  }

  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });

  if (body.action === 'list') {
    const { blobs } = await store.list({ prefix: 's-' });
    const out = [];
    for (const b of blobs) {
      const r = await store.get(b.key, { type: 'json' });
      if (!r) continue;
      // Never paid and a month old: gone (owner, 2026-10-12: "are those going
      // to sit there forever").
      if (r.status === 'pending' && Date.now() - Date.parse(r.created) > STALE_MS) { await store.delete(b.key); continue; }
      const { changed } = await syncWithPayPal(r);
      if (changed) { r.updated = new Date().toISOString(); await store.setJSON(b.key, r); }
      out.push(r);
    }
    out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    return json(200, { signups: out });
  }

  const key = keyOf(body.id);
  const rec = await store.get(key, { type: 'json' });
  if (!rec) return json(404, { error: 'No such sign-up.' });

  if (body.action === 'update') {
    if ('assignedDay' in body) rec.assignedDay = DAYS.includes(body.assignedDay) ? body.assignedDay : null;
    if ('status' in body && ['pending', 'active', 'paused', 'canceled'].includes(body.status)) rec.status = body.status;
    if ('ownerNote' in body) rec.ownerNote = String(body.ownerNote || '').replace(/[<>]/g, '').slice(0, 300);
    rec.updated = new Date().toISOString();
    await store.setJSON(key, rec);
    return json(200, { signup: rec });
  }

  if (body.action === 'cancel') {
    // Refunding a payment in PayPal does NOT stop the subscription; this does.
    if (rec.subscriptionId && rec.status !== 'canceled') {
      try {
        await call(config(), `/v1/billing/subscriptions/${rec.subscriptionId}/cancel`, { reason: 'Canceled by Lavish Leaf' });
      } catch (e) {
        // Already canceled in PayPal (or never approved): carry on and record it.
        console.error('[pickups] cancel', e.message);
      }
    }
    await canceled(rec, true);
    rec.updated = new Date().toISOString();
    await store.setJSON(key, rec);
    return json(200, { signup: rec });
  }

  if (body.action === 'emailDay') {
    try {
      await pickupDay(rec, String(body.note || '').replace(/[<>]/g, '').trim());
    } catch (e) {
      return json(502, { error: 'The email did not send: ' + e.message });
    }
    await store.setJSON(key, rec);
    return json(200, { signup: rec });
  }

  if (body.action === 'remove') {
    if (rec.status === 'active' || rec.status === 'approved') {
      const { changed } = await syncWithPayPal(rec);
      if (changed) await store.setJSON(key, rec);
    }
    if (rec.status === 'active' || rec.status === 'approved') return json(400, { error: 'PayPal says this subscription is still active. Use Cancel subscription first, then Remove.' });
    await store.delete(key);
    return json(200, { removed: true });
  }

  return json(400, { error: 'Unknown action.' });
};
