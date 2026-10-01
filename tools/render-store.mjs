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
  if (!/^[a-z0-9-]+$/.test(p.id ?? '')) throw new Error(`${where}: id must be lower-case letters, digits and dashes`);
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
    : CART
    ? p.interval
      ? `      <button type="button" class="btn btn-sm" data-subscribe="${p.id}">${esc(p.button)}</button>`
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
    `      <button type="button" class="sp-wish" data-wish="${p.id}" aria-pressed="false" aria-label="Save ${esc(p.name)} to a wish list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 4.5 6.4 4.1c2-.2 3.8.8 5.6 2.9 1.8-2.1 3.6-3.1 5.6-2.9 3.8.4 5.5 4.3 4 7.7C19.5 16.4 12 21 12 21z"/></svg></button>`,
    '    </div>',
    `    <h3 class="sp-name">${esc(p.name)}</h3>`,
    ...blurb,
    '    <div class="sp-foot">',
    `      <span class="sp-price">${priceLine(p)}</span>`,
    button,
    '    </div>',
    '  </article>',
  ].join('\n');
}

/** One Home shelf per category, in the order categories first appear. */
function shelves(active) {
  const note = active.some((p) => p.demo)
    ? '<p class="ss-demo-note"><strong>Demo catalogue.</strong> These are products we are considering, shown at the supplier\'s listed price ($0.00 where no price is published). They are not for sale yet; "Supplier page" opens the maker\'s own listing.</p>\n\n'
    : '';
  const groups = new Map();
  for (const p of active) {
    if (!groups.has(p.category)) groups.set(p.category, []);
    groups.get(p.category).push(p);
  }
  return note + [...groups].map(([name, ps]) => [
    `<section class="shelf" id="shelf-${slug(name)}" data-shelf="${slug(name)}" data-title="${esc(name)}">`,
    '  <div class="shelf-head">',
    `    <h2>${esc(name)}</h2>`,
    `    <a class="shelf-all" href="#shelf/${slug(name)}">See all</a>`,
    '  </div>',
    '  <div class="shelf-row">',
    ps.map(card).join('\n\n'),
    '  </div>',
    '</section>',
  ].join('\n')).join('\n\n');
}

/** In cart mode a button on another page goes to the Store, product added. */
function cartHref(p) {
  if (!p || p.active === false) return hrefFor(null);
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
    if (CART && !s.includes(TAG)) s = s.replace('</body>', TAG + '</body>');
    if (!CART) s = s.split(TAG).join('');
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
      // The server refuses an order without its waiver (checkout.mjs), so
      // the waiver has to be in the catalog the server reads.
      waiver: p.waiver ? { version: p.waiver.version } : null,
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
