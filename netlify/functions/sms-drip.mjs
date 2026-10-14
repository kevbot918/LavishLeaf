// Every 10 minutes: the next batch of a text-message send the owner started
// from the dashboard (netlify/lib/sms-job.mjs). Does nothing when no send is
// running, or outside 9 am to 8 pm Central.
import { runBatch } from '../lib/sms-job.mjs';
import { smsReady } from '../lib/sms.mjs';

export default async () => {
  if (!smsReady()) return new Response('texting not set up');
  try {
    const job = await runBatch();
    if (job) console.log('[sms-drip]', job.sent, 'sent,', job.queue.length, 'left', job.done ? 'done' : '');
  } catch (e) {
    console.error('[sms-drip] failed', e);
  }
  return new Response('ok');
};

export const config = { schedule: '*/10 * * * *' };
