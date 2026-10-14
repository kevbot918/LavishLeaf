// Scheduled every two hours: the stock check (netlify/lib/stock.mjs). What a
// supplier has run out of is hidden on the store until it is back.
import { checkNow } from '../lib/stock-run.mjs';

export default async () => {
  try {
    const s = await checkNow();
    const out = Object.values(s.items).filter((r) => r.out).length;
    console.log('[stock-check]', out, 'out;', JSON.stringify({ bangalla: s.bangalla, aliexpress: s.aliexpress }));
  } catch (e) {
    console.error('[stock-check] failed', e);
  }
  return new Response('ok');
};

export const config = { schedule: '15 */2 * * *' };
