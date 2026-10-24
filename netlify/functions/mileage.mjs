// POST /.netlify/functions/mileage   (owner only; netlify/lib/mileage.mjs, docs/BOOKS.md)
//   { action: "list" }                      the last 30 days of trips and this
//                                           year's miles per "who it is for"
//   { action: "add", date, from, to, purpose, who, miles, roundTrip }
//                                           one dashboard trip (Source ID dash:<id>)
//   { action: "edit", source, miles }       rewrites that row's miles (column F)
//   { action: "route", day, date }          the pick-up route for that day, farm to
//                                           farm, once (Source ID route:<date>:<day>)
import { randomUUID } from 'node:crypto';
import { adminFromRequest, json } from '../lib/admin.mjs';
import { chicagoDate, dashboardRow, editMiles, recentMileage, recordMileage, routeRow } from '../lib/mileage.mjs';
import { DAYS, pickupsStore } from '../lib/pickups.mjs';

async function allSignups() {
  const store = await pickupsStore();
  const { blobs } = await store.list({ prefix: 's-' });
  const out = [];
  for (const b of blobs) { const r = await store.get(b.key, { type: 'json' }).catch(() => null); if (r) out.push(r); }
  return out;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Only the owner can do that. Please sign in.' });
  let body = {};
  try { body = await request.json(); } catch { /* list */ }
  try {
    if (body.action === 'add') {
      const row = dashboardRow(body, randomUUID().slice(0, 12));
      return json(200, { row, saved: await recordMileage([row]) });
    }
    if (body.action === 'edit') return json(200, await editMiles(String(body.source || ''), body.miles));
    if (body.action === 'route') {
      const day = DAYS.includes(body.day) ? body.day : null;
      if (!day) return json(400, { error: 'Which route day?' });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? body.date : chicagoDate();
      const row = routeRow({ date, day, signups: await allSignups() });
      if (!row) return json(200, { notice: `No ${day} customer is on the map, so no miles were logged. Add the trip in Log mileage instead.` });
      const { unmapped, ...clean } = row;
      return json(200, { row: clean, unmapped, saved: await recordMileage([clean]) });
    }
    return json(200, await recentMileage(30));
  } catch (e) {
    return json(400, { error: e.message });
  }
};
