// POST /.netlify/functions/app-usage
//   The Symphonymph app, at most once a day per phone, no identifier:
//     { "app": "symphonymph", "version": "2.8.0 (261003239)",
//       "platform": "android" | "ios", "build": "store" | "alpha",
//       "days": [ { "day": "YYYY-MM-DD", "minutes": 0..1440 }, ... up to 7 ] }
//   A download button on lavishleaf.org, when it is tapped:
//     { "app": "symphonymph", "download": "symphonymph-2.8.0.apk" }
//   -> 204, always, once the body is well formed. 400 for a malformed body,
//      429 when one address sends too many, 405 for any other method.
//
// GET /.netlify/functions/app-usage?key=...      the owner's page
// GET /.netlify/functions/app-usage?key=...&format=json
//   The key is APP_STATS_KEY in Netlify's environment variables. With no key
//   set, or the wrong one, this answers 404 as if nothing were here.
//
// What is kept: one blob of sums per day in the Netlify Blobs store
// "app-usage". Never the request, never the IP address. The rules, and why
// a stale day is dropped rather than refused, are in netlify/lib/usage.mjs.
import {
  MAX_BODY, STORE_NAME, UsageError, applyDownload, applyReport, dayView,
  keyMatches, parseBody, rateLimiter, readDays, statsPage, summarise,
} from '../lib/usage.mjs';

let testStore = null;
export function setStoreForTests(s) { testStore = s; }
async function store() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore(STORE_NAME);
}

// In memory, per function instance, forgotten when the instance sleeps.
let allow = rateLimiter();
export function resetRateLimitForTests(options) { allow = rateLimiter(options); }

const empty = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
const PRIVATE = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  // The key rides in the address; it must not leave in a Referer header.
  'Referrer-Policy': 'no-referrer',
};

function callerIp(request, context) {
  return (context && context.ip) || request.headers.get('x-nf-client-connection-ip') || '';
}

async function stats(request) {
  const url = new URL(request.url);
  const ok = await keyMatches(url.searchParams.get('key'), process.env.APP_STATS_KEY);
  if (!ok) return new Response('Not found', { status: 404, headers: PRIVATE });
  const now = new Date();
  const days = await readDays(await store(), 30, now);
  if (url.searchParams.get('format') === 'json') {
    const body = {
      asOf: now.toISOString(),
      last7: summarise(days.slice(0, 7)),
      last30: summarise(days),
      days: days.map((d) => ({ ...dayView(d), by: d.by, files: d.downloads })),
    };
    return new Response(JSON.stringify(body, null, 1), { headers: { ...PRIVATE, 'Content-Type': 'application/json' } });
  }
  return new Response(statsPage(days, now), { headers: { ...PRIVATE, 'Content-Type': 'text/html; charset=utf-8' } });
}

export default async (request, context) => {
  try {
    if (request.method === 'GET') return await stats(request);
    if (request.method !== 'POST') return empty(405);

    // The address is looked at here and nowhere else, and never written.
    if (!allow(callerIp(request, context))) return empty(429);

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BODY) return empty(400);
    const parsed = parseBody(await request.text());

    const s = await store();
    if (parsed.kind === 'download') await applyDownload(s, parsed);
    else if (parsed.days.length) await applyReport(s, parsed);
    return empty(204);
  } catch (e) {
    if (e instanceof UsageError) return empty(e.status);
    // The store being down is ours to fix, not the phone's to retry into a
    // double count: nothing was written if we are here before applyReport,
    // and applyReport itself never throws.
    console.error('[app-usage] unexpected', e && e.message);
    return empty(503);
  }
};
