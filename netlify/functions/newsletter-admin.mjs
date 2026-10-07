// POST /.netlify/functions/newsletter-admin   (owner only, netlify/lib/admin.mjs)
//   { action: "status" }                  -> the list, today's email count, the job
//   { action: "test", issue }             -> that issue, to the owner's own inbox
//   { action: "send", issue }             -> start sending it to everyone
//   { action: "cancel" }                  -> stop a send part-way
//   { action: "welcome-test" }            -> the welcome email, to the owner
//   { action: "import" }                  -> everyone who ticked "Sign up" on the
//                                           Netlify newsletter form before this
//                                           list existed (no welcome email sent)
// An issue is a file in emails/ named like newsletter-2026-10.html, deployed
// first. Nothing reaches subscribers until the owner presses Send.
import { adminFromRequest, json } from '../lib/admin.mjs';
import { ISSUE, personalise, startJob, subjectOf } from '../lib/broadcast.mjs';
import { loadTemplate, mailConfig, mailReady, sendEmail, sentToday, textOf } from '../lib/mail.mjs';
import { allSubscribers, listStats, markWelcomed, newsletterStore, subscribe } from '../lib/newsletter.mjs';
import { sendWelcome } from '../lib/welcome.mjs';

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  const admin = await adminFromRequest(request);
  if (!admin) return json(403, { error: 'Only the owner can do that. Please sign in.' });
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const cfg = mailConfig();
  try {
    const store = await newsletterStore();
    if (body.action === 'status') {
      const job = await store.get('job', { type: 'json' }).catch(() => null);
      return json(200, {
        ready: mailReady(), postal: !!cfg.postal, from: cfg.from, daily: cfg.daily,
        sentToday: mailReady() ? await sentToday() : 0,
        list: listStats(await allSubscribers(store)),
        job: job ? { issue: job.issue, subject: job.subject, created: job.created, sent: job.sent.length, failed: job.failed, done: job.done } : null,
      });
    }
    if (body.action === 'import') {
      const n = await importFromForms(store);
      return json(200, { ok: true, message: `${n} past sign-up${n === 1 ? '' : 's'} added to the list.` });
    }
    if (!mailReady()) return json(400, { error: 'Email is not set up yet: add SES_ACCESS_KEY_ID and SES_SECRET_ACCESS_KEY in Netlify (docs/OWNER-STEPS.md).' });
    if (!cfg.postal) return json(400, { error: 'Add MAIL_POSTAL_ADDRESS (your PO box) in Netlify first. Every newsletter must carry it.' });
    const issue = String(body.issue || '');

    if (body.action === 'test') {
      if (!ISSUE.test(issue)) return json(400, { error: 'Issue names look like newsletter-2026-10.' });
      const tpl = await loadTemplate(issue);
      const { html, unsub } = personalise(tpl, { email: admin.email, first: 'Test' }, issue);
      await sendEmail({ to: admin.email, subject: '[Test] ' + subjectOf(tpl), html, text: textOf(html), kind: 'newsletter', unsubscribeUrl: unsub });
      return json(200, { ok: true, message: `A test copy went to ${admin.email}.` });
    }
    if (body.action === 'welcome-test') {
      await sendWelcome({ email: admin.email, first: 'Test' });
      return json(200, { ok: true, message: `The welcome email went to ${admin.email}.` });
    }
    if (body.action === 'send') {
      // Only the hourly newsletter-drip sends, so a slow request can never
      // cut a batch short and a double click cannot send twice.
      const job = await startJob(store, issue);
      return json(200, { ok: true, message: `"${job.subject}" is queued. It starts going out within the hour, in batches within the daily limit; this page shows the count.` });
    }
    if (body.action === 'cancel') {
      const job = await store.get('job', { type: 'json' }).catch(() => null);
      if (job && !job.done) await store.setJSON('job', { ...job, done: 'cancelled ' + new Date().toISOString() });
      return json(200, { ok: true, message: 'Stopped.' });
    }
    return json(400, { error: 'That request was not understood.' });
  } catch (e) {
    console.error('[newsletter-admin]', e.message);
    return json(400, { error: e.message });
  }
};

/** Past sign-ups from Netlify Forms (needs NETLIFY_API_TOKEN; SITE_ID is Netlify's own). */
async function importFromForms(store) {
  const token = process.env.NETLIFY_API_TOKEN;
  const site = process.env.SITE_ID;
  if (!token || !site) throw new Error('Add NETLIFY_API_TOKEN in Netlify first (docs/DASHBOARD.md).');
  const api = async (path) => {
    const res = await fetch('https://api.netlify.com/api/v1' + path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Netlify said ${res.status}`);
    return res.json();
  };
  const forms = await api(`/sites/${encodeURIComponent(site)}/forms`);
  const form = forms.find((f) => f.name === 'newsletter');
  if (!form) return 0;
  let added = 0;
  for (let page = 1; page <= 50; page++) {
    const subs = await api(`/forms/${form.id}/submissions?per_page=100&page=${page}`);
    for (const s of subs) {
      const d = s.data || {};
      if (String(d.subscribe || '').toLowerCase() !== 'yes' || !d.email) continue;
      try {
        const { isNew } = await subscribe(store, { email: d.email, first: d['first-name'] || '', last: d['last-name'] || '', source: 'netlify-forms' }, Date.parse(s.created_at) || Date.now());
        if (isNew) { added++; await markWelcomed(store, d.email); }
      } catch { /* not an address */ }
    }
    if (subs.length < 100) break;
  }
  return added;
}
