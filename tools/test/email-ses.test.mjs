// Amazon SES as the email provider: the request signing and the message sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { signV4 } from '../../netlify/lib/aws-sign.mjs';
import { mailConfig, sendEmail, setMailForTests } from '../../netlify/lib/mail.mjs';

const EXAMPLE = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', date: new Date('2015-08-30T12:36:00Z') };

test('signing matches the AWS Signature Version 4 test suite (get-vanilla)', () => {
  const h = signV4({ method: 'GET', host: 'example.amazonaws.com', path: '/', service: 'service', region: 'us-east-1', ...EXAMPLE });
  assert.equal(h.Authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  assert.equal(h['x-amz-date'], '20150830T123600Z');
});

test('signing matches the AWS documentation example (IAM ListUsers)', () => {
  const h = signV4({
    method: 'GET', host: 'iam.amazonaws.com', path: '/', query: 'Action=ListUsers&Version=2010-05-08',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' }, service: 'iam', region: 'us-east-1', ...EXAMPLE,
  });
  assert.match(h.Authorization, /Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7$/);
});

const SES_ENV = { SES_ACCESS_KEY_ID: 'AKIATEST', SES_SECRET_ACCESS_KEY: 'secret', MAIL_POSTAL_ADDRESS: 'PO Box 1, Stigler, OK 74462' };

test('SES is chosen when its keys are set and Brevo is not; the sandbox limit is the default', () => {
  assert.equal(mailConfig(SES_ENV).provider, 'ses');
  assert.equal(mailConfig(SES_ENV).daily, 200);
  assert.equal(mailConfig({ ...SES_ENV, MAIL_DAILY_LIMIT: '50000' }).daily, 50000);
  assert.equal(mailConfig({ ...SES_ENV, SES_REGION: 'us-west-2' }).ses.region, 'us-west-2');
  assert.equal(mailConfig({ BREVO_API_KEY: 'k' }).provider, 'brevo');
  assert.equal(mailConfig({ ...SES_ENV, BREVO_API_KEY: 'k' }).provider, 'brevo', 'both set: MAIL_PROVIDER decides, Brevo by default');
  assert.equal(mailConfig({ ...SES_ENV, BREVO_API_KEY: 'k', MAIL_PROVIDER: 'ses' }).provider, 'ses');
  assert.equal(mailConfig({ MAIL_PROVIDER: 'ses' }).key, '', 'SES without its keys is not ready');
});

function memStore() { const m = new Map(); return { async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; }, async setJSON(k, v) { m.set(k, JSON.stringify(v)); } }; }

test('a marketing email goes to SES v2 signed, with the one-click unsubscribe headers', async () => {
  const calls = [];
  setMailForTests({
    store: memStore(),
    fetchImpl: async (url, opts) => { calls.push({ url, opts }); return new Response(JSON.stringify({ MessageId: 'm-1' }), { status: 200 }); },
  });
  const r = await sendEmail({ to: 'buyer@example.com', toName: 'Ann B', subject: 'Welcome', html: '<p>Hi</p>', text: 'Hi', kind: 'welcome', unsubscribeUrl: 'https://lavishleaf.org/u?t=1' }, SES_ENV);
  assert.equal(r.id, 'm-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails');
  assert.match(calls[0].opts.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/us-east-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.FromEmailAddress, 'Lavish Leaf <support@lavishleaf.org>');
  assert.deepEqual(body.Destination.ToAddresses, ['Ann B <buyer@example.com>']);
  assert.deepEqual(body.ReplyToAddresses, ['support@lavishleaf.org']);
  assert.equal(body.Content.Simple.Subject.Data, 'Welcome');
  assert.equal(body.Content.Simple.Body.Text.Data, 'Hi');
  assert.deepEqual(body.Content.Simple.Headers, [
    { Name: 'List-Unsubscribe', Value: '<https://lavishleaf.org/u?t=1>' },
    { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
  ]);
  assert.deepEqual(body.EmailTags, [{ Name: 'kind', Value: 'welcome' }]);
});

test('an SES refusal is reported, and throttling is marked temporary', async () => {
  setMailForTests({ store: memStore(), fetchImpl: async () => new Response(JSON.stringify({ message: 'Email address is not verified.' }), { status: 400 }) });
  await assert.rejects(sendEmail({ to: 'a@example.com', subject: 's', html: '<p>x</p>', kind: 'order' }, SES_ENV), (e) => /SES said 400: Email address is not verified/.test(e.message) && !e.temporary);
  setMailForTests({ store: memStore(), fetchImpl: async () => new Response('{}', { status: 429 }) });
  await assert.rejects(sendEmail({ to: 'a@example.com', subject: 's', html: '<p>x</p>', kind: 'order' }, SES_ENV), (e) => e.temporary === true);
  setMailForTests({});
});
