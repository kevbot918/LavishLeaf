// GET /.netlify/functions/azure-prices -> { at, prices: { CODE: "$4.64" | null } }
//
// Keeps the Azure Standard cards (Home shelf and Green Swaps) at Azure's
// current retail prices and hides what is out of stock (owner, 2026-10-14:
// "keep prices and in stock up to date"). Reads Azure's public product API,
// the one azurestandard.com itself uses, 40 codes a request. Netlify's CDN
// keeps the answer for 12 hours, so Azure is read about twice a day.
import { AZURE_CODES } from '../lib/azure-codes.mjs';

export default async () => {
  const prices = {};
  try {
    for (let i = 0; i < AZURE_CODES.length; i += 40) {
      const res = await fetch('https://api.azurestandard.com/packaged-products?limit=100&code=' + AZURE_CODES.slice(i, i + 40).join(','), {
        headers: { 'User-Agent': 'Mozilla/5.0 (lavishleaf.org affiliate prices)' },
      });
      if (!res.ok) throw new Error('Azure said ' + res.status);
      for (const p of await res.json()) {
        const dollars = p.price && p.price.retail ? Number(p.price.retail.dollars) : 0;
        prices[p.code] = p.stock > 0 && dollars > 0 ? '$' + dollars.toFixed(2) : null;
      }
    }
  } catch (e) {
    console.error('[azure-prices]', e.message);
  }
  const ok = Object.keys(prices).length > 0;
  return new Response(JSON.stringify({ at: new Date().toISOString(), prices }), {
    status: ok ? 200 : 502,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Netlify-CDN-Cache-Control': ok ? 'public, durable, s-maxage=43200, stale-while-revalidate=86400' : 'no-store',
    },
  });
};
