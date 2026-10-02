// Anonymous usage counts for the Symphonymph app, and download taps for the
// site: everything netlify/functions/app-usage.mjs does, kept here so it can
// be tested without Netlify (tools/test/app-usage.test.mjs).
//
// The owner, 2026-10-02, to the app session: "basic analytics, but without
// any personal data being used". So, by construction:
//
//   * A report carries no identifier, and nothing here invents one. One
//     report is one phone on the days it names, which is why a day's
//     "devices" is simply how many reports named that day.
//   * ONLY AGGREGATES ARE STORED: one small JSON blob per day holding sums.
//     The request is never written anywhere, and neither is the IP address.
//     The rate limiter below remembers an IP in this process's memory for
//     ten minutes and nowhere else; it is gone when the function sleeps.
//   * The consequence, said on the stats page too: a week's figure is
//     device-DAYS, not people. The same phone cannot be recognised on two
//     days, because nothing lets us recognise it. That is the price of the
//     promise, and it is the right way round.
//
// The app's side is lib/core/usage_counts.dart in the app repository. Two
// facts about it shaped this file:
//
//   1. It treats ANY non-2xx reply as "not sent" and sends the same days
//      again at its next start. So a report is refused (400) only when it
//      is malformed, which a real app never sends. A well-formed report
//      naming a day too old to count is ANSWERED 204 with that day dropped;
//      refusing it would make a phone that was shut for three weeks retry
//      for ever and never be counted again.
//   2. For the same reason nothing fails after the first write: once a
//      report is accepted the reply is 204 even if a later day's write lost
//      a race, because a resend would count the earlier days twice. An
//      undercount under contention is the lesser error.

export const MAX_BODY = 2048;        // bytes
export const MAX_DAYS = 7;           // per report; the app's own cap
export const WINDOW_DAYS = 14;       // how far back a day may be and still count
export const MAX_SPLITS = 80;        // distinct platform|build|version rows kept per day
export const STORE_NAME = 'app-usage';

const PLATFORMS = ['android', 'ios'];
const BUILDS = ['store', 'alpha'];
const VERSION = /^[0-9A-Za-z][0-9A-Za-z .()+_-]{0,39}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
// The files the site actually serves: downloads/symphonymph[-alpha][-X.Y.Z].apk
const APK = /^symphonymph(-alpha)?(-\d{1,3}\.\d{1,3}\.\d{1,3})?\.apk$/;

export class UsageError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (why) => new UsageError(400, why);

/** "2026-10-02" for a Date, in UTC. */
export function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

/** A real calendar day, or null. "2026-02-30" is not one. */
function realDay(text) {
  const m = typeof text === 'string' ? DAY.exec(text) : null;
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return dayKey(new Date(t)) === text ? t : null;
}

/**
 * The body of a POST, checked. Returns one of
 *   { kind: 'report', platform, build, version, days: [{day, minutes}], dropped }
 *   { kind: 'download', file, day }
 * and throws a 400 UsageError for anything a real sender never produces.
 * `days` holds only the days that are inside the window; `dropped` counts
 * the well-formed ones that were outside it (see the note at the top).
 */
export function parseBody(text, now = new Date()) {
  if (typeof text !== 'string' || text.length === 0) throw bad('empty');
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY) throw bad('too large');
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    throw bad('not json');
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw bad('not an object');
  if (o.app !== 'symphonymph') throw bad('app');

  if ('download' in o) {
    if (typeof o.download !== 'string' || !APK.test(o.download)) throw bad('download');
    return { kind: 'download', file: o.download, day: dayKey(now) };
  }

  if (!PLATFORMS.includes(o.platform)) throw bad('platform');
  if (!BUILDS.includes(o.build)) throw bad('build');
  if (typeof o.version !== 'string' || !VERSION.test(o.version.trim())) throw bad('version');
  if (!Array.isArray(o.days) || o.days.length < 1 || o.days.length > MAX_DAYS) throw bad('days');

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const oldest = today - WINDOW_DAYS * 86400000;
  // A phone's local "yesterday" can be the server's today, never later.
  const newest = today;
  const seen = new Set();
  const days = [];
  let dropped = 0;
  for (const d of o.days) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw bad('day entry');
    const t = realDay(d.day);
    if (t == null) throw bad('day');
    if (!Number.isInteger(d.minutes) || d.minutes < 0 || d.minutes > 1440) throw bad('minutes');
    if (seen.has(d.day)) throw bad('day twice');
    seen.add(d.day);
    if (t < oldest || t > newest) dropped += 1;
    else days.push({ day: d.day, minutes: d.minutes });
  }
  return { kind: 'report', platform: o.platform, build: o.build, version: o.version.trim(), days, dropped };
}

/** An empty day. */
function blank(day) {
  return { v: 1, day, devices: 0, minutes: 0, by: {}, downloads: {} };
}

/** A stored day, tolerated: whatever is there, in the shape this file expects. */
function shaped(rec, day) {
  const out = blank(day);
  if (!rec || typeof rec !== 'object') return out;
  out.devices = Number.isFinite(rec.devices) ? rec.devices : 0;
  out.minutes = Number.isFinite(rec.minutes) ? rec.minutes : 0;
  if (rec.by && typeof rec.by === 'object') out.by = rec.by;
  if (rec.downloads && typeof rec.downloads === 'object') out.downloads = rec.downloads;
  return out;
}

/**
 * Read, change, write, and try again if somebody else wrote in between.
 * Two phones reporting the same day at the same moment would otherwise both
 * read 41 and both write 42. Netlify Blobs answers a conditional write with
 * { modified: false } when the blob changed under us; a store that knows
 * nothing of conditions simply writes, which is the old behaviour.
 */
export async function update(store, key, change, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const cur = await store.getWithMetadata(key, { type: 'json' });
    const next = change(cur ? cur.data : null);
    const cond = cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true };
    const res = await store.setJSON(key, next, cond);
    if (!res || res.modified !== false) return true;
  }
  return false;
}

const keyFor = (day) => `day/${day}`;

/** Add one phone's report to the days it names. Returns how many days were written. */
export async function applyReport(store, report) {
  const split = `${report.platform}|${report.build}|${report.version}`;
  let written = 0;
  for (const { day, minutes } of report.days) {
    const ok = await update(store, keyFor(day), (rec) => {
      const d = shaped(rec, day);
      d.devices += 1;
      d.minutes += minutes;
      // A version is free text, so somebody could invent thousands. Past the
      // cap a new one is counted under "other" and the totals stay right.
      const k = d.by[split] || Object.keys(d.by).length < MAX_SPLITS
        ? split
        : `${report.platform}|${report.build}|other`;
      const row = d.by[k] || { devices: 0, minutes: 0 };
      row.devices += 1;
      row.minutes += minutes;
      d.by[k] = row;
      return d;
    }).catch((e) => {
      console.error('[app-usage] write failed', day, e && e.message);
      return false;
    });
    if (ok) written += 1;
  }
  return written;
}

/** Count one tap on a download button on the site. */
export async function applyDownload(store, { file, day }) {
  return update(store, keyFor(day), (rec) => {
    const d = shaped(rec, day);
    d.downloads[file] = (d.downloads[file] || 0) + 1;
    return d;
  }).catch((e) => {
    console.error('[app-usage] download write failed', e && e.message);
    return false;
  });
}

/** The last `n` days, newest first, every day present (empty ones as zeros). */
export async function readDays(store, n, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(dayKey(new Date(today - i * 86400000)));
  const recs = await Promise.all(keys.map((day) =>
    store.get(keyFor(day), { type: 'json' }).catch(() => null).then((r) => shaped(r, day))));
  return recs;
}

/** One day, with the splits a reader wants already summed. */
export function dayView(d) {
  const v = {
    day: d.day, devices: d.devices, minutes: d.minutes,
    average: d.devices ? Math.round(d.minutes / d.devices) : 0,
    android: 0, ios: 0, store: 0, alpha: 0,
    androidMinutes: 0, iosMinutes: 0, storeMinutes: 0, alphaMinutes: 0,
    downloads: Object.values(d.downloads).reduce((a, b) => a + (Number(b) || 0), 0),
  };
  for (const [k, row] of Object.entries(d.by)) {
    const [platform, build] = k.split('|');
    if (platform in v) { v[platform] += row.devices; v[`${platform}Minutes`] += row.minutes; }
    if (build in v) { v[build] += row.devices; v[`${build}Minutes`] += row.minutes; }
  }
  return v;
}

/** Sums over a run of days. "deviceDays" on purpose: see the note at the top. */
export function summarise(days) {
  const s = {
    days: days.length, deviceDays: 0, minutes: 0, average: 0, peak: 0, peakDay: null,
    android: 0, ios: 0, store: 0, alpha: 0, downloads: 0, versions: {}, files: {},
  };
  for (const d of days) {
    const v = dayView(d);
    s.deviceDays += v.devices;
    s.minutes += v.minutes;
    s.android += v.android; s.ios += v.ios; s.store += v.store; s.alpha += v.alpha;
    s.downloads += v.downloads;
    if (v.devices > s.peak) { s.peak = v.devices; s.peakDay = v.day; }
    for (const [k, row] of Object.entries(d.by)) {
      const version = k.split('|').slice(2).join('|');
      const cur = s.versions[version] || { devices: 0, minutes: 0 };
      cur.devices += row.devices; cur.minutes += row.minutes;
      s.versions[version] = cur;
    }
    for (const [f, n] of Object.entries(d.downloads)) s.files[f] = (s.files[f] || 0) + (Number(n) || 0);
  }
  s.average = s.deviceDays ? Math.round(s.minutes / s.deviceDays) : 0;
  return s;
}

/**
 * A light brake, in this process's memory only. Returns true when the caller
 * may go on. Never written anywhere: when the function instance goes, so
 * does every address it saw.
 */
export function rateLimiter({ limit = 12, windowMs = 10 * 60 * 1000, max = 5000 } = {}) {
  const hits = new Map();
  return function allow(ip, now = Date.now()) {
    if (!ip) return true;
    if (hits.size > max) hits.clear();
    const fresh = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (fresh.length >= limit) { hits.set(ip, fresh); return false; }
    fresh.push(now);
    hits.set(ip, fresh);
    return true;
  };
}

/** Does the key in the address match the one in Netlify's settings? */
export async function keyMatches(given, expected) {
  if (!expected || typeof given !== 'string' || !given) return false;
  const { createHash, timingSafeEqual } = await import('node:crypto');
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// ------------------------------------------------------------- the stats page
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => Number(n).toLocaleString('en-US');
const hours = (m) => (m < 120 ? `${num(m)} min` : `${num(Math.round(m / 6) / 10)} h`);

function card(title, s) {
  return `<section class="card"><h2>${esc(title)}</h2>
<dl>
<dt>Active devices, summed over the days</dt><dd>${num(s.deviceDays)}</dd>
<dt>Busiest day</dt><dd>${s.peakDay ? `${num(s.peak)} on ${esc(s.peakDay)}` : 'none yet'}</dd>
<dt>Time listened</dt><dd>${hours(s.minutes)}</dd>
<dt>Average per active device, per day</dt><dd>${num(s.average)} min</dd>
<dt>Android / iPhone</dt><dd>${num(s.android)} / ${num(s.ios)}</dd>
<dt>Store / Alpha</dt><dd>${num(s.store)} / ${num(s.alpha)}</dd>
<dt>Download taps on the website</dt><dd>${num(s.downloads)}</dd>
</dl></section>`;
}

function rows(obj, cells) {
  const keys = Object.keys(obj).sort((a, b) => cells(obj[b])[0] - cells(obj[a])[0] || a.localeCompare(b));
  if (!keys.length) return '<tr><td colspan="3" class="none">Nothing yet.</td></tr>';
  return keys.map((k) => `<tr><th scope="row">${esc(k)}</th>${cells(obj[k]).map((c) => `<td>${num(c)}</td>`).join('')}</tr>`).join('\n');
}

/** The owner's page: the last 7 and 30 days, then every day. Plain HTML, nothing loaded from anywhere. */
export function statsPage(days, now = new Date()) {
  const week = summarise(days.slice(0, 7));
  const month = summarise(days.slice(0, 30));
  const table = days.slice(0, 30).map((d) => {
    const v = dayView(d);
    return `<tr><th scope="row">${esc(v.day)}</th><td>${num(v.devices)}</td><td>${hours(v.minutes)}</td><td>${num(v.average)}</td><td>${num(v.android)}</td><td>${num(v.ios)}</td><td>${num(v.store)}</td><td>${num(v.alpha)}</td><td>${num(v.downloads)}</td></tr>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Symphonymph usage: Lavish Leaf</title>
<style>
:root { color-scheme: dark; }
body { margin: 0; padding: 28px 20px 60px; background: #3d3d3d; color: #F2F4F2; font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif; }
main { max-width: 1040px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
h2 { font-size: 1.05rem; margin: 0 0 12px; color: #6FD65F; }
p { color: #C8CFC8; margin: 0 0 14px; max-width: 70ch; }
.cards { display: flex; flex-wrap: wrap; gap: 16px; margin: 22px 0; }
.card { flex: 1 1 320px; background: #2e2e2e; border: 1px solid #565656; border-radius: 10px; padding: 18px 20px; }
dl { display: grid; grid-template-columns: 1fr auto; gap: 6px 18px; margin: 0; }
dt { color: #C8CFC8; } dd { margin: 0; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.scroll { overflow-x: auto; background: #2e2e2e; border: 1px solid #565656; border-radius: 10px; margin: 0 0 22px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 8px 12px; text-align: right; white-space: nowrap; border-bottom: 1px solid #474747; }
thead th { color: #C8CFC8; font-weight: 600; font-size: .86rem; }
th[scope="row"], thead th:first-child { text-align: left; }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
.none { text-align: left; color: #C8CFC8; }
.fine { font-size: .9rem; }
</style></head><body><main>
<h1>Symphonymph usage</h1>
<p>As of ${esc(now.toISOString().slice(0, 16).replace('T', ' '))} UTC. Days are UTC days.</p>
<div class="cards">
${card('Last 7 days', week)}
${card('Last 30 days', month)}
</div>
<h2>Day by day</h2>
<div class="scroll"><table>
<thead><tr><th>Day</th><th>Active devices</th><th>Listened</th><th>Avg min</th><th>Android</th><th>iPhone</th><th>Store</th><th>Alpha</th><th>Download taps</th></tr></thead>
<tbody>
${table}
</tbody></table></div>
<h2>Versions, last 30 days</h2>
<div class="scroll"><table>
<thead><tr><th>Version</th><th>Active devices, summed</th><th>Minutes</th></tr></thead>
<tbody>
${rows(month.versions, (r) => [r.devices, r.minutes])}
</tbody></table></div>
<h2>Download taps by file, last 30 days</h2>
<div class="scroll"><table>
<thead><tr><th>File</th><th>Taps</th></tr></thead>
<tbody>
${rows(month.files, (n) => [n])}
</tbody></table></div>
<p class="fine"><strong>How to read this.</strong> A phone with the counts switched on sends one anonymous message a day, naming the earlier days it was opened and the minutes listened on each. It carries no identifier, so a day's active devices is a true count of phones for that day, but a week's or a month's figure is those days added up: a phone used on five days counts five times. That is the cost of never being able to recognise a phone, and it is deliberate.</p>
<p class="fine">A day keeps rising for up to a week, because a phone reports a day the next time it is opened. Phones with the switch off, and versions before 2.8, are not here at all. Download taps are taps on the download buttons on lavishleaf.org, not finished installs, and not downloads from a store.</p>
<p class="fine">Only these totals are kept. No message and no IP address is stored.</p>
</main></body></html>`;
}
