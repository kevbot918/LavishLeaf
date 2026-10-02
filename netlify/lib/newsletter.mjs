// The newsletter list, kept by us (2026-10-02, docs/EMAIL.md).
//
// Subscribers live in the Netlify Blobs store "newsletter", one record per
// person, keyed by a hash of the lower-cased address (so the key is not the
// address itself):
//   { email, first, last, source, joined, status: 'active' | 'unsubscribed',
//     welcomed, unsubscribedAt }
// Keeping the list ourselves means the sending service can change (Brevo
// today) without moving anybody, and nothing caps how many people can join.
//
// Sign-up is single opt-in (the owner, 2026-10-02): US law (CAN-SPAM) needs
// an honest From line, a postal address and a working unsubscribe honoured
// within 10 business days, not a confirmation click. Every marketing email
// carries a signed one-click unsubscribe link (unsubscribeUrl), which works
// without signing in and cannot be forged for somebody else's address.
//
// Environment: NEWSLETTER_SECRET (any long random text) signs those links.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { validEmail } from './mail.mjs';

export const STORE_NAME = 'newsletter';

let testStore = null;
export function setNewsletterStoreForTests(s) { testStore = s; }

export async function newsletterStore(event) {
  if (testStore) return testStore;
  const blobs = await import('@netlify/blobs');
  if (event) blobs.connectLambda(event);
  return blobs.getStore(STORE_NAME);
}

export const norm = (email) => String(email || '').trim().toLowerCase();
export const keyFor = (email) => 's-' + createHash('sha256').update(norm(email)).digest('hex').slice(0, 40);

const clip = (s, n) => String(s || '').replace(/[\x00-\x1f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function secret(env) {
  const s = env.NEWSLETTER_SECRET || '';
  if (s.length < 16) throw new Error('NEWSLETTER_SECRET is not set (16 characters or more)');
  return s;
}

/** A signature for one address and one purpose ('unsub'). */
export function sign(email, purpose = 'unsub', env = process.env) {
  return createHmac('sha256', secret(env)).update(purpose + ':' + norm(email)).digest('base64url').slice(0, 32);
}
export function verify(email, sig, purpose = 'unsub', env = process.env) {
  if (typeof sig !== 'string' || sig.length !== 32) return false;
  const want = Buffer.from(sign(email, purpose, env));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The link in every marketing email. list: 'news' or 'cart'. */
export function unsubscribeUrl(email, list = 'news', env = process.env) {
  const base = env.URL || 'https://lavishleaf.org';
  return `${base}/.netlify/functions/unsubscribe?e=${encodeURIComponent(norm(email))}&l=${list}&s=${sign(email, 'unsub-' + list, env)}`;
}

/**
 * Add (or re-add) somebody. Returns { record, isNew }. A person who had
 * unsubscribed and signs up again is active again: that is a new consent.
 */
export async function subscribe(store, { email, first = '', last = '', source = '' }, now = Date.now()) {
  if (!validEmail(email)) throw new Error('not an email address');
  const key = keyFor(email);
  const old = await store.get(key, { type: 'json' }).catch(() => null);
  const record = {
    ...(old || {}),
    email: norm(email),
    first: clip(first, 40) || (old && old.first) || '',
    last: clip(last, 40) || (old && old.last) || '',
    source: (old && old.source) || clip(source, 40),
    joined: (old && old.status === 'active' && old.joined) || new Date(now).toISOString(),
    status: 'active',
    unsubscribedAt: null,
  };
  await store.setJSON(key, record);
  return { record, isNew: !old || old.status !== 'active' };
}

export async function unsubscribe(store, email, now = Date.now()) {
  const key = keyFor(email);
  const old = await store.get(key, { type: 'json' }).catch(() => null);
  const record = { ...(old || { email: norm(email), joined: null }), status: 'unsubscribed', unsubscribedAt: new Date(now).toISOString() };
  await store.setJSON(key, record);
  return record;
}

export async function markWelcomed(store, email, now = Date.now()) {
  const key = keyFor(email);
  const rec = await store.get(key, { type: 'json' }).catch(() => null);
  if (rec) await store.setJSON(key, { ...rec, welcomed: new Date(now).toISOString() });
}

/** Every subscriber record (the list is small; Blobs pages it for us). */
export async function allSubscribers(store) {
  const out = [];
  const { blobs } = await store.list({ prefix: 's-' });
  for (const b of blobs) {
    const r = await store.get(b.key, { type: 'json' }).catch(() => null);
    if (r && r.email) out.push(r);
  }
  return out;
}

/** The numbers for the dashboard. */
export function listStats(subs, now = Date.now()) {
  const month = now - 30 * 864e5;
  const active = subs.filter((s) => s.status === 'active');
  return {
    active: active.length,
    newThisMonth: active.filter((s) => Date.parse(s.joined) >= month).length,
    unsubscribed: subs.filter((s) => s.status === 'unsubscribed').length,
    unsubscribedThisMonth: subs.filter((s) => s.status === 'unsubscribed' && Date.parse(s.unsubscribedAt) >= month).length,
  };
}
