// Text messages (2026-10-14): only to those who said yes, our name first and
// "Reply STOP" last on every one, quiet hours kept, STOP honored.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { e164, fullText, optedOutNumbers, quietHoursOk, segments, sendSms } from '../../netlify/lib/sms.mjs';
import { textable } from '../../netlify/lib/sms-job.mjs';
import { addContact, keyFor } from '../../netlify/lib/newsletter.mjs';

const env = { SMS_ORIGINATION_NUMBER: '+18885550100', SMS_REGION: 'us-east-2', SES_ACCESS_KEY_ID: 'AKIDEXAMPLE', SES_SECRET_ACCESS_KEY: 'secret' };

test('every text names us and says how to stop', () => {
  assert.equal(fullText('  Fall sale   this week '), 'Lavish Leaf: Fall sale this week Reply STOP to opt out.');
  assert.equal(e164('(918) 555-0101'), '+19185550101');
  assert.equal(e164('1 918 555 0101'), '+19185550101');
  assert.equal(e164('555-0101'), '');
  assert.deepEqual(segments('a'.repeat(160)), { chars: 160, parts: 1, gsm: true });
  assert.equal(segments('a'.repeat(161)).parts, 2);
  assert.equal(segments('Hi \u{1F33F}').gsm, false);
});

test('quiet hours: 9 am to 8 pm Central only', () => {
  assert.equal(quietHoursOk(new Date('2026-10-14T13:59:00Z')), false); // 8:59 am CDT
  assert.equal(quietHoursOk(new Date('2026-10-14T14:00:00Z')), true);  // 9:00 am
  assert.equal(quietHoursOk(new Date('2026-10-15T00:59:00Z')), true);  // 7:59 pm
  assert.equal(quietHoursOk(new Date('2026-10-15T01:00:00Z')), false); // 8:00 pm
});

test('the AWS call: SendTextMessage, signed, promotional, from our number', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ MessageId: 'm-1' }), { status: 200 }); };
  assert.equal(await sendSms('9185550101', 'Hello', { env, fetchImpl }), 'm-1');
  assert.equal(seen.url, 'https://sms-voice.us-east-2.amazonaws.com/');
  assert.equal(seen.init.headers['x-amz-target'], 'PinpointSMSVoiceV2.SendTextMessage');
  assert.match(seen.init.headers.Authorization, /Credential=AKIDEXAMPLE\/\d{8}\/us-east-2\/sms-voice\/aws4_request/);
  const body = JSON.parse(seen.init.body);
  assert.deepEqual([body.DestinationPhoneNumber, body.OriginationIdentity, body.MessageType], ['+19185550101', '+18885550100', 'PROMOTIONAL']);
  assert.match(body.MessageBody, /^Lavish Leaf: Hello Reply STOP to opt out\.$/);
});

test('an opted-out number is reported as such; the STOP list is read', async () => {
  const refuse = async () => new Response(JSON.stringify({ __type: 'ConflictException', Reason: 'DESTINATION_PHONE_NUMBER_OPTED_OUT', message: 'opted out' }), { status: 400 });
  await assert.rejects(sendSms('9185550101', 'Hi', { env, fetchImpl: refuse }), (e) => e.optedOut === true);
  await assert.rejects(sendSms('9185550101', 'Hi', { env: {} }), /not set up/);
  const pages = [{ OptedOutNumbers: [{ OptedOutNumber: '+19185550101' }], NextToken: 't' }, { OptedOutNumbers: [{ OptedOutNumber: '+19185550102' }] }];
  const list = async () => new Response(JSON.stringify(pages.shift()), { status: 200 });
  assert.deepEqual([...(await optedOutNumbers({ env, fetchImpl: list }))], ['+19185550101', '+19185550102']);
});

test('only a ticked box with a phone makes someone textable; STOP takes them off', async () => {
  const m = new Map();
  const store = { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); } };
  await addContact(store, { email: 'a@b.co', phone: '9185550101', source: 'order' });
  await addContact(store, { email: 'c@d.co', phone: '9185550102', source: 'discount', sms: true });
  await addContact(store, { email: 'e@f.co', phone: '', source: 'newsletter', sms: true });
  const all = [...m.values()].map((v) => JSON.parse(v));
  assert.deepEqual(textable(all).map((s) => s.email), ['c@d.co']);
  const c = JSON.parse(m.get(keyFor('c@d.co')));
  assert.equal(textable([{ ...c, smsOptOut: { at: 'x' } }]).length, 0);
});
