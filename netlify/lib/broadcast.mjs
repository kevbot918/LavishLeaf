// Sending one newsletter issue to the whole list (2026-10-02, docs/EMAIL.md).
//
// The owner presses Send on the dashboard; that only creates a JOB. The
// hourly newsletter-drip function then sends it in small batches, never past
// the day's email budget (mail.mjs keeps some back for order emails), so a
// list bigger than the provider's daily limit simply takes more than one
// day, and nobody gets it twice. The job lives in the "newsletter" store as
// "job": { issue, subject, created, sent: [subscriber keys], done, failed }.
import { fill, loadTemplate, mailConfig, marketingBudget, sendEmail, textOf } from './mail.mjs';
import { allSubscribers, keyFor, unsubscribeUrl } from './newsletter.mjs';

const BATCH = 50; // per run: a scheduled function has about 30 seconds

export const ISSUE = /^newsletter-\d{4}-\d{2}[a-z0-9-]*$/;

/** The subject is the template's <title>. */
export function subjectOf(html) {
  const m = /<title>([^<]{1,200})<\/title>/i.exec(html);
  return m ? m[1].replace(/&amp;/g, '&').trim() : 'News from Lavish Leaf';
}

export function personalise(tpl, sub, issue, env = process.env) {
  const unsub = unsubscribeUrl(sub.email, 'news', env);
  const html = fill(tpl, {
    first_name: sub.first || 'friend',
    unsubscribe_url: unsub,
    postal_address: mailConfig(env).postal,
    view_online_url: (env.URL || 'https://lavishleaf.org') + `/emails/${issue}.html`,
  });
  return { html, unsub };
}

export async function startJob(store, issue) {
  if (!ISSUE.test(issue)) throw new Error('Issue names look like newsletter-2026-10.');
  const cur = await store.get('job', { type: 'json' }).catch(() => null);
  if (cur && !cur.done) throw new Error(`"${cur.issue}" is still sending. Cancel it first if you meant to replace it.`);
  const tpl = await loadTemplate(issue); // fails now, not at 3am, if it is not deployed
  if (!mailConfig().postal) throw new Error('Set MAIL_POSTAL_ADDRESS in Netlify first (the PO box every newsletter must carry).');
  const job = { issue, subject: subjectOf(tpl), created: new Date().toISOString(), sent: [], failed: 0, done: null };
  await store.setJSON('job', job);
  return job;
}

/**
 * One batch. Progress is saved after EVERY email, so a run cut short never
 * sends anybody the issue twice; a lock keeps two runs from overlapping.
 * A temporary failure (rate limit, Brevo down, the day's limit) stops the
 * batch and that person is tried again next run; a permanent one is skipped.
 */
export async function runBatch(store, now = Date.now()) {
  const job = await store.get('job', { type: 'json' }).catch(() => null);
  if (!job || job.done) return job;
  const lock = await store.get('job-lock', { type: 'json' }).catch(() => null);
  if (lock && now - lock.at < 10 * 60 * 1000) return job; // another run is sending
  await store.setJSON('job-lock', { at: now });
  try {
    const budget = Math.min(BATCH, await marketingBudget());
    if (budget <= 0) return job;
    const tpl = await loadTemplate(job.issue);
    const done = new Set(job.sent);
    const todo = (await allSubscribers(store)).filter((s) => s.status === 'active' && !done.has(keyFor(s.email)));
    let stopped = false;
    for (const sub of todo.slice(0, budget)) {
      const { html, unsub } = personalise(tpl, sub, job.issue);
      try {
        await sendEmail({ to: sub.email, toName: sub.first, subject: job.subject, html, text: textOf(html), kind: 'newsletter', unsubscribeUrl: unsub });
      } catch (e) {
        if (e.temporary) { stopped = true; break; }
        console.error('[broadcast]', e.message);
        job.failed++;
      }
      job.sent.push(keyFor(sub.email));
      await store.setJSON('job', job);
    }
    if (!stopped && todo.length <= budget) {
      job.done = new Date().toISOString();
      await store.setJSON('job', job);
    }
    return job;
  } finally {
    await store.delete('job-lock').catch(() => {});
  }
}
