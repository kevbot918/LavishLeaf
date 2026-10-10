// /.netlify/functions/aliexpress  (2026-10-10; netlify/lib/aliexpress.mjs)
//   POST { action: "status" }        owner: connected? which account, until when
//   POST { action: "connect" }       owner: -> { url } to approve on AliExpress
//   GET  ?code=...&state=...         AliExpress sends the owner back here; the
//                                    code becomes a token in Blobs "aliexpress"
//   POST { action: "items", ids }    owner: live title, price, stock, images
//
// The callback address must be the app's registered Callback URL in the
// AliExpress developer console: https://lavishleaf.org/.netlify/functions/aliexpress
import { adminFromRequest, json } from '../lib/admin.mjs';
import { accessToken, aeReady, authorizeUrl, call, makeState, productFacts, stateOk, systemCall, tokenRecord } from '../lib/aliexpress.mjs';

let testStore = null;
export function setStoreForTests(s) { testStore = s; }
async function store() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore('aliexpress');
}

const callbackUrl = (request) => new URL('/.netlify/functions/aliexpress', request.url).toString();

export default async (request) => {
  if (!aeReady()) return json(503, { error: 'AliExpress is not set up yet: add AE_APP_KEY and AE_APP_SECRET in Netlify (docs/OWNER-STEPS.md, G10).' });

  // The way back from AliExpress's approval page.
  if (request.method === 'GET') {
    const u = new URL(request.url);
    const back = (msg) => Response.redirect(new URL('/dashboard.html?aliexpress=' + encodeURIComponent(msg) + '#sec-aliexpress', request.url).toString(), 302);
    if (!stateOk(u.searchParams.get('state'))) return back('expired: press Connect again');
    const code = u.searchParams.get('code');
    if (!code) return back('cancelled');
    try {
      const answer = await systemCall('/auth/token/create', { code });
      const rec = tokenRecord(answer);
      if (!rec.access_token) throw new Error('no token in the answer');
      await (await store()).setJSON('token', rec);
      return back('connected');
    } catch (e) {
      console.error('[aliexpress] token create failed', e.message);
      return back('failed: ' + String(e.message).slice(0, 120));
    }
  }

  if (request.method !== 'POST') return json(405, { error: 'POST or the AliExpress callback only.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
  let body = {};
  try { body = await request.json(); } catch { /* defaults */ }
  const s = await store();

  if (body.action === 'connect') return json(200, { url: authorizeUrl(callbackUrl(request), makeState()) });

  if (body.action === 'status') {
    const rec = await s.get('token', { type: 'json' }).catch(() => null);
    return json(200, rec ? { connected: true, account: rec.account, expires: rec.expires, refreshExpires: rec.refreshExpires } : { connected: false });
  }

  if (body.action === 'items') {
    const token = await accessToken(s);
    if (!token) return json(409, { error: 'Connect the AliExpress account first.' });
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => /^\d{6,20}$/.test(x)).slice(0, 40);
    const items = [];
    for (const id of ids) {
      try {
        const answer = await call('aliexpress.ds.product.get', { product_id: id, ship_to_country: 'US', target_currency: 'USD', target_language: 'EN' }, token);
        items.push({ id, ok: true, ...productFacts(answer) });
      } catch (e) {
        items.push({ id, ok: false, error: String(e.message).slice(0, 160) });
      }
    }
    await s.setJSON('items', { at: Date.now(), items }).catch(() => {});
    return json(200, { items });
  }

  return json(400, { error: 'Unknown action.' });
};
