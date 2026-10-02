// The Social page's own feed (netlify/lib/social.mjs), without Meta.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFeed, normalizeFacebook, normalizeInstagram, refreshInstagramToken, STALE_MS } from '../../netlify/lib/social.mjs';

function fakeStore() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
  };
}

test('Instagram: a video shows its thumbnail, only instagram.com links survive', () => {
  const out = normalizeInstagram({ data: [
    { id: '1', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg', permalink: 'https://www.instagram.com/p/A/', caption: 'Compost  day', timestamp: '2026-09-30T10:00:00+0000' },
    { id: '2', media_type: 'VIDEO', media_url: 'https://cdn/v.mp4', thumbnail_url: 'https://cdn/t.jpg', permalink: 'https://www.instagram.com/reel/B/' },
    { id: '3', media_type: 'IMAGE', media_url: 'https://cdn/x.jpg', permalink: 'javascript:alert(1)' },
  ] });
  assert.equal(out.length, 2);
  assert.equal(out[0].text, 'Compost day');
  assert.deepEqual([out[1].image, out[1].video], ['https://cdn/t.jpg', true]);
});

test('Facebook: text-only posts are kept, each post is its own card', () => {
  const out = normalizeFacebook({ data: [
    { id: 'p1', message: 'League starts Sunday!', permalink_url: 'https://www.facebook.com/LavishLeafInc/posts/1', created_time: '2026-09-29T12:00:00+0000' },
    { id: 'p2', full_picture: 'https://scontent/x.jpg', permalink_url: 'https://www.facebook.com/photo/2', attachments: { data: [{ media_type: 'photo', title: 'Farm day' }] } },
    { id: 'p3', permalink_url: 'https://www.facebook.com/x/3' },
  ] });
  assert.equal(out.length, 2, 'an empty post is dropped');
  assert.equal(out[0].image, null);
  assert.equal(out[1].text, 'Farm day');
});

test('the feed: not configured asks nobody; configured is cached for 30 minutes', async () => {
  const store = fakeStore();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes('graph.instagram.com/me/media')) return new Response(JSON.stringify({ data: [{ id: '1', media_type: 'IMAGE', media_url: 'https://c/a.jpg', permalink: 'https://www.instagram.com/p/A/' }] }));
    return new Response(JSON.stringify({ data: [{ id: 'p1', message: 'Hi', permalink_url: 'https://www.facebook.com/p/1' }] }));
  };
  const none = await getFeed(store, {}, fetchImpl);
  assert.deepEqual([none.configured, calls], [{ ig: false, fb: false }, 0]);

  const env = { IG_ACCESS_TOKEN: 'IGT', FB_PAGE_ID: '1234567890', FB_PAGE_TOKEN: 'FBT' };
  const t0 = Date.now();
  const first = await getFeed(store, env, fetchImpl, t0);
  assert.equal(first.ig.length + first.fb.length, 2);
  assert.equal(calls, 2);
  await getFeed(store, env, fetchImpl, t0 + 60_000);
  assert.equal(calls, 2, 'served from the cache');
  await getFeed(store, env, fetchImpl, t0 + STALE_MS + 1);
  assert.equal(calls, 4, 'stale: read again');
});

test('a Meta failure keeps the last good posts', async () => {
  const store = fakeStore();
  const env = { IG_ACCESS_TOKEN: 'IGT' };
  const ok = async () => new Response(JSON.stringify({ data: [{ id: '1', media_type: 'IMAGE', media_url: 'https://c/a.jpg', permalink: 'https://www.instagram.com/p/A/' }] }));
  const bad = async () => new Response('{"error":{}}', { status: 400 });
  const t0 = Date.now();
  await getFeed(store, env, ok, t0);
  const later = await getFeed(store, env, bad, t0 + STALE_MS + 1);
  assert.equal(later.ig.length, 1);
});

test('the Instagram token is refreshed weekly and the new one is used', async () => {
  const store = fakeStore();
  const env = { IG_ACCESS_TOKEN: 'OLD' };
  const seen = [];
  const fetchImpl = async (url) => { seen.push(url); return new Response(JSON.stringify({ access_token: 'NEW', expires_in: 5184000 })); };
  const t0 = Date.parse('2026-10-01T00:00:00Z');
  assert.deepEqual(await refreshInstagramToken(store, env, fetchImpl, t0), { refreshed: true });
  assert.match(seen[0], /access_token=OLD/);
  assert.equal((await refreshInstagramToken(store, env, fetchImpl, t0 + 86_400_000)).reason, 'fresh');
  await refreshInstagramToken(store, env, fetchImpl, t0 + 8 * 86_400_000);
  assert.match(seen[1], /access_token=NEW/);
});

test('with only the Page token, Instagram is read through the linked Page', async () => {
  const store = fakeStore();
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url.split('?')[0]);
    if (url.includes('fields=instagram_business_account')) return new Response(JSON.stringify({ instagram_business_account: { id: '17841400000000000' } }));
    if (url.includes('/17841400000000000/media')) return new Response(JSON.stringify({ data: [{ id: '9', media_type: 'IMAGE', media_url: 'https://c/a.jpg', permalink: 'https://www.instagram.com/p/Z/' }] }));
    return new Response(JSON.stringify({ data: [{ id: 'p1', message: 'Hi', permalink_url: 'https://www.facebook.com/p/1' }] }));
  };
  const feed = await getFeed(store, { FB_PAGE_ID: '1234567890', FB_PAGE_TOKEN: 'PT' }, fetchImpl);
  assert.deepEqual(feed.configured, { ig: true, fb: true });
  assert.equal(feed.ig.length, 1);
  assert.equal(feed.fb.length, 1);
  assert.ok(urls.includes('https://graph.facebook.com/17841400000000000/media'));
});

test('more than one page of posts is followed, up to MAX_POSTS', async () => {
  const { fetchInstagram, MAX_POSTS } = await import('../../netlify/lib/social.mjs');
  let calls = 0;
  const page = (start, n, next) => ({ data: Array.from({ length: n }, (_, i) => ({ id: String(start + i), media_type: 'IMAGE', media_url: 'https://c/x.jpg', permalink: 'https://www.instagram.com/p/' + (start + i) + '/' })), paging: next ? { next } : {} });
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes('after=2')) return new Response(JSON.stringify(page(100, 15, null)));
    return new Response(JSON.stringify(page(0, 15, 'https://graph.instagram.com/v1/me/media?after=2')));
  };
  const posts = await fetchInstagram('T', fetchImpl);
  assert.equal(posts.length, MAX_POSTS);
  assert.equal(calls, 2);
});

test('a Facebook refusal is reported in status, in Meta\'s words, without the token', async () => {
  const store = fakeStore();
  const fetchImpl = async (url) => {
    if (url.includes('graph.instagram.com')) return new Response(JSON.stringify({ data: [] }));
    return new Response(JSON.stringify({ error: { message: '(#10) This endpoint requires the pages_read_engagement permission' } }), { status: 400 });
  };
  const feed = await getFeed(store, { IG_ACCESS_TOKEN: 'IGT', FB_PAGE_ID: '1234567890', FB_PAGE_TOKEN: 'SECRETPAGETOKEN' }, fetchImpl);
  assert.match(feed.status.fb, /pages_read_engagement/);
  assert.ok(!JSON.stringify(feed.status).includes('SECRETPAGETOKEN'));
  const bad = await getFeed(fakeStore(), { FB_PAGE_ID: 'EAAabc', FB_PAGE_TOKEN: 'X' }, fetchImpl);
  assert.match(bad.status.fb, /Page ID digits/);
});
