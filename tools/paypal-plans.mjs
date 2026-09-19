#!/usr/bin/env node
// Create the PayPal subscription plan for every product with an interval
// (the monthly compost pick-up) and write its id into products.json. Run once
// per environment; a product that already has a plan id is left alone, so
// running it again changes nothing.
//
//   node tools/paypal-plans.mjs                  sandbox, dry run: says what it would create
//   node tools/paypal-plans.mjs --apply          sandbox, creates the plans
//   node tools/paypal-plans.mjs --live --apply   the real PayPal account
//
// Credentials are read from ../.env.tools beside the repo or from the
// environment, never from the command line, and never printed:
//   PAYPAL_CLIENT_ID / PAYPAL_SECRET                 live
//   PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_SANDBOX_SECRET sandbox
// Then run node tools/render-store.mjs so the checkout catalog carries the id.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live');
const APPLY = process.argv.includes('--apply');
const FIELD = LIVE ? 'paypalPlanId' : 'paypalSandboxPlanId';
const BASE = LIVE ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

// .env.tools: KEY=value lines. Read here so a secret never has to be typed
// into a shell, where it would land in the history.
const env = { ...process.env };
for (const file of [join(ROOT, '.env.tools'), join(ROOT, '..', '.env.tools')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const id = LIVE ? env.PAYPAL_CLIENT_ID : env.PAYPAL_SANDBOX_CLIENT_ID;
const secret = LIVE ? env.PAYPAL_SECRET : env.PAYPAL_SANDBOX_SECRET;

const file = join(ROOT, 'products.json');
const data = JSON.parse(readFileSync(file, 'utf8'));
const todo = data.products.filter((p) => p.interval && p.active !== false && !p[FIELD]);

console.log(`${LIVE ? 'LIVE' : 'Sandbox'} PayPal. ${todo.length} plan(s) to create: ${todo.map((p) => p.id).join(', ') || 'none'}.`);
if (!todo.length) process.exit(0);
if (!APPLY) {
  console.log('Dry run. Add --apply to create them.');
  process.exit(0);
}
if (!id || !secret) {
  console.error(`Missing ${LIVE ? 'PAYPAL_CLIENT_ID / PAYPAL_SECRET' : 'PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_SANDBOX_SECRET'} in .env.tools.`);
  process.exit(1);
}

async function paypal(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
      : {
          Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
    body: token ? JSON.stringify(body) : body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`PayPal refused ${path}: HTTP ${res.status} ${json.name || ''} ${json.message || ''}`);
    process.exit(1);
  }
  return json;
}

const token = (await paypal('/v1/oauth2/token', 'grant_type=client_credentials')).access_token;
for (const p of todo) {
  const product = await paypal('/v1/catalogs/products', { name: p.name.slice(0, 127), type: 'SERVICE' }, token);
  const plan = await paypal('/v1/billing/plans', {
    product_id: product.id,
    name: p.name.slice(0, 127),
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: { interval_unit: p.interval === 'year' ? 'YEAR' : 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0, // until cancelled
        pricing_scheme: { fixed_price: { value: (p.price / 100).toFixed(2), currency_code: 'USD' } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
  }, token);
  p[FIELD] = plan.id;
  console.log(`  ${p.id}: plan ${plan.id}`);
}
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('Written to products.json. Now run: node tools/render-store.mjs');
