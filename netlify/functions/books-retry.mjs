// Scheduled, once a day: writes the bookkeeping rows that could not reach the
// Books sheet when they happened (netlify/lib/books.mjs, docs/BOOKS.md).
// Nothing calls it from the site.
import { flushQueue } from '../lib/books.mjs';

export default async () => {
  try {
    const r = await flushQueue();
    console.log('[books-retry]', JSON.stringify(r));
  } catch (e) {
    console.error('[books-retry] failed', e);
  }
  return new Response('ok');
};

export const config = { schedule: '@daily' };
