#!/usr/bin/env node
// Create and update Stripe Payment Links from products.json, so a product
// change never means hand-making a checkout link.
//
//   node tools/sync-stripe.mjs           show what WOULD change (safe; default)
//   node tools/sync-stripe.mjs --apply   make the changes in Stripe, write the
//                                        links into products.json, re-render
//
// Needs STRIPE_KEY in a file named .env beside products.json:
//   STRIPE_KEY=rk_live_...
// Use a RESTRICTED key (Stripe Dashboard > Developers > API keys > Create
// restricted key) with WRITE on Products, Prices and Payment Links and nothing
// else. Never the full secret key. .env is gitignored; this repository is the
// public website, so a key committed here would be published.
//
// What it does for each product, and why:
//  - A Stripe Product per id (remembered as stripeProduct).
//  - A Price. Stripe Prices cannot be edited, so a new price or interval makes a
//    NEW Price and archives the old one.
//  - A Payment Link on that Price. When the price changes, the old link is
//    switched off, so a bookmarked link cannot still charge last season's
//    price. A subscription (interval) gets a subscription checkout.
//  - active:false in products.json switches its link off.
// Then it re-renders every page (tools/render-store.mjs).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const FILE = join(ROOT, 'products.json');

function loadKey() {
  if (process.env.STRIPE_KEY) return process.env.STRIPE_KEY;
  const env = join(ROOT, '.env');
  if (!existsSync(env)) return null;
  for (const line of readFileSync(env, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*STRIPE_KEY\s*=\s*['"]?([^'"\s]+)['"]?\s*$/);
    if (m) return m[1];
  }
  return null;
}

const key = loadKey();
if (APPLY && !key) {
  console.error('No STRIPE_KEY. Put a restricted key in .env (see the top of this file).');
  process.exit(1);
}
if (key && !/^(rk|sk)_(live|test)_/.test(key)) {
  console.error('STRIPE_KEY does not look like a Stripe key (rk_live_..., rk_test_...).');
  process.exit(1);
}
if (key && key.startsWith('sk_')) {
  console.warn('Warning: this is a FULL secret key. A restricted key (rk_) limited to Products, Prices and Payment Links is safer.');
}

async function stripe(method, path, form) {
  const body = form ? new URLSearchParams(form).toString() : undefined;
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

const doc = JSON.parse(readFileSync(FILE, 'utf8'));
const plan = [];
const say = (id, what) => plan.push(`${id}: ${what}`);

for (const p of doc.products) {
  const interval = p.interval || null;
  const wantPrice = p.price;
  const priceMoved = p.stripePrice && (p.stripePriceAmount !== wantPrice || (p.stripeInterval || null) !== interval);

  if (p.active === false) {
    if (p.stripeLink) {
      say(p.id, 'inactive: switch its payment link off');
      if (APPLY) {
        await stripe('POST', `/payment_links/${p.stripeLink}`, { active: 'false' });
        p.payLink = '';
        delete p.stripeLink;
      }
    }
    continue;
  }

  // A payLink pasted by hand (PayPal, Square, a Stripe link made in the
  // dashboard) is the owner's choice: leave it alone.
  if (p.payLink && !p.stripeLink) {
    say(p.id, 'has a hand-made payLink; left alone');
    continue;
  }

  if (!p.stripeProduct) {
    say(p.id, `create product "${p.name}"`);
    if (APPLY) {
      const prod = await stripe('POST', '/products', { name: p.name, 'metadata[sku]': p.id });
      p.stripeProduct = prod.id;
    }
  } else if (p.stripeName !== p.name) {
    say(p.id, `rename product to "${p.name}"`);
    if (APPLY) await stripe('POST', `/products/${p.stripeProduct}`, { name: p.name });
  }
  if (APPLY) p.stripeName = p.name;

  let newPrice = false;
  if (!p.stripePrice || priceMoved) {
    const label = `$${(wantPrice / 100).toFixed(2)}${interval ? ' every ' + interval : ''}`;
    say(p.id, priceMoved ? `price changed: new price ${label}, archive the old one` : `create price ${label}`);
    if (APPLY) {
      const form = { product: p.stripeProduct, currency: 'usd', unit_amount: String(wantPrice) };
      if (interval) form['recurring[interval]'] = interval;
      const price = await stripe('POST', '/prices', form);
      if (p.stripePrice) await stripe('POST', `/prices/${p.stripePrice}`, { active: 'false' });
      p.stripePrice = price.id;
      p.stripePriceAmount = wantPrice;
      p.stripeInterval = interval;
    }
    newPrice = true;
  }

  if (newPrice || !p.stripeLink) {
    say(p.id, p.stripeLink ? 'new payment link; switch the old one off' : 'create payment link');
    if (APPLY) {
      const link = await stripe('POST', '/payment_links', {
        'line_items[0][price]': p.stripePrice,
        'line_items[0][quantity]': '1',
        'metadata[sku]': p.id,
      });
      if (p.stripeLink) await stripe('POST', `/payment_links/${p.stripeLink}`, { active: 'false' });
      p.stripeLink = link.id;
      p.payLink = link.url;
    }
  }
}

if (!plan.length) {
  console.log('Stripe already matches products.json. Nothing to do.');
} else {
  console.log((APPLY ? 'Done:\n  ' : 'Would do (run with --apply to make it so):\n  ') + plan.join('\n  '));
}

if (APPLY) {
  writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'render-store.mjs')], { stdio: 'inherit' });
  console.log('Now review the pages and git push. Netlify publishes on push.');
}
