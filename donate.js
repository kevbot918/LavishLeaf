/* Donate: PayPal opens in a pop-up window, not in this tab and not as a new
   page. The owner, 2026-09-13: "The paypal donate link is supposed to be a
   pop-up, not opening a new page to paypal."

   This opens the pop-up itself rather than through PayPal's donate-sdk.js.
   The SDK renders its own <img> and, when that image was clicked in testing,
   it navigated the whole page to paypal.com instead of opening a window,
   which is exactly the behaviour being fixed here. window.open with real
   window features is the pop-up, it needs no third-party script, and it
   behaves the same on localhost as it does on the live site.

   Two fallbacks, so a donation is never a dead end:
     - A phone has no pop-up windows. window.open ignores the size there and
       gives a tab, which is the right thing on a small screen anyway.
     - If a pop-up blocker refuses outright, window.open returns null, we do
       NOT preventDefault, and the anchor's own href + target take over.

   To use it on another page: give the link class "donate-paypal" and load
   this file. Nothing else is needed, no ids, no inline handlers. */
(function () {
  'use strict';

  var WIDTH = 500;
  var HEIGHT = 720;

  function openDonate(e) {
    // A modified click is the visitor asking for a tab or a window of their
    // own; never take that away from them.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
        e.shiftKey || e.altKey) {
      return;
    }

    var href = this.href;
    if (!href) return;

    // Centre on the screen the browser is actually on, not on screen 0,
    // otherwise a second monitor throws the pop-up onto the first one. A
    // monitor placed to the left of the primary one reports a negative
    // screenX, which is legitimate, so the only thing rejected here is a
    // figure too large to be any real desktop: an embedded web view reports
    // screenX of -25600, and honouring that would open the window where
    // nobody can see it. When the numbers cannot be trusted we simply leave
    // left and top out and let the browser place the window itself.
    var baseX = window.screenX !== undefined ? window.screenX : window.screenLeft;
    var baseY = window.screenY !== undefined ? window.screenY : window.screenTop;
    var left = (baseX || 0) + Math.max(0, ((window.outerWidth || WIDTH) - WIDTH) / 2);
    var top = (baseY || 0) + Math.max(0, ((window.outerHeight || HEIGHT) - HEIGHT) / 2);
    var LIMIT = 20000;
    var placed = isFinite(left) && isFinite(top) &&
                 Math.abs(left) < LIMIT && Math.abs(top) < LIMIT;

    var features = 'popup=yes' +
      ',width=' + WIDTH +
      ',height=' + HEIGHT +
      (placed ? ',left=' + Math.round(left) + ',top=' + Math.round(top) : '') +
      ',resizable=yes,scrollbars=yes,status=yes';

    var win;
    try {
      win = window.open(href, 'LavishLeafDonate', features);
    } catch (err) {
      win = null;
    }

    if (win) {
      e.preventDefault();
      try { win.focus(); } catch (err) { /* a blocker may own the handle */ }
    }
  }

  function wire() {
    var links = document.querySelectorAll('a.donate-paypal');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', openDonate);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
