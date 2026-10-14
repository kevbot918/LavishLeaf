#!/usr/bin/env node
// CJ Dropshipping product research for the Recreation & Outdoors shelf
// (owner, 2026-10-14). Reads CJ_API_KEY from .env (never committed), searches
// CJ for each keyword in its US warehouse, and writes the candidates with
// CJ's price, US stock and the cheapest US freight to Stigler (74462) to the
// file given (outside the repository: costs are private).
//
//   node tools/cj-research.mjs <out.json> [keyword ...]
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));
const KEY = env.CJ_API_KEY;
if (!KEY) { console.error('Add CJ_API_KEY=... to .env first.'); process.exit(1); }
const [out, ...words] = process.argv.slice(2);
if (!out) { console.error('Usage: node tools/cj-research.mjs <out.json> [keyword ...]'); process.exit(1); }
const KEYWORDS = words.length ? words : ['camping lantern', 'hammock', 'camping chair', 'water bottle', 'hiking backpack', 'tent', 'sleeping bag', 'fishing', 'pickleball', 'yoga mat', 'resistance bands', 'jump rope', 'frisbee', 'cooler bag', 'headlamp', 'trekking poles', 'picnic blanket', 'bike light', 'soccer ball', 'camping cookware'];
const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, { method = 'GET', query, body, token } = {}) {
  await sleep(1150);
  const qs = query ? '?' + new URLSearchParams(query) : '';
  const r = await fetch(BASE + path + qs, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'CJ-Access-Token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (j.result === false || (j.code != null && j.code !== 200)) throw new Error(path + ': ' + j.code + ' ' + j.message);
  return j.data;
}
const tok = (await api('/authentication/getAccessToken', { method: 'POST', body: { apiKey: KEY } })).accessToken;
const found = [];
for (const kw of KEYWORDS) {
  const d = await api('/product/listV2', { query: { keyWord: kw, page: 1, size: 20, countryCode: 'US' }, token: tok }).catch((e) => { console.error(e.message); return null; });
  const list = ((d && d.content) || []).flatMap((c) => c.productList || []);
  for (const p of list.slice(0, 8)) {
    try {
      const q = await api('/product/query', { query: { pid: p.id, countryCode: 'US' }, token: tok });
      const vars = (q.variants || []).map((v) => ({ vid: v.vid, key: v.variantKey || v.variantNameEn || '', price: Number(v.variantSellPrice) || null, us: (v.inventories || []).filter((i) => String(i.countryCode).toUpperCase() === 'US').reduce((n, i) => n + (Number(i.totalInventory) || 0), 0), weight: v.variantWeight || null }));
      // product/query has no stock: ask stock/queryByVid for the cheapest
      // variants (2026-10-14, measured).
      for (const v of vars.sort((a, b) => a.price - b.price).slice(0, 3)) {
        const s = await api('/product/stock/queryByVid', { query: { vid: v.vid }, token: tok }).catch(() => []);
        v.us = (s || []).filter((r) => String(r.countryCode).toUpperCase() === 'US').reduce((n, r) => n + (Number(r.totalInventoryNum) || 0), 0);
      }
      const best = vars.filter((v) => v.us >= 20).sort((a, b) => a.price - b.price)[0];
      if (!best) continue;
      const fr = await api('/logistic/freightCalculate', { method: 'POST', body: { startCountryCode: 'US', endCountryCode: 'US', zip: '74462', products: [{ vid: best.vid, quantity: 1 }] }, token: tok }).catch(() => []);
      const cheapest = (fr || []).map((x) => ({ name: x.logisticName, days: x.logisticAging, usd: Number(x.totalPostageFee || x.logisticPrice) || 0 })).sort((a, b) => a.usd - b.usd)[0] || null;
      found.push({ keyword: kw, pid: q.pid, name: q.productNameEn, image: q.productImage || (q.productImageSet || [])[0] || null, variants: vars, pick: best, freight: cheapest });
      console.log(kw, '|', q.productNameEn.slice(0, 60), '| $' + best.price, '| US', best.us, '| ship', cheapest && cheapest.usd);
    } catch (e) { console.error(p.id, e.message); }
  }
  writeFileSync(out, JSON.stringify(found, null, 1));
}
console.log(found.length, 'candidates written to', out);
