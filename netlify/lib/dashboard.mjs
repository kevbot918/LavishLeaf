// Everything the owner's dashboard shows, gathered on the server
// (2026-10-02, docs/DASHBOARD.md). Each source is its own section and fails
// on its own: an unconnected or broken source says so, with the fix, and the
// rest of the dashboard still loads.
//
//   ga       Google Analytics 4: visitors, pages, sources, clicks (events)
//   gsc      Google Search Console: what people searched on Google
//   social   Facebook and Instagram: followers and each post's likes,
//            comments and shares (the Page token the Social page already uses)
//   clarity  Microsoft Clarity: scroll, engagement, rage and dead clicks
//   forms    Netlify Forms: submissions per form
//   list     our newsletter list (netlify/lib/newsletter.mjs)
//   orders   paid orders (netlify/lib/orders.mjs) and saved carts
import { gaReport, googleReady, gscQuery } from './google.mjs';

const ok = (data) => ({ status: 'ok', data });
const setup = (message) => ({ status: 'setup', message });
const fail = (e) => ({ status: 'error', message: String((e && e.message) || e).slice(0, 300) });

const iso = (t) => new Date(t).toISOString().slice(0, 10);

// The day analytics.js began counting clicks on every page.
export const COUNTING_SINCE = '2026-10-02';

// The events analytics.js sends, in plain words for the page.
export const EVENTS = {
  sign_up_click: 'Sign-up buttons (compost, recycling, league)',
  add_to_cart: 'Added to cart',
  supplier_click: 'Opened a supplier page (demo store)',
  wish_list: 'Saved to a wish list',
  newsletter_signup: 'Joined the newsletter',
  contact_sent: 'Sent the contact form',
  donate_click: 'Opened the donate window',
  social_click: 'Clicked to Facebook, Instagram or YouTube',
  app_download: 'Downloaded Symphonymph',
  affiliate_click: 'Clicked a Green Swaps partner link',
  email_click: 'Clicked an email address',
  search: 'Searched the store',
};

// ------------------------------------------------------------ Google Analytics
export async function gaSection(days, env = process.env, fetchImpl = fetch) {
  if (!googleReady(env) || !env.GA4_PROPERTY_ID) return setup('Google Analytics is counting visits, but the dashboard cannot read it yet. Follow "Connect Google" in docs/DASHBOARD.md.');
  const cur = { startDate: `${days - 1}daysAgo`, endDate: 'today' };
  const prev = { startDate: `${2 * days - 1}daysAgo`, endDate: `${days}daysAgo` };
  const run = (body) => gaReport(body, env, fetchImpl);
  const r = await Promise.allSettled([
    run({ dateRanges: [cur], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 }),
    run({ dateRanges: [cur, prev], metrics: ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'averageSessionDuration', 'engagementRate'].map((name) => ({ name })) }),
    run({ dateRanges: [cur], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 }),
    run({ dateRanges: [cur], dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 }),
    run({ dateRanges: [cur], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 12 }),
    run({ dateRanges: [cur, prev], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: Object.keys(EVENTS) } } }, limit: 50 }),
    run({ dateRanges: [cur], dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }], limit: 5 }),
    run({ dateRanges: [cur], dimensions: [{ name: 'city' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 8 }),
    // These two need the custom dimensions "product" and "search_term"
    // registered in GA4 (docs/DASHBOARD.md); until then they come back empty.
    run({ dateRanges: [cur], dimensions: [{ name: 'eventName' }, { name: 'customEvent:product' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['sign_up_click', 'add_to_cart', 'supplier_click', 'wish_list'] } } }, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 40 }),
    run({ dateRanges: [cur], dimensions: [{ name: 'customEvent:search_term' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'search' } } }, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 15 }),
    // Symphonymph APK taps (owner, 2026-10-10): every day of the period, the
    // total since counting began, and which file (the "file" custom
    // dimension; empty until it is registered, like the two above).
    run({ dateRanges: [cur], dimensions: [{ name: 'date' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'app_download' } } }, orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 }),
    run({ dateRanges: [{ startDate: COUNTING_SINCE, endDate: 'today' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'app_download' } } } }),
    // By link (GA4's own linkUrl: no setup), all time.
    run({ dateRanges: [{ startDate: COUNTING_SINCE, endDate: 'today' }], dimensions: [{ name: 'linkUrl' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'app_download' } } }, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 20 }),
    // Partner (affiliate) clicks by link, this period and all time.
    run({ dateRanges: [cur], dimensions: [{ name: 'linkUrl' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'affiliate_click' } } }, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 60 }),
    run({ dateRanges: [{ startDate: COUNTING_SINCE, endDate: 'today' }], dimensions: [{ name: 'linkUrl' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'affiliate_click' } } }, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 60 }),
  ]);
  const v = (i) => (r[i].status === 'fulfilled' ? r[i].value : null);
  if (!v(0) && !v(1)) return fail(r[0].reason || r[1].reason);

  // Two date ranges come back as rows tagged date_range_0 / date_range_1.
  const byRange = (rows) => {
    const out = [{}, {}];
    for (const row of rows || []) {
      const which = row.dims[row.dims.length - 1] === 'date_range_1' ? 1 : 0;
      out[which] = row;
    }
    return out;
  };
  const totals = byRange(v(1));
  const names = ['visitors', 'newVisitors', 'visits', 'pageViews', 'avgVisitSeconds', 'engagementRate'];
  const pick = (row) => Object.fromEntries(names.map((n, i) => [n, row && row.vals ? row.vals[i] || 0 : 0]));

  const events = {};
  for (const row of v(5) || []) {
    const [name, range] = row.dims;
    events[name] = events[name] || { label: EVENTS[name] || name, now: 0, before: 0 };
    events[name][range === 'date_range_1' ? 'before' : 'now'] = row.vals[0];
  }
  const fmtDate = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return ok({
    daily: (v(0) || []).map((row) => ({ date: fmtDate(row.dims[0]), visitors: row.vals[0], pageViews: row.vals[1] })),
    totals: pick(totals[0]),
    before: pick(totals[1]),
    channels: (v(2) || []).map((row) => ({ name: row.dims[0], value: row.vals[0] })),
    sources: (v(3) || []).map((row) => ({ name: row.dims[0], value: row.vals[0] })),
    pages: (v(4) || []).map((row) => ({ name: row.dims[0], value: row.vals[0], people: row.vals[1] })),
    events: Object.entries(events).map(([k, e]) => ({ key: k, ...e })).sort((a, b) => b.now - a.now),
    devices: (v(6) || []).map((row) => ({ name: row.dims[0], value: row.vals[0] })),
    cities: (v(7) || []).filter((row) => row.dims[0] !== '(not set)').map((row) => ({ name: row.dims[0], value: row.vals[0] })),
    products: (v(8) || []).filter((row) => row.dims[1] && row.dims[1] !== '(not set)').map((row) => ({ event: row.dims[0], name: row.dims[1], value: row.vals[0] })),
    searches: (v(9) || []).filter((row) => row.dims[0] && row.dims[0] !== '(not set)').map((row) => ({ name: row.dims[0], value: row.vals[0] })),
    customDimensions: r[8].status === 'fulfilled',
    downloads: {
      daily: (v(10) || []).map((row) => ({ date: fmtDate(row.dims[0]), value: row.vals[0] })),
      allTime: ((v(11) || [])[0] || { vals: [0] }).vals[0],
      since: COUNTING_SINCE,
      byBuild: buildCounts(v(12) || []),
    },
    affiliates: { now: linkCounts(v(13) || []), allTime: linkCounts(v(14) || []) },
  });
}

/** APK taps by build: the alpha file says "alpha" in its name. */
function buildCounts(rows) {
  const out = { store: 0, alpha: 0, unknown: 0 };
  for (const row of rows) {
    const url = row.dims[0] || '';
    if (!url || url === '(not set)') out.unknown += row.vals[0];
    else if (/alpha/i.test(url)) out.alpha += row.vals[0];
    else out.store += row.vals[0];
  }
  return out;
}

/** Partner clicks by site and by link. */
function linkCounts(rows) {
  const bySite = {}, byLink = [];
  for (const row of rows) {
    const url = row.dims[0] || '';
    if (!url || url === '(not set)') continue;
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep it */ }
    bySite[host] = (bySite[host] || 0) + row.vals[0];
    byLink.push({ name: url.replace(/^https?:\/\/(www\.)?/, ''), value: row.vals[0] });
  }
  return { bySite: Object.entries(bySite).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), byLink };
}

// ------------------------------------------------------------ Search Console
export async function gscSection(days, env = process.env, fetchImpl = fetch) {
  if (!googleReady(env) || !env.GSC_SITE_URL) return setup('Search Console is not connected yet. Follow "Connect Google" in docs/DASHBOARD.md.');
  // Search Console's numbers arrive about two days late.
  const end = iso(Date.now() - 2 * 864e5);
  const start = iso(Date.now() - (days + 1) * 864e5);
  try {
    const [queries, pages, total] = await Promise.all([
      gscQuery({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 15 }, env, fetchImpl),
      gscQuery({ startDate: start, endDate: end, dimensions: ['page'], rowLimit: 8 }, env, fetchImpl),
      gscQuery({ startDate: start, endDate: end }, env, fetchImpl),
    ]);
    const t = total[0] || { clicks: 0, impressions: 0, position: 0 };
    return ok({
      from: start, to: end,
      clicks: t.clicks, impressions: t.impressions, position: t.position,
      queries: queries.map((q) => ({ name: q.keys[0], clicks: q.clicks, impressions: q.impressions, position: Math.round(q.position * 10) / 10 })),
      pages: pages.map((q) => ({ name: q.keys[0].replace(/^https?:\/\/[^/]+/, '') || '/', clicks: q.clicks, impressions: q.impressions })),
    });
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------ Facebook + Instagram
async function graph(url, fetchImpl) {
  const res = await fetchImpl(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json.error && json.error.message) || `Meta said ${res.status}`);
  return json;
}

export async function socialSection(env = process.env, fetchImpl = fetch) {
  const page = String(env.FB_PAGE_ID || '').trim();
  const token = String(env.FB_PAGE_TOKEN || '').trim();
  if (!page || !token) return setup('Facebook and Instagram are read with the same keys as the Social page (FB_PAGE_ID and FB_PAGE_TOKEN).');
  const t = encodeURIComponent(token);
  const G = 'https://graph.facebook.com';
  const out = { facebook: null, instagram: null, errors: [] };
  try {
    const info = await graph(`${G}/${page}?fields=name,followers_count,fan_count,instagram_business_account,connected_instagram_account&access_token=${t}`, fetchImpl);
    // The posts need the pages_read_user_content permission on the Page token
    // (docs/SOCIAL-FEEDS.md D1b); without it the followers still show.
    let posts = { data: [] };
    try {
      posts = await graph(`${G}/${page}/posts?fields=${encodeURIComponent('message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)')}&limit=25&access_token=${t}`, fetchImpl);
    } catch (e) {
      out.errors.push('Facebook posts: ' + String(e.message).slice(0, 160) + ' The fix is docs/SOCIAL-FEEDS.md, D1b and D2 (add pages_read_user_content, then a new Page key).');
    }
    out.facebook = {
      followers: info.followers_count ?? info.fan_count ?? null,
      posts: (posts.data || []).map((p) => {
        const likes = (p.reactions && p.reactions.summary && p.reactions.summary.total_count) || 0;
        const comments = (p.comments && p.comments.summary && p.comments.summary.total_count) || 0;
        const shares = (p.shares && p.shares.count) || 0;
        return { text: String(p.message || '').slice(0, 140), date: p.created_time, url: p.permalink_url, image: p.full_picture || null, likes, comments, shares, total: likes + comments + shares };
      }),
    };
    const igLink = info.instagram_business_account || info.connected_instagram_account;
    const ig = igLink && igLink.id;
    if (ig) {
      const acct = await graph(`${G}/${ig}?fields=username,followers_count,media_count&access_token=${t}`, fetchImpl);
      const media = await graph(`${G}/${ig}/media?fields=caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=25&access_token=${t}`, fetchImpl);
      out.instagram = {
        followers: acct.followers_count ?? null,
        posts: (media.data || []).map((m) => ({
          text: String(m.caption || '').slice(0, 140), date: m.timestamp, url: m.permalink,
          image: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) || null,
          likes: m.like_count || 0, comments: m.comments_count || 0, shares: 0,
          total: (m.like_count || 0) + (m.comments_count || 0),
        })),
      };
    } else {
      out.errors.push('Facebook did not return an Instagram account for this Page, so Instagram numbers are missing. Either Instagram is not linked to the Page as a professional account, or the Page key lacks an Instagram permission: docs/SOCIAL-FEEDS.md, "Instagram not showing".');
    }
  } catch (e) {
    if (!out.facebook) return fail(e);
    out.errors.push(String(e.message).slice(0, 200));
  }
  return ok(out);
}

// ------------------------------------------------------------ follower history
// Meta only reports today's follower count, so the dashboard keeps one
// reading a day (Blobs "dashboard", key "followers"): written whenever the
// dashboard loads and by the daily social-refresh function. Growth over 7,
// 28 or 90 days is today's count minus the reading from that many days ago,
// or from the oldest reading when the history is younger than that.
export function recordFollowers(history, social, now = Date.now()) {
  const list = Array.isArray(history) ? history.slice() : [];
  if (!social) return list;
  const fb = social.facebook ? social.facebook.followers : null;
  const ig = social.instagram ? social.instagram.followers : null;
  if (fb == null && ig == null) return list;
  const date = iso(now);
  const entry = { date, fb, ig };
  const i = list.findIndex((x) => x.date === date);
  if (i >= 0) list[i] = { date, fb: fb ?? list[i].fb, ig: ig ?? list[i].ig };
  else list.push(entry);
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list.slice(-400);
}

export function followerGrowth(history, days, now = Date.now()) {
  const list = Array.isArray(history) ? history : [];
  const today = list[list.length - 1];
  if (!today) return null;
  const want = iso(now - days * 864e5);
  // The newest reading on or before the start day, else the oldest one.
  let base = null;
  for (const x of list) { if (x.date <= want) base = x; }
  const complete = !!base;
  base = base || list[0];
  const gain = (k) => (today[k] == null || base[k] == null ? null : today[k] - base[k]);
  return { from: base.date, to: today.date, complete, facebook: gain('fb'), instagram: gain('ig'), readings: list.length };
}

export async function snapshotFollowers(cache, social, days) {
  const history = await cache.get('followers', { type: 'json' }).catch(() => null);
  const next = recordFollowers(history, social);
  if (next.length) await cache.setJSON('followers', next).catch(() => {});
  return days ? followerGrowth(next, days) : null;
}

// ------------------------------------------------------------ Clarity
export async function claritySection(cache, env = process.env, fetchImpl = fetch) {
  const token = env.CLARITY_API_TOKEN;
  if (!token) return setup('Clarity is recording visits (open clarity.microsoft.com for heatmaps). For its numbers here, add CLARITY_API_TOKEN (docs/DASHBOARD.md).');
  // Clarity allows 10 calls a day, so its answer is kept for 3 hours.
  const saved = await cache.get('clarity', { type: 'json' }).catch(() => null);
  if (saved && Date.now() - saved.at < 3 * 3600e3) return ok(saved.data);
  try {
    const res = await fetchImpl('https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(json)) throw new Error(`Clarity said ${res.status}`);
    const metric = (name) => {
      const m = json.find((x) => x && x.metricName === name);
      return (m && Array.isArray(m.information) && m.information[0]) || {};
    };
    const num = (v) => (v == null || v === '' ? null : Number(v));
    const data = {
      days: 3,
      sessions: num(metric('Traffic').totalSessionCount),
      people: num(metric('Traffic').distinctUserCount),
      pagesPerVisit: num(metric('Traffic').pagesPerSessionPercentage),
      scrollDepth: num(metric('ScrollDepth').averageScrollDepth),
      activeSeconds: num(metric('EngagementTime').activeTime),
      rageClicks: num(metric('RageClickCount').sessionsWithMetricPercentage),
      deadClicks: num(metric('DeadClickCount').sessionsWithMetricPercentage),
      quickBacks: num(metric('QuickbackClick').sessionsWithMetricPercentage),
      errors: num(metric('ScriptErrorCount').sessionsWithMetricPercentage),
    };
    await cache.setJSON('clarity', { at: Date.now(), data }).catch(() => {});
    return ok(data);
  } catch (e) {
    if (saved) return ok({ ...saved.data, stale: true });
    return fail(e);
  }
}

// ------------------------------------------------------------ Netlify Forms
export async function formsSection(env = process.env, fetchImpl = fetch) {
  const token = env.NETLIFY_API_TOKEN;
  const site = env.SITE_ID;
  if (!token || !site) return setup('For form counts here, add NETLIFY_API_TOKEN (docs/DASHBOARD.md). Every submission is always in Netlify under Forms.');
  try {
    const res = await fetchImpl(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(site)}/forms`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => []);
    if (!res.ok) throw new Error(`Netlify said ${res.status}`);
    return ok((Array.isArray(json) ? json : []).map((f) => ({ name: f.name, value: f.submission_count || 0 })).sort((a, b) => b.value - a.value));
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------ orders and carts
export function ordersSummary(orders, accounts, days, now = Date.now()) {
  const since = now - days * 864e5;
  const recent = orders.filter((o) => Date.parse(o.date) >= since);
  const sold = {};
  for (const o of recent) for (const i of o.items || []) sold[i.name] = (sold[i.name] || 0) + i.qty;
  return {
    count: recent.length,
    revenue: Math.round(recent.reduce((s, o) => s + (Number(o.total) || 0), 0) * 100) / 100,
    allTime: orders.length,
    latest: orders.slice(0, 8).map((o) => ({ id: o.id, date: o.date, total: o.total, items: (o.items || []).map((i) => `${i.name}${i.qty > 1 ? ' x' + i.qty : ''}`).join(', ') })),
    bestSellers: Object.entries(sold).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    accounts: accounts.length,
    openCarts: accounts.filter((a) => Array.isArray(a.cart) && a.cart.length).length,
  };
}
