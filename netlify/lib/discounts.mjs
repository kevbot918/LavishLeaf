// First-order discount codes (owner, 2026-10-13), kept in Blobs "discounts":
//   c-<CODE>      { code, email, phone, created, used: null | { order, at }, sms }
//   e-<hash>      the code an email address claimed
//   p-<phone>     the code a phone number claimed
//   i-<hash>      the code an IP address claimed (an HMAC of the address,
//                 never the address itself)
// One claim per IP, per email and per phone, and only for somebody with no
// paid order yet, so a new email each visit does not get a new 15%.
import { createHash, createHmac, randomInt } from 'node:crypto';
import { CODE } from '../../discount.mjs';

let testStore = null;
export function setDiscountsStoreForTests(s) { testStore = s; }

export async function discountsStore() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'discounts', consistency: 'strong' });
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return 'LL15-' + s;
}

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const emailKey = (e) => 'e-' + createHash('sha256').update(normEmail(e)).digest('hex').slice(0, 40);
const ipKey = (ip, env) => 'i-' + createHmac('sha256', env.NEWSLETTER_SECRET || 'lavish-leaf-ip').update(String(ip || '')).digest('hex').slice(0, 40);

/** Which of email, phone or IP has already claimed a code (or null). */
export async function alreadyClaimed(store, { email, phone, ip }, env = process.env) {
  if (await store.get(emailKey(email))) return 'email';
  if (normPhone(phone).length === 10 && await store.get('p-' + normPhone(phone))) return 'phone';
  if (ip && await store.get(ipKey(ip, env))) return 'ip';
  return null;
}

/** Record a new code for this person. Returns the record. */
export async function claim(store, { email, phone, ip, sms = false }, env = process.env, now = Date.now()) {
  let code = newCode();
  while (await store.get('c-' + code)) code = newCode();
  const rec = { code, email: normEmail(email), phone: normPhone(phone), created: new Date(now).toISOString(), used: null, sms: sms ? new Date(now).toISOString() : null };
  await store.setJSON('c-' + code, rec);
  await store.set(emailKey(email), code);
  if (rec.phone.length === 10) await store.set('p-' + rec.phone, code);
  if (ip) await store.set(ipKey(ip, env), code);
  return rec;
}

/** The code's record when it can still be used, else null. */
export async function usable(store, code) {
  const c = String(code || '').trim().toUpperCase();
  if (!CODE.test(c)) return null;
  const rec = await store.get('c-' + c, { type: 'json' }).catch(() => null);
  return rec && !rec.used ? rec : null;
}

export async function markUsed(store, code, order, now = Date.now()) {
  const rec = await store.get('c-' + code, { type: 'json' }).catch(() => null);
  if (!rec || rec.used) return;
  rec.used = { order, at: new Date(now).toISOString() };
  await store.setJSON('c-' + code, rec);
}
