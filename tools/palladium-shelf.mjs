#!/usr/bin/env node
// Palladium Boots on the Store (owner, 2026-10-15): "add Palladium Boots to
// our GreenSwaps section and put a Palladium Boots shelf on our store home
// under the Azure Standard shelf ... add a variety of their more popular boots
// to our Recreation & Outdoors category ... advertise the FALL20 ... a card
// promoting their free shipping on orders over $90". Affiliate through Ascend
// (Partnerize), 10%; every link is our tracking link (tools/palladium-card.mjs).
//
//   node tools/palladium-shelf.mjs     read Palladium's public Shopify catalog
//                                      (collection products.json, in the
//                                      collection's own order), rewrite
//                                      store.html between the PALLADIUM
//                                      markers, write palladium-home.json and
//                                      netlify/lib/palladium-handles.mjs
// Then: node tools/render-store.mjs && node tools/seo.mjs
// Prices refresh by themselves on the page (functions/palladium-prices.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FALL20, esc, palladiumCard, palladiumLink } from './palladium-card.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// [shelf title, note, collections in order, how many]
const SHELVES = [
  ['Best sellers for men', 'The styles men buy most, canvas and leather.', ['mens-best-sellers'], 24],
  ['Best sellers for women', 'The styles women buy most.', ['womens-best-sellers'], 24],
  ['Waterproof boots', 'Waterproof styles for rain, trails, and muddy yards.', ['mens-waterproof', 'womens-waterproof'], 24],
  ['Cold-weather boots', 'Lined and insulated styles for winter.', ['cold-weather-boots'], 18],
  // Kids (owner, 2026-10-15): Palladium's own KIDS / CHILDREN tags across the
  // whole catalog (its "kids" collection is mostly adult styles).
  ['Kids', 'Palladium boots and shoes made for kids.', ['@kids'], 16],
];
// The Recreation & Outdoors picks: waterproof and trail-ready styles.
const OUTDOOR = { from: ['mens-waterproof', 'womens-waterproof', 'cold-weather-boots'], count: 10 };
const PER_MODEL = 3; // at most three colors of one style per shelf

const cache = new Map();
const isKid = (p) => (p.tags || []).some((t) => /^(KIDS|CHILDREN|JUNIOR|TODDLER|INFANT)$/i.test(t)) || /KIDS?|JUNIOR|TODDLER/i.test(p.title);
async function collection(handle) {
  if (cache.has(handle)) return cache.get(handle);
  if (handle === '@kids') {
    const all = [];
    for (let page = 1; page <= 20; page++) {
      const r = await fetch(`https://palladiumboots.com/products.json?limit=250&page=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0 (lavishleaf.org affiliate shelf)' } });
      if (!r.ok) throw new Error(`Palladium said ${r.status} for the catalog`);
      const { products } = await r.json();
      if (!products.length) break;
      all.push(...products);
    }
    const kids = all.filter(isKid);
    cache.set(handle, kids);
    return kids;
  }
  const res = await fetch(`https://palladiumboots.com/collections/${handle}/products.json?limit=250`, { headers: { 'User-Agent': 'Mozilla/5.0 (lavishleaf.org affiliate shelf)' } });
  if (!res.ok) throw new Error(`Palladium said ${res.status} for ${handle}`);
  const { products } = await res.json();
  cache.set(handle, products);
  return products;
}

// Palladium's own abbreviations, spelled out only where the meaning is certain
// ("WL" is used for both wool and fur-lined styles, so it stays WL).
const WORDS = { WP: 'Waterproof', WPS: 'Waterproof', WPN: 'Waterproof', WPA: 'Waterproof', RCYL: 'Recycled', LT: 'Lite', LITE: 'Lite', CVS: 'Canvas', ORG: 'Organic', HKR: 'Hiker', XPLR: 'Xplor', LTH: 'Leather', HI: 'Hi', LO: 'Lo', WL: 'WL', SP20: 'SP20' };
const title = (s) => s.replace(/\+/g, ' ').split(/\s+/).filter(Boolean)
  .map((w) => WORDS[w.toUpperCase()] || w.split('/').map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join('/')).join(' ');
const small = (src) => src + (src.includes('?') ? '&' : '?') + 'width=400';

const mens = new Set((await collection('mens-best-sellers')).map((p) => p.handle));
const womens = new Set((await collection('womens-best-sellers')).map((p) => p.handle));
for (const h of ['mens-waterproof', 'mens']) for (const p of await collection(h)) mens.add(p.handle);
for (const h of ['womens-waterproof', 'womens']) for (const p of await collection(h)) womens.add(p.handle);

function item(p) {
  const live = p.variants.filter((v) => v.available);
  if (!live.length || !p.images[0]) return null;
  if (/SLIDE|SANDAL|MARY-JANE|SOCK|\bBAG\b|\bCAP\b|\bHAT\b|SHIRT|HOODIE/i.test(p.title)) return null; // boots and shoes (owner: boots)
  const parts = p.title.split('|').map((s) => s.trim());
  const model = title(parts[1] || parts[0]);
  const color = title(parts[2] || '');
  const who = isKid(p) ? "Kids' " : mens.has(p.handle) && !womens.has(p.handle) ? "Men's " : womens.has(p.handle) && !mens.has(p.handle) ? "Women's " : '';
  const price = Math.min(...live.map((v) => +v.price));
  const was = Math.max(...p.variants.map((v) => +(v.compare_at_price || 0)));
  const tags = (p.tags || []).join(' ').toUpperCase();
  const kind = /WATERPROOF|\bWP/.test(tags + ' ' + p.title) ? 'Waterproof ' : '';
  const blurb = `${who}${kind ? kind.toLowerCase() : ''}${/SNEAKER|LOW TOP|LO\b/.test(tags) ? 'shoe' : 'boot'} from Palladium${color ? ', in ' + color.toLowerCase() : ''}. Sold and shipped by Palladium.`;
  return { handle: p.handle, model, name: model + (color ? ', ' + color : ''), price, was: was > price ? was : null, img: small(p.images[0].src), blurb: blurb.charAt(0).toUpperCase() + blurb.slice(1) };
}

async function pick(handles, count) {
  const out = [], perModel = new Map(), seen = new Set();
  for (const h of handles) for (const p of await collection(h)) {
    if (out.length >= count) break;
    if (seen.has(p.handle)) continue;
    const x = item(p); if (!x) continue;
    if ((perModel.get(x.model) || 0) >= PER_MODEL) continue;
    perModel.set(x.model, (perModel.get(x.model) || 0) + 1); seen.add(p.handle); out.push(x);
  }
  // Interleave several collections so one does not fill the shelf.
  return out;
}

const shelves = [];
for (const [t, note, from, n] of SHELVES) shelves.push({ title: t, note, items: await pick(from, n) });
const outdoor = await pick(OUTDOOR.from, OUTDOOR.count);
// Home: every Green Swaps product once, men's and women's alternating first.
const homeSeen = new Set(), home = [];
const longest = Math.max(...shelves.map((s) => s.items.length));
for (let i = 0; i < longest; i++) for (const s of shelves) { const x = s.items[i]; if (x && !homeSeen.has(x.handle)) { homeSeen.add(x.handle); home.push(x.handle); } }

const today = new Date().toISOString().slice(0, 10);
const all = new Map([...shelves.flatMap((s) => s.items), ...outdoor].map((x) => [x.handle, x]));
writeFileSync(join(ROOT, 'palladium-home.json'), JSON.stringify({ _help: 'Written by tools/palladium-shelf.mjs; drawn by tools/render-store.mjs (Home shelf "Palladium Boots", and the Recreation & Outdoors picks) and in Green Swaps. Public facts only; prices refresh live from functions/palladium-prices.mjs.', at: today, home, outdoor: outdoor.map((x) => x.handle), items: [...all.values()] }, null, 1) + '\n');
writeFileSync(join(ROOT, 'netlify', 'lib', 'palladium-handles.mjs'), `// GENERATED by tools/palladium-shelf.mjs on ${today}. The Palladium product handles on the Store.\nexport const PALLADIUM_HANDLES = ${JSON.stringify([...all.keys()])};\n`);

const html = [
  `<!-- PALLADIUM:START (generated by tools/palladium-shelf.mjs on ${today}; do not edit by hand) -->`,
  '      <div class="gs-feature gs-feature-palladium" id="palladium">',
  '        <div class="gs-feature-text">',
  '          <p class="gs-feature-kicker">Our boot partner</p>',
  '          <h2>Palladium Boots</h2>',
  '          <p>Rugged canvas and leather boots built since 1920, from everyday Pampa high-tops to waterproof and winter styles, many made with organic cotton and recycled materials.</p>',
  '        </div>',
  `        <a class="btn gs-feature-btn" href="${esc(palladiumLink('/'))}" target="_blank" rel="sponsored noopener" data-affiliate="Palladium Boots">Shop Palladium</a>`,
  '      </div>',
  '      <div class="az-drops pd-offers">',
  '        <div class="az-drop-card pd-offer">',
  '          <p class="pd-code">FALL20</p>',
  '          <h3>20% off everything</h3>',
  '          <p>Use code <strong>FALL20</strong> at checkout for 20% off all products, for a limited time.</p>',
  `          <a class="btn btn-sm" href="${esc(FALL20)}" target="_blank" rel="sponsored noopener" data-affiliate="Palladium Boots">Shop the fall sale</a>`,
  '        </div>',
  '        <div class="az-drop-card pd-offer">',
  '          <p class="pd-code">$90+</p>',
  '          <h3>Free shipping over $90</h3>',
  '          <p>Palladium ships free on orders over $90, so one pair of boots usually ships free.</p>',
  `          <a class="btn btn-sm" href="${esc(palladiumLink('/'))}" target="_blank" rel="sponsored noopener" data-affiliate="Palladium Boots">Shop Palladium</a>`,
  '        </div>',
  '      </div>',
  ...shelves.filter((s) => s.items.length).map((s) => [
    '<section class="shelf gs-pd-shelf">',
    `  <div class="shelf-head"><h2>${esc(s.title)}</h2><a class="shelf-all" href="${esc(palladiumLink('/'))}" target="_blank" rel="sponsored noopener" data-affiliate="Palladium Boots">More at Palladium</a></div>`,
    `  <p class="shelf-note">${esc(s.note)}</p>`,
    '  <div class="shelf-row">',
    s.items.map((x) => palladiumCard(x)).join('\n'),
    '  </div>',
    '</section>',
  ].join('\n')),
  '<!-- PALLADIUM:END -->',
].join('\n');

const file = join(ROOT, 'store.html');
let page = readFileSync(file, 'utf8');
const nl = page.includes('\r\n') ? '\r\n' : '\n';
const re = /<!-- PALLADIUM:START[\s\S]*?<!-- PALLADIUM:END -->/;
if (!re.test(page)) {
  const anchor = '<!-- AZURE:END -->';
  if (!page.includes(anchor)) throw new Error('store.html has neither PALLADIUM markers nor the AZURE:END marker');
  page = page.replace(anchor, anchor + nl + nl + '<!-- PALLADIUM:START --><!-- PALLADIUM:END -->');
}
page = page.replace(re, () => html.replace(/\n/g, nl));
writeFileSync(file, page);
console.log(`Palladium: ${shelves.map((s) => `${s.title} ${s.items.length}`).join(', ')}; home ${home.length}; outdoor ${outdoor.length}.`);
