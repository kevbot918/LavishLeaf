// POST /.netlify/functions/store-costs   Owner only (netlify/lib/admin.mjs).
//   { action: "get" }                      -> { file, loaded, count, rows: { SKU: row } } or { loaded: null }
//   { action: "save", file, rows: [...] }  -> { count }
//
// The owner's supplier costs, for the dashboard's "Store products" section
// (2026-10-06). The repository and the website are public, so a cost may
// never be written into either; it lives here, in the Netlify Blobs store
// "store-costs", and only the owner's signed-in dashboard can read it.
//
// The dashboard parses his Bangalla product data CSV in his own browser and
// sends only the rows worth keeping (Tier 0 SKUs and his categories): the
// file is 7 MB and a function takes at most 6. Each row:
//   { sku, brand, name, section, pack, perCase, lb, stock, cost, list, gold, map, restricted, eta }
import { adminFromRequest, json } from '../lib/admin.mjs';

const MAX_ROWS = 6000;
const KEY = 'bangalla';

let testStore = null;
export function setStoreForTests(s) { testStore = s; }
async function store() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore('store-costs');
}

const text = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e6 ? Math.round(v * 100) / 100 : null);

/** One row from the browser, checked; null if it is not a usable row. */
export function cleanRow(r) {
  if (!r || typeof r !== 'object') return null;
  const sku = text(r.sku, 40);
  if (!/^B-[A-Z0-9]+-\d+PK$/.test(sku)) return null;
  return {
    sku,
    brand: text(r.brand, 80),
    name: text(r.name, 200),
    section: text(r.section, 120),
    pack: text(r.pack, 40),
    perCase: numOrNull(r.perCase),
    lb: numOrNull(r.lb),
    stock: numOrNull(r.stock),
    cost: numOrNull(r.cost),
    list: numOrNull(r.list),
    gold: numOrNull(r.gold),
    map: numOrNull(r.map),
    restricted: r.restricted === true,
    eta: text(r.eta, 20),
  };
}

export default async (request, _context, deps = {}) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  const admin = deps.admin !== undefined ? deps.admin : await adminFromRequest(request);
  if (!admin) return json(403, { error: 'This is for the owner. Please sign in with the owner account.' });
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'That request was not understood.' }); }
  const s = await store();

  if (body.action === 'get') {
    const rec = await s.get(KEY, { type: 'json' }).catch(() => null);
    if (!rec) return json(200, { loaded: null, count: 0, rows: {} });
    return json(200, rec);
  }

  if (body.action === 'save') {
    if (!Array.isArray(body.rows) || body.rows.length === 0) return json(400, { error: 'No rows were sent. Choose the Bangalla product data CSV.' });
    if (body.rows.length > MAX_ROWS) return json(400, { error: `Too many rows (${body.rows.length}); the dashboard sends at most ${MAX_ROWS}.` });
    const rows = {};
    for (const r of body.rows) { const c = cleanRow(r); if (c) rows[c.sku] = c; }
    const count = Object.keys(rows).length;
    if (!count) return json(400, { error: 'None of those rows looked like Bangalla products (an SKU such as B-44494-1PK).' });
    await s.setJSON(KEY, { file: text(body.file, 120), loaded: new Date().toISOString(), count, rows });
    return json(200, { count });
  }

  return json(400, { error: 'Unknown action.' });
};
