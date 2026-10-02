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
  });
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
    const info = await graph(`${G}/${page}?fields=name,followers_count,fan_count,instagram_business_account&access_token=${t}`, fetchImpl);
    const posts = await graph(`${G}/${page}/posts?fields=${encodeURIComponent('message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)')}&limit=25&access_token=${t}`, fetchImpl);
    out.facebook = {
      followers: info.followers_count ?? info.fan_count ?? null,
      posts: (posts.data || []).map((p) => {
        const likes = (p.reactions && p.reactions.summary && p.reactions.summary.total_count) || 0;
        const comments = (p.comments && p.comments.summary && p.comments.summary.total_count) || 0;
        const shares = (p.shares && p.shares.count) || 0;
        return { text: String(p.message || '').slice(0, 140), date: p.created_time, url: p.permalink_url, image: p.full_picture || null, likes, comments, shares, total: likes + comments + shares };
      }),
    };
    const ig = info.instagram_business_account && info.instagram_business_account.id;
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
      out.errors.push('No Instagram account is linked to the Facebook Page, so Instagram numbers are missing.');
    }
  } catch (e) {
    if (!out.facebook) return fail(e);
    out.errors.push(String(e.message).slice(0, 200));
  }
  return ok(out);
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
