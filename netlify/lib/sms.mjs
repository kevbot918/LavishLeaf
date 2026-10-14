// Text messages to customers who said yes (owner, 2026-10-14: "add a 'Text me
// offers' checkbox and sending from the dashboard ... Ensure that in our
// texts, there is a way for people to stop or unsubscribe").
//
// Sent through AWS End User Messaging SMS (the same AWS account as the email),
// from our own toll-free number, without the AWS SDK (SigV4, aws-sign.mjs):
//   POST https://sms-voice.<region>.amazonaws.com/
//   X-Amz-Target: PinpointSMSVoiceV2.SendTextMessage
//
// Rules every text keeps:
//   * only to a contact with smsConsent and no smsOptOut (lib/newsletter.mjs);
//   * it starts "Lavish Leaf: " and ends "Reply STOP to opt out." (STOP and
//     HELP are answered by AWS on the number; an opted-out number is refused
//     by AWS itself, and the Default opt-out list is read before every send
//     so our list says so too);
//   * marketing texts only between 9 am and 8 pm Central (US quiet hours).
//
// Environment (Netlify): SMS_ORIGINATION_NUMBER (the toll-free number in
// +1 form, or its ARN), SMS_REGION (else SES_REGION), and the keys of an IAM
// user allowed sms-voice:SendTextMessage and sms-voice:DescribeOptedOutNumbers:
// SMS_ACCESS_KEY_ID / SMS_SECRET_ACCESS_KEY, or else the SES_* keys. Own keys
// since 2026-10-14: the owner's number and registration are in the
// Management Account in us-east-1, while email runs in the "Lavish Leaf Inc"
// account in us-east-2, and a text must go from the number's own account.
import { signV4 } from './aws-sign.mjs';

export const PREFIX = 'Lavish Leaf: ';
export const SUFFIX = ' Reply STOP to opt out.';

export function originationId(v) {
  const t = String(v || '').trim();
  if (/^[+\d\s().-]+$/.test(t)) { const d = t.replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d.length === 11 && d[0] === '1' ? '+' + d : t; }
  return t;
}

export function smsConfig(env = process.env) {
  return {
    // A bare number (18885551234, 888-555-1234) becomes +18885551234; an ARN or
    // id stays as given (owner, 2026-10-14: entered without the +).
    from: originationId(env.SMS_ORIGINATION_NUMBER),
    region: String(env.SMS_REGION || env.SES_REGION || 'us-east-1').trim(),
    accessKeyId: env.SMS_ACCESS_KEY_ID || env.SES_ACCESS_KEY_ID || '',
    secretAccessKey: env.SMS_SECRET_ACCESS_KEY || env.SES_SECRET_ACCESS_KEY || '',
  };
}
export const smsReady = (env = process.env) => { const c = smsConfig(env); return !!(c.from && c.accessKeyId && c.secretAccessKey); };

/** A US phone number in E.164 (+1XXXXXXXXXX), or ''. */
export function e164(phone) {
  const d = String(phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? '+1' + d : '';
}

/** The text as sent: our name first, the way out last. */
export function fullText(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return PREFIX + t + SUFFIX;
}

/** Characters and message parts (GSM 160 / 153 per part; anything else 70 / 67). */
export function segments(s) {
  const gsm = /^[A-Za-z0-9 @£$¥èéùìòÇØøÅå_ÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r]*$/.test(s);
  const n = s.length;
  if (gsm) return { chars: n, parts: n <= 160 ? 1 : Math.ceil(n / 153), gsm };
  return { chars: n, parts: n <= 70 ? 1 : Math.ceil(n / 67), gsm };
}

/** Whether a marketing text may go now: 9 am to 8 pm in Oklahoma. */
export function quietHoursOk(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(now)) % 24;
  return h >= 9 && h < 20;
}

export class SmsError extends Error {
  constructor(message, { optedOut = false, temporary = false } = {}) { super(message); this.optedOut = optedOut; this.temporary = temporary; }
}

async function api(cfg, action, payload, fetchImpl = fetch) {
  const host = `sms-voice.${cfg.region}.amazonaws.com`;
  const body = JSON.stringify(payload);
  const headers = signV4({
    method: 'POST', host, path: '/', body, service: 'sms-voice', region: cfg.region,
    headers: { 'content-type': 'application/x-amz-json-1.0', 'x-amz-target': 'PinpointSMSVoiceV2.' + action },
    accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey,
  });
  const res = await fetchImpl(`https://${host}/`, { method: 'POST', headers, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const type = String(json.__type || res.headers.get('x-amzn-errortype') || '').split('#').pop().split(':')[0];
    const reason = String(json.Reason || json.reason || '');
    const msg = String(json.message || json.Message || '').slice(0, 200);
    throw new SmsError(`AWS said ${res.status} ${type}${reason ? ' (' + reason + ')' : ''}: ${msg}`, {
      optedOut: /OPTED_OUT/i.test(reason) || /opted.?out/i.test(msg),
      temporary: res.status >= 500 || /Throttling/i.test(type),
    });
  }
  return json;
}

/** One text. Returns the MessageId. */
export async function sendSms(to, text, { env = process.env, fetchImpl = fetch, type = 'PROMOTIONAL' } = {}) {
  const cfg = smsConfig(env);
  if (!smsReady(env)) throw new SmsError('Texting is not set up yet (SMS_ORIGINATION_NUMBER and the AWS keys, docs/OWNER-STEPS.md).');
  const dest = e164(to);
  if (!dest) throw new SmsError('not a 10-digit US phone number');
  const r = await api(cfg, 'SendTextMessage', { DestinationPhoneNumber: dest, OriginationIdentity: cfg.from, MessageBody: fullText(text), MessageType: type }, fetchImpl);
  return r.MessageId || null;
}

/** Every number on AWS's Default opt-out list (people who texted STOP). */
export async function optedOutNumbers({ env = process.env, fetchImpl = fetch } = {}) {
  const cfg = smsConfig(env);
  const out = new Set();
  let token;
  for (let page = 0; page < 50; page++) {
    const r = await api(cfg, 'DescribeOptedOutNumbers', { OptOutListName: 'Default', MaxResults: 100, ...(token ? { NextToken: token } : {}) }, fetchImpl);
    for (const n of r.OptedOutNumbers || []) out.add(n.OptedOutNumber);
    token = r.NextToken;
    if (!token) break;
  }
  return out;
}
