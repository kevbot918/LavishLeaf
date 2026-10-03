// The links in Netlify Identity's emails (2026-10-03).
//
// "Confirm your email", "Reset your password", invitations and email changes
// all land on the HOME page with a one-time code after the #, e.g.
// lavishleaf.org/#confirmation_token=... Only Netlify's sign-in widget can
// use that code, and it is loaded on the store and the dashboard only, so on
// any other page the click did nothing and the account stayed unconfirmed.
// This file is on every page: when such a code is in the address, it loads
// the widget, which confirms the account (or opens "choose a new password")
// and signs the person in.
(function () {
  'use strict';
  var m = /(?:^#|&)(confirmation|recovery|invite|email_change)_token=/.exec(location.hash);
  if (!m) return;
  var kind = m[1];

  function hook() {
    var id = window.netlifyIdentity;
    if (!id) return;
    if (kind === 'confirmation') {
      // Confirmed and signed in: go where the account is used. The owner
      // (role "admin", any capitals) goes to the dashboard.
      id.on('login', function (user) {
        var roles = ((user && user.app_metadata && user.app_metadata.roles) || []).map(function (r) { return String(r).toLowerCase(); });
        setTimeout(function () { location.href = roles.indexOf('admin') >= 0 ? '/dashboard.html' : '/store.html'; }, 1200);
      });
    }
  }

  if (window.netlifyIdentity || document.querySelector('script[src*="netlify-identity-widget"]')) {
    // The page loads the widget itself (store, dashboard): it reads the code.
    if (window.netlifyIdentity) hook(); else window.addEventListener('load', hook);
    return;
  }
  var s = document.createElement('script');
  s.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
  s.onload = hook;
  document.head.appendChild(s);
})();
