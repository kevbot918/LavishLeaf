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
      }) : [];
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
      return { method: typeof d.method === 'string' ? d.method : 'ship', zip: typeof d.zip === 'string' ? d.zip : '' };
    } catch (e) {
      return { method: 'ship', zip: '' };
    }
  })();
  function saveDelivery() {
    try { localStorage.setItem(SHIP_KEY, JSON.stringify(delivery)); } catch (e) { /* fine */ }
  }
  import('/shipping.mjs').then(function (m) { ship = m; render(); }).catch(function () { /* the server still prices it */ });

  function money(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function add(id) {
    var p = products[id];
    if (!p || p.interval || p.active === false) return;
    var line = cart.find(function (l) { return l.id === id; });
    if (line) line.qty = Math.min(MAX_QTY, line.qty + 1);
    else cart.push({ id: id, qty: 1 });
    save(cart);
    say(p.name + ' added to your cart.');
  }

  function setQty(id, qty) {
    cart = cart
      .map(function (l) { return l.id === id ? { id: id, qty: Math.max(0, Math.min(MAX_QTY, qty)) } : l; })
      .filter(function (l) { return l.qty > 0; });
    save(cart);
  }

  // ------------------------------------------------------------------ view
  var fab, panel, list, totalEl, noteEl, payBtn, statusEl, banner;
  var shipWrap, shipLine, shipNudge, zipRow, zipInput;
  var waiverWrap;

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
    [['ship', 'Ship to me (48 states)'], ['pickup-eufaula', 'Pick up in Eufaula, free'],
      ['pickup-mcalester', 'Pick up in McAlester, free'], ['local', 'Local delivery, Eufaula and McAlester']]
      .forEach(function (m) {
        var row = el('label', { class: 'cart-ship-row' });
        var r = el('input', { type: 'radio', name: 'cart-ship', value: m[0] });
        r.checked = delivery.method === m[0];
        r.addEventListener('change', function () { delivery.method = m[0]; saveDelivery(); render(); });
        row.appendChild(r);
        row.appendChild(document.createTextNode(' ' + m[1]));
        shipWrap.appendChild(row);
      });
    zipRow = el('label', { class: 'cart-zip', hidden: '' }, 'Delivery ZIP ');
    zipInput = el('input', { type: 'text', inputmode: 'numeric', maxlength: '10', autocomplete: 'postal-code' });
    zipInput.value = delivery.zip;
    zipInput.addEventListener('input', function () { delivery.zip = zipInput.value.trim(); saveDelivery(); render(); });
    zipRow.appendChild(zipInput);
    shipWrap.appendChild(zipRow);
    panel.appendChild(shipWrap);
    shipNudge = el('p', { class: 'cart-nudge', hidden: '' });
    panel.appendChild(shipNudge);
    shipLine = el('p', { class: 'cart-shipline', hidden: '' });
    panel.appendChild(shipLine);

    totalEl = el('p', { class: 'cart-total' });
    panel.appendChild(totalEl);

    var label = el('label', { for: 'cart-note', class: 'cart-note-label' }, 'Who is this for? (player or team name, so we can match your payment)');
    noteEl = el('textarea', { id: 'cart-note', rows: '2', maxlength: '127' });
    panel.appendChild(label);
    panel.appendChild(noteEl);

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
    legal.appendChild(el('a', { href: 'terms-of-sale.html', target: '_blank', rel: 'noopener' }, 'Terms of Sale'));
    legal.appendChild(document.createTextNode(' and '));
    legal.appendChild(el('a', { href: 'refunds.html', target: '_blank', rel: 'noopener' }, 'Refund Policy'));
    legal.appendChild(document.createTextNode('.'));
    panel.appendChild(legal);
    statusEl = el('p', { class: 'cart-status', role: 'status', 'aria-live': 'polite' });
    panel.appendChild(statusEl);
    document.body.appendChild(panel);

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
      li.appendChild(el('span', { class: 'cart-name' }, p.name));
      var qty = el('span', { class: 'cart-qty' });
      var minus = el('button', { type: 'button', 'aria-label': 'One fewer ' + p.name }, '−');
      minus.addEventListener('click', function () { setQty(l.id, l.qty - 1); });
      var plus = el('button', { type: 'button', 'aria-label': 'One more ' + p.name }, '+');
      plus.addEventListener('click', function () { setQty(l.id, l.qty + 1); });
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
    shipWrap.hidden = !posts;
    zipRow.hidden = !posts || delivery.method !== 'local';
    shipLine.hidden = !posts;
    shipNudge.hidden = true;
    if (posts) {
      if (!ship) {
        shipLine.textContent = 'Shipping is calculated at checkout.';
      } else {
        try {
          var q = ship.quote(lines, { method: delivery.method, zip: delivery.zip });
          shipCents = q.cents;
          shipLine.textContent = q.label + ': ' + (q.cents ? money(q.cents) : 'free');
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
    totalEl.textContent = cart.length ? 'Total ' + money(cents + shipCents) : 'Your cart is empty.';

    // The waiver, when something in the cart needs one. Drawn fresh each
    // render so removing the last registration removes the tick with it.
    var waivers = waiversInCart();
    waiverWrap.textContent = '';
    waiverWrap.hidden = waivers.length === 0;
    waivers.forEach(function (w) {
      var row = el('label', { class: 'cart-waiver-row' });
      var box = el('input', { type: 'checkbox' });
      box.addEventListener('change', render);
      row.appendChild(box);
      row.appendChild(document.createTextNode(
        ' ' + (w.label || 'I have read and accept the waiver') + ' '
      ));
      if (w.url) {
        var link = el('a', { href: w.url, target: '_blank', rel: 'noopener' }, 'Read it');
        row.appendChild(link);
      }
      waiverWrap.appendChild(row);
    });
    // One tick per version, and with two versions in one cart all of them
    // must be ticked.
    var accepted = waivers.length === 0 ||
      Array.prototype.every.call(waiverWrap.querySelectorAll('input[type=checkbox]'),
        function (b) { return b.checked; });

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
    var accepted = waivers.length === 0 ||
      Array.prototype.every.call(waiverWrap.querySelectorAll('input[type=checkbox]'),
        function (b) { return b.checked; });
    if (!accepted) {
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
      zip: delivery.zip,
    })
      .then(function (r) { window.location.href = r.approveUrl; })
      .catch(function (e) {
        statusEl.textContent = e.message;
        payBtn.disabled = false;
      });
  }

  function subscribe(id, button) {
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
    }
  }

  function start(data) {
    (data.products || []).forEach(function (p) { products[p.id] = p; });
    cart = cart.filter(function (l) { return products[l.id] && !products[l.id].interval; });
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
