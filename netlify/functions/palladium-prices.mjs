// GET /.netlify/functions/palladium-prices -> { at, prices: { handle: "$64.00, was $80.00" | null } }
//
// Keeps the Palladium Boots cards (Home shelf, Recreation & Outdoors picks and
// Green Swaps) at Palladium's current prices; null = sold out in every size,
// and the card hides (2026-10-15). Reads each product's public Shopify JSON,
// 8 at a time. Netlify's CDN keeps the answer for 12 hours.
import { PALLADIUM_HANDLES } from '../lib/palladium-handles.mjs';

const money = (n) => '$' + Number(n).toFixed(2);

async function one(handle) {
  const r = await fetch(`https://palladiumboots.com/products/${handle}.js`, { headers: { 'User-Agent': 'Mozilla/5.0 (lavishleaf.org affiliate prices)' } });
  if (r.status === 404) return null;            // gone from Palladium
  if (!r.ok) throw new Error('Palladium said ' + r.status);
  const p = await r.json();
  const live = (p.variants || []).filter((v) => v.available);
  if (!live.length) return null;
  const price = Math.min(...live.map((v) => v.price)) / 100;     // .js prices are in cents
  const was = Math.max(...(p.variants || []).map((v) => v.compare_at_price || 0)) / 100;
  return was > price ? money(price) + ', was ' + money(was) : money(price);
}

export default async () => {
  const prices = {};
  try {
    for (let i = 0; i < PALLADIUM_HANDLES.length; i += 8) {
      const group = PALLADIUM_HANDLES.slice(i, i + 8);
      const got = await Promise.all(group.map((h) => one(h).catch(() => undefined)));
      group.forEach((h, k) => { if (got[k] !== undefined) prices[h] = got[k]; });
    }
  } catch (e) {
    console.error('[palladium-prices]', e.message);
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
