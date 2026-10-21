// One-time backfill of the Books sheet (2026-10-21, docs/BOOKS.md): replays
// every PAID order, one-time pick-up and donation already filed in Netlify
// Blobs, asking PayPal for each capture (amount and fee), and writes the same
// rows the live functions write. Rows already in the sheet are skipped by
// Source ID, so running it twice is safe.
//
//   node tools/books-backfill.mjs            dry run: prints the rows, writes nothing
//   node tools/books-backfill.mjs --write    writes them to the sheet
//
// Reads from .env (never committed, values never printed):
//   NETLIFY_API_TOKEN, NETLIFY_SITE_ID         to read the Blobs stores
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET            the LIVE PayPal keys
//   BOOKS_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY   (only for --write)
// Monthly pick-up payments and refunds are not replayed: PayPal's own
// activity report has them (the accounting session reconciles from it).
import { readFileSync } from 'node:fs';
import { appendRows, donationRows, orderRows } from '../netlify/lib/books.mjs';
import { call, config } from '../netlify/lib/paypal.mjs';

const env = { ...Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])), PAYPAL_ENV: 'live' };
const WRITE = process.argv.includes('--write');
const need = ['NETLIFY_API_TOKEN', 'NETLIFY_SITE_ID', 'PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', ...(WRITE ? ['BOOKS_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'] : [])].filter((k) => !env[k]);
if (need.length) { console.error('Add to .env first: ' + need.join(', ')); process.exit(1); }

// Loaded after the .env check, so a missing key is reported first (npm install brings it).
const { getStore } = await import('@netlify/blobs').catch(() => { console.error('Run npm install first (it brings @netlify/blobs).'); process.exit(1); });
const store = (name) => getStore({ name, siteID: env.NETLIFY_SITE_ID, token: env.NETLIFY_API_TOKEN, consistency: 'strong' });
async function all(name, prefix) {
  const s = store(name);
  const { blobs } = await s.list({ prefix });
  const out = [];
  for (const b of blobs) { const r = await s.get(b.key, { type: 'json' }).catch(() => null); if (r) out.push(r); }
  return out;
}

const cfg = config(env);
const orderIds = [];
for (const o of await all('orders', 'o-')) if (o.id) orderIds.push(['order', o.id]);
for (const p of await all('pickups', 's-')) if (p.once && p.orderId && p.payments) orderIds.push(['order', p.orderId]);
for (const d of await all('donations', 'd-')) if (d.id) orderIds.push(['donation', d.id]);

const rows = [];
for (const [kind, id] of orderIds) {
  try {
    const done = await call(cfg, `/v2/checkout/orders/${id}`, null, { method: 'GET' });
    const r = kind === 'donation' ? donationRows(done) : orderRows(done);
    if (!r.length) console.log(`${id}: no completed capture, skipped`);
    rows.push(...r);
  } catch (e) { console.log(`${id}: PayPal lookup failed (${e.message})`); }
}
console.log(`${orderIds.length} paid record(s), ${rows.length} row(s):`);
for (const r of rows) console.log([r.date, r.description, r.category, r.in, r.out, r.notes, r.source].join(' | '));
if (!WRITE) { console.log('Dry run: nothing written. Add --write to write them.'); process.exit(0); }
const res = await appendRows(rows, env);
console.log(`Written ${res.written}, already in the sheet ${res.skipped}.`);
