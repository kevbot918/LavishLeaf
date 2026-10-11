// GET /.netlify/functions/seedsnow-prices -> { at, prices: { handle: "From $2.99" | null } }
//
// Keeps the SeedsNow shelves on Green Swaps at SeedsNow's current prices
// (owner, 2026-10-11: "ensure our prices stay up to date as much as
// possible"). Reads SeedsNow's public catalogue (its Shopify products.json)
// and answers with each product's lowest in-stock price; null means sold out.
// Netlify's CDN keeps the answer for 12 hours, so SeedsNow is read about
// twice a day however many people visit, and the function costs next to
// nothing. store.js swaps the prices into the cards.
const PAGES = 10;

export default async () => {
  const prices = {};
  try {
    for (let page = 1; page <= PAGES; page++) {
      const res = await fetch(`https://www.seedsnow.com/products.json?limit=250&page=${page}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (lavishleaf.org affiliate prices)' },
      });
      if (!res.ok) break;
      const { products } = await res.json();
      if (!products || !products.length) break;
      for (const p of products) {
        const live = (p.variants || []).filter((v) => v.available).map((v) => Number(v.price)).filter((x) => x > 0);
        if (!live.length) { prices[p.handle] = null; continue; }
        const min = Math.min(...live);
        prices[p.handle] = (new Set(live).size > 1 ? 'From $' : '$') + min.toFixed(2);
      }
    }
  } catch (e) {
    console.error('[seedsnow-prices]', e.message);
  }
  const ok = Object.keys(prices).length > 0;
  return new Response(JSON.stringify({ at: new Date().toISOString(), prices }), {
    status: ok ? 200 : 502,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      // Cached at Netlify's edge: 12 hours, then served stale while it refreshes.
      'Netlify-CDN-Cache-Control': ok ? 'public, durable, s-maxage=43200, stale-while-revalidate=86400' : 'no-store',
    },
  });
};
