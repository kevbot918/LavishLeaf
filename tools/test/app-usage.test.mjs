// The anonymous usage counter: netlify/lib/usage.mjs and the function over it.
//   node --test tools/test/app-usage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SPLITS, UsageError, applyDownload, applyReport, dayKey, dayView, keyMatches,
  parseBody, rateLimiter, readDays, statsPage, summarise, update,
} from '../../netlify/lib/usage.mjs';
import handler, { resetRateLimitForTests, setStoreForTests } from '../../netlify/functions/app-usage.mjs';

const NOW = new Date('2026-10-10T15:00:00Z');
const ago = (n) => dayKey(new Date(NOW.getTime() - n * 86400000));

/** Netlify Blobs, as far as this code uses it: json values, etags, conditional writes. */
function fakeStore() {
  const m = new Map();
  let n = 0;
  return {
    m,
    writes: 0,
    async get(key) { const e = m.get(key); return e ? JSON.parse(e.json) : null; },
    async getWithMetadata(key) { const e = m.get(key); return e ? { data: JSON.parse(e.json), etag: e.etag } : null; },
    async setJSON(key, value, opts = {}) {
      const cur = m.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch !== undefined && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      m.set(key, { json: JSON.stringify(value), etag: `e${++n}` });
      this.writes += 1;
      return { modified: true, etag: `e${n}` };
    },
  };
}

const report = (over = {}) => JSON.stringify({
  app: 'symphonymph', version: '2.8.0 (261003239)', platform: 'android', build: 'store',
  days: [{ day: ago(1), minutes: 42 }], ...over,
});
const rejects = (text, why) => assert.throws(() => parseBody(text, NOW), (e) => e instanceof UsageError && e.status === 400, why);

test('a well-formed report parses', () => {
  const r = parseBody(report(), NOW);
  assert.deepEqual(r, { kind: 'report', platform: 'android', build: 'store', version: '2.8.0 (261003239)', days: [{ day: ago(1), minutes: 42 }], dropped: 0 });
});

test('a debug-signed version string is accepted', () => {
  assert.equal(parseBody(report({ version: '2.8.0 (261003239)-debugkey' }), NOW).version, '2.8.0 (261003239)-debugkey');
});

test('anything a real app never sends is a 400', () => {
  rejects('', 'empty');
  rejects('not json', 'not json');
  rejects('[]', 'an array');
  rejects(report({ app: 'other' }), 'wrong app');
  rejects(report({ platform: 'windows' }), 'platform');
  rejects(report({ build: 'beta' }), 'build');
  rejects(report({ version: '' }), 'empty version');
  rejects(report({ version: '<script>' }), 'markup in version');
  rejects(report({ version: 'x'.repeat(41) }), 'long version');
  rejects(report({ days: [] }), 'no days');
  rejects(report({ days: 'yesterday' }), 'days not a list');
  rejects(report({ days: Array.from({ length: 8 }, (_, i) => ({ day: ago(i + 1), minutes: 1 })) }), 'eight days');
  rejects(report({ days: [{ day: '2026-02-30', minutes: 1 }] }), 'not a real date');
  rejects(report({ days: [{ day: '10/09/2026', minutes: 1 }] }), 'wrong date shape');
  rejects(report({ days: [{ day: ago(1), minutes: 1441 }] }), 'too many minutes');
  rejects(report({ days: [{ day: ago(1), minutes: -1 }] }), 'negative minutes');
  rejects(report({ days: [{ day: ago(1), minutes: 1.5 }] }), 'fractional minutes');
  rejects(report({ days: [{ day: ago(1), minutes: '5' }] }), 'minutes as text');
  rejects(report({ days: [{ day: ago(1), minutes: 1 }, { day: ago(1), minutes: 2 }] }), 'one day twice');
  rejects(JSON.stringify({ app: 'symphonymph', pad: 'x'.repeat(2100) }), 'over 2 KB');
});

test('a stale or future day is DROPPED, not refused: the app retries every non-2xx for ever', () => {
  const r = parseBody(report({ days: [
    { day: ago(30), minutes: 10 },   // the phone was shut for a month
    { day: ago(14), minutes: 20 },   // the edge of the window still counts
    { day: ago(1), minutes: 30 },
    { day: ago(-2), minutes: 40 },   // a clock set wrong
  ] }), NOW);
  assert.deepEqual(r.days, [{ day: ago(14), minutes: 20 }, { day: ago(1), minutes: 30 }]);
  assert.equal(r.dropped, 2);
});

test('a report adds one device and its minutes to each day it names', async () => {
  const s = fakeStore();
  await applyReport(s, parseBody(report({ days: [{ day: ago(2), minutes: 10 }, { day: ago(1), minutes: 50 }] }), NOW));
  await applyReport(s, parseBody(report({ platform: 'ios', days: [{ day: ago(1), minutes: 30 }] }), NOW));
  await applyReport(s, parseBody(report({ build: 'alpha', version: '2.8.0 (1)', days: [{ day: ago(1), minutes: 0 }] }), NOW));
  const days = await readDays(s, 7, NOW);
  const y = dayView(days[1]);
  assert.equal(y.day, ago(1));
  assert.deepEqual([y.devices, y.minutes, y.average], [3, 80, 27]);
  assert.deepEqual([y.android, y.ios, y.store, y.alpha], [2, 1, 2, 1]);
  assert.deepEqual([dayView(days[2]).devices, dayView(days[2]).minutes], [1, 10]);
  assert.equal(dayView(days[0]).devices, 0, 'today is present and empty');
});

test('nothing but sums is stored: no request, no address, no identifier', async () => {
  const s = fakeStore();
  await applyReport(s, parseBody(report(), NOW));
  const stored = [...s.m.values()].map((e) => JSON.parse(e.json));
  assert.equal(stored.length, 1);
  assert.deepEqual(Object.keys(stored[0]).sort(), ['by', 'day', 'devices', 'downloads', 'minutes', 'v']);
  assert.deepEqual(stored[0].by, { 'android|store|2.8.0 (261003239)': { devices: 1, minutes: 42 } });
});

test('two phones writing one day at the same moment are both counted', async () => {
  const s = fakeStore();
  const key = `day/${ago(1)}`;
  // Somebody else writes between this caller's read and its write, twice.
  let interfere = 2;
  const real = s.setJSON.bind(s);
  s.setJSON = async (k, v, o) => {
    if (k === key && interfere > 0) {
      interfere -= 1;
      await applyReportQuietly();
    }
    return real(k, v, o);
  };
  async function applyReportQuietly() {
    const cur = await s.getWithMetadata(key);
    const d = cur ? cur.data : { v: 1, day: ago(1), devices: 0, minutes: 0, by: {}, downloads: {} };
    d.devices += 1; d.minutes += 5;
    await real(key, d, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
  }
  await applyReport(s, parseBody(report(), NOW));
  const d = (await readDays(s, 2, NOW))[1];
  assert.equal(d.devices, 3, 'the two interlopers and this report');
  assert.equal(d.minutes, 52);
});

test('update gives up after its tries rather than looping for ever', async () => {
  const s = { async getWithMetadata() { return { data: {}, etag: 'x' }; }, async setJSON() { return { modified: false }; } };
  assert.equal(await update(s, 'k', (d) => d, 3), false);
});

test('a store that fails does not throw out of applyReport', async () => {
  const s = { async getWithMetadata() { throw new Error('down'); }, async setJSON() {} };
  const quiet = console.error; console.error = () => {};
  try { assert.equal(await applyReport(s, parseBody(report(), NOW)), 0); } finally { console.error = quiet; }
});

test('invented versions cannot grow a day without limit', async () => {
  const s = fakeStore();
  for (let i = 0; i < MAX_SPLITS + 25; i++) {
    await applyReport(s, parseBody(report({ version: `9.9.${i}` }), NOW));
  }
  const d = (await readDays(s, 2, NOW))[1];
  assert.equal(d.devices, MAX_SPLITS + 25, 'the total is still right');
  assert.equal(Object.keys(d.by).length, MAX_SPLITS + 1, 'the cap, plus one "other" row');
  assert.equal(d.by['android|store|other'].devices, 25);
});

test('a download tap is counted by file, and only for the files the site serves', async () => {
  const s = fakeStore();
  const tap = (file) => JSON.stringify({ app: 'symphonymph', download: file });
  await applyDownload(s, parseBody(tap('symphonymph-2.8.0.apk'), NOW));
  await applyDownload(s, parseBody(tap('symphonymph-2.8.0.apk'), NOW));
  await applyDownload(s, parseBody(tap('symphonymph-alpha-2.8.0.apk'), NOW));
  const today = (await readDays(s, 1, NOW))[0];
  assert.deepEqual(today.downloads, { 'symphonymph-2.8.0.apk': 2, 'symphonymph-alpha-2.8.0.apk': 1 });
  assert.equal(dayView(today).downloads, 3);
  rejects(tap('../secret.apk'), 'a path');
  rejects(tap('other-app.apk'), 'another file');
  rejects(tap('symphonymph-2.8.0.exe'), 'another type');
});

test('a week is the sum of its days, and says which was busiest', async () => {
  const s = fakeStore();
  for (const [n, m] of [[1, 60], [1, 30], [2, 10], [9, 500]]) {
    await applyReport(s, parseBody(report({ days: [{ day: ago(n), minutes: m }] }), NOW));
  }
  const days = await readDays(s, 30, NOW);
  const week = summarise(days.slice(0, 7));
  assert.deepEqual([week.deviceDays, week.minutes, week.average, week.peak, week.peakDay], [3, 100, 33, 2, ago(1)]);
  assert.equal(summarise(days).deviceDays, 4, 'the month reaches the ninth day back');
  assert.deepEqual(week.versions, { '2.8.0 (261003239)': { devices: 3, minutes: 100 } });
});

test('the limiter stops a flood from one address and forgets after its window', () => {
  const allow = rateLimiter({ limit: 3, windowMs: 1000 });
  assert.deepEqual([1, 2, 3, 4].map(() => allow('1.2.3.4', 0)), [true, true, true, false]);
  assert.equal(allow('5.6.7.8', 0), true, 'another address is unaffected');
  assert.equal(allow('1.2.3.4', 1001), true, 'and the first is let back in');
  assert.equal(allow('', 0), true, 'no address is not a reason to refuse');
});

test('the stats key is compared whole, and nothing matches an unset key', async () => {
  assert.equal(await keyMatches('abc', 'abc'), true);
  assert.equal(await keyMatches('abd', 'abc'), false);
  assert.equal(await keyMatches('', 'abc'), false);
  assert.equal(await keyMatches(null, 'abc'), false);
  assert.equal(await keyMatches('abc', undefined), false);
  assert.equal(await keyMatches('', ''), false);
});

test('the stats page escapes what phones sent and has no em dash', async () => {
  const s = fakeStore();
  await applyReport(s, parseBody(report(), NOW));
  const html = statsPage(await readDays(s, 30, NOW), NOW);
  assert.match(html, /Last 7 days/);
  assert.match(html, /2\.8\.0 \(261003239\)/);
  assert.doesNotMatch(html, /[—–]/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /https?:\/\//, 'nothing is loaded from anywhere, so the key cannot leak');
});

// ----------------------------------------------------------- the function
const post = (body, headers = {}) => new Request('https://lavishleaf.org/.netlify/functions/app-usage', { method: 'POST', body, headers });
const today = () => dayKey(new Date());
const yesterday = () => dayKey(new Date(Date.now() - 86400000));
const live = (over = {}) => JSON.stringify({
  app: 'symphonymph', version: '2.8.0 (261003239)', platform: 'android', build: 'store',
  days: [{ day: yesterday(), minutes: 12 }], ...over,
});

test('POST: 204 with an empty body for a report, and the day is counted', async () => {
  const s = fakeStore(); setStoreForTests(s); resetRateLimitForTests();
  const res = await handler(post(live()), { ip: '10.0.0.1' });
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
  assert.equal(JSON.parse(s.m.get(`day/${yesterday()}`).json).devices, 1);
});

test('POST: a report whose days are all too old is still a 204, and writes nothing', async () => {
  const s = fakeStore(); setStoreForTests(s); resetRateLimitForTests();
  const res = await handler(post(live({ days: [{ day: '2026-01-01', minutes: 9 }] })), { ip: '10.0.0.1' });
  assert.equal(res.status, 204);
  assert.equal(s.writes, 0);
});

test('POST: malformed is 400, too large is 400, other methods are 405', async () => {
  setStoreForTests(fakeStore()); resetRateLimitForTests();
  assert.equal((await handler(post('{'), {})).status, 400);
  assert.equal((await handler(post(live({ app: 'x' })), {})).status, 400);
  assert.equal((await handler(post('x'.repeat(3000)), {})).status, 400);
  assert.equal((await handler(new Request('https://lavishleaf.org/.netlify/functions/app-usage', { method: 'PUT', body: '{}' }), {})).status, 405);
});

test('POST: one address is braked, and the address is never stored', async () => {
  const s = fakeStore(); setStoreForTests(s); resetRateLimitForTests({ limit: 2 });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await handler(post(live()), { ip: '203.0.113.9' })).status);
  assert.deepEqual(codes, [204, 204, 429, 429]);
  assert.equal(JSON.parse(s.m.get(`day/${yesterday()}`).json).devices, 2, 'the refused two were not counted');
  assert.doesNotMatch([...s.m.values()].map((e) => e.json).join(''), /203\.0\.113\.9/);
});

test('POST: a download tap lands on today', async () => {
  const s = fakeStore(); setStoreForTests(s); resetRateLimitForTests();
  const res = await handler(post(JSON.stringify({ app: 'symphonymph', download: 'symphonymph-2.8.0.apk' })), {});
  assert.equal(res.status, 204);
  assert.deepEqual(JSON.parse(s.m.get(`day/${today()}`).json).downloads, { 'symphonymph-2.8.0.apk': 1 });
});

test('GET: 404 without the key, with the wrong key, and when no key is set at all', async () => {
  setStoreForTests(fakeStore());
  const get = (q) => handler(new Request(`https://lavishleaf.org/.netlify/functions/app-usage${q}`), {});
  delete process.env.APP_STATS_KEY;
  assert.equal((await get('')).status, 404);
  assert.equal((await get('?key=anything')).status, 404, 'no key set means closed, not open');
  process.env.APP_STATS_KEY = 'correct horse';
  assert.equal((await get('')).status, 404);
  assert.equal((await get('?key=wrong')).status, 404);
  delete process.env.APP_STATS_KEY;
});

test('GET: the right key shows the page, private and unindexed; format=json gives the numbers', async () => {
  const s = fakeStore(); setStoreForTests(s); resetRateLimitForTests();
  await handler(post(live()), {});
  process.env.APP_STATS_KEY = 'correct horse';
  const page = await handler(new Request('https://lavishleaf.org/.netlify/functions/app-usage?key=correct%20horse'), {});
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  assert.match(await page.text(), /Symphonymph usage/);
  const json = await (await handler(new Request('https://lavishleaf.org/.netlify/functions/app-usage?key=correct%20horse&format=json'), {})).json();
  assert.equal(json.last7.deviceDays, 1);
  assert.equal(json.days.length, 30);
  delete process.env.APP_STATS_KEY;
});
