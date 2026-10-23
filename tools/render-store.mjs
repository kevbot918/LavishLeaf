#!/usr/bin/env node
// Render every product and checkout button on the site from products.json.
//
//   node tools/render-store.mjs          rewrite the pages
//   node tools/render-store.mjs --check  change nothing; exit 1 if a page is
//                                        out of date with products.json
//
// Why this exists: the owner, 2026-09-17: "I'd rather have a way that you can
// create some sort of pay links when I update products instead of having to
// create pay links for every time we have a product change." Before this, the
// same three products were typed out by hand in six places across three pages,
// and every button was a mailto. Now a product lives in ONE file.
//
// What it touches, and nothing else:
//   1. store.html, between <!-- PRODUCTS:BEGIN --> and <!-- PRODUCTS:END -->:
//      one Home shelf per category, one card per active product, and the
//      checkout mode stamped on <body data-checkout> for store.js.
//   2. Any <a ... data-product="ID" ...> on any page: its href, so the
//      rec-sports and farms buttons check out through the same link.
//   3. netlify/lib/catalog.mjs: the prices the checkout functions trust.
//
// Two checkout modes, chosen by "checkout" at the top of products.json:
//   "links" (the default): each button goes to its payLink, or an email.
//   "cart": one-off products get "Add to cart" and check out together
//           through PayPal (netlify/functions/checkout.mjs); a product with
//           an interval gets a Subscribe button (subscribe.mjs). Buttons on
//           other pages go to the Store with the product added. Turn it on
//           only once PayPal's keys are in Netlify and a sandbox order has
//           gone through; until then "links" keeps today's buttons.
//
// The site stays plain static HTML with no build step: this runs on the
// owner's machine before a push, and what it writes is ordinary markup that
// works with JavaScript off.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azureCard } from './azure-card.mjs';
import { palladiumCard } from './palladium-card.mjs';
import { FDA, SHELF as HERBAL, eeCard } from './earth-elements-card.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const EMAIL = 'support@lavishleaf.org';

const { products, checkout = 'links' } = JSON.parse(readFileSync(join(ROOT, 'products.json'), 'utf8'));
if (!['links', 'cart'].includes(checkout)) throw new Error('checkout must be "links" or "cart"');
const CART = checkout === 'cart';

// ------------------------------------------------------------------ validate
// A typo here reaches paying customers, so refuse rather than guess.
const seen = new Set();
for (const p of products) {
  const where = `product "${p.id ?? '?'}"`;
  if (!/^[a-z0-9-]+$/.test(p.id ?? '')) throw new Error(`${where}: id must be lower-case letters, digits, and dashes`);
  if (seen.has(p.id)) throw new Error(`${where}: id used twice`);
  seen.add(p.id);
  // A demo product (tools/demo-store.mjs) may show $0.00: its price is
  // simply not known yet. Nothing with "demo" can be bought.
  if (!Number.isInteger(p.price) || p.price < 0 || (p.price === 0 && !p.demo)) throw new Error(`${where}: price must be whole CENTS, e.g. 2500 for $25.00`);
  if (p.demo && !/^https:\/\//.test(p.supplierUrl || '')) throw new Error(`${where}: a demo product needs supplierUrl, an https:// link to the supplier's page`);
  if (p.oldPrice != null && (!Number.isInteger(p.oldPrice) || p.oldPrice <= p.price)) {
    throw new Error(`${where}: oldPrice must be whole cents and higher than price, or null`);
  }
  if (![null, undefined, 'month', 'year'].includes(p.interval)) throw new Error(`${where}: interval must be "month", "year" or null`);
  if (p.payLink && !/^https:\/\//.test(p.payLink)) throw new Error(`${where}: payLink must start with https://`);
  for (const f of ['paypalPlanId', 'paypalSandboxPlanId']) {
    if (p[f] != null && p[f] !== '' && !/^P-[A-Z0-9]+$/.test(p[f])) {
      throw new Error(`${where}: ${f} looks wrong (PayPal plan ids start with P-)`);
    }
  }
  for (const f of ['name', 'button', 'emailSubject']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) throw new Error(`${where}: ${f} is required`);
  }
  // A photo and a sentence are optional, because the emoji cards worked and
  // still do. But a typo in a path is a broken image on a page asking for
  // money, so the file has to be on disk before this will render.
  if (p.image != null && p.image !== '') {
    if (typeof p.image !== 'string' || /^[a-z]+:/i.test(p.image) || p.image.startsWith('/')) {
      throw new Error(`${where}: image must be a path inside this site, e.g. "images/compost.jpg"`);
    }
    if (!existsSync(join(ROOT, p.image))) {
      throw new Error(`${where}: image "${p.image}" is not in the site folder. Put the file there first.`);
    }
  }
  if (p.imageAlt != null && typeof p.imageAlt !== 'string') throw new Error(`${where}: imageAlt must be text`);
  // A product lives on exactly one Home shelf, named by its category. The
  // store page is a set of shelves now (2026-09-30, after the Symphonymph
  // app's Home), so a product with no category has nowhere to be drawn.
  if (typeof p.category !== 'string' || !p.category.trim()) throw new Error(`${where}: category is required, e.g. "Rec Sports"`);
  if (p.tags != null && !(Array.isArray(p.tags) && p.tags.every((t) => typeof t === 'string'))) {
    throw new Error(`${where}: tags must be a list of words`);
  }
  // Shipping (shipping.mjs, docs/SHIPPING.md): every product that can be
  // bought says whether it is posted, and a posted one has a packed weight.
  // A guessed weight is how a flat rate quietly loses money, so there is no
  // default.
  if (!p.demo && p.active !== false) {
    if (typeof p.ship !== 'boolean') throw new Error(`${where}: say "ship": true (it is posted) or false (a service, a registration, pickup only)`);
    if (p.ship && !(Number.isInteger(p.shipOz) && p.shipOz > 0)) throw new Error(`${where}: a posted product needs "shipOz", its packed weight in whole ounces`);
  }
  if (p.blurb != null && p.blurb !== '') {
    if (typeof p.blurb !== 'string') throw new Error(`${where}: blurb must be text`);
    if (p.blurb.length > 200) throw new Error(`${where}: blurb is ${p.blurb.length} characters; keep it under 200`);
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (cents) => '$' + (cents / 100).toFixed(2);

/** Where a button for this product goes: its checkout, else an email. */
function hrefFor(p) {
  if (p && p.active !== false && p.payLink) return p.payLink;
  const subject = p ? p.emailSubject : 'Store question';
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject).replace(/%20/g, ' ')}`;
}

/** Attributes that go with the href: a checkout opens in its own tab. */
function linkAttrs(p) {
  return p && p.active !== false && p.payLink ? ' target="_blank" rel="noopener"' : '';
}

function priceLine(p) {
  const per = p.interval ? ` every ${p.interval}` : '';
  const old = p.oldPrice ? ` <span class="old-price">${money(p.oldPrice)}</span>` : '';
  return `${money(p.price)}${per}${old}`;
}

/** A shelf's URL-safe name: "Farm & Garden" -> "farm-garden". */
const slug = (name) => name.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function card(p) {
  const button = p.demo
    ? `      <a href="${esc(p.supplierUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost">${esc(p.button || 'Supplier page')}</a>`
    : CART && !(p.interval && !hasPlan(p))
    ? p.interval
      ? `      <button type="button" class="btn btn-sm" data-subscribe="${p.id}"${p.pickup && p.oneTime ? ' data-plan="month"' : ''}>${esc(p.button)}</button>`
      : p.options
        ? `      <button type="button" class="btn btn-sm" data-choose="${p.id}">Choose ${esc(p.options.label.toLowerCase())}</button>`
        : `      <button type="button" class="btn btn-sm" data-cart-add="${p.id}">Add to cart</button>`
    : `      <a href="${esc(hrefFor(p))}"${linkAttrs(p)} class="btn btn-sm" data-product="${p.id}">${esc(p.button)}</a>`;
  // A photo when there is one, the emoji when there is not. Both sit in the
  // same box so a half-photographed store still lines up. The heart saves
  // the product to a wish list in this browser (store.js); without
  // JavaScript it is simply a button that does nothing, which is honest.
  const media = p.image
    ? `      <img src="${esc(p.image)}" alt="${esc(p.imageAlt || p.name)}" loading="lazy">`
    : `      <span class="sp-icon" aria-hidden="true">${esc(p.icon || '')}</span>`;
  const blurb = p.blurb ? [`    <p class="sp-blurb">${esc(p.blurb)}</p>`] : [];
  return [
    `  <article class="sp-card${p.demo ? ' sp-demo' : ''}" data-id="${p.id}" data-category="${esc(p.category)}">`,
    '    <div class="sp-media">',
    media,
    // A sale shows its saving on the photo (owner, 2026-10-11: "50% off").
    // Eco-friendly products (tools/eco.mjs) carry a small badge (owner, 2026-10-11).
    ...(p.eco && !p.demo ? ['      <span class="sp-eco" title="Eco-friendly: compostable, recycled, reusable, organic or natural material">Eco</span>'] : []),
    ...(p.oldPrice && !p.demo ? [`      <span class="sp-badge">${Math.round((1 - p.price / p.oldPrice) * 100)}% off</span>`] : []),
    `      <button type="button" class="sp-wish" data-wish="${p.id}" aria-pressed="false" aria-label="Save ${esc(p.name)} to a wish list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 4.5 6.4 4.1c2-.2 3.8.8 5.6 2.9 1.8-2.1 3.6-3.1 5.6-2.9 3.8.4 5.5 4.3 4 7.7C19.5 16.4 12 21 12 21z"/></svg></button>`,
    '    </div>',
    `    <h3 class="sp-name">${esc(p.name)}</h3>`,
    ...blurb,
    // Pick-ups: monthly or one time, chosen on the card (owner, 2026-10-16).
    ...(CART && p.pickup && p.oneTime && hasPlan(p) ? [`    <div class="sp-plan" role="group" aria-label="How often"><button type="button" data-plan-for="${p.id}" data-plan="month" aria-pressed="true">Monthly</button><button type="button" data-plan-for="${p.id}" data-plan="once" data-once="${money(p.oneTime)} one time" aria-pressed="false">One time</button></div>`] : []),
    '    <div class="sp-foot">',
    // Demo products show no price (owner, 2026-10-07: only the registrations
    // and the pick-up services carry a price until products are chosen).
    ...(p.demo ? [] : [`      <span class="sp-price">${priceLine(p)}</span>`]),
    button,
    '    </div>',
    '  </article>',
  ].join('\n');
}

// The Seeds shelf (owner, 2026-10-11): our partner SeedsNow's products,
// from seedsnow-home.json (tools/seedsnow-shelf.mjs). Never sold here: every
// card links out with our affiliate code, and store.js keeps the prices live.
const SEEDS = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'seedsnow-home.json'), 'utf8')); } catch { return null; } })();
function seedsShelf() {
  if (!SEEDS || !SEEDS.products.length) return '';
  const href = (h) => esc(`https://www.seedsnow.com/products/${h}?${SEEDS.affiliate}`);
  const cards = SEEDS.products.map((s) => [
    `  <article class="sp-card gs-sn-card" data-id="sn-${esc(s.handle)}" data-category="Seeds">`,
    '    <div class="sp-media">',
    `      <img src="${esc(s.image)}" alt="${esc(s.name)}" loading="lazy">`,
    '      <span class="sp-badge sp-partner">SeedsNow</span>',
    `      <button type="button" class="sp-wish" data-wish="sn-${esc(s.handle)}" aria-pressed="false" aria-label="Save ${esc(s.name)} to a wish list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 4.5 6.4 4.1c2-.2 3.8.8 5.6 2.9 1.8-2.1 3.6-3.1 5.6-2.9 3.8.4 5.5 4.3 4 7.7C19.5 16.4 12 21 12 21z"/></svg></button>`,
    '    </div>',
    `    <h3 class="sp-name">${esc(s.name)}</h3>`,
    `    <p class="sp-blurb">${esc(s.type ? s.type.replace(/^\*/, '') + ' seed' : 'Seed')} from our partner SeedsNow: non-GMO and open-pollinated.</p>`,
    '    <div class="sp-foot">',
    `      <span class="sp-price" data-sn-price="${esc(s.handle)}">${esc(s.price)}</span>`,
    `      <a class="btn btn-sm" href="${href(s.handle)}" target="_blank" rel="sponsored noopener" data-affiliate="SeedsNow" data-sn="${esc(s.handle)}">View at SeedsNow</a>`,
    '    </div>',
    '  </article>',
  ].join('\n'));
  return [
    '<section class="shelf" id="shelf-seeds" data-shelf="seeds" data-title="Seeds">',
    '  <div class="shelf-head">',
    '    <h2>Seeds</h2>',
    '    <a class="shelf-all" href="#shelf/seeds">See all</a>',
    '  </div>',
    '  <p class="shelf-note">From our seed partner SeedsNow. We earn commission on orders using these links, at no extra cost.</p>',
    '  <div class="shelf-row">',
    cards.join('\n\n'),
    '  </div>',
    '</section>',
  ].join('\n');
}

// The Azure Standard shelf (owner, 2026-10-14: its own Home shelf below
// Pets): four products from each Azure line in azure-home.json
// (tools/azure-shelf.mjs); every line is on Green Swaps. Affiliate links only.
const AZURE = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'azure-home.json'), 'utf8')); } catch { return null; } })();
function azureShelf() {
  if (!AZURE || !AZURE.home.length) return '';
  const all = new Map(AZURE.shelves.flatMap((s) => s.items).map((x) => [x.code, x]));
  return [
    '<section class="shelf" id="shelf-azure-standard" data-shelf="azure-standard" data-title="Azure Standard">',
    '  <div class="shelf-head">',
    '    <h2>Azure Standard</h2>',
    '    <a class="shelf-all" href="#swaps">See all</a>',
    '  </div>',
    '  <p class="shelf-note">Organic pantry staples from our partner Azure Standard, delivered to a Drop near you or to your door. We earn commission on orders using these links, at no extra cost.</p>',
    '  <div class="shelf-row">',
    AZURE.home.map((c) => all.get(c)).filter(Boolean).map((x) => azureCard(x)).join('\n\n'),
    '  </div>',
    '</section>',
  ].join('\n');
}

// Palladium Boots (owner, 2026-10-15): its own Home shelf under Azure, and
// waterproof picks at the end of Recreation & Outdoors; palladium-home.json
// from tools/palladium-shelf.mjs. Affiliate links only (Ascend, 10%).
const PALLADIUM = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'palladium-home.json'), 'utf8')); } catch { return null; } })();
const pdItem = (h) => PALLADIUM && PALLADIUM.items.find((x) => x.handle === h);
function palladiumShelf() {
  if (!PALLADIUM || !PALLADIUM.home.length) return '';
  return [
    '<section class="shelf" id="shelf-palladium-boots" data-shelf="palladium-boots" data-title="Palladium Boots">',
    '  <div class="shelf-head">',
    '    <h2>Palladium Boots</h2>',
    '    <a class="shelf-all" href="#palladium">See all</a>',
    '  </div>',
    '  <p class="shelf-note">Boots from our partner Palladium. Use code FALL20 for 20% off, and orders over $90 ship free. We earn commission on orders using these links, at no extra cost.</p>',
    '  <div class="shelf-row">',
    PALLADIUM.home.map(pdItem).filter(Boolean).map((x) => palladiumCard(x)).join('\n\n'),
    '  </div>',
    '</section>',
  ].join('\n');
}
// Earth Elements Organics (owner, 2026-10-23): its own Home shelf, "Herbal
// Oils & Balms", right after Personal Care, with every product they sell
// (retail, Craft Your Formula, wholesale); earth-elements-home.json from
// tools/earth-elements-shelf.mjs. Affiliate links only (Refersion).
const EARTH = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'earth-elements-home.json'), 'utf8')); } catch { return null; } })();
function herbalShelf() {
  if (!EARTH || !EARTH.home.length) return '';
  const byHandle = new Map(EARTH.items.map((x) => [x.handle, x]));
  return [
    '<section class="shelf" id="shelf-' + slug(HERBAL) + '" data-shelf="' + slug(HERBAL) + '" data-title="' + esc(HERBAL) + '">',
    '  <div class="shelf-head">',
    '    <h2>' + esc(HERBAL) + '</h2>',
    '    <a class="shelf-all" href="#shelf/' + slug(HERBAL) + '">See all</a>',
    '  </div>',
    '  <p class="shelf-note">Organic herbal oils, balms, and salves from our partner Earth Elements Organics, plus their Craft Your Formula and wholesale oils. We earn commission on orders using these links, at no extra cost. ' + esc(FDA) + '</p>',
    '  <div class="shelf-row">',
    EARTH.home.map((h) => byHandle.get(h)).filter(Boolean).map((x) => eeCard(x)).join('\n\n'),
    '  </div>',
    '</section>',
  ].join('\n');
}
// Azure on the Groceries shelf (owner, 2026-10-15: "a bit of a variety ...
// the best sellers of each category"): the first four of each food line in
// azure-home.json (each line is in Azure's own favorites order), at the end.
const AZURE_FOOD = ['Flour and grains', 'Beans and baking', 'Oils, honey and condiments', 'Snacks, nuts and drinks', 'Fresh and frozen, to a Drop'];
const azureGroceries = () => (AZURE ? AZURE.shelves.filter((s) => AZURE_FOOD.includes(s.title)).flatMap((s) => s.items.slice(0, 4)).map((x) => azureCard(x, 'Groceries')).join('\n\n') : '');
const palladiumOutdoor = () => (PALLADIUM ? PALLADIUM.outdoor.map(pdItem).filter(Boolean).map((x) => palladiumCard(x, 'Recreation & Outdoors')).join('\n\n') : '');

const SHORT = { 'Lavish Leaf Products & Services': 'Lavish Leaf' };

/** One Home shelf per category, in the order categories first appear. */
function shelves(active) {
  const note = active.some((p) => p.demo)
    ? '<p class="ss-demo-note"><strong>Demo catalog.</strong> These are products we are considering. They are not for sale yet, so they carry no price here; "Supplier page" opens the maker\'s own listing.</p>\n\n'
    : '';
  const groups = new Map();
  for (const p of active) {
    if (!groups.has(p.category)) groups.set(p.category, []);
    groups.get(p.category).push(p);
  }
  return note + [...groups].map(([name, ps]) => [
    // The sidebar's shorter name for our own shelf (owner, 2026-10-16).
    `<section class="shelf" id="shelf-${slug(name)}" data-shelf="${slug(name)}" data-title="${esc(name)}"${SHORT[name] ? ` data-short="${esc(SHORT[name])}"` : ''}>`,
    '  <div class="shelf-head">',
    `    <h2>${esc(name)}</h2>`,
    `    <a class="shelf-all" href="#shelf/${slug(name)}">See all</a>`,
    '  </div>',
    '  <div class="shelf-row">',
    // Palladium picks at the END of Recreation & Outdoors (owner, 2026-10-17:
    // "I no longer like having them at the beginning").
    (() => {
      const cards = ps.map(card);
      if (name === 'Groceries' && azureGroceries()) return cards.concat(azureGroceries()).join('\n\n');
      if (name === 'Recreation & Outdoors' && palladiumOutdoor()) return cards.concat(palladiumOutdoor()).join('\n\n');
      return cards.join('\n\n');
    })(),
    '  </div>',
    '</section>',
  ].join('\n') + (name === 'Farm & Garden' && seedsShelf() ? '\n\n' + seedsShelf() : '')
    + (name === 'Personal Care' && herbalShelf() ? '\n\n' + herbalShelf() : '')
    + (name === 'Pets' && azureShelf() ? '\n\n' + azureShelf() + (palladiumShelf() ? '\n\n' + palladiumShelf() : '') : '')).join('\n\n');
}

/** In cart mode a button on another page goes to the Store, product added. */
// A subscription with no PayPal plan yet keeps its email sign-up even in
// cart mode (2026-10-11), so nobody meets a "not set up yet" error.
const hasPlan = (p) => !!(p && (p.paypalPlanId || p.paypalSandboxPlanId));
function cartHref(p) {
  if (!p || p.active === false) return hrefFor(null);
  if (p.interval && !hasPlan(p)) return hrefFor(p);
  return p.interval ? `store.html?subscribe=${p.id}` : `store.html?add=${p.id}`;
}

const byId = new Map(products.map((p) => [p.id, p]));
const changed = [];
const unknown = [];

for (const file of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const path = join(ROOT, file);
  const before = readFileSync(path, 'utf8');
  let s = before;

  // 1. The Store grid.
  const B = '<!-- PRODUCTS:BEGIN -->', E = '<!-- PRODUCTS:END -->';
  const b = s.indexOf(B), e = s.indexOf(E);
  if (b >= 0 && e > b) {
    s = s.slice(0, b + B.length) + '\n' + shelves(products.filter((p) => p.active !== false)) + '\n' + s.slice(e);
    // store.js reads this to know whether a cart exists on this deploy.
    s = s.replace(/<body([^>]*?)\sdata-checkout="[a-z]+"/, `<body$1 data-checkout="${checkout}"`);
  }

  // The cart script, on the Store page only and only in cart mode, so the
  // links mode costs visitors nothing.
  if (b >= 0 && e > b) {
    const TAG = '<script src="cart.js" defer></script>\n';
    // One tag, whatever the line endings (a CRLF file once collected three).
    s = s.replace(/<script src="cart\.js" defer><\/script>\r?\n?/g, '');
    if (CART) s = s.replace('</body>', TAG + '</body>');
  }

  // 2. Every tagged button, wherever it is. Only the href and the tab
  //    attributes are rewritten; the rest of the tag is the page's own.
  s = s.replace(/<a\b[^>]*\bdata-product="([a-z0-9-]+)"[^>]*>/g, (tag, id) => {
    const p = byId.get(id);
    if (!p) unknown.push(`${file}: data-product="${id}"`);
    let t = tag.replace(/\s+target="[^"]*"/g, '').replace(/\s+rel="[^"]*"/g, '');
    if (CART) return t.replace(/\bhref="[^"]*"/, `href="${esc(cartHref(p))}"`);
    t = t.replace(/\bhref="[^"]*"/, `href="${esc(hrefFor(p))}"`);
    return t.replace(/^<a\b/, '<a' + linkAttrs(p));
  });

  if (s !== before) {
    changed.push(file);
    if (!CHECK) writeFileSync(path, s);
  }
}

if (unknown.length) {
  console.error('Buttons name a product that products.json does not have:\n  ' + unknown.join('\n  '));
  process.exit(2);
}

// 3. The catalog the checkout functions price from. Only what they need.
{
  const catalog = {};
  for (const p of products) {
    if (p.demo) continue; // never sold: the checkout functions do not know them
    catalog[p.id] = {
      id: p.id,
      name: p.name,
      price: p.price,
      interval: p.interval || null,
      active: p.active !== false,
      paypalPlanId: p.paypalPlanId || null,
      paypalSandboxPlanId: p.paypalSandboxPlanId || null,
      ship: p.ship === true,
      shipOz: p.ship === true ? p.shipOz : null,
      shipFrom: p.ship === true ? (p.shipFrom || 'bangalla') : null,
      // CJ items carry their own freight (shipping.mjs "cj").
      shipCents: p.ship === true && Number.isInteger(p.shipCents) ? p.shipCents : null,
      shipAddCents: p.ship === true && Number.isInteger(p.shipAddCents) ? p.shipAddCents : null,
      shipWarehouse: p.ship === true && p.source && p.source.warehouse === 'CN' ? 'CN' : null,
      // Options (scent, colour, size): the names the server accepts.
      options: p.options ? { label: p.options.label, values: p.options.values.map((v) => v.name) } : null,
      // Pick-up services take the sign-up form; "bucket" is the optional
      // bucket price in cents (netlify/lib/pickups.mjs).
      pickup: p.pickup === true,
      // League registrations take the player or team form (registrations.mjs).
      registration: p.registration === 'player' || p.registration === 'team' ? p.registration : null,
      league: p.registration ? String(p.league || p.category || '') : null,
      bucket: p.pickup === true && Number.isInteger(p.bucket) ? p.bucket : null,
      // A one-time pick-up price in cents (owner, 2026-10-16): subscribe.mjs once.
      oneTime: p.pickup === true && Number.isInteger(p.oneTime) && p.oneTime > 0 ? p.oneTime : null,
      // Groceries carry the grocery tax rate (tax.mjs).
      grocery: p.grocery === true,
      // The server refuses an order without its waiver (checkout.mjs), so
      // the waiver has to be in the catalog the server reads.
      waiver: p.waiver ? { version: p.waiver.version } : null,
      // The supplier's code, for the stock check (netlify/lib/stock.mjs,
      // 2026-10-13): Bangalla SKUs (each option its own), AliExpress item id.
      supplier: p.source ? { name: p.source.supplier || '', sku: p.source.sku || null, item: p.source.item || null,
        optionSkus: p.options && p.options.values.some((v) => v.sku) ? Object.fromEntries(p.options.values.filter((v) => v.sku).map((v) => [v.name, v.sku])) : null,
        // CJ Dropshipping (2026-10-14): the product id and the variant id(s).
        pid: p.source.pid || null, vid: p.source.vid || null, warehouse: p.source.warehouse || (p.source.pid ? 'US' : null),
        optionVids: p.options && p.options.values.some((v) => v.vid) ? Object.fromEntries(p.options.values.filter((v) => v.vid).map((v) => [v.name, v.vid])) : null,
        // Printful (2026-10-14): the sync variant id(s) a draft order needs.
        sv: p.source.sv || null,
        optionSv: p.options && p.options.values.some((v) => v.pf) ? Object.fromEntries(p.options.values.filter((v) => v.pf).map((v) => [v.name, v.pf])) : null } : null,
    };
  }
  const path = join(ROOT, 'netlify', 'lib', 'catalog.mjs');
  const text =
    '// GENERATED by tools/render-store.mjs from products.json. Do not edit.\n' +
    '// The checkout functions price every order from this, never from the browser.\n' +
    'export const catalog = ' + JSON.stringify(catalog, null, 2) + ';\n';
  let before = '';
  try {
    before = readFileSync(path, 'utf8');
  } catch {
    // Not generated yet.
  }
  if (before !== text) {
    changed.push('netlify/lib/catalog.mjs');
    if (!CHECK) writeFileSync(path, text);
  }
}

console.log(`Checkout mode: ${checkout}.`);
const linked = products.filter((p) => p.active !== false && p.payLink).length;
const active = products.filter((p) => p.active !== false && !p.demo).length;
const demos = products.filter((p) => p.active !== false && p.demo).length;
console.log(`${active} active products, ${linked} with a checkout link, ${active - linked} falling back to email.`);
if (demos) console.log(`${demos} demo products on the shelves (not for sale; tools/demo-store.mjs --remove takes them off).`);
if (CHECK) {
  if (changed.length) {
    console.log('OUT OF DATE: ' + changed.join(', ') + '. Run node tools/render-store.mjs');
    process.exit(1);
  }
  console.log('Every page matches products.json.');
} else {
  console.log(changed.length ? 'Rewrote: ' + changed.join(', ') : 'Nothing to change.');
}
