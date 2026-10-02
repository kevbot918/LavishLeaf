// What visitors do on lavishleaf.org, for the owner's dashboard (2026-10-02).
//
// Google Analytics (gtag, loaded in each page's <head>) counts visits; this
// file adds the few EVENTS that answer "what are people interested in?", and
// loads Microsoft Clarity (heatmaps and visit recordings, free). One click
// listener on the whole page, so no page needs its own tracking code.
//
// Event names, once, so the dashboard and GA4 reports agree:
//   sign_up_click     a compost, recycling or league sign-up button  {product}
//   add_to_cart       a store "Add to cart"                          {product}
//   supplier_click    a demo card's "Supplier page"                  {product}
//   wish_list         a heart on a store card                        {product}
//   donate_click      the donate pop-up
//   social_click      Facebook, Instagram or YouTube                 {network}
//   app_download      a Symphonymph APK link
//   email_click       a mailto: link                                 {address}
//   newsletter_signup the newsletter form sent                       {page}
//   contact_sent      the contact form sent                          {page}
//   search            the store search, after a pause                {search_term}
// Nothing here records what anybody types into a form.
(function () {
  'use strict';

  // ---- Microsoft Clarity (project yrei9vub09). Not on the shared-playlist
  // page, whose address carries somebody's playlist.
  if (!/^\/p(\.html)?$/.test(location.pathname)) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', 'yrei9vub09');
  }

  var page = location.pathname.replace(/^\/|\.html$/g, '') || 'index';

  function track(name, params) {
    params = params || {};
    params.page = params.page || page;
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch (e) { /* never break a click */ }
    try { if (typeof window.clarity === 'function') window.clarity('event', name); } catch (e) { /* same */ }
  }
  window.llTrack = track;

  function productOf(el) {
    var card = el.closest('[data-id]');
    return el.getAttribute('data-product') || el.getAttribute('data-cart-add') ||
      el.getAttribute('data-subscribe') || el.getAttribute('data-wish') || (card && card.getAttribute('data-id')) || '';
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a, button');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    if (el.matches('[data-cart-add]')) return track('add_to_cart', { product: productOf(el) });
    if (el.matches('[data-wish]')) return track('wish_list', { product: productOf(el) });
    if (el.matches('[data-product], [data-subscribe]')) return track('sign_up_click', { product: productOf(el) });
    if (el.matches('.sp-demo a.btn')) return track('supplier_click', { product: productOf(el) });
    if (el.matches('.donate-paypal') || /#donate$/.test(href)) return track('donate_click');
    if (/\/downloads\/.+\.apk$/i.test(href)) return track('app_download', { file: href.split('/').pop() });
    var net = /facebook\.com/.test(href) ? 'facebook' : /instagram\.com/.test(href) ? 'instagram' : /youtube\.com/.test(href) ? 'youtube' : '';
    if (net) return track('social_click', { network: net });
    if (/^mailto:/i.test(href)) return track('email_click', { address: href.slice(7).split('?')[0] });
  }, true);

  document.addEventListener('submit', function (e) {
    var f = e.target;
    var name = f && f.getAttribute('name');
    if (name === 'newsletter') track('newsletter_signup');
    else if (name === 'contact') track('contact_sent');
  }, true);

  // The store search: one event per finished search, not per keystroke.
  var timer;
  document.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'search-input') return;
    clearTimeout(timer);
    var q = e.target.value.trim().toLowerCase().slice(0, 60);
    if (q.length < 2) return;
    timer = setTimeout(function () { track('search', { search_term: q }); }, 1500);
  });
})();
