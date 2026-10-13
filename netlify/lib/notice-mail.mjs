// Short customer notices in the receipt's look (emails/notice.html, owner
// 2026-10-12: "make it similar to our receipt email that had our logo and
// website colors"): pick-up sign-up, pick-up day, order shipped, refund,
// subscription canceled. One function so they all read alike.
import { esc, fill, loadTemplate, sendEmail, textOf, validEmail } from './mail.mjs';

const P = (t) => `<p style="margin:0 0 14px;color:#F2F4F2;">${t}</p>`;

/**
 * paragraphs: plain sentences (escaped); rows: optional [label, value] pairs
 * shown as a small table (escaped). Returns true when sent.
 */
export async function sendNotice({ to, name = '', subject, heading, paragraphs = [], rows = [], kind = 'order' }) {
  if (!validEmail(to)) return false;
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const table = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-top:1px solid #565656;border-bottom:1px solid #565656;">${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#C8CFC8;font-size:15px;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;color:#F2F4F2;font-size:15px;">${esc(v)}</td></tr>`).join('')}</table>`
    : '';
  const body = [P(`Hi ${esc(first)},`), ...paragraphs.map((t) => P(esc(t))), table,
    P("Questions? Just reply to this email, or write to <a href='mailto:support@lavishleaf.org' style='color:#6FD65F;'>support@lavishleaf.org</a>.")].join('\n        ');
  const tpl = await loadTemplate('notice');
  const html = fill(tpl, { subject, heading, preview: paragraphs[0] || subject, body_html: body });
  await sendEmail({ to, toName: name, subject, html, text: textOf(html), kind });
  return true;
}
