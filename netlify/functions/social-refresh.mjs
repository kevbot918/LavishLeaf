// Scheduled, once a day: keep the Instagram token alive (it expires 60 days
// after it was last refreshed) and warm the feed cache. Netlify runs this on
// its own schedule; nothing calls it from the site. See netlify/lib/social.mjs.
import { getFeed, refreshInstagramToken } from '../lib/social.mjs';

export default async () => {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('social');
    const r = await refreshInstagramToken(store);
    await store.delete('feed').catch(() => {}); // the next visit reads Meta afresh
    await getFeed(store);
    console.log('[social-refresh]', JSON.stringify(r));
  } catch (e) {
    console.error('[social-refresh] failed', e);
  }
  return new Response('ok');
};

export const config = { schedule: '@daily' };
