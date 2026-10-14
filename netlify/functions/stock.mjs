// /.netlify/functions/stock   (2026-10-13; netlify/lib/stock.mjs)
//   GET                        -> { out: [ids], outOptions: { id: [names] } }
//                                 for the store and the cart (public, cached
//                                 5 minutes)
//   POST { action: "status" }  owner: every supplier product with its stock
//   POST { action: "run" }     owner: check now
//   POST { action: "pause", supplier: "bangalla" | "aliexpress", on }
//                              owner: take every product of a supplier off
//                              the store (or put them back)
import { adminFromRequest, json } from '../lib/admin.mjs';
import { MIN_STOCK, outOf, readState, stockStore, supplierProducts } from '../lib/stock.mjs';
import { checkNow } from '../lib/stock-run.mjs';

export default async (request) => {
  if (request.method === 'GET') {
    const { products, options } = outOf(await readState(await stockStore()));
    return new Response(JSON.stringify({ out: products, outOptions: options }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  }
  if (request.method !== 'POST') return json(405, { error: 'GET or POST.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
  let body = {};
  try { body = await request.json(); } catch { /* defaults */ }
  if (body.action === 'pause' && ['bangalla', 'aliexpress', 'cj'].includes(body.supplier)) {
    const store = await stockStore();
    const s = await readState(store);
    s.paused = { ...(s.paused || {}), [body.supplier]: !!body.on };
    await store.setJSON('state', s);
  }
  const state = body.action === 'run' ? await checkNow() : await readState(await stockStore());
  // Every supplier product, checked or not yet.
  const rows = supplierProducts().map((p) => state.items[p.id] || {
    id: p.id, name: p.name, supplier: /aliexpress/i.test(p.supplier.name) ? 'AliExpress' : /^cj/i.test(p.supplier.name) ? 'CJ Dropshipping' : 'Bangalla',
    code: p.supplier.item || p.supplier.sku || p.supplier.vid || Object.values(p.supplier.optionSkus || p.supplier.optionVids || {}).join(', '), qty: null, out: false, why: 'not checked yet', options: null, at: null,
  });
  return json(200, { rows, min: MIN_STOCK, bangalla: state.bangalla, aliexpress: state.aliexpress, cj: state.cj || null, checked: state.checked || null, paused: state.paused || {} });
};
