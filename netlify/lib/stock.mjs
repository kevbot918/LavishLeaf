// The stock check (owner, 2026-10-13: "Is there a way we are ensuring that
// all of our products are still in stock and can automatically be removed if
// they are no longer in stock on our suppliers?").
//
//   * Bangalla: the inventory feed from the owner's own Bangalla account
//     (BANGALLA_FEED_URL in Netlify; a private address, never in this repo).
//     Every SKU we sell, each option's own SKU too, is looked up; missing
//     from the feed or under MIN_STOCK is "out".
//   * AliExpress: the connected dropship API (aliexpress.ds.product.get),
//     a slice of items per run so a run fits a function's time; an item the
//     API no longer returns, or with under MIN_STOCK, is "out".
//
// What is out is hidden on the store (store.js asks /.netlify/functions/stock)
// and refused at checkout (checkout.mjs); it comes back by itself when the
// supplier restocks. Kept in Blobs "stock", key "state".
import { catalog as liveCatalog } from './catalog.mjs';

export const MIN_STOCK = 5;
const AE_PER_RUN = 30;

let testStore = null;
export function setStockStoreForTests(s) { testStore = s; }
export async function stockStore() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'stock', consistency: 'strong' });
}

/** One CSV line into fields (quotes and doubled quotes). */
function csvLine(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Bangalla's feed, whatever its shape (CSV, tab-separated or JSON): a Map of
 * upper-cased SKU to quantity. The columns are found by name (SKU; Quantity,
 * Qty, Stock, Inventory or Available).
 */
export function parseFeed(text) {
  const map = new Map();
  const t = String(text || '').replace(/^﻿/, '').trim();
  const qtyKey = (k) => /^(quantity|qty|stock|inventory|available|qty[ _]?available|quantity[ _]?available|stock[ _]?level|on[ _]?hand)$/i.test(String(k).trim());
  const skuKey = (k) => /^(sku|item[ _]?sku|product[ _]?sku|variant[ _]?sku|item[ _]?number|item)$/i.test(String(k).trim());
  if (t.startsWith('[') || t.startsWith('{')) {
    let j; try { j = JSON.parse(t); } catch { return map; }
    const rows = Array.isArray(j) ? j : (j.products || j.items || j.data || j.inventory || []);
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const ks = Object.keys(r); const sk = ks.find(skuKey); const qk = ks.find(qtyKey);
      if (sk && qk) map.set(String(r[sk]).trim().toUpperCase(), Number(r[qk]) || 0);
    }
    return map;
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return map;
  const sep = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const head = csvLine(lines[0], sep);
  const si = head.findIndex(skuKey), qi = head.findIndex(qtyKey);
  if (si < 0 || qi < 0) return map;
  for (const l of lines.slice(1)) {
    const f = csvLine(l, sep);
    if (f[si]) map.set(f[si].toUpperCase(), Number(String(f[qi]).replace(/[^\d.-]/g, '')) || 0);
  }
  return map;
}

/** The products the check covers: everything sold that ships from a supplier. */
export function supplierProducts(catalog = liveCatalog) {
  return Object.values(catalog).filter((p) => p.active && p.ship && p.supplier && (p.supplier.sku || p.supplier.item || p.supplier.optionSkus));
}

/** Bangalla's lines judged from the feed. Mutates state.items. */
export function applyBangalla(state, feed, catalog = liveCatalog, now = Date.now()) {
  const at = new Date(now).toISOString();
  for (const p of supplierProducts(catalog).filter((x) => /bangalla/i.test(x.supplier.name))) {
    const skus = p.supplier.optionSkus ? Object.entries(p.supplier.optionSkus) : [[null, p.supplier.sku]];
    const opts = {};
    let anyIn = false, total = 0;
    for (const [opt, sku] of skus) {
      const q = feed.has(String(sku).toUpperCase()) ? feed.get(String(sku).toUpperCase()) : null;
      const out = q === null || q < MIN_STOCK;
      if (opt) opts[opt] = { sku, qty: q, out };
      if (!out) anyIn = true;
      total += q || 0;
    }
    state.items[p.id] = {
      id: p.id, name: p.name, supplier: 'Bangalla', code: skus.map(([, s]) => s).join(', '),
      qty: total, out: !anyIn, why: anyIn ? '' : (skus.every(([, s]) => !feed.has(String(s).toUpperCase())) ? 'not in Bangalla\'s feed' : 'under ' + MIN_STOCK + ' left'),
      options: p.supplier.optionSkus ? opts : null, at,
    };
  }
}

/** The ids, and the options, that the store must not sell now. */
export function outOf(state) {
  const products = [], options = {};
  for (const r of Object.values((state && state.items) || {})) {
    if (r.out) products.push(r.id);
    else if (r.options) {
      const o = Object.entries(r.options).filter(([, v]) => v.out).map(([k]) => k);
      if (o.length) options[r.id] = o;
    }
  }
  return { products, options };
}

export async function readState(store) {
  const s = await store.get('state', { type: 'json' }).catch(() => null);
  return s && s.items ? s : { items: {}, bangalla: null, aliexpress: null };
}

/**
 * One run: the whole Bangalla feed, and the next slice of AliExpress items.
 * deps: { fetchImpl, aeCheck(id) -> { stock } | null (null = gone) | throws }
 */
export async function runCheck(store, { env = process.env, fetchImpl = fetch, aeCheck = null, catalog = liveCatalog, now = Date.now() } = {}) {
  const state = await readState(store);
  if (env.BANGALLA_FEED_URL) {
    try {
      const res = await fetchImpl(env.BANGALLA_FEED_URL, { headers: { Accept: 'text/csv, application/json, */*' } });
      if (!res.ok) throw new Error('Bangalla\'s feed said ' + res.status);
      const feed = parseFeed(await res.text());
      // A feed that came back empty or unreadable must not hide the whole shelf.
      if (feed.size < 50) throw new Error('the feed had ' + feed.size + ' SKUs, too few to trust; nothing was changed');
      applyBangalla(state, feed, catalog, now);
      state.bangalla = { at: new Date(now).toISOString(), ok: true, skus: feed.size };
    } catch (e) {
      state.bangalla = { at: new Date(now).toISOString(), ok: false, error: String(e.message).slice(0, 200) };
    }
  } else state.bangalla = { at: new Date(now).toISOString(), ok: false, error: 'BANGALLA_FEED_URL is not set in Netlify yet' };

  if (aeCheck) {
    const ae = supplierProducts(catalog).filter((p) => /aliexpress/i.test(p.supplier.name) && p.supplier.item);
    const cursor = (state.aliexpress && state.aliexpress.cursor) || 0;
    const slice = [];
    for (let i = 0; i < Math.min(AE_PER_RUN, ae.length); i++) slice.push(ae[(cursor + i) % ae.length]);
    let errors = 0;
    for (const p of slice) {
      try {
        const f = await aeCheck(p.supplier.item);
        const qty = f ? Number(f.stock) || 0 : 0;
        state.items[p.id] = { id: p.id, name: p.name, supplier: 'AliExpress', code: p.supplier.item, qty, out: !f || qty < MIN_STOCK, why: !f ? 'no longer on AliExpress' : qty < MIN_STOCK ? 'under ' + MIN_STOCK + ' left' : '', options: null, at: new Date(now).toISOString() };
      } catch (e) { errors++; }
    }
    state.aliexpress = { at: new Date(now).toISOString(), ok: errors < slice.length, cursor: ae.length ? (cursor + slice.length) % ae.length : 0, checked: slice.length - errors, errors };
  } else state.aliexpress = { at: new Date(now).toISOString(), ok: false, error: 'AliExpress is not connected (dashboard, AliExpress, Connect)', cursor: (state.aliexpress && state.aliexpress.cursor) || 0 };

  state.checked = new Date(now).toISOString();
  await store.setJSON('state', state);
  return state;
}
