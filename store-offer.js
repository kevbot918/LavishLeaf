/* The store's 15% first-order offer (owner, 2026-10-13): a pop-up a few
   seconds after somebody reaches the store, asking for an email and a phone
   number. The server (netlify/functions/discount.mjs) allows one claim per IP
   address, email and phone, and none after a first order, so a new email each
   visit does not get a new code; it emails the code, which only works with
   that same email in PayPal. A claimed or dismissed offer is not shown again
   in this browser, and a connection that has claimed is never shown it. */
(function () {
  'use strict';
  var KEY = 'll-offer';
  var DELAY = 4000;
  function seen() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!v) return false;
      // "No thanks" is remembered for 30 days; a claim for good.
      return v.state === 'claimed' || Date.now() - v.at < 30 * 864e5;
    } catch (e) { return false; }
  }
  function remember(state) { try { localStorage.setItem(KEY, JSON.stringify({ state: state, at: Date.now() })); } catch (e) { /* fine */ } }
  function hasCode() { try { return !!localStorage.getItem('ll-discount'); } catch (e) { return false; } }
  function post(body) {
    return fetch('/.netlify/functions/discount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; } return j; }); });
  }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  function show() {
    var dlg = h('<dialog class="offer-dlg" aria-labelledby="offer-title">' +
      '<button type="button" class="offer-x" aria-label="Close">&times;</button>' +
      '<div class="offer-body">' +
      '<p class="offer-kicker">Welcome to the Lavish Leaf store</p>' +
      '<h2 id="offer-title">15% off your first order</h2>' +
      '<p class="offer-lede">Enter your email and phone and we will send you a code for 15% off the products in your first order.</p>' +
      '<form class="offer-form" novalidate>' +
      '<label>Email<input type="email" name="email" autocomplete="email" required maxlength="120"></label>' +
      '<label>Phone<input type="tel" name="phone" autocomplete="tel" required maxlength="20" placeholder="(918) 555-0100"></label>' +
      '<label class="offer-tick"><input type="checkbox" name="sms"> Also text me offers (optional). Up to 4 texts a month; message and data rates may apply. Reply STOP to cancel, HELP for help. Consent is not a condition of purchase. <a href="privacy.html#sms" target="_blank" rel="noopener">Text terms</a></label>' +
      '<button type="submit" class="btn btn-wide">Get my 15% code</button>' +
      '<p class="offer-msg" role="status"></p>' +
      '<p class="offer-fine">One code per customer, for one first order: 15% off store products, not shipping, tax, league registrations or pick-ups. Pay with the same email in PayPal. By claiming, you join our email newsletter; every email has a one-click unsubscribe. <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></p>' +
      '</form>' +
      '<button type="button" class="offer-no">No thanks</button>' +
      '</div></dialog>');
    document.body.appendChild(dlg);
    var form = dlg.querySelector('form'), msg = dlg.querySelector('.offer-msg'), btn = form.querySelector('button[type=submit]');
    function close(state) { if (state) remember(state); if (dlg.open) dlg.close(); dlg.remove(); }
    dlg.querySelector('.offer-x').addEventListener('click', function () { close('dismissed'); });
    dlg.querySelector('.offer-no').addEventListener('click', function () { close('dismissed'); });
    dlg.addEventListener('cancel', function () { remember('dismissed'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.email.value.trim(), phone = form.phone.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) { msg.textContent = 'Please enter your email address.'; return; }
      if (phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length !== 10) { msg.textContent = 'Please enter a 10-digit phone number.'; return; }
      btn.disabled = true; msg.textContent = 'Getting your code...';
      post({ action: 'claim', email: email, phone: phone, sms: form.sms.checked }).then(function (r) {
        remember('claimed');
        // The cart applies it at once (cart.js listens for ll-discount).
        document.dispatchEvent(new CustomEvent('ll-discount', { detail: { code: r.code } }));
        try { localStorage.setItem('ll-discount', r.code); } catch (err) { /* fine */ }
        if (window.gtag) window.gtag('event', 'discount_claim');
        dlg.querySelector('.offer-body').innerHTML = '<p class="offer-kicker">You are in!</p><h2>Your code: <span class="offer-code"></span></h2>' +
          '<p class="offer-lede">It is already applied in your cart, and we emailed it to <strong class="offer-email"></strong>.</p>' +
          '<p class="offer-lede"><strong>Pay with this same email in PayPal.</strong> The code only works with the email it was sent to.</p>' +
          '<button type="button" class="btn btn-wide offer-done">Start shopping</button>';
        dlg.querySelector('.offer-code').textContent = r.code;
        dlg.querySelector('.offer-email').textContent = email;
        dlg.querySelector('.offer-done').addEventListener('click', function () { close(); });
      }).catch(function (err) {
        btn.disabled = false;
        msg.textContent = err.message;
        if (err.status === 409) remember('claimed');
      });
    });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function start() {
    if (seen() || hasCode() || !document.body.matches('[data-checkout="cart"]')) return;
    setTimeout(function () {
      if (document.querySelector('dialog[open]')) return; // never over the cart or a product
      post({ action: 'status' }).then(function (r) {
        if (r.claimed) { remember('claimed'); return; }
        show();
      }).catch(function () { /* no offer if the server cannot be asked */ });
    }, DELAY);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
