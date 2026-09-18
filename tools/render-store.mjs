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
//      one card per active product.
//   2. Any <a ... data-product="ID" ...> on any page: its href, so the
//      rec-sports and farms buttons check out through the same link.
//
// The site stays plain static HTML with no build step: this runs on the
// owner's machine before a push, and what it writes is ordinary markup that
// works with JavaScript off.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const EMAIL = 'support@lavishleaf.org';

const { products } = JSON.parse(readFileSync(join(ROOT, 'products.json'), 'utf8'));

// ------------------------------------------------------------------ validate
// A typo here reaches paying customers, so refuse rather than guess.
const seen = new Set();
for (const p of products) {
  const where = `product "${p.id ?? '?'}"`;
  if (!/^[a-z0-9-]+$/.test(p.id ?? '')) throw new Error(`${where}: id must be lower-case letters, digits and dashes`);
  if (seen.has(p.id)) throw new Error(`${where}: id used twice`);
  seen.add(p.id);
  if (!Number.isInteger(p.price) || p.price <= 0) throw new Error(`${where}: price must be whole CENTS, e.g. 2500 for $25.00`);
  if (p.oldPrice != null && (!Number.isInteger(p.oldPrice) || p.oldPrice <= p.price)) {
    throw new Error(`${where}: oldPrice must be whole cents and higher than price, or null`);
  }
  if (![null, undefined, 'month', 'year'].includes(p.interval)) throw new Error(`${where}: interval must be "month", "year" or null`);
  if (p.payLink && !/^https:\/\//.test(p.payLink)) throw new Error(`${where}: payLink must start with https://`);
  for (const f of ['name', 'button', 'emailSubject']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) throw new Error(`${where}: ${f} is required`);
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

function card(p) {
  return [
    '  <div class="product-card">',
    `    <div class="product-img">${esc(p.icon || '')}</div>`,
    `    <h3>${esc(p.name)}</h3>`,
    `    <div class="product-price">${priceLine(p)}</div>`,
    `    <a href="${esc(hrefFor(p))}"${linkAttrs(p)} class="btn btn-sm" data-product="${p.id}">${esc(p.button)}</a>`,
    '  </div>',
  ].join('\n');
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
    const cards = products.filter((p) => p.active !== false).map(card).join('\n\n');
    s = s.slice(0, b + B.length) + '\n' + cards + '\n' + s.slice(e);
  }

  // 2. Every tagged button, wherever it is. Only the href and the tab
  //    attributes are rewritten; the rest of the tag is the page's own.
  s = s.replace(/<a\b[^>]*\bdata-product="([a-z0-9-]+)"[^>]*>/g, (tag, id) => {
    const p = byId.get(id);
    if (!p) unknown.push(`${file}: data-product="${id}"`);
    let t = tag.replace(/\s+target="[^"]*"/g, '').replace(/\s+rel="[^"]*"/g, '');
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

const linked = products.filter((p) => p.active !== false && p.payLink).length;
const active = products.filter((p) => p.active !== false).length;
console.log(`${active} active products, ${linked} with a checkout link, ${active - linked} falling back to email.`);
if (CHECK) {
  if (changed.length) {
    console.log('OUT OF DATE: ' + changed.join(', ') + '. Run node tools/render-store.mjs');
    process.exit(1);
  }
  console.log('Every page matches products.json.');
} else {
  console.log(changed.length ? 'Rewrote: ' + changed.join(', ') : 'Nothing to change.');
}
