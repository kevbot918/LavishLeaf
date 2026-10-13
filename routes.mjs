// Pick-up routes (owner, 2026-10-11): "a system that takes in that
// information and establishes an efficient driving route", and grouping
// customers by area so a day's route stays short (preferred days may move to
// save fuel). Used by the dashboard in the browser and by the tests.
//
// Distances are straight-line miles times ROAD_FACTOR (country roads wind
// about a quarter longer than the crow flies); Google Maps gives the real
// turn-by-turn route from the links this builds.

export const FARM = { lat: 35.259911, lon: -95.490796, address: '41 Last Resort Rd, Stigler, OK 74462' };
export const ROAD_FACTOR = 1.25;
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function miles(a, b) {
  const R = (d) => (d * Math.PI) / 180;
  const x = Math.sin(R(b.lat - a.lat) / 2) ** 2 + Math.cos(R(a.lat)) * Math.cos(R(b.lat)) * Math.sin(R(b.lon - a.lon) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(x));
}

const tourMiles = (depot, stops) => {
  let d = 0, at = depot;
  for (const s of stops) { d += miles(at, s); at = s; }
  return (d + (stops.length ? miles(at, depot) : 0)) * ROAD_FACTOR;
};

/** The order to drive: nearest stop first, then 2-opt until no swap helps. Farm to farm. */
export function orderRoute(stops, depot = FARM) {
  const left = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  const route = [];
  let at = depot;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (miles(at, left[i]) < miles(at, left[best])) best = i;
    at = left.splice(best, 1)[0];
    route.push(at);
  }
  // 2-opt: reverse any stretch whose reversal shortens the loop.
  let improved = true;
  while (improved && route.length > 3) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const a = i === 0 ? depot : route[i - 1], b = route[i], c = route[k], d = k === route.length - 1 ? depot : route[k + 1];
        if (miles(a, c) + miles(b, d) < miles(a, b) + miles(c, d) - 1e-9) {
          route.splice(i, k - i + 1, ...route.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return { stops: route, miles: Math.round(tourMiles(depot, route) * 10) / 10 };
}

const bearing = (depot, s) => Math.atan2(s.lat - depot.lat, (s.lon - depot.lon) * Math.cos((depot.lat * Math.PI) / 180));

/**
 * Split customers into k route days by direction from the farm (the "sweep"
 * method): everyone to the south-west on one day, the north on another, and
 * so on, so each day drives one direction instead of criss-crossing. Groups
 * are as even as the count allows. Each group then takes the day most of its
 * customers asked for, if that day is still free.
 */
export function suggestDays(customers, k, depot = FARM) {
  const located = customers.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  k = Math.max(1, Math.min(DAYS.length, k, located.length || 1));
  const sorted = located.map((c) => ({ c, a: bearing(depot, c) })).sort((x, y) => x.a - y.a);
  // Start the sweep at the widest empty angle, so no area is cut in two.
  let start = 0, gap = -1;
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1].a : sorted[0].a + 2 * Math.PI;
    if (next - sorted[i].a > gap) { gap = next - sorted[i].a; start = (i + 1) % sorted.length; }
  }
  const ring = sorted.slice(start).concat(sorted.slice(0, start)).map((x) => x.c);
  const groups = [];
  for (let g = 0; g < k; g++) groups.push(ring.slice(Math.round((g * ring.length) / k), Math.round(((g + 1) * ring.length) / k)));
  const free = new Set(DAYS);
  const days = groups.map((grp) => {
    const votes = {};
    grp.forEach((c) => { if (free.has(c.day)) votes[c.day] = (votes[c.day] || 0) + 1; });
    const pick = Object.keys(votes).sort((a, b) => votes[b] - votes[a] || DAYS.indexOf(a) - DAYS.indexOf(b))[0] || DAYS.find((d) => free.has(d));
    free.delete(pick);
    return pick;
  });
  return groups.map((grp, i) => ({ day: days[i], customers: grp, route: orderRoute(grp, depot), kept: grp.filter((c) => c.day === days[i]).length }));
}

/** Google Maps driving links for a route, at most 9 stops each (Maps' limit), farm to farm. */
export function mapsLinks(stops, depot = FARM) {
  const place = (s) => s.address || `${s.lat},${s.lon}`;
  const links = [];
  for (let i = 0; i < stops.length; i += 9) {
    const leg = stops.slice(i, i + 9);
    const origin = i === 0 ? depot.address : place(stops[i - 1]);
    const last = i + 9 >= stops.length;
    const destination = last ? depot.address : place(leg[leg.length - 1]);
    const via = last ? leg : leg.slice(0, -1);
    const q = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
    if (via.length) q.set('waypoints', via.map(place).join('|'));
    links.push('https://www.google.com/maps/dir/?' + q.toString());
  }
  return links.length ? links : ['https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', origin: depot.address, destination: depot.address }).toString()];
}
