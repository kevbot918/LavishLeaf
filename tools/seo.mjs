// Search engines (owner, 2026-10-11: "make sure our website and store are
// easily findable"). Writes, from products.json and the page list:
//   sitemap.xml          every public page, for Google and Bing
//   robots.txt           crawl everything public, never the dashboard
//   google-shopping.xml  the Google Merchant Center product feed (free
//                        listings in Google Shopping); services and league
//                        registrations are left out (Merchant Center refuses them)
//   store.html           a JSON-LD ItemList of every product between the
//                        STORE-LD markers, so Google reads names, photos, prices
// Run after node tools/render-store.mjs:   node tools/seo.mjs
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lavishleaf.org';
const { products } = JSON.parse(readFileSync(join(ROOT, 'products.json'), 'utf8'));
const sold = products.filter((p) => p.active !== false && !p.demo);
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (c) => (c / 100).toFixed(2);
const productUrl = (p) => `${SITE}/store.html?p=${encodeURIComponent(p.id)}`;
const abs = (img) => (/^https?:/.test(img) ? img : `${SITE}/${img}`);

// ---- sitemap.xml (pages in order of importance)
const PAGES = [
  ['index.html', '/', '1.0', 'weekly'], ['store.html', '/store.html', '0.9', 'daily'], ['farms.html', '/farms.html', '0.9', 'weekly'],
  ['rec-sports.html', '/rec-sports.html', '0.9', 'weekly'], ['symphonymph.html', '/symphonymph.html', '0.8', 'monthly'],
  ['gaming.html', '/gaming.html', '0.7', 'monthly'], ['company.html', '/company.html', '0.7', 'monthly'], ['social.html', '/social.html', '0.6', 'weekly'],
  ['refunds.html', '/refunds.html', '0.3', 'yearly'], ['terms-of-sale.html', '/terms-of-sale.html', '0.3', 'yearly'],
  ['privacy.html', '/privacy.html', '0.3', 'yearly'], ['waiver.html', '/waiver.html', '0.3', 'yearly'],
];
const day = (f) => statSync(join(ROOT, f)).mtime.toISOString().slice(0, 10);
const urls = PAGES.map(([f, path, pr, freq]) => `  <url><loc>${SITE}${path}</loc><lastmod>${day(f)}</lastmod><changefreq>${freq}</changefreq><priority>${pr}</priority></url>`);
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

// ---- robots.txt
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /dashboard.html\nDisallow: /.netlify/\n\nSitemap: ${SITE}/sitemap.xml\n`);

// ---- google-shopping.xml: physical goods only
const goods = sold.filter((p) => p.ship === true && !p.interval);
const GCAT = {
  'Farm & Garden': 'Home & Garden > Lawn & Garden', 'Recreation & Outdoors': 'Sporting Goods', 'Personal Care': 'Health & Beauty > Personal Care',
  'Home & Kitchen': 'Home & Garden', 'Cleaning Supplies': 'Home & Garden > Household Supplies', 'Games & Gifts': 'Toys & Games', Pets: 'Animals & Pet Supplies',
};
const items = goods.map((p) => [
  '    <item>',
  `      <g:id>${xml(p.id)}</g:id>`,
  `      <title>${xml(p.name)}</title>`,
  `      <description>${xml(p.blurb || p.name)}</description>`,
  `      <link>${xml(productUrl(p))}</link>`,
  `      <g:image_link>${xml(abs(p.image))}</g:image_link>`,
  '      <g:availability>in_stock</g:availability>',
  `      <g:price>${money(p.price)} USD</g:price>`,
  '      <g:condition>new</g:condition>',
  '      <g:identifier_exists>no</g:identifier_exists>',
  ...(GCAT[p.category] ? [`      <g:google_product_category>${xml(GCAT[p.category])}</g:google_product_category>`] : []),
  `      <g:product_type>${xml(p.category)}</g:product_type>`,
  `      <g:shipping_weight>${p.shipOz} oz</g:shipping_weight>`,
  '    </item>',
].join('\n'));
writeFileSync(join(ROOT, 'google-shopping.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>Lavish Leaf Online Store</title>\n    <link>${SITE}/store.html</link>\n    <description>Products from the Lavish Leaf online store</description>\n${items.join('\n')}\n  </channel>\n</rss>\n`);

// ---- JSON-LD in store.html
const ld = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Lavish Leaf Online Store',
  numberOfItems: sold.length,
  itemListElement: sold.map((p, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: {
      '@type': p.interval ? 'Service' : 'Product',
      name: p.name, url: productUrl(p), ...(p.image ? { image: abs(p.image) } : {}), description: p.blurb || p.name,
      ...(p.interval ? { areaServed: ['Stigler, OK', 'McAlester, OK', 'Checotah, OK'], provider: { '@type': 'Organization', name: 'Lavish Leaf' } } : { category: p.category }),
      offers: { '@type': 'Offer', price: money(p.price), priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: productUrl(p) },
    },
  })),
};
const storePath = join(ROOT, 'store.html');
let store = readFileSync(storePath, 'utf8');
const block = `<!-- STORE-LD (tools/seo.mjs) -->\n  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n  <!-- /STORE-LD -->`;
const re = /<!-- STORE-LD \(tools\/seo\.mjs\) -->[\s\S]*?<!-- \/STORE-LD -->/;
store = re.test(store) ? store.replace(re, () => block) : store.replace('</head>', () => `  ${block}\n</head>`);
writeFileSync(storePath, store);
console.log(`sitemap.xml (${PAGES.length} pages), robots.txt, google-shopping.xml (${goods.length} products), store.html JSON-LD (${sold.length} items).`);
