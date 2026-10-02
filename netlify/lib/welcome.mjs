// The welcome email (emails/welcome.html), sent once when somebody joins the
// newsletter (submission-created.mjs), and as a test from the dashboard.
import { fill, loadTemplate, mailConfig, sendEmail, textOf } from './mail.mjs';
import { unsubscribeUrl } from './newsletter.mjs';

export async function sendWelcome(record) {
  const tpl = await loadTemplate('welcome');
  const unsub = unsubscribeUrl(record.email, 'news');
  const html = fill(tpl, {
    first_name: record.first || 'friend',
    unsubscribe_url: unsub,
    postal_address: mailConfig().postal,
    view_online_url: (process.env.URL || 'https://lavishleaf.org') + '/emails/welcome.html',
  });
  await sendEmail({
    to: record.email, toName: record.first,
    subject: 'Welcome to Lavish Leaf', html, text: textOf(html),
    kind: 'welcome', unsubscribeUrl: unsub,
  });
}
