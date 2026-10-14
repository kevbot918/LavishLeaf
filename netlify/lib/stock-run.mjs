// One stock check with the real suppliers wired in (lib/stock.mjs runCheck),
// shared by the scheduled run (functions/stock-check.mjs) and the dashboard's
// "Check now" (functions/stock.mjs).
import { accessToken, aeReady, call, productFacts } from './aliexpress.mjs';
import { runCheck, stockStore } from './stock.mjs';

export async function checkNow() {
  let aeCheck = null;
  if (aeReady()) {
    const { getStore } = await import('@netlify/blobs');
    const token = await accessToken(getStore('aliexpress')).catch(() => null);
    if (token) {
      aeCheck = async (id) => {
        try {
          const answer = await call('aliexpress.ds.product.get', { product_id: id, ship_to_country: 'US', target_currency: 'USD', target_language: 'EN' }, token);
          return productFacts(answer);
        } catch (e) {
          // An item taken down answers with an error, not an empty stock.
          if (/not ?exist|offline|not ?found|unavailable|delete|off ?shelf|invalid product/i.test(e.message)) return null;
          throw e;
        }
      };
    }
  }
  // Bangalla gives no feed link (owner, 2026-10-14), so the product data file
  // he loads in the dashboard (Blobs "store-costs") is the stock source.
  let costsFile = null;
  try {
    const { getStore } = await import('@netlify/blobs');
    costsFile = await getStore('store-costs').get('bangalla', { type: 'json' });
  } catch (e) { console.error('[stock] costs file', e.message); }
  return runCheck(await stockStore(), { aeCheck, costsFile });
}
