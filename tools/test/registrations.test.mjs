// League registrations (2026-10-12): the player and team forms, checked on
// the server, kept as separate lines, named on the PayPal order, and the
// roster the owner is emailed.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanReg, regLabel, ROSTER_MIN } from '../../netlify/lib/registrations.mjs';
import { orderBody, validateCart } from '../../netlify/lib/paypal.mjs';
import { rosterRows } from '../../netlify/lib/registration-mail.mjs';

const me = (name, i = 0) => ({ name, phone: '918555014' + i, email: name.split(' ')[0].toLowerCase() + '@example.com' });
const player = { ...me('Sam Lee'), team: 'Lake Kickers', comms: true, bothTowns: true };
const team = { team: 'Lake Kickers', captain: me('Cap Tain'), players: Array.from({ length: ROSTER_MIN - 1 }, (_, i) => me('Player ' + (i + 2), i)), comms: true, bothTowns: true };
const catalog = {
  p: { id: 'p', name: 'Player Registration', price: 1500, active: true, ship: false, registration: 'player', waiver: { version: '2026-09' } },
  t: { id: 't', name: 'Team Registration', price: 15000, active: true, ship: false, registration: 'team', waiver: { version: '2026-09' } },
};

test('a player gives name, phone and email and ticks both boxes', () => {
  assert.equal(cleanReg('player', player).phone, '9185550140');
  assert.throws(() => cleanReg('player', { ...player, comms: false }), /communication/);
  assert.throws(() => cleanReg('player', { ...player, bothTowns: false }), /Eufaula and McAlester/);
  assert.throws(() => cleanReg('player', { ...player, phone: '555' }), /phone/);
  assert.throws(() => cleanReg('player', { ...player, email: 'nope' }), /email/);
});

test('a team gives its name, the captain and every player, at least a full side', () => {
  const r = cleanReg('team', team);
  assert.equal(r.players.length + 1, ROSTER_MIN);
  assert.throws(() => cleanReg('team', { ...team, players: team.players.slice(1) }), /at least 7 players/);
  assert.throws(() => cleanReg('team', { ...team, team: '' }), /team name/);
  assert.throws(() => cleanReg('team', { ...team, players: [...team.players, { name: 'No Phone', email: 'x@example.com' }] }), /phone number for No Phone/);
  assert.equal(regLabel(r), 'Team Lake Kickers, 7 players');
  assert.equal(rosterRows(r).length, 7);
  assert.equal(rosterRows(r)[0][0], 'Captain');
});

test('checkout refuses a registration without its form, and keeps each one on its own line', () => {
  assert.throws(() => validateCart([{ id: 'p', qty: 1 }], catalog), /registration form/);
  assert.throws(() => validateCart([{ id: 'p', qty: 2, reg: player }], catalog), /its own line/);
  const lines = validateCart([{ id: 'p', qty: 1, reg: player }, { id: 'p', qty: 1, reg: { ...player, ...me('Ana Ruiz') } }, { id: 't', qty: 1, reg: team }], catalog);
  assert.equal(lines.length, 3);
  const items = orderBody(lines, { returnUrl: 'r', cancelUrl: 'c', waivers: ['2026-09'] }).purchase_units[0].items;
  assert.deepEqual(items.map((i) => i.name), ['Player Registration: Sam Lee, Lake Kickers', 'Player Registration: Ana Ruiz, Lake Kickers', 'Team Registration: Team Lake Kickers, 7 players']);
});
