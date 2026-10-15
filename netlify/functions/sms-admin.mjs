// POST /.netlify/functions/sms-admin   owner only (2026-10-14)
//   { action: "status" }                -> set up?, who can be texted, the send
//   { action: "test", phone, text }     -> one text to the owner's own phone
//   { action: "send", text }            -> text everyone who said yes (in batches)
//   { action: "cancel" }                -> stop a send part-way
// Every text reads "Lavish Leaf: <text> Reply STOP to opt out." (lib/sms.mjs).
import { adminFromRequest, json } from '../lib/admin.mjs';
import { allSubscribers, newsletterStore } from '../lib/newsletter.mjs';
import { fullText, quietHoursOk, segments, sendSms, smsReady , smsConfig } from '../lib/sms.mjs';
import { runBatch, smsStore, startJob, syncOptOuts, textable } from '../lib/sms-job.mjs';

const clean = (t) => String(t || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
  let body = {};
  try { body = await request.json(); } catch { /* defaults */ }
  try {
    const st = await smsStore();
    if (body.action === 'status') {
      const subs = await allSubscribers(await newsletterStore());
      const job = await st.get('job', { type: 'json' }).catch(() => null);
      return json(200, {
        ready: smsReady(), quietOk: quietHoursOk(),
        // Where texts are sent from (names only): helps a ResourceNotFound (2026-10-15).
        setup: (() => { const c = smsConfig(); return { region: c.region, regionFrom: c.regionFrom, keys: c.keys, from: c.from ? c.from.replace(/\d(?=\d{4})/g, '*') : null }; })(),
        consented: subs.filter((s) => s.smsConsent).length,
        textable: textable(subs).length,
        optedOut: subs.filter((s) => s.smsOptOut).length,
        job: job ? { text: job.text, created: job.created, sent: job.sent, left: job.queue.length, failed: job.failed, optedOut: job.optedOut, done: !!job.done, canceled: !!job.canceled, errors: job.errors } : null,
      });
    }
    if (!smsReady()) return json(400, { error: 'Texting is not set up yet: the toll-free number and SMS_ORIGINATION_NUMBER in Netlify (docs/OWNER-STEPS.md, "Texting").' });
    const text = clean(body.text);
    if (body.action === 'test' || body.action === 'send') {
      if (!text) return json(400, { error: 'Write the message first.' });
      const seg = segments(fullText(text));
      if (seg.parts > 2) return json(400, { error: 'That is ' + seg.parts + ' text messages long; keep it to 2 at most (shorter is cheaper).' });
    }
    if (body.action === 'test') {
      await sendSms(body.phone, text);
      return json(200, { ok: true, sentTo: String(body.phone) });
    }
    if (body.action === 'send') {
      const old = await st.get('job', { type: 'json' }).catch(() => null);
      if (old && !old.done && !old.canceled) return json(409, { error: 'A send is still going. Cancel it first, or wait for it to finish.' });
      const job = await startJob(text);
      // A first few now (a dashboard call has 10 seconds); sms-drip does the rest.
      const after = (await runBatch(new Date(), 5)) || job;
      return json(200, { ok: true, total: job.queue.length, sent: after.sent || 0, quietOk: quietHoursOk() });
    }
    if (body.action === 'sync') {
      return json(200, { newlyOptedOut: await syncOptOuts(await newsletterStore()) });
    }
    if (body.action === 'cancel') {
      const job = await st.get('job', { type: 'json' }).catch(() => null);
      if (job && !job.done) { job.canceled = new Date().toISOString(); await st.setJSON('job', job); }
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    console.error('[sms-admin]', e);
    return json(502, { error: String(e.message || e).slice(0, 300) });
  }
};
