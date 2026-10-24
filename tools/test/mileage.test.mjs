// The mileage log (2026-10-24): dashboard trips and pick-up route days go to
// the Mileage tab once each, never into the formula columns I, J and K, and a
// failed write waits in the queue. Not tied to PayPal.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  appendMileage, dashboardRow, editMiles, flushMileage, recentMileage, recordMileage, routeRow, setMileageQueueForTests,
} from '../../netlify/lib/mileage.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = {
  BOOKS_SHEET_ID: '1hzTESTSHEETidThatIsLongEnough_xx',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'books@example.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

function fakeStore() {
  const m = new Map();
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}

const COLS = 'ABCDEFGHIJK';
/** The Mileage tab: header in row 4, I and J formulas down to row 5000. */
function fakeSheet({ rows = {}, failWrites = false } = {}) {
  const sheet = { rows: { 4: { A: 'Date', H: 'Source ID' }, ...rows }, writes: [], failWrites };
  for (let n = 5; n <= 5000; n++) { sheet.rows[n] = sheet.rows[n] || {}; sheet.rows[n].I = '=rate'; sheet.rows[n].J = '=value'; }
  const col = (c) => {
    const out = [];
    for (let n = 5; n <= 5000; n++) out.push(sheet.rows[n][c] || '');
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  };
  const rowsAH = () => {
    const out = [];
    for (let n = 5; n <= 5000; n++) out.push([...'ABCDEFGH'].map((c) => sheet.rows[n][c] || ''));
    while (out.length && !out[out.length - 1].some(Boolean)) out.pop();
    return out;
  };
  sheet.fetch = async (url, opts = {}) => {
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'tok', expires_in: 3600 });
    const u = decodeURIComponent(url);
    if (u.includes(':batchGet')) {
      const ranges = [...u.matchAll(/ranges=Mileage!([A-K])5:([A-K])/g)].map((m) => m[1] + m[2]);
      if (u.includes('majorDimension=ROWS')) return ok({ valueRanges: [{ values: rowsAH() }] });
      return ok({ valueRanges: ranges.map((r) => ({ values: [col(r[0])] })) });
    }
    if (u.includes(':batchUpdate')) {
      if (sheet.failWrites) return { ok: false, status: 503, json: async () => ({ error: { message: 'backend error' } }) };
      const body = JSON.parse(opts.body);
      assert.equal(body.valueInputOption, 'USER_ENTERED');
      for (const d of body.data) {
        const m = d.range.match(/^Mileage!([A-K])(\d+)(?::([A-K])\d+)?$/);
        assert.ok(m, 'range ' + d.range);
        const last = m[3] || m[1];
        assert.ok(last <= 'H', 'never writes I, J or K: ' + d.range);
        const n = Number(m[2]);
        d.values[0].forEach((v, i) => { sheet.rows[n][COLS[COLS.indexOf(m[1]) + i]] = v; });
        sheet.writes.push(d.range);
      }
      return ok({});
    }
    throw new Error('unexpected fetch ' + url);
  };
  return sheet;
}

const trip = (over = {}) => dashboardRow({ date: '2026-10-24', from: 'Farm', to: 'Hummert, McAlester', purpose: 'Bought compost buckets', who: 'Lavish Leaf Inc', miles: 21, roundTrip: true, ...over }, 'abc123');

test('a dashboard trip is checked, doubled for a round trip, and cannot become a formula', () => {
  const r = trip();
  assert.equal(r.miles, 42);
  assert.equal(r.kind, 'Dashboard');
  assert.equal(r.source, 'dash:abc123');
  assert.equal(trip({ to: '=HYPERLINK("x")' }).to, 'HYPERLINK("x")');
  assert.throws(() => trip({ who: 'Me' }), /who the trip is for/);
  assert.throws(() => trip({ miles: 'ten' }), /number/);
  assert.throws(() => trip({ purpose: '' }), /purpose/);
});

test('rows go after the last date (row 5 onward), never into I, J or K, and a Source ID is written once', async () => {
  const sheet = fakeSheet({ rows: { 5: { A: '2026-10-01', H: 'manual-1' }, 6: { A: '2026-10-02', H: 'dash:old' } } });
  const r = await appendMileage([trip(), { ...trip(), source: 'dash:old' }], ENV, sheet.fetch);
  assert.deepEqual(r, { written: 1, skipped: 1 });
  assert.deepEqual(sheet.writes, ['Mileage!A7:H7'], 'row 7, not 5001');
  assert.equal(sheet.rows[7].F, 42);
  assert.equal(sheet.rows[7].G, 'Dashboard');
  assert.equal(sheet.rows[7].I, '=rate');
  assert.deepEqual(await appendMileage([trip()], ENV, sheet.fetch), { written: 0, skipped: 1 });
  // An empty tab starts at row 5.
  const empty = fakeSheet();
  await appendMileage([trip()], ENV, empty.fetch);
  assert.deepEqual(empty.writes, ['Mileage!A5:H5']);
});

test('a route day is one row, farm to farm, estimated, keyed by date and day', () => {
  const signups = [
    { status: 'active', day: 'Tuesday', lat: 35.25, lon: -95.12 },
    { status: 'active', day: 'Monday', assignedDay: 'Tuesday', lat: 34.98, lon: -95.78 },
    { status: 'active', day: 'Tuesday', lat: null, lon: null },
    { status: 'canceled', day: 'Tuesday', lat: 35.4, lon: -95.5 },
    { status: 'active', day: 'Friday', lat: 35.4, lon: -95.5 },
  ];
  const r = routeRow({ date: '2026-10-27', day: 'Tuesday', signups });
  assert.equal(r.source, 'route:2026-10-27:Tuesday');
  assert.equal(r.to, 'Pick-up route Tuesday: 2 stops');
  assert.equal(r.from, 'Farm');
  assert.equal(r.who, 'Lavish Leaf Inc');
  assert.equal(r.kind, 'Pick-up route');
  assert.match(r.purpose, /^Compost and recycling pick-up route \(estimated/);
  assert.equal(r.unmapped, 1);
  assert.ok(r.miles > 20 && r.miles < 200, 'a real farm-to-farm loop: ' + r.miles);
  assert.equal(routeRow({ date: '2026-10-27', day: 'Sunday', signups }), null, 'no stops on the map: nothing');
});

test('marking the same route day twice never doubles it', async () => {
  const sheet = fakeSheet();
  const row = routeRow({ date: '2026-10-27', day: 'Friday', signups: [{ status: 'active', day: 'Friday', lat: 35.4, lon: -95.5 }] });
  const { unmapped, ...clean } = row;
  assert.equal((await recordMileage([clean], { env: ENV, fetchImpl: sheet.fetch })).written, 1);
  assert.equal((await recordMileage([clean], { env: ENV, fetchImpl: sheet.fetch })).skipped, 1);
  assert.equal(sheet.writes.length, 1);
});

test('Edit miles rewrites only column F of the row found by its Source ID', async () => {
  const sheet = fakeSheet({ rows: { 5: { A: '2026-10-20', F: 30, H: 'route:2026-10-20:Tuesday' }, 6: { A: '2026-10-21', F: 9, H: 'dash:x' } } });
  assert.deepEqual(await editMiles('route:2026-10-20:Tuesday', '36.4', ENV, sheet.fetch), { row: 5, miles: 36.4 });
  assert.deepEqual(sheet.writes, ['Mileage!F5']);
  assert.equal(sheet.rows[5].F, 36.4);
  await assert.rejects(editMiles('dash:gone', 3, ENV, sheet.fetch), /not in the Mileage tab/);
});

test('the dashboard list: the last 30 days, newest first, and this year per purpose', async () => {
  const sheet = fakeSheet({ rows: {
    5: { A: '2026-01-05', E: 'Farm', F: 10, H: 'a' },
    6: { A: '2026-10-01', E: 'Lavish Leaf Inc', F: 42, H: 'b' },
    7: { A: '2026-10-20', E: 'DoorDash', F: '1,200', H: 'c' },
    8: { A: '2025-12-30', E: 'Farm', F: 5, H: 'd' },
  } });
  const r = await recentMileage(30, ENV, sheet.fetch, Date.parse('2026-10-24T17:00:00Z'));
  assert.deepEqual(r.recent.map((x) => x.source), ['c', 'b']);
  assert.deepEqual(r.totals, { 'Lavish Leaf Inc': 42, Farm: 10, DoorDash: 1200, Other: 0 });
});

test('a failed write is queued, not lost, and the daily retry writes it; PayPal plays no part', async () => {
  const q = fakeStore(); setMileageQueueForTests(q);
  const sheet = fakeSheet({ failWrites: true });
  const r = await recordMileage([trip()], { env: { ...ENV, PAYPAL_ENV: 'sandbox' }, fetchImpl: sheet.fetch });
  assert.equal(r.queued, 1);
  assert.equal((await flushMileage({ env: ENV, fetchImpl: sheet.fetch })).failed, 1);
  sheet.failWrites = false;
  assert.deepEqual(await flushMileage({ env: ENV, fetchImpl: sheet.fetch }), { batches: 1, written: 1, failed: 0 });
  assert.equal(q.m.size, 0);
  setMileageQueueForTests(null);
});
