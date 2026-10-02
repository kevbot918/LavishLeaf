// Scheduled, every hour: send the next batch of a newsletter the owner has
// started from the dashboard (netlify/lib/broadcast.mjs). Does nothing when
// no issue is sending.
import { runBatch } from '../lib/broadcast.mjs';
import { mailReady } from '../lib/mail.mjs';
import { newsletterStore } from '../lib/newsletter.mjs';

export default async () => {
  if (!mailReady()) return new Response('email not set up');
  try {
    const job = await runBatch(await newsletterStore());
    if (job) console.log('[newsletter-drip]', job.issue, job.sent.length, 'sent', job.done ? 'done' : 'continuing');
  } catch (e) {
    console.error('[newsletter-drip] failed', e);
  }
  return new Response('ok');
};

export const config = { schedule: '@hourly' };
