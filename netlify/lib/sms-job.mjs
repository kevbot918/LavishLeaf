// A text-message send to everyone who said yes (2026-10-14), worked through a
// batch at a time so it fits the toll-free number's 3 messages a second and a
// function's time: the dashboard starts it, functions/sms-drip.mjs carries on
// every 10 minutes, within US quiet hours. Blobs "sms", key "job".
import { allSubscribers, keyFor, newsletterStore } from './newsletter.mjs';
import { e164, optedOutNumbers, quietHoursOk, sendSms } from './sms.mjs';

export const BATCH = 25;

export async function smsStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'sms', consistency: 'strong' });
}

/** Contacts who may get a text: consent, a phone, no STOP. */
export function textable(subs) {
  const seen = new Set();
  return subs.filter((s) => {
    const p = s.smsConsent && !s.smsOptOut && e164(s.smsConsent.phone || s.phone);
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

/** AWS's opt-out list onto our contacts (anyone who texted STOP). */
export async function syncOptOuts(nl, opts = {}) {
  const out = await optedOutNumbers(opts);
  let n = 0;
  for (const s of await allSubscribers(nl)) {
    const p = e164((s.smsConsent && s.smsConsent.phone) || s.phone);
    if (p && out.has(p) && !s.smsOptOut) {
      await nl.setJSON(keyFor(s.email), { ...s, smsOptOut: { at: new Date().toISOString(), how: 'replied STOP' } });
      n++;
    }
  }
  return n;
}

export async function startJob(text) {
  const nl = await newsletterStore();
  await syncOptOuts(nl).catch((e) => { throw new Error('Could not read the opt-out list from AWS, so nothing was sent: ' + e.message); });
  const people = textable(await allSubscribers(nl));
  const job = { text, created: new Date().toISOString(), queue: people.map((s) => ({ k: keyFor(s.email), p: e164(s.smsConsent.phone || s.phone) })), sent: 0, failed: 0, optedOut: 0, done: people.length === 0, errors: [] };
  const st = await smsStore();
  await st.setJSON('job', job);
  return job;
}

/** One batch. Returns the job (or null when there is none to run). */
export async function runBatch(now = new Date(), limit = BATCH) {
  const st = await smsStore();
  const job = await st.get('job', { type: 'json' }).catch(() => null);
  if (!job || job.done || job.canceled) return null;
  if (!quietHoursOk(now)) return job;
  const nl = await newsletterStore();
  const batch = job.queue.splice(0, limit);
  for (const r of batch) {
    try {
      // Read again: somebody may have opted out since the send began.
      const c = await nl.get(r.k, { type: 'json' }).catch(() => null);
      if (!c || !c.smsConsent || c.smsOptOut) { job.optedOut++; continue; }
      await sendSms(r.p, job.text);
      job.sent++;
    } catch (e) {
      if (e.optedOut) {
        job.optedOut++;
        const c = await nl.get(r.k, { type: 'json' }).catch(() => null);
        if (c) await nl.setJSON(r.k, { ...c, smsOptOut: { at: new Date().toISOString(), how: 'AWS opt-out list' } });
      } else if (e.temporary) {
        job.queue.push(r); // try again next batch
        break;
      } else {
        job.failed++;
        if (job.errors.length < 10) job.errors.push(String(e.message).slice(0, 160));
      }
    }
    await new Promise((res) => setTimeout(res, 350)); // under 3 a second
  }
  if (!job.queue.length) { job.done = true; job.finished = new Date().toISOString(); }
  await st.setJSON('job', job);
  return job;
}
