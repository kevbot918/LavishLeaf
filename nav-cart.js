// The cart button in every page's header, beside the email icon (owner,
// 2026-10-10: "take users to their shopping cart if they have one or to our
// online store if they don't"). The cart itself lives in this browser's
// localStorage under "ll-cart" (cart.js); this only reads it.
(function () {
  'use strict';
  var link = document.querySelector('[data-nav-cart]');
  if (!link) return;
  function count() {
    try {
      var cart = JSON.parse(localStorage.getItem('ll-cart') || '[]');
      return Array.isArray(cart) ? cart.reduce(function (n, l) { return n + (l && l.qty > 0 ? l.qty : 0); }, 0) : 0;
    } catch (e) { return 0; }
  }
  function draw() {
    var n = count();
    var badge = link.querySelector('.nav-cart-n');
    link.setAttribute('href', n ? 'store.html#cart' : 'store.html');
    link.setAttribute('aria-label', n ? 'Your cart, ' + n + ' item' + (n === 1 ? '' : 's') : 'Shop the online store');
    link.title = n ? 'Your cart' : 'Shop the online store';
    if (badge) { badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = !n; }
  }
  draw();
  // Another tab changed the cart, or this page's cart did.
  window.addEventListener('storage', function (e) { if (e.key === 'll-cart') draw(); });
  document.addEventListener('ll-cart', draw);
})();
