// Contacts (2026-10-13): every customer is kept for the newsletter with their
// phone, nobody who unsubscribed is added back, and donations are checked.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addContact, keyFor, subscribe, unsubscribe } from '../../netlify/lib/newsletter.mjs';
import { cleanAmount, donationBody } from '../../netlify/functions/donate.mjs';
import { optOutHtml } from '../../netlify/lib/notice-mail.mjs';

function fakeStore() {
  const m = new Map();
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
  };
}
const read = (s, e) => JSON.parse(s.m.get(keyFor(e)));

test('a customer becomes a contact with their phone and every source', async () => {
  const s = fakeStore();
  const r = await addContact(s, { email: 'Pat@Example.com', first: 'Pat', phone: '+1 (918) 555-0101', source: 'order' });
  assert.equal(r.isNew, true);
  await addContact(s, { email: 'pat@example.com', first: 'Patricia', source: 'pickup' });
  const c = read(s, 'pat@example.com');
  assert.equal(c.status, 'active');
  assert.equal(c.first, 'Pat');
  assert.equal(c.phone, '9185550101');
  assert.deepEqual(c.sources, ['order', 'pickup']);
});

test('somebody who unsubscribed is never put back by a purchase', async () => {
  const s = fakeStore();
  await subscribe(s, { email: 'sam@example.com' });
  await unsubscribe(s, 'sam@example.com');
  await addContact(s, { email: 'sam@example.com', phone: '9185550102', source: 'order' });
  const c = read(s, 'sam@example.com');
  assert.equal(c.status, 'unsubscribed');
  assert.equal(c.phone, '9185550102');
  // Their own newsletter sign-up is new consent.
  await subscribe(s, { email: 'sam@example.com' });
  assert.equal(read(s, 'sam@example.com').status, 'active');
});

test('unticking "news and updates" keeps the details but not the list', async () => {
  const s = fakeStore();
  await addContact(s, { email: 'lee@example.com', first: 'Lee', source: 'newsletter', declined: true });
  assert.equal(read(s, 'lee@example.com').status, 'unsubscribed');
  assert.equal(await addContact(s, { email: 'not an email' }), null);
});

test('donation amounts are checked and the PayPal order says donation', () => {
  assert.equal(cleanAmount('$25'), 25);
  assert.equal(cleanAmount('10.555'), 10.56);
  assert.throws(() => cleanAmount('0.50'));
  assert.throws(() => cleanAmount('9000'));
  assert.throws(() => cleanAmount('abc'));
  const b = donationBody(25, 'symphonymph', { returnUrl: 'https://x/r', cancelUrl: 'https://x/c' });
  assert.equal(b.purchase_units[0].custom_id, 'donation:symphonymph');
  assert.equal(b.purchase_units[0].items[0].category, 'DONATION');
  assert.equal(b.purchase_units[0].amount.value, '25.00');
  assert.equal(donationBody(5, 'nope', {}).purchase_units[0].custom_id, 'donation:general');
});

test('every notice carries a working unsubscribe link when the secret is set', () => {
  const was = process.env.NEWSLETTER_SECRET;
  process.env.NEWSLETTER_SECRET = 'a-long-enough-test-secret';
  assert.match(optOutHtml('pat@example.com'), /unsubscribe\?e=pat%40example\.com&amp;l=news&amp;s=/);
  delete process.env.NEWSLETTER_SECRET;
  assert.equal(optOutHtml('pat@example.com'), '');
  if (was) process.env.NEWSLETTER_SECRET = was;
});

// Pasted contacts (2026-10-19): name and email in either order, tab, comma or spaces.
test('pasted contact lines', async () => {
  const { parseContactLines } = await import('../../netlify/lib/newsletter.mjs');
  const rows = parseContactLines('Joanne Dobler\tsbjdobler@gmail.com\nfreddy@example.net, Freddy Wright\n\njust a name\nno-name@example.org');
  assert.deepEqual(rows, [
    { email: 'sbjdobler@gmail.com', first: 'Joanne', last: 'Dobler' },
    { email: 'freddy@example.net', first: 'Freddy', last: 'Wright' },
    { email: 'no-name@example.org', first: '', last: '' },
  ]);
});
