// GET /.netlify/functions/social-feed
//   -> { configured: { ig, fb }, ig: [card], fb: [card], fetched }
// Our latest Instagram and Facebook posts for social.html, cached in Netlify
// Blobs for 30 minutes so Meta is asked rarely. See netlify/lib/social.mjs.
import { getFeed } from '../lib/social.mjs';

let testStore = null;
export function setStoreForTests(s) { testStore = s; }
async function store() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore('social');
}

export default async (request) => {
  if (request.method !== 'GET') return new Response('GET only', { status: 405 });
  try {
    const feed = await getFeed(await store());
    return new Response(JSON.stringify({ configured: feed.configured, ig: feed.ig, fb: feed.fb, fetched: feed.fetched }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    console.error('[social-feed]', e);
    return new Response(JSON.stringify({ configured: { ig: false, fb: false }, ig: [], fb: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
