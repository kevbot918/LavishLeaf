// The mileage log (2026-10-24, the owner through the accounting session):
// miles entered on the dashboard, and each compost and recycling pick-up
// route day once it is marked picked up, go to the "Mileage" tab of the
// "Lavish Leaf Inc: Books" sheet (BOOKS_SHEET_ID; docs/BOOKS.md).
//
// The tab: header in row 4, data from row 5. A Date (YYYY-MM-DD, Chicago) |
// B From | C To | D Business purpose | E Who it is for | F Round-trip miles |
// G Source ("Dashboard" or "Pick-up route") | H Source ID | I Rate (auto) |
// J Value (auto) | K Booked as reimbursement? I and J are ARRAYFORMULAs that
// fill down, so nothing appends: the next row is the one after the last date
// in column A, only A to H are written (and F when miles are edited), and a
// Source ID already in column H is skipped.
//
// Not tied to PayPal: mileage is written whether or not PayPal is live. A
// Google failure never loses a row: it waits in the Blobs store
// "mileage-queue" and books-retry writes it once a day.
import { accessToken, googleReady } from './google.mjs';
import { orderRoute, ROAD_FACTOR } from '../../routes.mjs';

export const TAB = 'Mileage';
export const FIRST = 5; // the first data row
export const WHO = ['Lavish Leaf Inc', 'Farm', 'DoorDash', 'Other'];
const SCOPE = ['https://www.googleapis.com/auth/spreadsheets'];

let testQueue = null;
export function setMileageQueueForTests(s) { testQueue = s; }
async function queueStore() {
  if (testQueue) return testQueue;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'mileage-queue', consistency: 'strong' });
}

/** Today (or a moment) as YYYY-MM-DD in Oklahoma. */
export function chicagoDate(when = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(when));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const clip = (s, n = 120) => String(s == null ? '' : s).replace(/[\x00-\x1f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// A leading = + - or @ would make the sheet read text as a formula.
const text = (s, n) => clip(s, n).replace(/^[=+\-@]+/, '');
const round1 = (n) => Math.round(n * 10) / 10;

/** A dashboard entry, checked. Throws a sentence the owner can act on. */
export function dashboardRow(b, id) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : chicagoDate();
  const one = Number(b.miles);
  if (!Number.isFinite(one) || one <= 0 || one > 2000) throw new Error('Enter the miles as a number between 0 and 2,000.');
  const who = WHO.includes(b.who) ? b.who : null;
  if (!who) throw new Error('Choose who the trip is for.');
  const purpose = text(b.purpose, 160);
  if (!purpose) throw new Error('Add the business purpose of the trip (the IRS asks for it).');
  return { date, from: text(b.from) || '', to: text(b.to) || '', purpose, who, miles: round1(b.roundTrip ? one * 2 : one), kind: 'Dashboard', source: 'dash:' + id };
}

/**
 * One row for a pick-up route day: the whole route, farm to farm, of every
 * active customer whose pick-up day it is. Distances are straight-line miles
 * times routes.mjs ROAD_FACTOR, so the purpose says "(estimated)" and the
 * owner edits the miles to the odometer from the dashboard. Returns null when
 * no customer that day is on the map.
 */
export function routeRow({ date, day, signups }) {
  const live = (signups || []).filter((s) => (s.status === 'active' || s.status === 'approved') && (s.assignedDay || s.day) === day);
  const stops = live.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  if (!stops.length) return null;
  const r = orderRoute(stops);
  return {
    date, from: 'Farm', to: `Pick-up route ${day}: ${r.stops.length} stop${r.stops.length === 1 ? '' : 's'}`,
    purpose: `Compost and recycling pick-up route (estimated: straight line x ${ROAD_FACTOR}; edit to the odometer)`,
    who: 'Lavish Leaf Inc', miles: r.miles, kind: 'Pick-up route', source: `route:${date}:${day}`,
    unmapped: live.length - stops.length,
  };
}

async function sheet(env, fetchImpl) {
  const id = String(env.BOOKS_SHEET_ID || '');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) throw new Error('BOOKS_SHEET_ID is not set');
  if (!googleReady(env)) throw new Error('the Google service account is not set');
  const token = await accessToken(SCOPE, env, fetchImpl);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values`;
  const auth = { Authorization: `Bearer ${token}` };
  const ask = async (url, opts = {}) => {
    const res = await fetchImpl(url, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((j.error && j.error.message) || `Sheets said ${res.status}`);
    return j;
  };
  const get = (ranges, dim = 'COLUMNS') => ask(`${base}:batchGet?${ranges.map((r) => 'ranges=' + encodeURIComponent(r)).join('&')}&majorDimension=${dim}`);
  const put = (data) => ask(`${base}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) });
  return { get, put };
}

/** Writes rows now; throws when it cannot. Returns { written, skipped }. */
export async function appendMileage(rows, env = process.env, fetchImpl = fetch) {
  const s = await sheet(env, fetchImpl);
  const j = await s.get([`${TAB}!A${FIRST}:A`, `${TAB}!H${FIRST}:H`]);
  const [colA, colH] = (j.valueRanges || []).map((v) => (v.values && v.values[0]) || []);
  const seen = new Set((colH || []).map(String));
  let next = (colA || []).length + FIRST; // the row after the last date
  const data = [];
  let skipped = 0;
  for (const r of rows) {
    if (!r || !r.source || seen.has(r.source)) { skipped++; continue; }
    seen.add(r.source);
    data.push({ range: `${TAB}!A${next}:H${next}`, values: [[r.date, r.from, r.to, r.purpose, r.who, r.miles, r.kind, r.source]] });
    next++;
  }
  if (data.length) await s.put(data);
  return { written: data.length, skipped };
}

/** Never throws: a failed write waits in "mileage-queue". */
export async function recordMileage(rows, { env = process.env, fetchImpl = fetch } = {}) {
  rows = (rows || []).filter(Boolean);
  if (!rows.length) return { skipped: 'nothing to write' };
  try {
    return await appendMileage(rows, env, fetchImpl);
  } catch (e) {
    console.error('[mileage] queued for retry:', e.message);
    try {
      const q = await queueStore();
      await q.setJSON('q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), { rows, at: new Date().toISOString(), error: String(e.message).slice(0, 300), tries: 0 });
    } catch (e2) { console.error('[mileage] could not queue', e2.message, JSON.stringify(rows.map((r) => r.source))); }
    return { queued: rows.length, error: e.message };
  }
}

/** Writes everything waiting (books-retry, daily). */
export async function flushMileage({ env = process.env, fetchImpl = fetch } = {}) {
  const q = await queueStore();
  const { blobs } = await q.list({ prefix: 'q-' });
  const out = { batches: blobs.length, written: 0, failed: 0 };
  for (const b of blobs) {
    const item = await q.get(b.key, { type: 'json' }).catch(() => null);
    if (!item) { await q.delete(b.key); continue; }
    try { out.written += (await appendMileage(item.rows, env, fetchImpl)).written; await q.delete(b.key); }
    catch (e) { out.failed++; await q.setJSON(b.key, { ...item, tries: (item.tries || 0) + 1, error: String(e.message).slice(0, 300), last: new Date().toISOString() }); }
  }
  return out;
}

/** Rewrites the miles (column F only) of the row with that Source ID. */
export async function editMiles(source, miles, env = process.env, fetchImpl = fetch) {
  const m = Number(miles);
  if (!Number.isFinite(m) || m < 0 || m > 2000) throw new Error('Enter the miles as a number between 0 and 2,000.');
  const s = await sheet(env, fetchImpl);
  const j = await s.get([`${TAB}!H${FIRST}:H`]);
  const col = ((j.valueRanges || [])[0] || {}).values;
  const i = ((col && col[0]) || []).map(String).indexOf(String(source));
  if (i < 0) throw new Error('That trip is not in the Mileage tab any more.');
  await s.put([{ range: `${TAB}!F${i + FIRST}`, values: [[round1(m)]] }]);
  return { row: i + FIRST, miles: round1(m) };
}

/** The last `days` days of entries, and this year's miles per "who it is for". */
export async function recentMileage(days = 30, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const s = await sheet(env, fetchImpl);
  const j = await s.get([`${TAB}!A${FIRST}:H`], 'ROWS');
  const rows = (((j.valueRanges || [])[0] || {}).values || []).map((r, i) => ({
    row: i + FIRST, date: r[0] || '', from: r[1] || '', to: r[2] || '', purpose: r[3] || '', who: r[4] || '', miles: Number(String(r[5] || '').replace(/,/g, '')) || 0, kind: r[6] || '', source: r[7] || '',
  })).filter((r) => r.date);
  const since = chicagoDate(now - days * 864e5), year = chicagoDate(now).slice(0, 4);
  const totals = Object.fromEntries(WHO.map((w) => [w, 0]));
  for (const r of rows) if (String(r.date).slice(0, 4) === year) totals[WHO.includes(r.who) ? r.who : 'Other'] = round1(totals[WHO.includes(r.who) ? r.who : 'Other'] + r.miles);
  return { recent: rows.filter((r) => String(r.date) >= since).reverse(), totals, year };
}
