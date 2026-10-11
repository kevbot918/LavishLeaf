// The Lavish Leaf cart. Used only when products.json says "checkout": "cart"
// (tools/render-store.mjs then renders "Add to cart" and Subscribe buttons).
//
// What it keeps: a list of {id, qty} in this browser's localStorage. Nothing
// else, and no prices: the checkout function prices every order on the
// server from products.json, so what a page says can never change what
// PayPal charges.
//
// The flow: Add to cart -> the cart panel -> "Check out with PayPal" ->
// PayPal's page -> back here with ?paypal=return&token=ORDER -> capture ->
// a thank-you line and an empty cart. Cancel comes back with the cart intact.
(function () {
  'use strict';

  var KEY = 'll-cart';
  var MAX_QTY = 20;
  var products = {};

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(function (l) {
        return l && typeof l.id === 'string' && Number.isInteger(l.qty) && l.qty > 0;
      }).map(function (l) { return l.opt ? { id: l.id, qty: l.qty, opt: String(l.opt) } : { id: l.id, qty: l.qty }; }) : [];
    } catch (e) {
      return [];
    }
  }

  function save(cart) {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch (e) {
      // Private mode or storage off: the cart lives until the page closes.
    }
    render();
  }

  var cart = load();

  // Shipping: the same rules the server charges by (shipping.mjs). Until the
  // module loads the cart says "calculated at checkout" rather than guess.
  var SHIP_KEY = 'll-ship';
  var ship = null;
  var delivery = (function () {
    try {
      var d = JSON.parse(localStorage.getItem(SHIP_KEY) || '{}');
      // Shipping is the only choice for now (no pickup, no delivery); a
      // browser that remembered a retired choice falls back to it.
      var m = 'ship';
      return {
        method: typeof m === 'string' ? m : 'ship',
        zip: typeof d.zip === 'string' ? d.zip : '',
      };
    } catch (e) {
      return { method: 'ship', zip: '' };
    }
  })();
  function saveDelivery() {
    try { localStorage.setItem(SHIP_KEY, JSON.stringify(delivery)); } catch (e) { /* fine */ }
  }
  import('/shipping.mjs').then(function (m) { ship = m; render(); }).catch(function () { /* the server still prices it */ });
  // Sales tax: the same rules the server charges by (tax.mjs).
  var tax = null;
  import('/tax.mjs').then(function (m) { tax = m; render(); }).catch(function () { /* the server still taxes it */ });

  function money(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function add(id, opt) {
    var p = products[id];
    if (!p || p.interval || p.active === false) return;
    // A product with options needs one: the store opens its pop-up to choose.
    if (p.options && !opt) { document.dispatchEvent(new CustomEvent('ll-choose', { detail: { id: id } })); return; }
    opt = opt || '';
    var line = cart.find(function (l) { return l.id === id && (l.opt || '') === opt; });
    if (line) line.qty = Math.min(MAX_QTY, line.qty + 1);
    else cart.push(opt ? { id: id, qty: 1, opt: opt } : { id: id, qty: 1 });
    save(cart);
    notify(p, opt);
  }

  // A notice the buyer cannot miss: bottom of the screen, with a way to the
  // cart (owner, 2026-10-11).
  function notify(p, opt) {
    if (!toastEl) return;
    toastEl.textContent = '';
    if (p.image) toastEl.appendChild(el('img', { src: p.image, alt: '' }));
    var txt = el('div', { class: 'cart-toast-text' });
    txt.appendChild(el('strong', null, 'Added to your cart'));
    txt.appendChild(el('span', null, p.name + (opt ? ' (' + opt + ')' : '')));
    toastEl.appendChild(txt);
    var view = el('button', { type: 'button', class: 'btn btn-sm' }, 'View cart');
    view.addEventListener('click', function () { toastEl.hidden = true; open(); });
    toastEl.appendChild(view);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 5000);
  }

  // The waiver, the Terms of Sale and the Refund Policy open over the cart,
  // so reading them never loses the cart (owner, 2026-10-11).
  function openDoc(url, title) {
    if (!docDlg) {
      docDlg = el('dialog', { class: 'cart-doc', 'aria-label': 'Document' });
      var bar = el('div', { class: 'cart-doc-bar' });
      bar.appendChild(el('h2', { class: 'cart-doc-title' }));
      var x = el('button', { type: 'button', class: 'btn btn-sm' }, 'Back to cart');
      x.addEventListener('click', function () { docDlg.close(); });
      bar.appendChild(x);
      docDlg.appendChild(bar);
      docDlg.appendChild(el('div', { class: 'cart-doc-body' }));
      document.body.appendChild(docDlg);
    }
    docDlg.querySelector('.cart-doc-title').textContent = title;
    var body = docDlg.querySelector('.cart-doc-body');
    body.textContent = 'Loading...';
    if (typeof docDlg.showModal === 'function') docDlg.showModal(); else docDlg.setAttribute('open', '');
    fetch(url).then(function (r) { return r.text(); }).then(function (html) {
      var d = new DOMParser().parseFromString(html, 'text/html');
      var parts = d.querySelectorAll('section.content-section');
      body.textContent = '';
      Array.prototype.forEach.call(parts, function (s) {
        Array.prototype.forEach.call(s.querySelectorAll('script, form, .btn'), function (n) { n.remove(); });
        body.appendChild(document.importNode(s, true));
      });
      if (!parts.length) body.textContent = 'Open ' + url + ' to read it.';
      body.scrollTop = 0;
    }).catch(function () { body.textContent = 'This did not load. It is at lavishleaf.org/' + url; });
  }
  function docLink(text, url, title) {
    var a = el('a', { href: url }, text);
    a.addEventListener('click', function (e) { e.preventDefault(); openDoc(url, title); });
    return a;
  }

  function setQty(id, qty, opt) {
    opt = opt || '';
    cart = cart
      .map(function (l) { return l.id === id && (l.opt || '') === opt ? Object.assign({}, l, { qty: Math.max(0, Math.min(MAX_QTY, qty)) }) : l; })
      .filter(function (l) { return l.qty > 0; });
    save(cart);
  }

  // ------------------------------------------------------------------ view
  var fab, panel, list, totalEl, noteEl, payBtn, statusEl, banner;
  var shipWrap, shipLine, shipNudge, taxLine;
  var waiverWrap, noteWrap, toastEl, toastTimer, docDlg;
  // Ticked waivers, by version: the cart redraws often, and a redraw must
  // never untick what the buyer ticked (owner, 2026-10-11: the box would
  // not stay ticked).
  var acceptedW = {};
  function allAccepted() {
    return waiversInCart().every(function (w) { return acceptedW[w.version]; });
  }
  function isRegistration(p) { return !!(p && p.waiver); }

  // A product may require an agreement before it can be paid for. Today
  // that is the two soccer registrations, which take a waiver in the email
  // flow the site uses now: when checkout moves to the cart, the waiver has
  // to move with it or it quietly disappears from a contact sport that
  // charges $250 a team. A product opts in with, in products.json:
  //
  //   "waiver": { "version": "2026-09", "url": "waiver.html",
  //               "label": "I have read and accept the liability waiver" }
  //
  // No waiver field means nothing changes for that product.
  function waiversInCart() {
    var seen = {};
    cart.forEach(function (l) {
      var p = products[l.id];
      if (p && p.waiver && p.waiver.version) seen[p.waiver.version] = p.waiver;
    });
    return Object.keys(seen).map(function (v) { return seen[v]; });
  }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function build() {
    fab = el('button', { type: 'button', class: 'cart-fab', 'aria-haspopup': 'dialog' });
    fab.addEventListener('click', open);
    document.body.appendChild(fab);

    panel = el('dialog', { class: 'cart-panel', 'aria-labelledby': 'cart-title' });
    var head = el('div', { class: 'cart-head' });
    head.appendChild(el('h2', { id: 'cart-title' }, 'Your cart'));
    var close = el('button', { type: 'button', class: 'cart-close', 'aria-label': 'Close the cart' }, '×');
    close.addEventListener('click', function () { panel.close(); });
    head.appendChild(close);
    panel.appendChild(head);

    list = el('ul', { class: 'cart-lines' });
    panel.appendChild(list);

    // How it reaches you: shown only when something in the cart is posted.
    shipWrap = el('fieldset', { class: 'cart-ship', hidden: '' });
    shipWrap.appendChild(el('legend', null, 'Delivery'));
    [['ship', 'Ship to me (48 contiguous states)']]
      .forEach(function (m) {
        var row = el('label', { class: 'cart-ship-row' });
        var r = el('input', { type: 'radio', name: 'cart-ship', value: m[0] });
        r.checked = delivery.method === m[0];
        r.addEventListener('change', function () { delivery.method = m[0]; saveDelivery(); render(); });
        row.appendChild(r);
        row.appendChild(document.createTextNode(' ' + m[1]));
        shipWrap.appendChild(row);
      });
    panel.appendChild(shipWrap);
    shipNudge = el('p', { class: 'cart-nudge', hidden: '' });
    panel.appendChild(shipNudge);
    shipLine = el('p', { class: 'cart-shipline', hidden: '' });
    panel.appendChild(shipLine);
    taxLine = el('p', { class: 'cart-shipline', hidden: '' });
    panel.appendChild(taxLine);

    totalEl = el('p', { class: 'cart-total' });
    panel.appendChild(totalEl);

    // Only for a registration, under its own heading (owner, 2026-10-11).
    noteWrap = el('div', { class: 'cart-reg', hidden: '' });
    noteWrap.appendChild(el('h3', { class: 'cart-reg-head' }, 'Rec Sports registration'));
    noteWrap.appendChild(el('label', { for: 'cart-note', class: 'cart-note-label' }, 'Player or team name, so we can match your payment to the roster'));
    noteEl = el('textarea', { id: 'cart-note', rows: '2', maxlength: '127' });
    noteWrap.appendChild(noteEl);
    panel.appendChild(noteWrap);

    waiverWrap = el('div', { class: 'cart-waiver', hidden: '' });
    panel.appendChild(waiverWrap);

    payBtn = el('button', { type: 'button', class: 'btn btn-wide cart-pay' }, 'Check out with PayPal');
    payBtn.addEventListener('click', checkout);
    panel.appendChild(payBtn);
    panel.appendChild(el('p', { class: 'cart-fine' }, 'No PayPal account needed: you can pay with a debit or credit card on the next page.'));
    // The two policies, where somebody is deciding whether to pay. They
    // live in the footer of every page as well, but a footer is not where
    // this question gets asked.
    var legal = el('p', { class: 'cart-fine' });
    legal.appendChild(document.createTextNode('By paying you accept our '));
    legal.appendChild(docLink('Terms of Sale', 'terms-of-sale.html', 'Terms of Sale'));
    legal.appendChild(document.createTextNode(' and '));
    legal.appendChild(docLink('Refund Policy', 'refunds.html', 'Refund Policy'));
    legal.appendChild(document.createTextNode('.'));
    panel.appendChild(legal);
    statusEl = el('p', { class: 'cart-status', role: 'status', 'aria-live': 'polite' });
    panel.appendChild(statusEl);
    document.body.appendChild(panel);

    toastEl = el('div', { class: 'cart-toast', role: 'status', 'aria-live': 'polite', hidden: '' });
    document.body.appendChild(toastEl);

    // Above the products, where the buyer is looking when they come back.
    banner = el('div', { class: 'cart-banner', role: 'status', 'aria-live': 'polite', hidden: '' });
    var products_ = document.querySelector('.store-products, #shelves');
    var header = document.querySelector('header');
    if (products_) products_.parentNode.insertBefore(banner, products_);
    else if (header) header.parentNode.insertBefore(banner, header.nextSibling);
    else document.body.insertBefore(banner, document.body.firstChild);
  }

  function render() {
    if (!fab) return;
    var count = cart.reduce(function (n, l) { return n + l.qty; }, 0);
    fab.textContent = 'Cart (' + count + ')';
    fab.hidden = count === 0;
    list.textContent = '';
    var cents = 0;
    cart.forEach(function (l) {
      var p = products[l.id];
      if (!p) return;
      cents += p.price * l.qty;
      var li = el('li', { class: 'cart-line' });
      li.appendChild(el('span', { class: 'cart-name' }, p.name + (l.opt ? ' (' + p.options.label + ': ' + l.opt + ')' : '')));
      var qty = el('span', { class: 'cart-qty' });
      var minus = el('button', { type: 'button', 'aria-label': 'One fewer ' + p.name }, '−');
      minus.addEventListener('click', function () { setQty(l.id, l.qty - 1, l.opt); });
      var plus = el('button', { type: 'button', 'aria-label': 'One more ' + p.name }, '+');
      plus.addEventListener('click', function () { setQty(l.id, l.qty + 1, l.opt); });
      qty.appendChild(minus);
      qty.appendChild(el('span', { class: 'cart-n' }, String(l.qty)));
      qty.appendChild(plus);
      li.appendChild(qty);
      li.appendChild(el('span', { class: 'cart-price' }, money(p.price * l.qty)));
      list.appendChild(li);
    });
    // Shipping, by the same rules the server will charge.
    var lines = cart.map(function (l) { return { product: products[l.id], qty: l.qty }; })
      .filter(function (x) { return x.product; });
    var posts = lines.some(function (x) { return x.product.ship === true; });
    var shipCents = 0, shipOk = true;
    // One way to receive an order (shipping only, for now): no choice to show.
    shipWrap.hidden = !posts || shipWrap.querySelectorAll('input').length < 2;
    shipLine.hidden = !posts;
    shipNudge.hidden = true;
    if (posts) {
      if (!ship) {
        shipLine.textContent = 'Shipping is calculated at checkout.';
      } else {
        try {
          var q = ship.quote(lines, { method: delivery.method });
          shipCents = q.cents;
          shipLine.textContent = q.label + ': ' + (q.cents ? money(q.cents) : 'free');
          shipLine.title = 'Each supplier ships its own parcel, so each part is charged on its own. See Terms of Sale.';
          // Weight meter for items shipped by weight (owner, 2026-10-11):
          // "3.5 oz / 16 oz = $8.95", so a buyer sees the room left in the band.
          var meter = (q.parts || []).filter(function (pt) { return pt.upToOz; }).map(function (pt) {
            var room = Math.round((pt.upToOz - pt.oz) * 10) / 10;
            return 'Shipped by weight: ' + (Math.round(pt.oz * 10) / 10) + ' oz / ' + pt.upToOz + ' oz = ' + money(pt.cents) + '.' +
              (room > 0 ? ' Add up to ' + room + ' oz more for the same shipping.' : '');
          });
          if (meter.length) { shipNudge.textContent = meter.join(' '); shipNudge.hidden = false; }
          if (delivery.method === 'ship' && ship.untilReduced(cents) > 0) {
            shipNudge.textContent = money(ship.untilReduced(cents)) + ' more and shipping is ' +
              money(ship.SHIPPING.reducedCents) + ' on the whole order.';
            shipNudge.hidden = false;
          }
        } catch (e) {
          shipOk = false;
          shipLine.textContent = e.message;
        }
      }
    }
    // Sales tax, by the same rules the server will charge.
    var taxCents = 0;
    taxLine.hidden = !cart.length;
    if (!tax) {
      taxLine.textContent = 'Sales tax is calculated at checkout.';
    } else if (cart.length) {
      var t = tax.taxQuote(lines);
      taxCents = t.cents;
      taxLine.textContent = t.label + ': ' + money(t.cents);
    }
    totalEl.textContent = cart.length ? 'Total ' + money(cents + shipCents + taxCents) : 'Your cart is empty.';

    // The waiver, when something in the cart needs one. Drawn fresh each
    // render so removing the last registration removes the tick with it.
    var waivers = waiversInCart();
    waiverWrap.textContent = '';
    waiverWrap.hidden = waivers.length === 0;
    waivers.forEach(function (w) {
      var row = el('label', { class: 'cart-waiver-row' });
      var box = el('input', { type: 'checkbox' });
      box.checked = !!acceptedW[w.version];
      box.addEventListener('change', function () { acceptedW[w.version] = box.checked; render(); });
      row.appendChild(box);
      row.appendChild(document.createTextNode(
        ' ' + (w.label || 'I have read and accept the waiver') + ' '
      ));
      if (w.url) row.appendChild(docLink('Read it', w.url, 'Liability waiver'));
      waiverWrap.appendChild(row);
    });
    // One tick per version, and with two versions in one cart all of them
    // must be ticked.
    var accepted = allAccepted();
    noteWrap.hidden = !lines.some(function (x) { return isRegistration(x.product); });

    payBtn.disabled = cart.length === 0 || !accepted || !shipOk;
    // The store shell (store.js) draws its own cart button in the top bar
    // and hides the floating one; this is how it learns the count.
    document.dispatchEvent(new CustomEvent('ll-cart', { detail: { count: count } }));
  }

  function open() {
    render();
    if (typeof panel.showModal === 'function') panel.showModal();
    else panel.setAttribute('open', '');
  }

  function say(text) {
    banner.textContent = text;
    banner.hidden = false;
  }

  // -------------------------------------------------------------- checkout
  // A signed-in customer's token travels with the order, so it is filed in
  // their account (store.js provides window.LLAccount).
  function authHeader() {
    var a = window.LLAccount;
    return (a && a.token ? a.token() : Promise.resolve(null)).catch(function () { return null; });
  }
  function post(fn, body) {
    return authHeader().then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch('/.netlify/functions/' + fn, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error(json.error || 'Checkout is unavailable right now. Please try again.');
        return json;
      });
    });
  }

  function checkout() {
    var waivers = waiversInCart();
    if (!allAccepted()) {
      statusEl.textContent = 'Please accept the waiver before paying.';
      return;
    }
    payBtn.disabled = true;
    statusEl.textContent = 'Opening PayPal…';
    // The versions accepted travel with the order, so what was agreed to
    // is on the order itself and not only in this browser.
    post('checkout', {
      items: cart,
      note: noteEl.value,
      waivers: waivers.map(function (w) { return w.version; }),
      shipMethod: delivery.method,
    })
      .then(function (r) { window.location.href = r.approveUrl; })
      .catch(function (e) {
        statusEl.textContent = e.message;
        payBtn.disabled = false;
      });
  }

  // Pick-up sign-up (owner, 2026-10-11): name, phone, email, address, day,
  // instructions and (compost) our $10 bucket. The server checks the address
  // is in the pick-up area before PayPal opens (netlify/lib/pickups.mjs).
  var signDlg;
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function field(form, label, input, hint) {
    var l = el('label', { class: 'su-field' });
    l.appendChild(el('span', null, label));
    l.appendChild(input);
    if (hint) l.appendChild(el('small', null, hint));
    form.appendChild(l);
    return input;
  }
  function signUp(id, button) {
    var p = products[id];
    if (!signDlg) {
      signDlg = el('dialog', { class: 'cart-doc su-dlg', 'aria-label': 'Sign up' });
      document.body.appendChild(signDlg);
    }
    signDlg.textContent = '';
    var bar = el('div', { class: 'cart-doc-bar' });
    bar.appendChild(el('h2', { class: 'cart-doc-title' }, 'Sign up: ' + p.name));
    var x = el('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, 'Close');
    x.addEventListener('click', function () { signDlg.close(); if (button) button.disabled = false; });
    bar.appendChild(x);
    signDlg.appendChild(bar);
    var form = el('form', { class: 'cart-doc-body su-form', novalidate: '' });
    form.appendChild(el('p', { class: 'su-lede' }, '$' + (p.price / 100).toFixed(2) + ' a month' + (p.oldPrice ? ' (50% off $' + (p.oldPrice / 100).toFixed(2) + ')' : '') + ', plus 6% Oklahoma sales tax. We pick up within 25 miles of Stigler, and anywhere in McAlester, Stigler and Checotah.'));
    var f = {
      name: field(form, 'Your name', el('input', { type: 'text', autocomplete: 'name', required: '', maxlength: '80' })),
      phone: field(form, 'Phone number', el('input', { type: 'tel', autocomplete: 'tel', required: '', maxlength: '20' })),
      email: field(form, 'Email', el('input', { type: 'email', autocomplete: 'email', required: '', maxlength: '120' })),
      street: field(form, 'Street address', el('input', { type: 'text', autocomplete: 'address-line1', required: '', maxlength: '120' })),
      city: field(form, 'City', el('input', { type: 'text', autocomplete: 'address-level2', required: '', maxlength: '60' })),
      zip: field(form, 'ZIP code', el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'postal-code', required: '', maxlength: '5' })),
    };
    var day = el('select', { required: '' });
    day.appendChild(el('option', { value: '' }, 'Choose a day...'));
    DAYS.forEach(function (d) { day.appendChild(el('option', { value: d }, d)); });
    f.day = field(form, 'Preferred pick-up day', day);
    f.notes = field(form, 'Instructions for pick-up', el('textarea', { rows: '3', maxlength: '500', placeholder: 'Where to find the bucket or bin, gate codes, dogs, anything we should know.' }));
    var bucket = null;
    if (p.bucket) {
      var bl = el('label', { class: 'su-check' });
      bucket = el('input', { type: 'checkbox' });
      bl.appendChild(bucket);
      bl.appendChild(document.createTextNode(' Add our 5 gallon bucket for $' + (p.bucket / 100).toFixed(2) + ' (one time). Leave unticked to use your own; we empty it into ours on the trailer.'));
      form.appendChild(bl);
    }
    var msg = el('p', { class: 'su-msg', role: 'status' });
    var go = el('button', { type: 'submit', class: 'btn' }, 'Continue to PayPal');
    form.appendChild(msg);
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var details = { bucket: bucket ? bucket.checked : false };
      Object.keys(f).forEach(function (k) { details[k] = f[k].value.trim(); });
      if (!details.name || !details.phone || !details.email || !details.street || !details.city || !details.zip || !details.day) {
        msg.textContent = 'Please fill in every field except the instructions.';
        return;
      }
      go.disabled = true;
      msg.textContent = 'Checking your address...';
      post('subscribe', { id: id, details: details })
        .then(function (r) { msg.textContent = 'Opening PayPal...'; window.location.href = r.approveUrl; })
        .catch(function (err) { msg.textContent = err.message; go.disabled = false; });
    });
    signDlg.appendChild(form);
    if (typeof signDlg.showModal === 'function') signDlg.showModal(); else signDlg.setAttribute('open', '');
    f.name.focus();
  }

  function subscribe(id, button) {
    if (products[id] && products[id].pickup) { signUp(id, button); return; }
    if (button) button.disabled = true;
    post('subscribe', { id: id })
      .then(function (r) { window.location.href = r.approveUrl; })
      .catch(function (e) {
        say(e.message);
        if (button) button.disabled = false;
      });
  }

  /** Coming back from PayPal, or from a button on another page. */
  function handleArrival() {
    var q = new URLSearchParams(window.location.search);
    var clean = function () {
      history.replaceState(null, '', window.location.pathname + window.location.hash);
    };
    if (q.get('paypal') === 'cancel') {
      say('Checkout cancelled. Nothing was charged, and your cart is still here.');
      clean();
    } else if (q.get('paypal') === 'return' && q.get('subscription_id')) {
      say('You are signed up. PayPal will email you a confirmation.');
      // A pick-up sign-up: tell the owner (once) now that PayPal has it.
      post('pickups', { action: 'confirm', subscriptionId: q.get('subscription_id') })
        .then(function (r) { if (r && r.day) say('You are signed up. Your pick-up day is ' + r.day + '; we will call or text before the first one. PayPal will email you a confirmation.'); })
        .catch(function () { /* PayPal's own email still goes */ });
      clean();
    } else if (q.get('paypal') === 'return' && q.get('token')) {
      say('Finishing your payment…');
      post('capture', { orderId: q.get('token') })
        .then(function (r) {
          if (r.status === 'COMPLETED') {
            cart = [];
            save(cart);
            say('Thank you! Your payment' + (r.amount ? ' of $' + r.amount : '') +
              ' went through. PayPal will email you a receipt.');
          } else {
            say('PayPal says this payment is ' + String(r.status).toLowerCase() +
              '. If that looks wrong, email support@lavishleaf.org.');
          }
        })
        .catch(function (e) { say(e.message); })
        .then(clean);
    } else if (q.get('add')) {
      add(q.get('add'));
      clean();
      open();
    } else if (q.get('subscribe')) {
      var b = document.querySelector('[data-subscribe="' + CSS.escape(q.get('subscribe')) + '"]');
      clean();
      if (b) {
        b.scrollIntoView({ block: 'center' });
        b.focus();
      }
      // A pick-up service opens its sign-up form straight away.
      var sp = products[q.get('subscribe')];
      if (sp && sp.pickup) signUp(sp.id, b);
    }
  }

  function start(data) {
    (data.products || []).forEach(function (p) { products[p.id] = p; });
    cart = cart.filter(function (l) {
      var p = products[l.id];
      if (!p || p.interval) return false;
      // An option that no longer exists, or a product that gained options: drop the line.
      if (p.options) return !!l.opt && p.options.values.some(function (v) { return v.name === l.opt; });
      return !l.opt;
    });
    build();
    // reload(): the account (store.js) merged a saved cart into this browser.
    window.LLCart = { open: open, add: add, subscribe: subscribe, reload: function () { cart = load(); render(); } };
    render();
    document.querySelectorAll('[data-cart-add]').forEach(function (b) {
      b.addEventListener('click', function () { add(b.getAttribute('data-cart-add')); });
    });
    document.querySelectorAll('[data-subscribe]').forEach(function (b) {
      b.addEventListener('click', function () { subscribe(b.getAttribute('data-subscribe'), b); });
    });
    handleArrival();
    document.dispatchEvent(new CustomEvent('ll-cart-ready'));
  }

  fetch('/products.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.checkout !== 'cart') return;
      start(data);
    })
    .catch(function () {
      // Without the product list the buttons cannot price anything; they
      // stay inert rather than guess.
    });
})();
