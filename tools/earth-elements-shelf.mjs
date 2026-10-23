#!/usr/bin/env node
// Earth Elements Organics on the Store (owner, 2026-10-23): "Lets make it in
// its own category in our store, plus in the Green Swaps section ... Ensure
// our link is on all of the products. Lets list all of their products in our
// store. Including the craft your formula and the wholesale products".
// Affiliate through Refersion; every link carries our code (earth-elements-card.mjs).
//
//   node tools/earth-elements-shelf.mjs   read the public Shopify catalog, rewrite
//                                         store.html between the EARTH-ELEMENTS
//                                         markers (Green Swaps), write
//                                         earth-elements-home.json (the Home shelf)
//                                         and netlify/lib/earth-elements-handles.mjs
// Then: node tools/render-store.mjs && node tools/seo.mjs
// Prices refresh by themselves on the page (functions/earth-elements-prices.mjs).
//
// The names and sentences are ours, written from each product page: what it
// is made of and what it is traditionally used for, with no claim to treat a
// condition (the FDA line sits under every shelf and in every pop-up).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FDA, SHELF, eeCard, eeLink, esc } from './earth-elements-card.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOP = 'https://earthelementsorganics.net';
// Their three groups, as their own menu names them.
const GROUPS = [
  { key: 'retail', title: 'Herbal oils, balms, and salves', note: 'Ready-to-use oils in 1 fl oz bottles, and balms and salves for skin, lips, and hands.', more: '/collections/all' },
  { key: 'craft', title: 'Craft Your Formula', note: 'Their organic infused oils by the 32 fl oz, to blend into your own balms, salves, lotions, and massage oils.', more: '/collections/herbal-oils-8fl-oz-64fl-oz' },
  { key: 'wholesale', title: 'Wholesale', note: 'Infused oils in bulk, 101 or 169 fl oz, for makers, spas, and shops.', more: '/collections/https-earthelementsorganics-net-collections-https-earthelementsorganics-net-collections-wholesale-bulk' },
];
const HERB = { 'witch hazel': 'witch hazel leaves', chickweed: 'chickweed', calendula: 'calendula flowers', 'raspberry leaf': 'red raspberry leaves', comfrey: 'comfrey leaves', chamomile: 'chamomile flowers' };
// [group, our name, our sentence]
const COPY = {
  'peppermint-balm': ['retail', 'Peppermint Balm, 1 oz', 'Organic chamomile oil and beeswax with peppermint essential oil, to rub under the nose or on the chest for a cool, clearing breath. Keep away from the eyes.'],
  'organic-witch-hazel-medicinal-oil': ['retail', 'Witch Hazel Herbal Oil, 1 fl oz', 'Organic witch hazel leaves infused in organic sunflower oil: a natural astringent and moisturizer that helps skin hold its moisture.'],
  'organic-patchouli-medicinal-oil': ['retail', 'Patchouli Herbal Oil, 1 fl oz', 'Organic patchouli infused in organic sunflower oil, used to tone and tighten skin and as a warm, earthy massage oil.'],
  'organic-chickweed-medicinal-oil': ['retail', 'Chickweed Herbal Oil, 1 fl oz', 'Organic chickweed infused in organic sunflower oil, a gentle alternative to creams for soothing irritated, itchy skin.'],
  'organic-calendula-medicinal-oil': ['retail', 'Calendula Herbal Oil, 1 fl oz', 'Organic calendula flowers infused in organic sunflower oil, a soothing oil for dry, chapped, cold-weather skin.'],
  'arnica-oil': ['retail', 'Arnica Oil, 1 fl oz', 'Arnica flowers infused in sunflower oil, a traditional massage oil for bumps, bruises, and tired muscles. For unbroken skin only.'],
  'comfrey-oil': ['retail', 'Comfrey Herbal Oil, 1 or 4 fl oz', 'Organic comfrey leaves infused in organic sunflower oil, rich in allantoin, a moisturizing oil traditionally used to help skin renew. For external use only.'],
  'chamomile-oil': ['retail', 'Chamomile Herbal Oil, 1 fl oz', 'Organic chamomile flowers infused in organic sunflower oil, a calming oil for dry, itchy skin and a gentle carrier for essential oils.'],
  'diaper-balm': ['retail', 'Herbal Diaper Balm', "Chickweed, comfrey, chamomile, and calendula oils in a beeswax balm, made to soothe and protect a baby's tender skin."],
  'belly-balm': ['retail', 'Herbal Pregnancy & Postpartum Balm', 'Herbal oils with a high level of tannins in a moisturizing balm that helps stretching skin stay hydrated and supple, during pregnancy and after.'],
  'comfrey-arnica-salve': ['retail', 'Comfrey & Arnica Salve', 'Comfrey and arnica oils in a rich salve, a traditional rub for sore joints and muscles, bumps, and bruises.'],
  'apres-ski-balm': ['retail', 'Après Ski Balm, 1 oz', 'Organic raspberry leaf oil, beeswax, and lanolin for hands, face, and lips after wind, cold, and sun. Suits fair skin especially.'],
  'sweet-orange-balm': ['retail', 'Sweet-Orange Balm, 1 oz', 'Organic chamomile oil and beeswax with sweet orange essential oil, for lips, face, and hands. Safe for children.'],
  'calendula-oil-100-organic': ['craft', 'Calendula Oil, 32 fl oz', 'calendula'],
  'raspberry-leaf-oil-100-organic': ['craft', 'Raspberry Leaf Oil, 32 fl oz', 'raspberry leaf'],
  'witch-hazel-extract': ['craft', 'Witch Hazel Oil, 32 fl oz', 'witch hazel'],
  'chickweed-extract': ['craft', 'Chickweed Oil, 32 fl oz', 'chickweed'],
  'comfrey-oil-100-organic': ['craft', 'Comfrey Oil, 32 fl oz', 'comfrey'],
  'chamomile-oil-100-organic': ['craft', 'Chamomile Oil, 32 fl oz', 'chamomile'],
  'witch-hazel-oil-bulk-100-organic': ['wholesale', 'Witch Hazel Oil, Wholesale', 'witch hazel'],
  'chickweed-oil-bulk-100-organic': ['wholesale', 'Chickweed Oil, Wholesale', 'chickweed'],
  'raspberry-leaf-oil-bulk-100-organic': ['wholesale', 'Raspberry Leaf Oil, Wholesale', 'raspberry leaf'],
  'comfrey-oil-bulk-100-organic': ['wholesale', 'Comfrey Oil, Wholesale', 'comfrey'],
  'chamomile-oil-bulk-100-organic': ['wholesale', 'Chamomile Oil, Wholesale', 'chamomile'],
  'calendula-bulk-100-organic-coming-soon': ['wholesale', 'Calendula Oil, Wholesale', 'calendula'],
};
const sentence = (group, text) => (group === 'craft'
  ? `Organic ${HERB[text]} infused in organic sunflower oil, 32 fl oz, a base for your own balms, salves, lotions, and massage oils.`
  : group === 'wholesale'
    ? `Organic ${HERB[text]} infused in organic sunflower oil, in bulk: 101 or 169 fl oz, for makers, spas, and shops.`
    : text);

const all = [];
for (let page = 1; page <= 10; page++) {
  const r = await fetch(`${SHOP}/products.json?limit=250&page=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0 (lavishleaf.org affiliate shelf)' } });
  if (!r.ok) throw new Error(`Earth Elements said ${r.status}`);
  const { products } = await r.json();
  if (!products.length) break;
  all.push(...products);
}
const unknown = all.filter((p) => !COPY[p.handle]).map((p) => p.handle);
if (unknown.length) console.warn('NEW at Earth Elements, add to COPY to list them: ' + unknown.join(', '));
const gone = Object.keys(COPY).filter((h) => !all.some((p) => p.handle === h));
if (gone.length) console.warn('No longer at Earth Elements, left off: ' + gone.join(', '));

const small = (src) => src + (src.includes('?') ? '&' : '?') + 'width=400';
const items = [];
for (const p of all) {
  const c = COPY[p.handle];
  if (!c || !p.images[0]) continue;
  const live = p.variants.filter((v) => v.available);
  if (!live.length) { console.warn('Sold out, left off for now: ' + p.handle); continue; }
  const prices = live.map((v) => +v.price);
  items.push({ handle: p.handle, group: c[0], name: c[1], blurb: sentence(c[0], c[2]), price: Math.min(...prices), from: new Set(prices).size > 1, img: small(p.images[0].src) });
}
const byGroup = (k) => items.filter((x) => x.group === k);

const today = new Date().toISOString().slice(0, 10);
const order = GROUPS.flatMap((g) => byGroup(g.key).map((x) => x.handle));
writeFileSync(join(ROOT, 'earth-elements-home.json'), JSON.stringify({ _help: `Written by tools/earth-elements-shelf.mjs; drawn by tools/render-store.mjs (the Home shelf "${SHELF}") and in Green Swaps. Public facts only; prices refresh live from functions/earth-elements-prices.mjs.`, at: today, home: order, items }, null, 1) + '\n');
writeFileSync(join(ROOT, 'netlify', 'lib', 'earth-elements-handles.mjs'), `// GENERATED by tools/earth-elements-shelf.mjs on ${today}. The Earth Elements Organics product handles on the Store.\nexport const EARTH_ELEMENTS_HANDLES = ${JSON.stringify(order)};\n`);

const shopBtn = (label, path = '/') => `<a class="btn gs-feature-btn" href="${esc(eeLink(path))}" target="_blank" rel="sponsored noopener" data-affiliate="Earth Elements Organics">${label}</a>`;
const html = [
  `<!-- EARTH-ELEMENTS:START (generated by tools/earth-elements-shelf.mjs on ${today}; do not edit by hand) -->`,
  '      <div class="gs-feature gs-feature-ee" id="earth-elements">',
  '        <div class="gs-feature-text">',
  '          <p class="gs-feature-kicker">Our herbal partner</p>',
  '          <h2>Earth Elements Organics</h2>',
  '          <p>Organic herbs slowly infused in organic sunflower oil, made into herbal oils, balms, and salves for skin, lips, hands, and tired muscles. Their Craft Your Formula oils and wholesale sizes are for anyone making their own.</p>',
  '        </div>',
  '        ' + shopBtn('Shop Earth Elements'),
  '      </div>',
  ...GROUPS.filter((g) => byGroup(g.key).length).map((g) => [
    '<section class="shelf gs-ee-shelf">',
    `  <div class="shelf-head"><h2>${esc(g.title)}</h2><a class="shelf-all" href="${esc(eeLink(g.more))}" target="_blank" rel="sponsored noopener" data-affiliate="Earth Elements Organics">More at Earth Elements</a></div>`,
    `  <p class="shelf-note">${esc(g.note)}</p>`,
    '  <div class="shelf-row">',
    byGroup(g.key).map((x) => eeCard(x)).join('\n'),
    '  </div>',
    '</section>',
  ].join('\n')),
  `<p class="gs-disclosure gs-ee-fda">${esc(FDA)}</p>`,
  '<!-- EARTH-ELEMENTS:END -->',
].join('\n');

const file = join(ROOT, 'store.html');
let page = readFileSync(file, 'utf8');
const nl = page.includes('\r\n') ? '\r\n' : '\n';
const re = /<!-- EARTH-ELEMENTS:START[\s\S]*?<!-- EARTH-ELEMENTS:END -->/;
if (!re.test(page)) {
  const anchor = '<!-- PALLADIUM:END -->';
  if (!page.includes(anchor)) throw new Error('store.html has neither EARTH-ELEMENTS markers nor the PALLADIUM:END marker');
  page = page.replace(anchor, anchor + nl + nl + '<!-- EARTH-ELEMENTS:START --><!-- EARTH-ELEMENTS:END -->');
}
page = page.replace(re, () => html.replace(/\n/g, nl));
writeFileSync(file, page);
console.log(`Earth Elements: ${GROUPS.map((g) => `${g.title} ${byGroup(g.key).length}`).join(', ')}; ${items.length} of ${all.length} products listed.`);
