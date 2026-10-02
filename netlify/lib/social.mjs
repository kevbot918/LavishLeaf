// Our own Instagram and Facebook posts, for the Social page (2026-10-01).
//
// The owner: Behold's free tier shows six Instagram posts, and Facebook's
// Page plugin draws every post in one long column. So the site reads its own
// posts from Meta and draws each one as a card (social-feed.js):
//
//   Instagram  graph.instagram.com/me/media, with a long-lived token from
//              "Instagram API with Instagram Login" (a Business or Creator
//              account). The token lasts 60 days and must be refreshed while
//              it is valid; social-refresh.mjs does that every day and keeps
//              the newest token in Blobs, because an environment variable
//              cannot be rewritten from a function.
//   Facebook   graph.facebook.com/{page-id}/posts, with a Page access token
//              (a long-lived Page token does not expire).
//   Instagram, the simpler way (2026-10-02, after Meta's tester form refused
//              the account): when the Instagram account is linked to the
//              Facebook Page, the SAME Page token reads it through
//              graph.facebook.com/{page}?fields=instagram_business_account
//              and then /{ig-id}/media. No IG_ACCESS_TOKEN, no tester, no
//              60-day refresh. Used whenever IG_ACCESS_TOKEN is not set.
//
// Environment (Netlify, never in this repository):
//   IG_ACCESS_TOKEN   the first long-lived Instagram token
//   FB_PAGE_ID        the Lavish Leaf page's numeric id
//   FB_PAGE_TOKEN     a long-lived Page access token
// Missing values just mean that network is not configured; the page falls
// back to the Behold widget and the Page plugin. Setup: docs/SOCIAL-FEEDS.md.

// How many posts the Social page shows per network (owner, 2026-10-02:
// "can we include more than 24?"). Meta hands posts over in pages; getPaged
// follows them until it has this many.
export const MAX_POSTS = 60;
const PAGE_SIZE = 50;
export const STALE_MS = 30 * 60 * 1000; // re-read Meta at most every 30 minutes
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // refresh the IG token weekly

const https = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
const text = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Instagram media, as cards. A video shows its thumbnail. */
export function normalizeInstagram(json) {
  return (Array.isArray(json && json.data) ? json.data : []).slice(0, MAX_POSTS).map((m) => ({
    id: String(m.id),
    image: https(m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) || https(m.thumbnail_url),
    video: m.media_type === 'VIDEO',
    album: m.media_type === 'CAROUSEL_ALBUM',
    text: text(m.caption, 400),
    url: https(m.permalink),
    date: typeof m.timestamp === 'string' ? m.timestamp : null,
  })).filter((m) => m.url && /^https:\/\/(www\.)?instagram\.com\//.test(m.url));
}

/** Facebook Page posts, as cards. A text-only post has no image. */
export function normalizeFacebook(json) {
  return (Array.isArray(json && json.data) ? json.data : []).slice(0, MAX_POSTS).map((p) => {
    const att = p.attachments && Array.isArray(p.attachments.data) ? p.attachments.data[0] : null;
    return {
      id: String(p.id),
      image: https(p.full_picture),
      video: !!(att && /video/i.test(att.media_type || '')),
      text: text(p.message || (att && (att.title || att.description)) || '', 600),
      url: https(p.permalink_url),
      date: typeof p.created_time === 'string' ? p.created_time : null,
    };
  }).filter((p) => p.url && /^https:\/\/(www\.|m\.)?facebook\.com\//.test(p.url) && (p.text || p.image));
}

/** Every page of a Meta list until MAX_POSTS items, as one { data } object. */
async function getPaged(url, fetchImpl) {
  const data = [];
  let next = url;
  for (let i = 0; next && data.length < MAX_POSTS && i < 5; i++) {
    const json = await getJson(next, fetchImpl);
    if (Array.isArray(json.data)) data.push(...json.data);
    const n = json.paging && json.paging.next;
    next = typeof n === 'string' && /^https:\/\/graph\.(instagram|facebook)\.com\//.test(n) ? n : null;
  }
  return { data: data.slice(0, MAX_POSTS) };
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[social]', url.split('?')[0], res.status, JSON.stringify(json).slice(0, 300));
    // Meta's own sentence (never the token), so the owner can read it at
    // /.netlify/functions/social-feed under "status".
    const msg = json && json.error && json.error.message ? String(json.error.message) : 'no message';
    throw new Error(`Meta said ${res.status}: ${msg.replace(/access_token=[^&\s]+/g, 'access_token=...').slice(0, 300)}`);
  }
  return json;
}

export async function fetchInstagram(token, fetchImpl = fetch) {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
  const url = `https://graph.instagram.com/me/media?fields=${fields}&limit=${PAGE_SIZE}&access_token=${encodeURIComponent(token)}`;
  return normalizeInstagram(await getPaged(url, fetchImpl));
}

export async function fetchFacebook(pageId, token, fetchImpl = fetch) {
  if (!/^\d{5,25}$/.test(String(pageId))) throw new Error('FB_PAGE_ID must be only the Page ID digits (it looks like something else is in it)');
  const fields = 'id,message,full_picture,permalink_url,created_time,attachments{media_type,title,description}';
  const url = `https://graph.facebook.com/${pageId}/posts?fields=${encodeURIComponent(fields)}&limit=${PAGE_SIZE}&access_token=${encodeURIComponent(token)}`;
  return normalizeFacebook(await getPaged(url, fetchImpl));
}

/** Instagram through the linked Facebook Page, with the Page token. */
export async function fetchInstagramViaPage(pageId, pageToken, fetchImpl = fetch) {
  if (!/^\d{5,25}$/.test(String(pageId))) throw new Error('FB_PAGE_ID must be the numeric page id');
  const page = await getJson(`https://graph.facebook.com/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(pageToken)}`, fetchImpl);
  const igId = page.instagram_business_account && page.instagram_business_account.id;
  if (!igId || !/^\d{5,30}$/.test(String(igId))) throw new Error('no Instagram account is linked to the Page');
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
  return normalizeInstagram(await getPaged(`https://graph.facebook.com/${igId}/media?fields=${fields}&limit=${PAGE_SIZE}&access_token=${encodeURIComponent(pageToken)}`, fetchImpl));
}

/** The Instagram token to use: the newest refreshed one, else the env's. */
export async function instagramToken(store, env = process.env) {
  const saved = store ? await store.get('ig-token', { type: 'json' }).catch(() => null) : null;
  return (saved && saved.token) || env.IG_ACCESS_TOKEN || '';
}

/** Refresh the long-lived Instagram token if it is a week old. */
export async function refreshInstagramToken(store, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const saved = await store.get('ig-token', { type: 'json' }).catch(() => null);
  const token = (saved && saved.token) || env.IG_ACCESS_TOKEN;
  if (!token) return { refreshed: false, reason: 'no token' };
  if (saved && saved.refreshed && now - Date.parse(saved.refreshed) < REFRESH_AFTER_MS) {
    return { refreshed: false, reason: 'fresh' };
  }
  const json = await getJson(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, fetchImpl);
  if (!json.access_token) throw new Error('no token in refresh reply');
  await store.setJSON('ig-token', { token: json.access_token, refreshed: new Date(now).toISOString(), expiresIn: json.expires_in || null });
  return { refreshed: true };
}

/**
 * The feed, from the cache when it is fresh, else from Meta. One network
 * failing keeps its last good posts rather than going blank.
 */
export async function getFeed(store, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const igToken = await instagramToken(store, env);
  const pageId = String(env.FB_PAGE_ID || '').trim();
  const pageToken = String(env.FB_PAGE_TOKEN || '').trim();
  const page = !!(pageId && pageToken);
  const configured = { ig: !!igToken || page, fb: page };
  // Which keys this cache was made with: a changed key in Netlify makes the
  // cache stale at once instead of after 30 minutes. Only lengths and the
  // last few characters, never a whole token.
  const keys = [igToken.length, igToken.slice(-6), pageId, pageToken.length, pageToken.slice(-6)].join('|');
  const cached = await store.get('feed', { type: 'json' }).catch(() => null);
  if (cached && cached.keys === keys && cached.fetched && now - Date.parse(cached.fetched) < STALE_MS) return cached;
  const feed = {
    configured, keys,
    ig: (cached && cached.ig) || [], fb: (cached && cached.fb) || [],
    status: { ig: configured.ig ? 'ok' : 'not set up', fb: page ? 'ok' : 'not set up (FB_PAGE_ID and FB_PAGE_TOKEN)' },
    fetched: new Date(now).toISOString(),
  };
  if (configured.ig) {
    try {
      feed.ig = igToken
        ? await fetchInstagram(igToken, fetchImpl)
        : await fetchInstagramViaPage(pageId, pageToken, fetchImpl);
      feed.status.ig = `ok, ${feed.ig.length} posts`;
    } catch (e) { feed.status.ig = 'error: ' + e.message; /* keep the last good posts */ }
  }
  if (configured.fb) {
    try {
      feed.fb = await fetchFacebook(pageId, pageToken, fetchImpl);
      feed.status.fb = `ok, ${feed.fb.length} posts`;
    } catch (e) { feed.status.fb = 'error: ' + e.message; }
  }
  if (configured.ig || configured.fb) await store.setJSON('feed', feed).catch(() => {});
  return feed;
}
