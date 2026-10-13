// POST /.netlify/functions/dashboard-data  { days: 7 | 28 | 90, refresh }
// Owner only (netlify/lib/admin.mjs). Everything dashboard.html draws, from
// every connected source at once (netlify/lib/dashboard.mjs), kept for 15
// minutes so opening the page twice does not ask Google and Meta twice.
import { adminFromRequest, json } from '../lib/admin.mjs';
import { claritySection, formsSection, gaSection, gscSection, ordersSummary, snapshotFollowers, socialSection } from '../lib/dashboard.mjs';
import { mailConfig, mailReady, sentToday } from '../lib/mail.mjs';
import { allSubscribers, listStats, newsletterStore } from '../lib/newsletter.mjs';
import { allOrders, ordersStore } from '../lib/orders.mjs';

const KEEP_MS = 15 * 60 * 1000;

async function store(name) {
  const { getStore } = await import('@netlify/blobs');
  return getStore(name);
}

async function listSection(days) {
  try {
    const subs = await allSubscribers(await newsletterStore());
    const s = listStats(subs);
    const cfg = mailConfig();
    const job = await (await newsletterStore()).get('job', { type: 'json' }).catch(() => null);
    return {
      status: 'ok',
      data: {
        ...s,
        mail: { ready: mailReady(), postal: !!cfg.postal, daily: cfg.daily, sentToday: mailReady() ? await sentToday() : 0 },
        job: job ? { issue: job.issue, subject: job.subject, sent: job.sent.length, failed: job.failed, done: job.done } : null,
      },
    };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function ordersSection(days) {
  try {
    const orders = await allOrders(await ordersStore());
    const acc = await store('accounts');
    const { blobs } = await acc.list();
    const accounts = [];
    for (const b of blobs.slice(0, 2000)) {
      const r = await acc.get(b.key, { type: 'json' }).catch(() => null);
      if (r) accounts.push(r);
    }
    return { status: 'ok', data: ordersSummary(orders, accounts, days) };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * The newer top tiles (owner, 2026-10-13): accounts created (every account
 * with saved lists, plus every sign-up the identity-signup function counted)
 * and donations raised through our own donate page (functions/donate.mjs).
 */
async function countsSection(days) {
  try {
    const since = Date.now() - days * 864e5;
    const acc = await store('accounts');
    const ids = new Set((await acc.list()).blobs.map((b) => b.key));
    const su = await store('signups');
    let recent = 0;
    for (const b of (await su.list({ prefix: 'u-' })).blobs) {
      ids.add(b.key.slice(2));
      const r = await su.get(b.key, { type: 'json' }).catch(() => null);
      if (r && Date.parse(r.at) >= since) recent++;
    }
    const dons = await store('donations');
    const list = [];
    for (const b of (await dons.list({ prefix: 'd-' })).blobs) { const r = await dons.get(b.key, { type: 'json' }).catch(() => null); if (r) list.push(r); }
    const kept = list.filter((d) => !d.refunded);
    const sum = (a) => Math.round(a.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100) / 100;
    return {
      status: 'ok',
      data: {
        accounts: ids.size, accountsRecent: recent,
        donations: { total: sum(kept), count: kept.length, recentTotal: sum(kept.filter((d) => Date.parse(d.date) >= since)),
          latest: list.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20).map((d) => ({ date: d.date, amount: d.amount, name: d.name, email: d.email, division: d.divisionName, refunded: !!d.refunded })) },
      },
    };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  const admin = await adminFromRequest(request);
  if (!admin) return json(403, { error: 'This page is for the owner. Please sign in with the owner account.' });
  let body = {};
  try { body = await request.json(); } catch { /* defaults */ }
  const days = [7, 28, 90].includes(Number(body.days)) ? Number(body.days) : 28;

  const cache = await store('dashboard');
  const key = 'd' + days;
  if (!body.refresh) {
    const hit = await cache.get(key, { type: 'json' }).catch(() => null);
    if (hit && Date.now() - Date.parse(hit.generated) < KEEP_MS) return json(200, { ...hit, cached: true });
  }

  const [ga, gsc, social, clarity, forms, list, orders, counts] = await Promise.all([
    gaSection(days).catch((e) => ({ status: 'error', message: e.message })),
    gscSection(days).catch((e) => ({ status: 'error', message: e.message })),
    socialSection().catch((e) => ({ status: 'error', message: e.message })),
    claritySection(cache).catch((e) => ({ status: 'error', message: e.message })),
    formsSection().catch((e) => ({ status: 'error', message: e.message })),
    listSection(days),
    ordersSection(days),
    countsSection(days),
  ]);
  if (social.status === 'ok') {
    social.data.growth = await snapshotFollowers(cache, social.data, days).catch(() => null);
  }
  const out = { generated: new Date().toISOString(), days, ga, gsc, social, clarity, forms, list, orders, counts };
  await cache.setJSON(key, out).catch(() => {});
  return json(200, out);
};
