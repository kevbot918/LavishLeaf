#!/usr/bin/env node
// Lavish Leaf apparel from Printful into products.json (2026-10-14).
//
//   node tools/printful-import.mjs            show what would change
//   node tools/printful-import.mjs --write    write products.json + photos
//
// Reads PRINTFUL_API_TOKEN (and PRINTFUL_STORE_ID if set) from .env, which is
// never committed. For every product in the Printful store it takes the
// variants that are enabled, the retail prices the owner set in Printful,
// the mockup photos, and Printful's own shipping to Stigler (one unit, and
// what a second adds). Sizes priced higher (2XL and up, usually) become their
// own product, because a product here has one price. Prints Printful's cost
// and our margin after PayPal for each one: costs are private, so they are
// printed, never written to the repository.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, storeProducts, shippingCents } from '../netlify/lib/printful.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const FLOOR = 15; // margin floor, percent (owner, 2026-10-11)
const env = Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!env.PRINTFUL_API_TOKEN) { console.error('Add PRINTFUL_API_TOKEN=... to .env first.'); process.exit(1); }
const opts = { env };
const SHELF = 'Lavish Leaf Products & Services'; // our own shelf, first on Home (owner, 2026-10-16)
const STIGLER = { address1: '1 Main St', city: 'Stigler', state_code: 'OK', zip: '74462', country_code: 'US' };
const slug = (s) => s.toLowerCase().replace(/['.]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL', '6XL'];
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(String(s || '').toUpperCase()); return i < 0 ? 99 : i; };
const ozFor = (t) => /hoodie|sweatshirt|crewneck|jacket/i.test(t) ? 20 : /mug|tumbler|bottle/i.test(t) ? 16 : /hat|cap|beanie/i.test(t) ? 5 : /sticker/i.test(t) ? 1 : /tote|bag/i.test(t) ? 8 : 7;
const nice = (c) => { let d = Math.floor(c / 100) * 100; for (const e of [49, 99, 149]) if (d + e >= c) return d + e; return d + 149; };

const catalogCache = new Map();
async function catalogVariant(id) {
  if (!catalogCache.has(id)) catalogCache.set(id, await call('/products/variant/' + id, opts));
  return catalogCache.get(id);
}

const j = JSON.parse(readFileSync(join(ROOT, 'products.json'), 'utf8'));
const items = await storeProducts(opts);
console.log('Printful store products:', items.length);
const made = [], photos = [];
for (const { sync_product: sp, sync_variants: svs } of items) {
  const live = (svs || []).filter((v) => !v.is_ignored && v.availability_status !== 'discontinued' && v.availability_status !== 'out_of_stock');
  if (!live.length) { console.log('SKIP (no live variants):', sp.name); continue; }
  const first = await catalogVariant(live[0].variant_id);
  const productType = (first.product && (first.product.type_name || first.product.title)) || '';
  const model = first.product ? first.product.title || '' : '';
  // Group by retail price (one price per product here).
  const groups = new Map();
  for (const v of live) { const k = Math.round(Number(v.retail_price) * 100); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); }
  const ordered = [...groups].sort((a, b) => a[0] - b[0]);
  for (const [gi, [setCents, vs]] of ordered.entries()) {
    let cents = setCents;
    vs.sort((a, b) => String(a.color).localeCompare(String(b.color)) || sizeRank(a.size) - sizeRank(b.size));
    const colors = [...new Set(vs.map((v) => v.color).filter(Boolean))];
    const sizes = [...new Set(vs.map((v) => v.size).filter(Boolean))];
    const big = ordered.length > 1 && gi > 0;
    // "Unisex Hoodie - Symphonymph" -> "Unisex Hoodie: Symphonymph"
    const name = sp.name.replace(/\s+[-–—]\s+/g, ': ').replace(/’/g, "'") + (big ? ' (' + sizes.join(', ') + ')' : '');
    const id = 'pf-' + slug(sp.name) + (big ? '-' + slug(sizes[0]) + '-up' : '');
    let options = null;
    const valueName = (v) => colors.length > 1 && sizes.length > 1 ? v.color + ', ' + v.size : sizes.length > 1 ? v.size : colors.length > 1 ? v.color : null;
    if (vs.length > 1) {
      const label = colors.length > 1 && sizes.length > 1 ? 'Color and size' : sizes.length > 1 ? 'Size' : 'Color';
      options = { label, values: vs.map((v) => ({ name: valueName(v), pf: v.id, note: v.name })) };
    }
    // Photos: the mockup of the first variant (per color when there are several).
    const preview = (v) => ((v.files || []).find((f) => f.type === 'preview') || {}).preview_url || (v.product && v.product.image) || sp.thumbnail_url;
    const image = 'images/store/pf-' + sp.id + (big ? '-' + gi : '') + '.jpg';
    if (!existsSync(join(ROOT, image))) photos.push([preview(vs[0]), image]);
    // Shipping to Stigler: one unit, and what a second unit adds.
    const one = await shippingCents([{ variant_id: vs[0].variant_id, quantity: 1 }], STIGLER, opts);
    const two = await shippingCents([{ variant_id: vs[0].variant_id, quantity: 2 }], STIGLER, opts);
    // Cost (private): the dearest variant's catalog price.
    let cost = 0;
    for (const v of vs) { const cv = await catalogVariant(v.variant_id); cost = Math.max(cost, Math.round(Number(cv.variant && cv.variant.price) * 100) || 0); }
    // The owner's own Printful prices, exactly (2026-10-15: "change those back
    // to the prices I had set on Printful"). Under the floor is only warned.
    const floorCents = nice(Math.ceil((cost + 49) / (1 - 0.0349 - FLOOR / 100)));
    const raised = false;
    const margin = Math.round(((cents - cost - (cents * 0.0349 + 49)) / cents) * 100);
    let minCost = Infinity;
    for (const v of vs) { const cv = await catalogVariant(v.variant_id); minCost = Math.min(minCost, Math.round(Number(cv.variant && cv.variant.price) * 100) || Infinity); }
    const common = Math.round(((cents - minCost - (cents * 0.0349 + 49)) / cents) * 100);
    const blurb = (`Our own Lavish Leaf design on ${/^[aeiou]/i.test(productType) ? 'an' : 'a'} ${productType.toLowerCase() || 'item'}${model ? ' (' + model.split('|').pop().trim() + ')' : ''}, printed for you when you order.` +
      (colors.length > 1 ? ' In ' + colors.join(', ').toLowerCase() + '.' : '')).slice(0, 199);
    made.push({
      id, name, category: SHELF, tags: ['lavish leaf', 'merch', 'apparel', ...new Set(slug(name + ' ' + productType).split('-').filter((w) => w.length > 2))],
      image, imageAlt: name, blurb, price: cents, oldPrice: null, interval: null, button: 'Add to cart',
      emailSubject: 'Store order: ' + name, payLink: '', active: true,
      ship: true, shipOz: ozFor(productType + ' ' + sp.name), shipFrom: 'printful',
      shipCents: one ? one.cents : 599, shipAddCents: one && two ? Math.max(0, two.cents - one.cents) : 250,
      ...(options ? { options } : {}),
      source: { supplier: 'Printful', item: String(sp.id), sv: String(vs[0].id), variant: vs[0].name },
    });
    console.log(`${name} | $${(cents / 100).toFixed(2)}${raised ? ' (yours $' + (setCents / 100).toFixed(2) + ')' : ''} | cost $${(minCost / 100).toFixed(2)} to $${(cost / 100).toFixed(2)} | margin ${common}% common sizes, ${margin}% dearest | ship $${((one ? one.cents : 0) / 100).toFixed(2)} +$${(((two && one) ? two.cents - one.cents : 0) / 100).toFixed(2)} | ${options ? options.label + ': ' + options.values.length : 'one variant'}` +
      (margin < 15 ? '   <-- under 15%' : '') + (!/(49|99)$/.test(String(cents)) ? '   (price not .49/.99; ' + (cents / 100).toFixed(2) + ' -> ' + (nice(cents) / 100).toFixed(2) + '?)' : ''));
  }
}
if (!WRITE) { console.log('\nDry run. Add --write to put these on the store.'); process.exit(0); }
// Replace earlier imports, keep everything else; the apparel leads its shelf
// (owner, 2026-10-14: on Recreation & Outdoors), which keeps its place on Home.
const keep = j.products.filter((p) => !(p.source && p.source.supplier === 'Printful'));
// Names and descriptions written by hand on the store stay (2026-10-14).
for (const m of made) { const old = j.products.find((p) => p.id === m.id); if (old) { m.name = old.name; m.imageAlt = old.imageAlt; m.emailSubject = old.emailSubject; m.blurb = old.blurb; m.tags = old.tags; } }
// After the pick-ups and registrations on our own shelf.
let at = keep.map((p) => p.category === SHELF).lastIndexOf(true) + 1;
if (at <= 0) at = 0;
j.products = [...keep.slice(0, at), ...made, ...keep.slice(at)];
writeFileSync(join(ROOT, 'products.json'), JSON.stringify(j, null, 2) + '\n');
if (photos.length) {
  const list = join(ROOT, 'tools', '.printful-photos.json');
  writeFileSync(list, JSON.stringify(photos));
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT, 'tools', 'getimg.ps1'), list, ROOT], { stdio: 'inherit' });
}
console.log(`Wrote ${made.length} apparel products; ${photos.length} photos fetched. Next: node tools/render-store.mjs && node tools/seo.mjs`);
