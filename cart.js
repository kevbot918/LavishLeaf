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
    totalEl = el('p', { class: 'cart-total' });
    panel.appendChild(totalEl);

    var label = el('label', { for: 'cart-note', class: 'cart-note-label' }, 'Who is this for? (player or team name, so we can match your payment)');
    noteEl = el('textarea', { id: 'cart-note', rows: '2', maxlength: '127' });
    panel.appendChild(label);
    panel.appendChild(noteEl);

    payBtn = el('button', { type: 'button', class: 'btn btn-wide cart-pay' }, 'Check out with PayPal');
    payBtn.addEventListener('click', checkout);
    panel.appendChild(payBtn);
    panel.appendChild(el('p', { class: 'cart-fine' }, 'No PayPal account needed: you can pay with a debit or credit card on the next page.'));
    statusEl = el('p', { class: 'cart-status', role: 'status', 'aria-live': 'polite' });
    panel.appendChild(statusEl);
    document.body.appendChild(panel);

    // Above the products, where the buyer is looking when they come back.
    banner = el('div', { class: 'cart-banner', role: 'status', 'aria-live': 'polite', hidden: '' });
    var products_ = document.querySelector('.store-products');
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
    totalEl.textContent = cart.length ? 'Total ' + money(cents) : 'Your cart is empty.';
    payBtn.disabled = cart.length === 0;
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
  function post(fn, body) {
    return fetch('/.netlify/functions/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error(json.error || 'Checkout is unavailable right now. Please try again.');
        return json;
      });
    });
  }

  function checkout() {
    payBtn.disabled = true;
    statusEl.textContent = 'Opening PayPal…';
    post('checkout', { items: cart, note: noteEl.value })
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
