#!/usr/bin/env node
// Fill the Store with a DEMO catalogue read from docs/STORE-PRODUCTS.md.
//
//   node tools/demo-store.mjs           replace every "demo" product in
//                                       products.json with a fresh read
//   node tools/demo-store.mjs --remove  take every demo product out again
//   then: node tools/render-store.mjs
//
// The owner, 2026-10-01: "analyze the product doc and fill shelves using
// those products as our demo store so I can then analyze and decide which
// products to use. If prices are unknowns then list it at $0.00".
//
// What it reads: every linked product in the Tier 0 to 4 tables and the
// Miscellany. A row that names several products becomes one card each.
// Tier 5 is skipped: its rows are suppliers and categories, not products.
//
// What it writes (2026-10-06, the owner: "the current store page needs to be
// changed to only include the items for tier 0 ... so that I can analyze
// those"):
//   * products.json: the demo cards for TIER 0 ONLY, beside the real products.
//   * store-tiers.json: every tier, every product, for the dashboard's "Store
//     products" section. Public facts only (the document is public): a
//     supplier's own costs never go in either file; the dashboard reads them
//     from the owner's upload, matched by the SKU in brackets on a Tier 0 row.
//   node tools/demo-store.mjs --all   puts every tier back on the Store page.
// The price is the document's own number (the low end of a range); a price
// the document does not have (HIDDEN, "see page", "MSRP hidden") is 0.
// The card's sentence says the tier, the rank, the supplier, the price
// kind and the opening minimum, so the shelf can be compared at a glance.
// Every demo product is marked "demo": true. The renderer gives it a
// "Supplier page" button instead of a checkout, and the checkout functions
// never sell it. The real products (compost, soccer) are left alone.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = readFileSync(join(ROOT, 'docs', 'STORE-PRODUCTS.md'), 'utf8');
const JSON_PATH = join(ROOT, 'products.json');
const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const real = data.products.filter((p) => !p.demo);

if (process.argv.includes('--remove')) {
  data.products = real;
  writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`Removed the demo products; ${real.length} real products remain.`);
  process.exit(0);
}

// ------------------------------------------------------------------ shelves
// The document's category column, mapped onto a store's shelves.
const SHELF = [
  [/^pest/, 'Pest Control', '🐞'],
  [/^(fertiliser|sacks|liquid feed)/, 'Fertilizer & Soil', '🌿'],
  [/^seed/, 'Seeds', '🌻'],
  [/^(garden|heavy garden|live)/, 'Garden Supplies', '🪴'],
  [/^laundry/, 'Laundry', '🧺'],
  [/^(cleaning|brushes|sponges|cloths)/, 'Cleaning', '🧽'],
  [/^(soap|personal care)/, 'Soap & Personal Care', '🧼'],
  [/^(kitchen|serving|coasters)/, 'Kitchen & Serving', '🥄'],
  [/^textiles/, 'Towels & Textiles', '🧣'],
  [/^(plastic-free|compostable|paper)/, 'Plastic-Free Home', '♻️'],
  [/^refill/, 'Refill Station', '🫙'],
  [/^herb bar/, 'Herb Bar', '🌶️'],
  [/^books/, 'Books & Journals', '📚'],
  [/^(games|collectables|impulse)/, 'Games & Gifts', '🎲'],
  [/^misc/, 'Miscellany', '📦'],
];
function shelfFor(category, name) {
  if (/soap/i.test(name) && /games, soap/.test(category)) return shelfFor('soap', name);
  for (const [re, title, icon] of SHELF) if (re.test(category)) return { title, icon };
  return { title: 'Miscellany', icon: '📦' };
}

// Brand words a row puts before a list of short link names ("eeBoo: [Go
// Fish], [Snap]"), so a card reads "eeBoo Go Fish" and not "Go Fish".
const PREFIX = [
  [/^eeBoo/, 'eeBoo'], [/^Matr Boomie/, 'Matr Boomie'], [/^Dr\. Earth/, 'Dr. Earth'],
  [/^Botanical Interests/, 'Botanical Interests'], [/goat milk/i, 'Goat Milk Soap:'],
  [/^Night's hemp/, 'Hemp'], [/^Arbico tools/, 'Arbico'], [/^Night's coasters/, 'Coaster:'],
  [/^Figurines/, 'Figurine:'], [/^Night's bowls/, ''], [/^Squishies/, 'Squishies:'],
  [/^The twenty-two Arbico DTE/, 'Down To Earth'], [/^GrowOrganic sacks/, ''],
  [/^Seven Springs pest/, ''], [/^Arbico compost and seed-starting tools/, 'Arbico'], [/^Herb bar: Frontier/, 'Frontier 1 lb'],
  [/^Heavy garden/, ''], [/^Live goods/, ''], [/^Display fixtures/, 'Display:'],
  [/^Peaceful Valley Gift Seed Tins/, ''], [/^Harvest/, ''],
];

// Link names that are too short to stand alone on a card, written out.
const RENAME = {
  '12"': 'Helen\'s Asian Kitchen Bamboo Spoon 12"', '10"': 'Helen\'s Asian Kitchen Bamboo Spoon 10"',
  'Corner': 'Helen\'s Asian Kitchen Bamboo Corner Spoon', 'Pierced': 'Helen\'s Asian Kitchen Bamboo Pierced Spoon',
  'Epsom Salt': 'Grandpa\'s Epsom Salt Bar Soap', 'Grandpa\'s Oatmeal': 'Grandpa\'s Oatmeal Bar Soap',
  'Indian Hemp': 'Nubian Heritage Indian Hemp Soap', 'South of France six scents': 'South of France Bar Soap',
  'Toilet Bowl Cleaner 24 oz, 4/case': 'Seventh Generation Toilet Bowl Cleaner 24 oz, 4/case',
  'Palanan horse-hair': 'Palanan Horse-Hair Toothbrush', 'The future is bamboo Unicorn (children)': 'The Future Is Bamboo Children\'s Toothbrush',
  'Ripple Edge Plate': 'World Centric Ripple Edge Plate 6"', 'Bagasse Bowl': 'World Centric Bagasse Bowl',
  'Repurpose Bowls': 'Repurpose Compostable Bowls', 'Plates': 'Repurpose Compostable Plates',
  'Utensils': 'Repurpose Compostable Utensils', 'Natural Brew Filters': 'Natural Brew Coffee Filters',
  'Compost Waste Bag': 'BioBag Compost Waste Bags', 'Food Scrap Bags': 'BioBag Food Scrap Bags',
  'Pet Waste': 'BioBag Pet Waste Bags', 'Lawn and Leaf': 'BioBag Lawn and Leaf Bags',
  'Large Food Storage': 'Preserve Large Food Storage', '19 oz': 'Preserve 19 oz Food Storage', 'Cutlery': 'Preserve Cutlery',
  'Toilet Tissue 240 sheets, 48/case': 'Seventh Generation Toilet Tissue, 48/case',
  'Paper Towel': 'Green Forest Paper Towel', 'Paper Towels 156 sheets': 'Seventh Generation Paper Towels',
  'Household Gloves': 'If You Care Household Gloves', 'Hand Soap 2.5 gal': 'Common Good Hand Soap 2.5 gal',
  'Oxygen Bleach 50 lb': 'Azure Oxygen Bleach 50 lb', 'Bio-tone 25 lb': 'Espoma Bio-tone 25 lb', 'Bone Meal 24 lb': 'Espoma Bone Meal 24 lb',
  'Dishmate 1 gal, 4/case': 'ECOS Pro Dishmate 1 gal, 4/case', 'Hand Soap 1 gal, 4/case': 'ECOS Pro Hand Soap 1 gal, 4/case',
  'Vinegar Glass Cleaner 1 gal, 4/case': 'ECOS Pro Vinegar Glass Cleaner 1 gal, 4/case', 'OxoBrite 8.5 lb, 4/case': 'ECOS Pro OxoBrite 8.5 lb, 4/case',
  'Chlorine-Free Bleach 64 oz, 6/case': 'Seventh Generation Chlorine-Free Bleach 64 oz, 6/case',
  'Feather Meal 50 lb': 'DTE Feather Meal 50 lb', 'All Purpose 25 lb': 'DTE All Purpose 25 lb', 'Acid Mix 25 lb': 'DTE Acid Mix 25 lb',
  'Bio-Live 50 lb': 'DTE Bio-Live 50 lb', 'Fish Bone Meal 40 lb': 'DTE Fish Bone Meal 40 lb', 'Alfalfa Meal 40 lb': 'DTE Alfalfa Meal 40 lb',
  'Tomato & Veg 15 lb': 'DTE Tomato & Veg 15 lb', 'Kreher 5-4-3, 40 lb': 'Kreher\'s 5-4-3, 40 lb',
  'My First Garden': 'Peaceful Valley Gift Seed Tin: My First Garden', 'Herbal Teas': 'Peaceful Valley Gift Seed Tin: Herbal Teas',
  'Three Sisters': 'Peaceful Valley Gift Seed Tin: Three Sisters', 'Companion Plants': 'Peaceful Valley Gift Seed Tin: Companion Plants',
  'Edible Front Yard': 'Peaceful Valley Gift Seed Tin: Edible Front Yard',
  'Peaceful Valley Gift Seed Tins: Salsa Fiesta': 'Peaceful Valley Gift Seed Tin: Salsa Fiesta',
  'Okra': 'Botanical Interests Okra Seeds', 'Collards': 'Botanical Interests Collards Seeds', 'Carrot': 'Botanical Interests Carrot Seeds',
  'Cucumber': 'Botanical Interests Cucumber Seeds', 'Armenian Cucumber': 'Botanical Interests Armenian Cucumber Seeds',
  'Eggplant': 'Botanical Interests Eggplant Seeds', 'Cabbage': 'Botanical Interests Cabbage Seeds',
  'Chinese Broccoli': 'Botanical Interests Chinese Broccoli Seeds', 'Amaranth': 'Botanical Interests Amaranth Seeds',
  'Sorrel': 'Botanical Interests Sorrel Seeds', 'Spaghetti Squash': 'Botanical Interests Spaghetti Squash Seeds',
  'Botanical Interests': 'Botanical Interests Seed Rack', 'High Mowing seed rack programme': 'High Mowing Seed Rack Program',
  'Jobe\'s Organics': 'Jobe\'s Organics Fertilizers', 'Worm Castings': 'ARBICO Earthworm Castings',
  'Chocoly': 'Chocoly Card Game', 'Swooble': 'Swooble Game', 'Illimat': 'Illimat Card Game', 'Skip-Bo': 'Skip-Bo Card Game',
  'Beat the Flood': 'Beat the Flood Game', 'DiPel 1 lb': 'DiPel DF Biological Insecticide 1 lb',
  'Caterpillar Killer II 16 oz': 'Safer Caterpillar Killer II 16 oz', 'Monterey Neem RTU': 'Monterey Neem Oil RTU',
  'Rustic Strength bulk sizes': 'Rustic Strength Bulk Refills (30 to 275 gal)', 'Fillaree bag-in-box': 'Fillaree Bag-in-Box Refills',
};

// ------------------------------------------------------------------ parsing
const LINK = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
const money = (s) => {
  // The first dollar figure that is NOT inside parentheses: "$14.32 ($125)"
  // is a price and an opening minimum.
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === '$' && depth === 0) {
      const m = s.slice(i).match(/^\$([\d,]+(?:\.\d\d)?)/);
      if (m) return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
    }
  }
  return null;
};
const kindOf = (s) => (s.match(/\b(WHOLESALE|RETAIL|MSRP|LISTED|HIDDEN|LIST)\b/) || [])[1] || '';
const plain = (s) => s.replace(LINK, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(/\s\|\s/).map((c) => c.trim());

function section(start, end) {
  const a = DOC.indexOf(start), b = DOC.indexOf(end, a + 1);
  if (a < 0 || b < 0) throw new Error(`STORE-PRODUCTS.md: cannot find the section "${start}"`);
  return DOC.slice(a, b).split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
}

const TABLES = [
  { tier: 0, rows: section('## 3. TIER 0', '### What Tier 0 asks'), cols: { cat: 2, price: 3, min: 4, src: 5 } },
  { tier: 1, rows: section('## 3A. TIER 1', '### What Tier 1 asks'), cols: { cat: 2, price: 3, min: 4, src: 5 } },
  { tier: 2, rows: section('## 4. TIER 2', '## 5. TIER 3'), cols: { cat: 2, price: 3, min: 4, src: 5 } },
  { tier: 3, rows: section('## 5. TIER 3', '## 6. TIER 4'), cols: { cat: 2, price: 3, min: 4, src: 5 } },
  { tier: 4, rows: section('## 6. TIER 4', '## 7. TIER 5'), cols: { cat: 2, price: 3, min: null, src: 4 } },
  { tier: 'Misc', rows: section('## 8. MISCELLANY', '\n---'), cols: { cat: null, price: 2, min: null, src: null } },
];

const out = [];
for (const t of TABLES) {
  for (const line of t.rows) {
    const c = cells(line);
    const rank = c[0];
    const cell = c[1];
    const category = t.cols.cat == null ? 'misc' : c[t.cols.cat].toLowerCase();
    const priceCell = c[t.cols.price] || '';
    const min = t.cols.min == null ? '' : plain(c[t.cols.min] || '');
    const src = t.cols.src == null ? '' : plain(c[t.cols.src] || '');
    const links = [...cell.matchAll(LINK)];
    if (!links.length) continue; // BWI, bundles, Tier 5 style rows: not a product
    const lead = plain(cell.slice(0, links[0].index));
    const pre = PREFIX.find(([re]) => re.test(lead) || re.test(cell));
    const prefix = pre ? pre[1] : '';
    const rowPrice = /hidden|see page/i.test(priceCell) ? null : money(priceCell);
    const kind = kindOf(priceCell) || kindOf(src) || (t.tier === 'Misc' && /MSRP/.test(priceCell) ? 'MSRP' : '');

    // Each link, with the text that follows it up to the next link. A price
    // in that text belongs to it, and to any links just before it that had
    // none ("[Go Fish], [Snap] $11.99" prices both).
    const groupOf = (idx) => (cell.slice(0, idx).match(/;/g) || []).length;
    const items = links.map((m, i) => {
      const after = cell.slice(m.index + m[0].length, i + 1 < links.length ? links[i + 1].index : cell.length);
      let name = m[1].trim();
      let price = null;
      if (name.includes('$')) { price = money(name); name = name.split(' $')[0].replace(/;.*$/, ''); }
      const inline = after.replace(/^\s*\/\s*/, '').split(/;|, (?=\[)/)[0];
      if (price == null) price = money(inline.split(/\[/)[0]);
      // A Tier 0 Bangalla row carries its SKU in brackets after the price:
      // "[Name](url) $2.71 (B-44494-1PK)". The dashboard matches costs by it.
      const sku = (after.match(/^[^[;]*?\((B-[A-Z0-9]+-\d+PK)\)/) || [])[1] || null;
      return { name, url: m[2], price, sku, group: groupOf(m.index), and: /^\s*and\s*$/.test(after) };
    });
    // "[Grandpa's Oatmeal] and [Epsom Salt] $5.74": the pair shares a price.
    for (let i = items.length - 2; i >= 0; i--) if (items[i].and && items[i].price == null) items[i].price = items[i + 1].price;
    // A row like "[DTE Blood Meal 12-0-0](arbico) / [4 lb at GrowOrganic](...)"
    // is ONE product with two sources: keep the first.
    const oneProduct = links.length === 2 && /^\s*\/\s*$/.test(cell.slice(links[0].index + links[0][0].length, links[1].index));
    const list = oneProduct ? [items[0]] : items;
    // Carry a price back only inside one ";" group, and only where most of
    // that group printed no price of its own (a list sharing one price).
    const hasInline = list.some((x) => x.price != null);
    const priced = new Set(list.filter((x) => x.price != null));
    for (let i = list.length - 1, carry = null, g = -1; i >= 0; i--) {
      const it = list[i];
      if (it.group !== g) { carry = null; g = it.group; }
      const mates = list.filter((x) => x.group === it.group);
      const shared = mates.filter((x) => priced.has(x)).length <= mates.length / 2;
      if (it.price != null) carry = it.price;
      else if (carry != null && shared) it.price = carry;
    }
    for (const it of list) {
      if (it.price == null && !hasInline) it.price = rowPrice;
      it.name = RENAME[it.name] || it.name;
      let name = it.name;
      if (prefix && !RENAME[name] && !Object.values(RENAME).includes(name) && !(prefix === 'Dr. Earth' && /Jobe/.test(name)) && !name.toLowerCase().startsWith(prefix.replace(/:$/, '').toLowerCase())) name = `${prefix} ${name}`;
      name = name.replace(/\s+/g, ' ').trim();
      const shelf = shelfFor(category, name);
      const supplier = (src.split(/[,;]/)[0] || new URL(it.url).hostname.replace(/^www\./, '').split('.')[0]).trim();
      // No price words: demo cards carry no price (owner, 2026-10-07).
      const bits = [`Tier ${t.tier}, rank ${rank}.`, `${supplier}.`];
      if (min && !/^none$/i.test(min)) bits.push(`Minimum ${min}.`);
      // Only the first clause after the supplier: what follows a ";" is a
      // note for the owner (login pages, restriction flags), not for a shopper.
      const rest = src.split(',').slice(1).join(',').split(';')[0].trim();
      if (rest) bits.push(rest.replace(/\.$/, '') + '.');
      let blurb = bits.join(' ');
      if (blurb.length > 200) blurb = blurb.slice(0, 197).replace(/\s+\S*$/, '') + '...';
      const why = t.cols.src == null ? '' : plain(c.slice(t.cols.src + 1).join(' | '));
      out.push({ tier: t.tier, rank, name, url: it.url, price: it.price || 0, shelf, blurb, kind, supplier, sku: it.sku, category, min, src, why });
    }
  }
}

// ------------------------------------------------------------------ write
const ids = new Set(real.map((p) => p.id));
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');
const tierOrder = (t) => (t === 'Misc' ? 9 : t);
out.sort((a, b) => tierOrder(a.tier) - tierOrder(b.tier) || Number(a.rank) - Number(b.rank));
// The dashboard's list: every tier, public facts only.
const tiersOut = out.map((p) => ({
  tier: p.tier, rank: p.rank, name: p.name, url: p.url, price: p.price, kind: p.kind,
  supplier: p.supplier, shelf: p.shelf.title, category: p.category, min: p.min, source: p.src, why: p.why,
  ...(p.sku ? { sku: p.sku } : {}),
}));
writeFileSync(join(ROOT, 'store-tiers.json'), JSON.stringify({
  _help: 'GENERATED by tools/demo-store.mjs from docs/STORE-PRODUCTS.md. Do not edit. Every tier, for the owner dashboard. Prices are public ones (list, retail, MSRP), in cents; never a supplier cost.',
  generated: new Date().toISOString().slice(0, 10),
  products: tiersOut,
}, null, 1) + '\n');

const ALL = process.argv.includes('--all');
const shown = ALL ? out : out.filter((p) => p.tier === 0);
const demo = shown.map((p) => {
  let id = 'demo-' + slug(p.name), n = 2;
  while (ids.has(id)) id = 'demo-' + slug(p.name) + '-' + n++;
  ids.add(id);
  return {
    id,
    name: p.name.length > 90 ? p.name.slice(0, 87).replace(/\s+\S*$/, '') + '...' : p.name,
    category: p.shelf.title,
    tags: ['demo', `tier ${String(p.tier).toLowerCase()}`, p.supplier.toLowerCase(), p.kind.toLowerCase()].filter(Boolean),
    icon: p.shelf.icon,
    blurb: p.blurb,
    price: p.price,
    oldPrice: null,
    interval: null,
    button: 'Supplier page',
    emailSubject: `Store question: ${p.name}`.slice(0, 120),
    supplierUrl: p.url,
    payLink: '',
    active: true,
    demo: true,
  };
});

data.products = [...real, ...demo];
writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + '\n');
const byShelf = {};
for (const p of demo) byShelf[p.category] = (byShelf[p.category] || 0) + 1;
console.log(`store-tiers.json: ${tiersOut.length} products across every tier.`);
console.log(`${demo.length} demo products written (${demo.filter((p) => !p.price).length} at $0.00, price not listed).`);
for (const [k, v] of Object.entries(byShelf)) console.log(`  ${k}: ${v}`);
