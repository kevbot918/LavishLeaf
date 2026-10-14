// Short customer notices in the receipt's look (emails/notice.html, owner
// 2026-10-12: "make it similar to our receipt email that had our logo and
// website colors"): pick-up sign-up, pick-up day, order shipped, refund,
// subscription canceled, account welcome, donation thanks. One function so
// they all read alike.
import { esc, fill, loadTemplate, sendEmail, textOf, validEmail } from './mail.mjs';
import { unsubscribeUrl } from './newsletter.mjs';

const P = (t) => `<p style="margin:0 0 14px;color:#F2F4F2;">${t}</p>`;

/**
 * The small print under every customer email. It unsubscribes from the
 * NEWSLETTER and offers only: receipts and notices are sent whatever the
 * list says (mail.mjs sendEmail checks no list for these kinds; owner,
 * 2026-10-14: "we only really want them to be able to unsubscribe for
 * marketing emails").
 * (owner, 2026-10-13: "ensure
 * there is always an easy opt out or unsubscribe"): customers are on the
 * newsletter list, so each email says so with the one-click link. Empty when
 * the signing secret is missing (no link that would not work).
 */
export function optOutHtml(email) {
  try {
    const u = unsubscribeUrl(email, 'news');
    return `<p style="margin:6px 0 0;">Prefer not to get our newsletter and offers? <a href="${esc(u)}" style="color:#6FD65F;">Unsubscribe from marketing emails</a> with one click. You will still get receipts, order and pick-up updates, and replies to your messages.</p>`;
  } catch {
    return '';
  }
}

/**
 * paragraphs: plain sentences (escaped); rows: optional [label, value] pairs
 * shown as a small table (escaped); links: optional [label, url] buttons.
 * Returns true when sent.
 */
export async function sendNotice({ to, name = '', subject, heading, paragraphs = [], rows = [], links = [], kind = 'order' }) {
  if (!validEmail(to)) return false;
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const table = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-top:1px solid #565656;border-bottom:1px solid #565656;">${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#C8CFC8;font-size:15px;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;color:#F2F4F2;font-size:15px;">${esc(v)}</td></tr>`).join('')}</table>`
    : '';
  const buttons = links.map(([label, url]) => `<p style="margin:0 0 16px;"><a href="${esc(url)}" style="display:inline-block;background:#4AB73C;color:#0f1210;font-weight:800;text-decoration:none;padding:10px 20px;border-radius:8px;">${esc(label)}</a></p>`).join('');
  // The greeting is the template's own "Hi {{first_name}}," line (it was
  // also written here once, so notices said "Hi ," and then "Hi Kevin,").
  const body = [...paragraphs.map((t) => P(esc(t))), table, buttons,
    P("Questions? Just reply to this email, or write to <a href='mailto:support@lavishleaf.org' style='color:#6FD65F;'>support@lavishleaf.org</a>.")].filter(Boolean).join('\n        ');
  const tpl = await loadTemplate('notice');
  const html = fill(tpl, { subject, heading, first_name: first, preview: paragraphs[0] || subject, body_html: body, optout_html: optOutHtml(to) });
  await sendEmail({ to, toName: name, subject, html, text: textOf(html), kind });
  return true;
}
