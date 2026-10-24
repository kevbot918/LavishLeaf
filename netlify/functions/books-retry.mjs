// Scheduled, once a day: writes the bookkeeping rows that could not reach the
// Books sheet when they happened (netlify/lib/books.mjs, docs/BOOKS.md), and
// the mileage rows likewise (netlify/lib/mileage.mjs, the Mileage tab).
// Nothing calls it from the site.
import { flushQueue } from '../lib/books.mjs';
import { flushMileage } from '../lib/mileage.mjs';

export default async () => {
  try {
    const r = await flushQueue();
    console.log('[books-retry]', JSON.stringify(r));
  } catch (e) {
    console.error('[books-retry] failed', e);
  }
  try {
    console.log('[books-retry] mileage', JSON.stringify(await flushMileage()));
  } catch (e) {
    console.error('[books-retry] mileage failed', e);
  }
  return new Response('ok');
};

export const config = { schedule: '@daily' };
