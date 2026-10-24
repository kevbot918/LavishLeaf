// GET /.netlify/functions/earth-elements-prices -> { at, prices: { handle: "$13.50" | "from $327.75" | null } }
//
// Keeps the Earth Elements Organics cards (the "Natural Wellness" Home
// shelf and Green Swaps) at their current prices; null = sold out in every
// size, and the card hides (2026-10-23). Reads each product's public Shopify
// JSON, 4 at a time, one retry. Netlify's CDN keeps the answer for 12 hours.
import { EARTH_ELEMENTS_HANDLES } from '../lib/earth-elements-handles.mjs';

const money = (n) => '$' + Number(n).toFixed(2);

async function one(handle) {
  const r = await fetch(`https://earthelementsorganics.net/products/${handle}.js`, { headers: { 'User-Agent': 'Mozilla/5.0 (lavishleaf.org affiliate prices)' } });
  if (r.status === 404) return null;            // gone from Earth Elements
  if (!r.ok) throw new Error('Earth Elements said ' + r.status);
  const p = await r.json();
  const live = (p.variants || []).filter((v) => v.available);
  if (!live.length) return null;
  const prices = live.map((v) => v.price / 100); // .js prices are in cents
  return (new Set(prices).size > 1 ? 'from ' : '') + money(Math.min(...prices));
}

export default async () => {
  const prices = {};
  try {
    for (let i = 0; i < EARTH_ELEMENTS_HANDLES.length; i += 4) {
      const group = EARTH_ELEMENTS_HANDLES.slice(i, i + 4);
      const got = await Promise.all(group.map((h) => one(h).catch(() => new Promise((ok) => setTimeout(ok, 600)).then(() => one(h)).catch(() => undefined))));
      group.forEach((h, k) => { if (got[k] !== undefined) prices[h] = got[k]; });
    }
  } catch (e) {
    console.error('[earth-elements-prices]', e.message);
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
