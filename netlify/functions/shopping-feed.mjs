// GET https://lavishleaf.org/products-feed.xml  (a 200 rewrite in _redirects)
//
// The Google Merchant Center feed with live stock (owner, 2026-10-24: "a file
// that updates every time we make product listing changes so that google
// merchant can use that to update our product listings automatically").
// tools/seo.mjs writes google-shopping.xml on every products.json change, and
// it deploys with the site; this serves that same file with each product the
// stock check has taken off the store (lib/stock.mjs outOf: sold out, under 5
// left, or its supplier paused) marked out_of_stock, so Google never shows
// something the cart would refuse. Merchant Center fetches it once a day.
import { outOf, readState, stockStore } from '../lib/stock.mjs';

export default async () => {
  const base = process.env.URL || 'https://lavishleaf.org';
  const res = await fetch(base + '/google-shopping.xml');
  if (!res.ok) return new Response('feed unavailable', { status: 502 });
  let xml = await res.text();
  try {
    const out = new Set(outOf(await readState(await stockStore())).products);
    if (out.size) {
      xml = xml.replace(/<item>[\s\S]*?<\/item>/g, (item) => {
        const id = (item.match(/<g:id>([^<]+)<\/g:id>/) || [])[1];
        return id && out.has(id) ? item.replace('<g:availability>in_stock</g:availability>', '<g:availability>out_of_stock</g:availability>') : item;
      });
    }
  } catch (e) {
    console.error('[shopping-feed] stock not applied:', e.message); // the plain feed still goes out
  }
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
