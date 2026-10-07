// Sending email for lavishleaf.org (2026-10-02, docs/EMAIL.md).
//
// ONE place that sends: the welcome email, the newsletter, order
// confirmations, cart reminders and the contact auto-reply all come through
// sendEmail(). Two providers, chosen in mailConfig(): Amazon SES (the
// owner's choice, 2026-10-07) or Brevo. Nothing outside send() knows which.
//
// Environment (Netlify, never in this repository):
//   BREVO_API_KEY        the Brevo API key ("SMTP & API" -> "API keys")
//   MAIL_FROM            the From address, e.g. hello@lavishleaf.org (default
//                        support@lavishleaf.org); its domain must be verified
//                        in Brevo
//   MAIL_DAILY_LIMIT     the provider's daily cap (default 300)
//   MAIL_POSTAL_ADDRESS  the PO box every marketing email must carry
//                        (CAN-SPAM); marketing mail refuses to send without it
//   OWNER_EMAIL          where order alerts go

export class MailError extends Error {
  /** temporary: true when trying again later may work (rate limit, outage). */
  constructor(message, { temporary = false } = {}) { super(message); this.temporary = temporary; }
}

/** Mail that is a reply to something the person did, not marketing. */
export const TRANSACTIONAL = new Set(['order', 'owner', 'contact-reply', 'test']);

/**
 * Kinds that a stranger can cause (a sign-up, the contact form) or that go to
 * many people share the day's budget minus the reserve, so nothing but order
 * emails can ever use the last 40.
 */
const CAPPED = new Set(['welcome', 'newsletter', 'cart', 'contact-reply']);

/** Kept back each day for order emails, so a newsletter never blocks a receipt. */
const RESERVE = 40;

// Amazon SES (2026-10-07, the owner: Brevo's 300 a day was too few; SES is
// $0.10 per 1,000). The keys are SES_*, not AWS_*: Netlify functions run on
// AWS Lambda, which reserves the AWS_ names for itself.
//   SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY   an IAM user allowed ses:SendEmail
//   SES_REGION                                 where lavishleaf.org is verified (default us-east-1)
// With the SES keys present and no BREVO_API_KEY, SES is chosen; MAIL_PROVIDER
// ("ses" or "brevo") decides when both exist.
export function mailConfig(env = process.env) {
  const ses = !!(env.SES_ACCESS_KEY_ID && env.SES_SECRET_ACCESS_KEY);
  const provider = (env.MAIL_PROVIDER || (ses && !env.BREVO_API_KEY ? 'ses' : 'brevo')).toLowerCase();
  return {
    provider,
    key: provider === 'ses' ? (ses ? 'ses' : '') : env.BREVO_API_KEY || '',
    ses: { accessKeyId: env.SES_ACCESS_KEY_ID || '', secretAccessKey: env.SES_SECRET_ACCESS_KEY || '', region: (env.SES_REGION || 'us-east-1').trim() },
    from: env.MAIL_FROM || 'support@lavishleaf.org',
    fromName: env.MAIL_FROM_NAME || 'Lavish Leaf',
    replyTo: env.MAIL_REPLY_TO || 'support@lavishleaf.org',
    // A new SES account is in the "sandbox": 200 a day until Amazon approves
    // production access. Set MAIL_DAILY_LIMIT to the quota SES then shows.
    daily: Math.max(1, parseInt(env.MAIL_DAILY_LIMIT, 10) || (provider === 'ses' ? 200 : 300)),
    postal: (env.MAIL_POSTAL_ADDRESS || '').trim(),
    owner: (env.OWNER_EMAIL || '').trim(),
  };
}

export function mailReady(env = process.env) {
  return !!mailConfig(env).key;
}

const EMAIL = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export function validEmail(e) {
  return typeof e === 'string' && EMAIL.test(e.trim());
}

let testStore = null;
let testFetch = null;
export function setMailForTests({ store, fetchImpl } = {}) { testStore = store || null; testFetch = fetchImpl || null; }

async function counterStore() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore('mail');
}

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** How many emails have gone out today (UTC), across every kind. */
export async function sentToday(now = Date.now()) {
  const s = await counterStore();
  const n = await s.get('count-' + today(now), { type: 'json' }).catch(() => null);
  return (n && n.sent) || 0;
}
async function countOne(now = Date.now()) {
  const s = await counterStore();
  const key = 'count-' + today(now);
  const n = await s.get(key, { type: 'json' }).catch(() => null);
  await s.setJSON(key, { sent: ((n && n.sent) || 0) + 1 });
}

/** How many marketing emails may still go today, leaving the reserve. */
export async function marketingBudget(env = process.env, now = Date.now()) {
  return Math.max(0, mailConfig(env).daily - RESERVE - (await sentToday(now)));
}

/**
 * Send one email. kind is 'order', 'owner', 'contact-reply', 'test' (no
 * unsubscribe needed) or 'welcome', 'newsletter', 'cart' (marketing: needs
 * unsubscribeUrl and the postal address, which the template carries).
 */
export async function sendEmail({ to, toName = '', subject, html, text = '', kind, unsubscribeUrl = '' }, env = process.env) {
  const cfg = mailConfig(env);
  if (!cfg.key) throw new MailError(cfg.provider === 'ses' ? 'email is not set up (SES_ACCESS_KEY_ID and SES_SECRET_ACCESS_KEY)' : 'email is not set up (no SES keys or BREVO_API_KEY)');
  if (!validEmail(to)) throw new MailError('not an email address');
  if (!subject || !html) throw new MailError('subject and html are required');
  const marketing = !TRANSACTIONAL.has(kind);
  if (marketing && !unsubscribeUrl) throw new MailError('marketing email needs an unsubscribe link');
  if (marketing && !cfg.postal) throw new MailError('marketing email needs MAIL_POSTAL_ADDRESS (CAN-SPAM)');
  const sent = await sentToday();
  if (sent >= cfg.daily || (CAPPED.has(kind) && sent >= cfg.daily - RESERVE)) throw new MailError('daily email limit reached', { temporary: true });

  const headers = {};
  if (unsubscribeUrl) {
    // RFC 8058 one-click unsubscribe, which Gmail and Yahoo now expect.
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const res = await send(cfg, { to: to.trim(), toName, subject, html, text, headers, kind });
  await countOne();
  return res;
}

/** A From line: "Lavish Leaf <support@lavishleaf.org>", the name quoted only if it needs it. */
function fromLine(name, email) {
  const clean = String(name || '').replace(/["\\\r\n]/g, '').trim();
  if (!clean) return email;
  return /^[A-Za-z0-9 .'-]+$/.test(clean) ? `${clean} <${email}>` : `"${clean}" <${email}>`;
}

async function sendSes(cfg, m, fetchImpl) {
  const { signV4 } = await import('./aws-sign.mjs');
  const host = `email.${cfg.ses.region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const simple = {
    Subject: { Data: m.subject.slice(0, 200), Charset: 'UTF-8' },
    Body: { Html: { Data: m.html, Charset: 'UTF-8' }, ...(m.text ? { Text: { Data: m.text, Charset: 'UTF-8' } } : {}) },
  };
  const headers = Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value }));
  if (headers.length) simple.Headers = headers;
  const to = m.toName ? fromLine(m.toName.slice(0, 70), m.to) : m.to;
  const body = JSON.stringify({
    FromEmailAddress: fromLine(cfg.fromName, cfg.from),
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: [cfg.replyTo],
    Content: { Simple: simple },
    // Tag values allow letters, numbers, "_" and "-" only.
    EmailTags: [{ Name: 'kind', Value: String(m.kind || 'other').replace(/[^A-Za-z0-9_-]/g, '-') }],
  });
  const signed = signV4({
    method: 'POST', host, path, body, service: 'ses', region: cfg.ses.region,
    headers: { 'content-type': 'application/json' },
    accessKeyId: cfg.ses.accessKeyId, secretAccessKey: cfg.ses.secretAccessKey,
  });
  const res = await fetchImpl(`https://${host}${path}`, { method: 'POST', headers: signed, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = String(json.message || json.Message || '').slice(0, 200);
    throw new MailError(`Amazon SES said ${res.status}: ${why}`, { temporary: res.status === 429 || res.status >= 500 });
  }
  return { id: json.MessageId || null };
}

async function send(cfg, m) {
  const fetchImpl = testFetch || fetch;
  if (cfg.provider === 'ses') return sendSes(cfg, m, fetchImpl);
  if (cfg.provider !== 'brevo') throw new MailError(`unknown MAIL_PROVIDER "${cfg.provider}"`);
  const body = {
    sender: { name: cfg.fromName, email: cfg.from },
    to: [{ email: m.to, ...(m.toName ? { name: m.toName.slice(0, 70) } : {}) }],
    replyTo: { email: cfg.replyTo, name: cfg.fromName },
    subject: m.subject.slice(0, 200),
    htmlContent: m.html,
    ...(m.text ? { textContent: m.text } : {}),
    ...(Object.keys(m.headers).length ? { headers: m.headers } : {}),
    tags: [m.kind],
  };
  const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': cfg.key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new MailError(`Brevo said ${res.status}: ${String(json.message || '').slice(0, 200)}`, { temporary: res.status === 429 || res.status >= 500 });
  return { id: json.messageId || null };
}

// ----------------------------------------------------------- templates

/** HTML-escape a value going into a template. */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Fill {{name}} placeholders. Values are escaped unless the name ends in
 * _html (blocks this code builds itself, like an order's item rows).
 */
export function fill(template, vars) {
  return String(template).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => {
    const v = vars[k];
    if (v == null) return '';
    return /_html$/.test(k) ? String(v) : esc(v);
  });
}

/** The words of an HTML email, for the plain-text part. */
export function textOf(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<(br|\/p|\/h[1-6]|\/tr|\/li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

/** A template file from the deployed site (emails/*.html), so editing one is a commit. */
export async function loadTemplate(name, env = process.env) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new MailError('bad template name');
  const base = env.URL || 'https://lavishleaf.org';
  const res = await (testFetch || fetch)(`${base}/emails/${name}.html`);
  if (!res.ok) throw new MailError(`template ${name} not found (${res.status})`);
  // The files carry a small script for "View in your browser"; scripts in
  // a sent email only raise spam scores, so they never go out.
  return (await res.text()).replace(/<script[\s\S]*?<\/script>/gi, '');
}
