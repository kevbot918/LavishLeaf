// /.netlify/functions/unsubscribe?e=<email>&l=<news|cart>&s=<signature>
//
//   GET   a small page with one button ("Unsubscribe"), so a mail scanner
//         that follows links cannot unsubscribe anybody by accident
//   POST  unsubscribes at once: the button above, and the one-click
//         unsubscribe Gmail and Yahoo show beside the sender (RFC 8058)
//
// The signature (netlify/lib/newsletter.mjs) proves the link came from one of
// our emails to that address, so nobody can unsubscribe somebody else.
import { keyFor, newsletterStore, norm, unsubscribe, verify } from '../lib/newsletter.mjs';

const LISTS = { news: 'the Lavish Leaf newsletter', cart: 'cart reminder emails' };

function page(title, body, status = 200) {
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}: Lavish Leaf</title>
<style>body{margin:0;background:#3d3d3d;color:#F2F4F2;font:16px/1.6 'Nunito Sans',system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{max-width:460px;background:#2e2e2e;border-top:4px solid #4AB73C;border-radius:12px;padding:28px 28px 24px;text-align:center}
h1{color:#6FD65F;font-size:1.4rem;margin:0 0 10px}p{color:#C8CFC8;margin:0 0 16px}a{color:#6FD65F}
button{background:#4AB73C;color:#14261A;border:0;border-radius:999px;padding:12px 26px;font:700 1rem inherit;cursor:pointer}button:hover{background:#6FD65F}</style></head>
<body><main>${body}</main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async (request) => {
  const url = new URL(request.url);
  const email = norm(url.searchParams.get('e'));
  const list = url.searchParams.get('l') === 'cart' ? 'cart' : 'news';
  const sig = url.searchParams.get('s') || '';
  let good = false;
  try { good = !!email && verify(email, sig, 'unsub-' + list); } catch { good = false; }
  if (!good) {
    return page('Link not recognised', '<h1>That link has expired or was cut short</h1><p>Email <a href="mailto:support@lavishleaf.org?subject=Unsubscribe">support@lavishleaf.org</a> with the word "unsubscribe" and we will take you off straight away.</p>', 400);
  }

  if (request.method === 'POST') {
    try {
      const store = await newsletterStore();
      if (list === 'news') await unsubscribe(store, email);
      else await store.setJSON('c-' + keyFor(email).slice(2), { optOut: true, at: new Date().toISOString() });
    } catch (e) {
      console.error('[unsubscribe]', e.message);
      return page('Something went wrong', '<h1>We could not do that just now</h1><p>Please try again in a minute, or email <a href="mailto:support@lavishleaf.org?subject=Unsubscribe">support@lavishleaf.org</a> and we will do it by hand.</p>', 500);
    }
    return page('Unsubscribed', `<h1>You are unsubscribed</h1><p>${esc(email)} will not get ${LISTS[list]} any more. Sorry to see you go, and thank you for reading.</p><p><a href="https://lavishleaf.org">Back to lavishleaf.org</a></p>`);
  }

  return page('Unsubscribe', `<h1>Unsubscribe?</h1><p>Stop sending ${LISTS[list]} to <strong>${esc(email)}</strong>.</p>
<form method="post" action="${esc(url.pathname + url.search)}"><button type="submit">Unsubscribe</button></form>`);
};
