// AliExpress signing, the OAuth state and the product facts
// (netlify/lib/aliexpress.mjs).   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { authorizeUrl, call, makeState, productFacts, sign, stateOk, systemCall, tokenRecord } from '../../netlify/lib/aliexpress.mjs';

const ENV = { AE_APP_KEY: '123456', AE_APP_SECRET: 'test-secret' };
const hmac = (s) => createHmac('sha256', 'test-secret').update(s).digest('hex').toUpperCase();

test('business and system signatures follow the two AliExpress recipes', () => {
  const p = { method: 'aliexpress.ds.product.get', app_key: '123456', timestamp: '1700000000000', sign_method: 'sha256', product_id: '42' };
  assert.equal(sign(p, 'test-secret'), hmac('app_key123456methodaliexpress.ds.product.getproduct_id42sign_methodsha256timestamp1700000000000'));
  assert.equal(sign({ app_key: '123456', code: 'abc' }, 'test-secret', '/auth/token/create'), hmac('/auth/token/createapp_key123456codeabc'));
});

test('calls go to the right gateway with the signature and token', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return new Response(JSON.stringify({ ok: 1 }), { status: 200 }); };
  await call('aliexpress.ds.product.get', { product_id: '42' }, 'TOKEN', { env: ENV, fetchImpl, now: 1700000000000 });
  await systemCall('/auth/token/create', { code: 'abc' }, { env: ENV, fetchImpl, now: 1700000000000 });
  const u1 = new URL(urls[0]); const u2 = new URL(urls[1]);
  assert.equal(u1.origin + u1.pathname, 'https://api-sg.aliexpress.com/sync');
  assert.equal(u1.searchParams.get('access_token'), 'TOKEN');
  assert.match(u1.searchParams.get('sign'), /^[0-9A-F]{64}$/);
  assert.equal(u2.pathname, '/rest/auth/token/create');
});

test('an AliExpress error is reported, not swallowed', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error_response: { code: 'MissingParameter', msg: 'access_token missing' } }), { status: 200 });
  await assert.rejects(call('x', {}, '', { env: ENV, fetchImpl }), /MissingParameter access_token missing/);
});

test('the OAuth state lasts 15 minutes and cannot be forged', () => {
  const now = 1700000000000;
  const st = makeState(ENV, now);
  assert.equal(stateOk(st, ENV, now + 60e3), true);
  assert.equal(stateOk(st, ENV, now + 16 * 60e3), false);
  assert.equal(stateOk(st.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), ENV, now), false);
  assert.equal(stateOk('', ENV, now), false);
  const url = new URL(authorizeUrl('https://lavishleaf.org/.netlify/functions/aliexpress', st, ENV));
  assert.equal(url.searchParams.get('client_id'), '123456');
  assert.equal(url.searchParams.get('response_type'), 'code');
});

test('token records and product facts', () => {
  const t = tokenRecord({ access_token: 'A', refresh_token: 'R', expires_in: 3600, account: 'shop@x' }, 1000);
  assert.deepEqual([t.access_token, t.expires, t.account], ['A', 1000 + 3600e3, 'shop@x']);
  const f = productFacts({ aliexpress_ds_product_get_response: { result: {
    ae_item_base_info_dto: { product_id: 9, subject: 'Grow bags', currency_code: 'USD', avg_evaluation_rating: '4.9', sales_count: '4000' },
    ae_item_sku_info_dtos: { ae_item_sku_info_d_t_o: [{ sku_price: '10.66', offer_sale_price: '5.33', sku_available_stock: 50 }, { sku_price: '12.00', offer_sale_price: '6.00', sku_available_stock: 10 }] },
    ae_multimedia_info_dto: { image_urls: 'https://ae01.alicdn.com/a.jpg;https://ae01.alicdn.com/b.jpg' },
  } } });
  assert.deepEqual([f.title, f.price, f.regular, f.stock, f.images.length], ['Grow bags', 5.33, 10.66, 60, 2]);
});
