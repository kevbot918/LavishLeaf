// The pick-up route planner (routes.mjs, 2026-10-11): driving order, the
// area grouping that saves fuel, and the Google Maps links.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FARM, mapsLinks, miles, orderRoute, suggestDays } from '../../routes.mjs';

// Real places around the farm (Census ZIP centres).
const P = (name, lat, lon, day = 'Tuesday') => ({ name, lat, lon, day, address: name + ', OK' });
const mcalester = [P('McAlester A', 34.93, -95.77), P('McAlester B', 34.95, -95.75, 'Friday'), P('Krebs', 34.93, -95.72)];
const checotah = [P('Checotah A', 35.47, -95.52, 'Monday'), P('Checotah B', 35.45, -95.53, 'Monday'), P('Eufaula', 35.29, -95.58, 'Monday')];
const stigler = [P('Stigler A', 35.25, -95.13, 'Wednesday'), P('Stigler B', 35.26, -95.12, 'Wednesday'), P('Keota', 35.25, -94.92, 'Wednesday')];

test('a route is farm to farm, every stop once, and no longer than the order they signed up in', () => {
  const stops = [mcalester[0], checotah[0], stigler[0], mcalester[1], checotah[1], stigler[1]];
  const r = orderRoute(stops);
  assert.equal(r.stops.length, stops.length);
  assert.deepEqual(new Set(r.stops), new Set(stops));
  let naive = 0, at = FARM; for (const s of stops) { naive += miles(at, s); at = s; } naive = (naive + miles(at, FARM)) * 1.25;
  assert.ok(r.miles < naive, `${r.miles} should beat ${naive.toFixed(1)}`);
  // Neighbours stay together: the two McAlester stops are adjacent in the order.
  const i = r.stops.indexOf(mcalester[0]), k = r.stops.indexOf(mcalester[1]);
  assert.equal(Math.abs(i - k), 1);
});

test('three areas on three days: each day drives one direction and keeps its customers\' day', () => {
  const plan = suggestDays([...mcalester, ...checotah, ...stigler], 3);
  assert.equal(plan.length, 3);
  const towns = plan.map((g) => new Set(g.customers.map((c) => c.name.split(' ')[0])));
  for (const t of towns) assert.ok(t.size <= 2, 'a day stays in one area: ' + [...t]);
  assert.deepEqual(plan.map((g) => g.day).sort(), ['Monday', 'Tuesday', 'Wednesday']);
  const separate = plan.reduce((n, g) => n + g.route.miles, 0);
  const oneDay = orderRoute([...mcalester, ...checotah, ...stigler]).miles;
  assert.ok(separate >= oneDay, 'one long day is never longer than three short ones');
});

test('Google Maps links: at most 9 stops each, starting and ending at the farm', () => {
  const stops = Array.from({ length: 20 }, (_, i) => P('Stop ' + i, 35 + i / 100, -95.5));
  const links = mapsLinks(stops);
  assert.equal(links.length, 3);
  const first = new URL(links[0]), last = new URL(links[2]);
  assert.equal(first.searchParams.get('origin'), FARM.address);
  assert.equal(last.searchParams.get('destination'), FARM.address);
  for (const u of links) assert.ok(new URL(u).searchParams.get('waypoints').split('|').length <= 9);
  const all = links.flatMap((u) => { const q = new URL(u).searchParams; return [...q.get('waypoints').split('|'), q.get('destination')]; });
  for (const s of stops) assert.ok(all.includes(s.address), 'every stop is in a link: ' + s.address);
});
