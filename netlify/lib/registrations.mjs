// League registrations (owner, 2026-10-12): who is playing, and how to reach
// them. A player registration carries the player's name, phone and email (and
// the team they are joining, if any); a team registration carries the team
// name, the captain and every player on the roster. Both must tick that they
// accept communication about league play and that they will play in both
// Eufaula and McAlester.
//
// The details ride on the cart line (cart.js), are checked here before PayPal
// is asked (validateCart in paypal.mjs), kept in the Blobs store
// "registrations" under the PayPal order id when the order is created
// (checkout.mjs), and marked paid with an email to the owner when the payment
// is captured (capture.mjs). The dashboard lists them (functions/registrations).
import { CheckoutError } from './paypal.mjs';

export const ROSTER_MIN = 7;   // 7v7: a full side, captain included
export const ROSTER_MAX = 12;

const line = (s, max) => String(s == null ? '' : s).replace(/[\x00-\x1f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const phone = (s) => String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e);

function person(d, who) {
  const p = { name: line(d && d.name, 80), phone: phone(d && d.phone), email: line(d && d.email, 120).toLowerCase() };
  if (p.name.length < 2) throw new CheckoutError(400, `Please enter ${who}'s name.`);
  if (p.phone.length !== 10) throw new CheckoutError(400, `Please enter a 10-digit phone number for ${p.name}.`);
  if (!emailOk(p.email)) throw new CheckoutError(400, `Please enter an email address for ${p.name}.`);
  return p;
}

/**
 * A registration's details, cleaned; throws a sentence the buyer can act on.
 * kind: "player" or "team" (products.json "registration").
 */
export function cleanReg(kind, d = {}) {
  if (!d || typeof d !== 'object' || !Object.keys(d).length) throw new CheckoutError(400, 'Please fill in the registration form for each registration in your cart.');
  if (d.comms !== true) throw new CheckoutError(400, 'Please tick that you accept communication about league play.');
  if (d.bothTowns !== true) throw new CheckoutError(400, 'Please tick that you will play in both Eufaula and McAlester.');
  if (kind === 'team') {
    const team = line(d.team, 60);
    if (team.length < 2) throw new CheckoutError(400, 'Please enter the team name.');
    const captain = person(d.captain, 'the captain');
    const players = (Array.isArray(d.players) ? d.players : [])
      .filter((x) => x && (x.name || x.phone || x.email))
      .slice(0, ROSTER_MAX - 1)
      .map((x, i) => person(x, `player ${i + 2}`));
    if (players.length + 1 < ROSTER_MIN) throw new CheckoutError(400, `A team needs at least ${ROSTER_MIN} players, the captain included. Please add the rest of your roster.`);
    return { kind, team, captain, players, comms: true, bothTowns: true };
  }
  const player = person(d, 'the player');
  return { kind: 'player', ...player, team: line(d.team, 60), comms: true, bothTowns: true };
}

/** One line for PayPal and the emails: who this registration is for. */
export function regLabel(r) {
  return r.kind === 'team' ? `Team ${r.team}, ${r.players.length + 1} players` : `${r.name}${r.team ? ', ' + r.team : ''}`;
}

let testStore = null;
export function setRegistrationsStoreForTests(s) { testStore = s; }
export async function registrationsStore() {
  if (testStore) return testStore;
  const { getStore } = await import('@netlify/blobs');
  // Strong reads: an owner's change must show on the next load (2026-10-12; the
  // default eventual reads could show the old value for up to a minute).
  return getStore({ name: 'registrations', consistency: 'strong' });
}
