// /.netlify/functions/impact   "Making a Difference" (owner, 2026-10-11)
//   GET                          -> { stats: [...], updated }  (public, CDN-cached 10 minutes)
//   POST { action: "save", stats } owner only (the dashboard)
//
// The numbers live in the Netlify Blobs store "impact", so the owner updates
// them from the dashboard without a deploy. Until he saves once, the
// starting figures below are served (his estimates of 2026-10-11).
import { adminFromRequest, json } from '../lib/admin.mjs';

export const DEFAULT_STATS = {
  updated: '2026-10-11',
  stats: [
    { key: 'compost', label: 'Pounds of food scraps and yard waste turned into soil', value: 1000, unit: 'lb', plus: true },
    { key: 'recycled', label: 'Pounds of cardboard, cans, glass and plastic recycled', value: 1500, unit: 'lb', plus: true },
    { key: 'repurposed', label: 'Pounds of cardboard reused instead of thrown away, including archery targets', value: 200, unit: 'lb', plus: true },
  ],
};

/** Only what the page may show: known keys, sane numbers and words. */
export function cleanStats(input) {
  const list = Array.isArray(input) ? input : [];
  return list.slice(0, 12).map((s) => ({
    key: String(s.key || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30),
    label: String(s.label || '').replace(/[<>]/g, '').slice(0, 120),
    value: Math.max(0, Math.min(1e9, Math.round(Number(s.value) || 0))),
    unit: String(s.unit || '').replace(/[<>]/g, '').slice(0, 12),
    plus: !!s.plus,
  })).filter((s) => s.key && s.label);
}

let testStore = null;
export function setStoreForTests(s) { testStore = s; }
async function store() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore('impact');
}

export default async (request) => {
  const s = await store();
  if (request.method === 'GET') {
    const saved = await s.get('stats', { type: 'json' }).catch(() => null);
    return new Response(JSON.stringify(saved || DEFAULT_STATS), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  }
  if (request.method !== 'POST') return json(405, { error: 'GET or POST.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
  let body = {};
  try { body = await request.json(); } catch { /* below */ }
  if (body.action !== 'save') return json(400, { error: 'Unknown action.' });
  const rec = { updated: new Date().toISOString().slice(0, 10), stats: cleanStats(body.stats) };
  await s.setJSON('stats', rec);
  return json(200, rec);
};
