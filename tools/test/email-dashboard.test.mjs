// The email system (mail, newsletter list, welcome, orders, cart reminders,
// newsletter sending) and the dashboard's own numbers, without Netlify,
// Brevo or Google. npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEWSLETTER_SECRET = 'test-secret-that-is-long-enough';
process.env.BREVO_API_KEY = 'test-key';
process.env.MAIL_POSTAL_ADDRESS = 'PO Box 1, Eufaula, OK 74432';
process.env.OWNER_EMAIL = 'owner@example.com';
process.env.URL = 'https://lavishleaf.org';

const { fill, textOf, sendEmail, setMailForTests, validEmail, MailError } = await import('../../netlify/lib/mail.mjs');
const nl = await import('../../netlify/lib/newsletter.mjs');
const { afterPayment, summarise, setOrdersStoreForTests } = await import('../../netlify/lib/orders.mjs');
const { runBatch, startJob, subjectOf } = await import('../../netlify/lib/broadcast.mjs');
const { due } = await import('../../netlify/functions/cart-reminders.mjs');
const { isAdmin } = await import('../../netlify/lib/admin.mjs');
const { ordersSummary } = await import('../../netlify/lib/dashboard.mjs');

/** A Blobs store in memory. */
function memStore() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}

let sent, mailStore;
function fakeFetch(templates = {}) {
  return async (url, opts = {}) => {
    if (String(url).includes('/emails/')) {
      const name = String(url).split('/emails/')[1].replace('.html', '');
      return { ok: !!templates[name], status: templates[name] ? 200 : 404, text: async () => templates[name] || '' };
    }
    sent.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
    return { ok: true, status: 201, json: async () => ({ messageId: 'm' + sent.length }) };
  };
}
const TPL = { welcome: '<title>Welcome</title>Hi {{first_name}} <a href="{{unsubscribe_url}}">x</a> {{postal_address}}', 'order-confirmation': 'Hi {{first_name}} {{order_id}} <table>{{items_html}}</table> {{delivery_text}}', 'newsletter-2026-10': '<title>Fall &amp; more</title>Hi {{first_name}} {{unsubscribe_url}} {{postal_address}}' };

beforeEach(() => {
  sent = [];
  mailStore = memStore();
  setMailForTests({ store: mailStore, fetchImpl: fakeFetch(TPL) });
});

test('templates fill and escape, except _html blocks', () => {
  assert.equal(fill('Hi {{first_name}}', { first_name: '<b>Al</b>' }), 'Hi &lt;b&gt;Al&lt;/b&gt;');
  assert.equal(fill('{{rows_html}}', { rows_html: '<tr></tr>' }), '<tr></tr>');
  assert.equal(fill('{{missing}}!', {}), '!');
  assert.match(textOf('<p>Hi <a href="https://x.org">there</a></p><p>Bye</p>'), /Hi there \(https:\/\/x\.org\)\nBye/);
  assert.ok(validEmail('a@b.co') && !validEmail('nope') && !validEmail('a@b'));
});

test('marketing email carries one-click unsubscribe headers; transactional does not need them', async () => {
  await sendEmail({ to: 'a@b.co', subject: 'S', html: '<p>x</p>', kind: 'newsletter', unsubscribeUrl: 'https://lavishleaf.org/u' });
  assert.equal(sent[0].body.headers['List-Unsubscribe'], '<https://lavishleaf.org/u>');
  assert.equal(sent[0].body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  await sendEmail({ to: 'a@b.co', subject: 'S', html: '<p>x</p>', kind: 'order' });
  assert.equal(sent[1].body.headers, undefined);
  await assert.rejects(sendEmail({ to: 'a@b.co', subject: 'S', html: 'x', kind: 'newsletter' }), MailError);
});

test('marketing refuses without the postal address (CAN-SPAM)', async () => {
  const saved = process.env.MAIL_POSTAL_ADDRESS;
  delete process.env.MAIL_POSTAL_ADDRESS;
  await assert.rejects(sendEmail({ to: 'a@b.co', subject: 'S', html: 'x', kind: 'welcome', unsubscribeUrl: 'https://u' }), /POSTAL/);
  process.env.MAIL_POSTAL_ADDRESS = saved;
});

test('the daily limit holds, with a reserve kept for order emails', async () => {
  process.env.MAIL_DAILY_LIMIT = '42';
  await sendEmail({ to: 'a@b.co', subject: 'S', html: 'x', kind: 'order' });
  await sendEmail({ to: 'a@b.co', subject: 'S', html: 'x', kind: 'order' });
  // 42 - 40 reserve = 2 marketing a day, and 2 have gone already
  await assert.rejects(sendEmail({ to: 'a@b.co', subject: 'S', html: 'x', kind: 'newsletter', unsubscribeUrl: 'https://u' }), /daily/);
  await sendEmail({ to: 'a@b.co', subject: 'S', html: 'x', kind: 'order' }); // receipts still go
  delete process.env.MAIL_DAILY_LIMIT;
});

test('unsubscribe links are signed per address and per list', () => {
  const url = new URL(nl.unsubscribeUrl('Kim@Example.com', 'news'));
  const s = url.searchParams.get('s');
  assert.equal(url.searchParams.get('e'), 'kim@example.com');
  assert.ok(nl.verify('kim@example.com', s, 'unsub-news'));
  assert.ok(!nl.verify('other@example.com', s, 'unsub-news'));
  assert.ok(!nl.verify('kim@example.com', s, 'unsub-cart'));
});

test('subscribe, unsubscribe and subscribe again', async () => {
  const st = memStore();
  const a = await nl.subscribe(st, { email: 'Kim@Example.com', first: 'Kim' });
  assert.ok(a.isNew);
  assert.equal((await nl.subscribe(st, { email: 'kim@example.com' })).isNew, false);
  await nl.unsubscribe(st, 'kim@example.com');
  const stats = nl.listStats(await nl.allSubscribers(st));
  assert.deepEqual([stats.active, stats.unsubscribed], [0, 1]);
  assert.ok((await nl.subscribe(st, { email: 'kim@example.com' })).isNew);
  assert.equal((await nl.allSubscribers(st))[0].first, 'Kim');
});

const DONE = {
  id: 'ORDER123', status: 'COMPLETED',
  payer: { email_address: 'Buyer@Example.com', name: { given_name: 'Sam' } },
  purchase_units: [{
    items: [{ name: 'Player Registration', sku: 'soccer-player-fall', quantity: '1', unit_amount: { value: '25.00' } }],
    amount: { value: '25.00', breakdown: { item_total: { value: '25.00' } } },
    payments: { captures: [{ amount: { value: '25.00' } }] },
  }],
};

test('after a payment: filed once, customer and owner each emailed once', async () => {
  const st = memStore();
  setOrdersStoreForTests(st);
  const o = summarise(DONE, { w: 'v1' });
  assert.equal(o.email, 'buyer@example.com');
  await afterPayment(o);
  await afterPayment(o); // a reload of the thank-you page
  assert.equal(sent.length, 2);
  assert.equal(sent[0].body.to[0].email, 'buyer@example.com');
  assert.match(sent[0].body.htmlContent, /ORDER123/);
  assert.equal(sent[1].body.to[0].email, 'owner@example.com');
  assert.ok((await st.get('o-ORDER123')).mailed);
});

test('a newsletter goes out in batches within the budget, nobody twice', async () => {
  const st = memStore();
  for (let i = 0; i < 5; i++) await nl.subscribe(st, { email: `p${i}@example.com` });
  await nl.unsubscribe(st, 'p4@example.com');
  process.env.MAIL_DAILY_LIMIT = '43'; // 3 marketing a day
  const job = await startJob(st, 'newsletter-2026-10');
  assert.equal(job.subject, 'Fall & more');
  let j = await runBatch(st);
  assert.equal(j.sent.length, 3);
  assert.equal(j.done, null);
  mailStore.m.clear(); // the next day
  j = await runBatch(st);
  assert.equal(j.sent.length, 4);
  assert.ok(j.done);
  const to = sent.map((s) => s.body.to[0].email);
  assert.equal(new Set(to).size, 4);
  assert.ok(!to.includes('p4@example.com'));
  assert.match(sent[0].body.htmlContent, /PO Box 1/);
  delete process.env.MAIL_DAILY_LIMIT;
  await assert.rejects(startJob(st, '../secret'), /newsletter-2026-10/);
  assert.equal(subjectOf('<title> Hello </title>'), 'Hello');
});

test('a cart reminder is due once, 1 to 7 days after, never twice in 14 days', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const day = 864e5;
  const rec = { email: 'a@b.co', cart: [{ id: 'soccer-player-fall', qty: 1 }], cartChanged: new Date(now - 2 * day).toISOString(), orders: [] };
  assert.equal(due(rec, now), true);
  assert.equal(due({ ...rec, cartChanged: new Date(now - 3600e3).toISOString() }, now), false); // too soon
  assert.equal(due({ ...rec, cartChanged: new Date(now - 8 * day).toISOString() }, now), false); // too late
  assert.equal(due({ ...rec, remindedFor: rec.cartChanged }, now), false); // already reminded
  assert.equal(due({ ...rec, lastReminded: new Date(now - 5 * day).toISOString() }, now), false); // 14-day rule
  assert.equal(due({ ...rec, orders: [{ date: new Date(now - day).toISOString() }] }, now), false); // bought since
  assert.equal(due({ ...rec, cart: [] }, now), false);
});

test('only the owner opens the dashboard', () => {
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin({ email: 'x@y.co', roles: ['admin'] }), true);
  assert.equal(isAdmin({ email: 'Boss@Y.co', roles: [] }, { ADMIN_EMAILS: 'a@b.co, boss@y.co' }), true);
  assert.equal(isAdmin({ email: 'someone@y.co', roles: [] }, { ADMIN_EMAILS: 'boss@y.co' }), false);
  assert.equal(isAdmin({ email: 'someone@y.co', roles: [] }, {}), false);
});

test('the dashboard order numbers', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  const orders = [
    { id: 'a', date: '2026-10-09T00:00:00Z', total: 25, items: [{ name: 'Player', qty: 1 }] },
    { id: 'b', date: '2026-08-01T00:00:00Z', total: 250, items: [{ name: 'Team', qty: 1 }] },
  ];
  const s = ordersSummary(orders, [{ cart: [{ id: 'x', qty: 1 }] }, { cart: [] }], 28, now);
  assert.deepEqual([s.count, s.revenue, s.allTime, s.accounts, s.openCarts], [1, 25, 2, 2, 1]);
  assert.deepEqual(s.bestSellers, [{ name: 'Player', value: 1 }]);
});
