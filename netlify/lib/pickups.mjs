// Compost and recycling pick-up sign-ups (owner, 2026-10-11).
//
// A sign-up gives a name, phone, email, address, preferred pick-up day,
// instructions and (compost) whether they want our $10 bucket. The address
// must be within 25 miles of the farm (41 Last Resort Rd, Stigler), or in
// McAlester, Stigler or Checotah. It is checked with the US Census geocoder
// (free, no key); when Census cannot place a rural address, the ZIP decides:
// the ZIPs whose centre is within 25 miles (2024 Census ZCTA gazetteer),
// plus the three towns' own.
//
// The sign-up is kept in the Blobs store "pickups"; its id rides on the PayPal
// subscription as custom_id, and the subscription carries the store's price
// and the bucket fee (or none) as a plan override, so one PayPal plan serves
// every sign-up and the 50% price needs no new plan.
import { CheckoutError } from './paypal.mjs';

export const FARM = { lat: 35.259911, lon: -95.490796 };
export const RADIUS_MILES = 25;
export const TOWNS = { MCALESTER: ['74501', '74502'], STIGLER: ['74462'], CHECOTAH: ['74426'] };
export const NEAR_ZIPS = ['74425', '74426', '74428', '74430', '74432', '74438', '74442', '74450', '74455', '74459', '74462', '74469', '74470', '74472', '74552', '74561', '74845', '74943'];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Where a ZIP-only sign-up sits on the route map: the ZIP's centre (2024
// Census ZCTA gazetteer). 74502 is McAlester's PO-box ZIP: the town's centre.
export const ZIP_POINTS = {"74425":[35.1712,-95.623],"74426":[35.4455,-95.5293],"74428":[35.5487,-95.6481],"74430":[35.1294,-95.6464],"74432":[35.2822,-95.6506],"74438":[35.5132,-95.7621],"74442":[35.1238,-95.8166],"74450":[35.5996,-95.4727],"74455":[35.3616,-95.2689],"74459":[35.5188,-95.4921],"74462":[35.2796,-95.1467],"74469":[35.5119,-95.3215],"74470":[35.4767,-95.1669],"74472":[35.25,-95.2597],"74501":[34.9842,-95.7867],"74502":[34.9842,-95.7867],"74552":[35.1134,-95.2489],"74561":[35.1303,-95.4152],"74845":[35.2532,-95.8798],"74943":[35.1,-95.0994]};
export const BUCKET_CENTS = 1000;

export function miles(a, b) {
  const R = (d) => (d * Math.PI) / 180;
  const x = Math.sin(R(b.lat - a.lat) / 2) ** 2 + Math.cos(R(a.lat)) * Math.cos(R(b.lat)) * Math.sin(R(b.lon - a.lon) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(x));
}

const line = (s, max) => String(s == null ? '' : s).replace(/[\x00-\x1f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** The sign-up form, cleaned; throws a sentence the buyer can act on. */
export function cleanSignup(d = {}, product = {}) {
  const s = {
    name: line(d.name, 80),
    phone: String(d.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''),
    email: line(d.email, 120).toLowerCase(),
    street: line(d.street, 120),
    city: line(d.city, 60),
    zip: String(d.zip || '').trim().slice(0, 5),
    day: DAYS.includes(d.day) ? d.day : '',
    notes: String(d.notes == null ? '' : d.notes).replace(/[\x00-\x09\x0b-\x1f<>]/g, ' ').trim().slice(0, 500),
    bucket: !!(product.bucket && d.bucket === true),
  };
  if (s.name.length < 2) throw new CheckoutError(400, 'Please enter your name.');
  if (s.phone.length !== 10) throw new CheckoutError(400, 'Please enter a 10-digit phone number.');
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s.email)) throw new CheckoutError(400, 'Please enter your email address.');
  if (s.street.length < 4 || s.city.length < 2) throw new CheckoutError(400, 'Please enter your street address and city.');
  if (!/^\d{5}$/.test(s.zip)) throw new CheckoutError(400, 'Please enter your 5-digit ZIP code.');
  if (!s.day) throw new CheckoutError(400, 'Please choose your pick-up day.');
  return s;
}

/**
 * Whether we pick up at this address. Returns { ok, how, miles?, matched? }
 * or throws CheckoutError with the reason.
 */
export async function checkArea(s, fetchImpl = fetch) {
  const town = s.city.toUpperCase().replace(/[^A-Z]/g, '');
  let match = null;
  try {
    const q = encodeURIComponent(`${s.street}, ${s.city}, OK ${s.zip}`);
    const res = await fetchImpl(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${q}&benchmark=Public_AR_Current&format=json`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) match = ((await res.json()).result || {}).addressMatches?.[0] || null;
  } catch { /* the ZIP decides below */ }
  if (match) {
    const c = match.addressComponents || {};
    if (c.state && c.state !== 'OK') throw new CheckoutError(400, 'We pick up in Oklahoma only, near Stigler, McAlester and Checotah.');
    const city = String(c.city || '').toUpperCase().replace(/[^A-Z]/g, '');
    const d = miles(FARM, { lat: match.coordinates.y, lon: match.coordinates.x });
    if (TOWNS[city] || d <= RADIUS_MILES) return { ok: true, how: TOWNS[city] ? 'town' : 'radius', miles: Math.round(d * 10) / 10, matched: match.matchedAddress, lat: match.coordinates.y, lon: match.coordinates.x };
    throw new CheckoutError(400, `That address is about ${Math.round(d)} miles from us, outside our ${RADIUS_MILES} mile pick-up area (plus McAlester, Stigler and Checotah). Email support@lavishleaf.org and we will let you know when we reach you.`);
  }
  const townZip = Object.entries(TOWNS).some(([t, zips]) => t === town && zips.includes(s.zip));
  if (townZip || NEAR_ZIPS.includes(s.zip) || Object.values(TOWNS).flat().includes(s.zip)) {
    const pt = ZIP_POINTS[s.zip];
    return { ok: true, how: 'zip', ...(pt ? { lat: pt[0], lon: pt[1], miles: Math.round(miles(FARM, { lat: pt[0], lon: pt[1] }) * 10) / 10 } : {}) };
  }
  throw new CheckoutError(400, `We could not place that address inside our pick-up area (${RADIUS_MILES} miles of Stigler, plus McAlester and Checotah). Check the street and ZIP, or email support@lavishleaf.org.`);
}

/** PayPal's plan override: our price on the regular cycle, the bucket fee or none, 6% tax. */
export function planOverride(plan, product, s, taxPercent) {
  const regular = ((plan && plan.billing_cycles) || []).find((c) => c.tenure_type === 'REGULAR') || { sequence: 1 };
  return {
    billing_cycles: [{ sequence: regular.sequence, total_cycles: 0, pricing_scheme: { fixed_price: { value: (product.price / 100).toFixed(2), currency_code: 'USD' } } }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: s.bucket ? (BUCKET_CENTS / 100).toFixed(2) : '0.00', currency_code: 'USD' },
      setup_fee_failure_action: 'CANCEL',
      payment_failure_threshold: 3,
    },
    taxes: { percentage: taxPercent, inclusive: false },
  };
}

let testStore = null;
export function setPickupsStoreForTests(s) { testStore = s; }
export async function pickupsStore() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  return getStore('pickups');
}
