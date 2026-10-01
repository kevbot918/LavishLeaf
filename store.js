// The Lavish Leaf store shell: the behaviour behind store.html.
//
// Modelled on the Symphonymph app's Home, sidebar and Settings (2026-09-30,
// at the owner's request). Everything a visitor chooses here lives in THIS
// browser under one localStorage key, "ll-store": the look (light, dark, true
// black, or the device's), the accent, which Home shelves show and in what
// order, what the sidebar shows, how long a shelf is, and the named wish
// lists. Nothing is sent anywhere and nobody signs in.
//
// The products themselves are rendered into the page by tools/render-store.mjs
// from products.json, so Home works with JavaScript off. This file reads
// those cards back as the catalogue (and fetches products.json for the
// search tags), then rearranges, searches and decorates them.
(function () {
  'use strict';

  var KEY = 'll-store';
  var ACCENTS = [
    ['leaf', 'Leaf', '#5FD86C'], ['amber', 'Amber', '#E0A153'], ['ember', 'Ember', '#F08A6E'],
    ['forest', 'Forest', '#74C79A'], ['ocean', 'Ocean', '#6FB8E8'], ['plum', 'Plum', '#D198D6'],
    ['slate', 'Slate', '#A9B4C4'], ['rose', 'Rose', '#EF92AC'], ['moss', 'Moss', '#C2CE7E'],
  ];
  var THEME_COLOR = { dark: '#14171C', light: '#F7F8FA', black: '#000000' };
  var DEFAULTS = {
    theme: 'dark', accent: 'leaf', shelfLength: 10, sort: 'relevance',
    homeOrder: [], homeHidden: [], sideOrder: [], sideHidden: [], lists: [],
  };

  // ------------------------------------------------------------ state
  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    var out = {};
    for (var k in DEFAULTS) out[k] = s[k] !== undefined ? s[k] : clone(DEFAULTS[k]);
    if (!Array.isArray(out.lists)) out.lists = [];
    out.lists = out.lists.filter(function (l) { return l && l.id && typeof l.name === 'string'; })
      .map(function (l) { return { id: String(l.id), name: l.name, items: Array.isArray(l.items) ? l.items.filter(isStr) : [] }; });
    if (!THEME_COLOR[out.theme] && out.theme !== 'system') out.theme = 'dark';
    if (!ACCENTS.some(function (a) { return a[0] === out.accent; })) out.accent = 'leaf';
    out.shelfLength = Math.min(30, Math.max(10, parseInt(out.shelfLength, 10) || 10));
    return out;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: lives until the tab closes */ }
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function isStr(v) { return typeof v === 'string'; }
  var state = load();

  // ------------------------------------------------------------ dom helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (attrs[k] === false || attrs[k] == null) continue;
      e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(path, stroke) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path);
    if (stroke) { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); }
    s.appendChild(p);
    return s;
  }
  var HEART = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 4.5 6.4 4.1c2-.2 3.8.8 5.6 2.9 1.8-2.1 3.6-3.1 5.6-2.9 3.8.4 5.5 4.3 4 7.7C19.5 16.4 12 21 12 21z';

  var toastTimer;
  function toast(text) {
    var t = $('#toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------ catalogue
  // Read from the rendered cards: the page is the source, and it works on a
  // file:// preview too. products.json adds the search tags when it loads.
  var products = {};
  var shelfDefs = []; // [{slug, title, ids}]
  function readCatalogue() {
    $$('#shelves .shelf').forEach(function (sh) {
      var def = { slug: sh.getAttribute('data-shelf'), title: sh.getAttribute('data-title'), ids: [] };
      $$('.sp-card', sh).forEach(function (c) {
        var id = c.getAttribute('data-id');
        var priceText = ($('.sp-price', c) || {}).textContent || '';
        var m = priceText.match(/\$([\d,]+\.\d\d)/);
        products[id] = {
          id: id,
          name: ($('.sp-name', c) || {}).textContent || id,
          blurb: ($('.sp-blurb', c) || {}).textContent || '',
          category: c.getAttribute('data-category') || def.title,
          shelf: def.slug,
          price: m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) : 0,
          interval: /every (month|year)/.test(priceText) ? RegExp.$1 : null,
          tags: [],
          card: c,
        };
        def.ids.push(id);
      });
      shelfDefs.push(def);
    });
  }
  function fetchTags() {
    fetch('/products.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        (data.products || []).forEach(function (p) {
          if (products[p.id]) products[p.id].tags = Array.isArray(p.tags) ? p.tags : [];
        });
      })
      .catch(function () { /* search still works on names, sentences and shelves */ });
  }

  // ------------------------------------------------------------ theme
  function effectiveTheme() {
    if (state.theme !== 'system') return state.theme;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function applyTheme() {
    var h = document.documentElement;
    var t = effectiveTheme();
    h.setAttribute('data-theme', t);
    h.setAttribute('data-accent', state.accent);
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[t]);
    $$('input[name="theme"]').forEach(function (r) { r.checked = r.value === state.theme; });
    $$('.ss-swatch').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-accent') === state.accent)); });
  }
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
      if (state.theme === 'system') applyTheme();
    });
  }

  function buildSettings() {
    $$('input[name="theme"]').forEach(function (r) {
      r.addEventListener('change', function () { state.theme = r.value; save(); applyTheme(); });
    });
    var sw = $('#accent-swatches');
    ACCENTS.forEach(function (a) {
      var b = el('button', { type: 'button', class: 'ss-swatch', role: 'radio', 'data-accent': a[0], 'aria-checked': 'false' });
      var dot = el('i'); dot.style.setProperty('--sw', a[2]);
      b.appendChild(dot);
      b.appendChild(el('span', null, a[1]));
      b.addEventListener('click', function () { state.accent = a[0]; save(); applyTheme(); });
      sw.appendChild(b);
    });
    var len = $('#shelf-len'), out = $('#shelf-len-out');
    len.value = state.shelfLength; out.textContent = state.shelfLength;
    len.addEventListener('input', function () {
      state.shelfLength = parseInt(len.value, 10); out.textContent = len.value; save(); layoutHome();
    });
    $('#set-new-list').addEventListener('click', function () { askListName(null); });
    $('#set-reset-btn').addEventListener('click', function () {
      ['theme', 'accent', 'shelfLength', 'sort', 'homeOrder', 'homeHidden', 'sideOrder', 'sideHidden'].forEach(function (k) {
        state[k] = clone(DEFAULTS[k]);
      });
      save(); applyTheme(); len.value = 10; out.textContent = '10';
      layoutHome(); buildSidebar(); buildOrderLists(); toast('Back to the way it came.');
    });
  }

  // ------------------------------------------------------------ ordering
  // An order is a list of names; names survive a shelf being added or
  // renamed. Anything not named goes at the end, in the page's order.
  function ordered(all, order) {
    var seen = {}, out = [];
    order.forEach(function (n) { if (all.indexOf(n) >= 0 && !seen[n]) { out.push(n); seen[n] = 1; } });
    all.forEach(function (n) { if (!seen[n]) { out.push(n); seen[n] = 1; } });
    return out;
  }
  function shelfSlugs() { return shelfDefs.map(function (d) { return d.slug; }); }
  function shelfTitle(slug) {
    var d = shelfDefs.filter(function (x) { return x.slug === slug; })[0];
    return d ? d.title : slug;
  }

  function layoutHome() {
    // The lists shelf is rendered outside the generated block (the renderer
    // owns that block); at runtime it joins the others so it can be ordered
    // with them.
    var wrap = $('#shelves');
    var order = ordered(['lists'].concat(shelfSlugs()), state.homeOrder);
    order.forEach(function (slug) {
      var sh = $('#shelf-' + slug);
      if (!sh) return;
      wrap.appendChild(sh);
      sh.hidden = state.homeHidden.indexOf(slug) >= 0;
      if (slug !== 'lists') $$('.sp-card', sh).forEach(function (c, i) { c.hidden = i >= state.shelfLength; });
    });
    renderHomeLists();
  }

  // The two order editors in Settings share one widget.
  function orderRow(name, sub, on, canUp, canDown, onToggle, onMove) {
    var li = el('li');
    var sw = el('label', { class: 'ss-switch' });
    var box = el('input', { type: 'checkbox' }); box.checked = on;
    box.setAttribute('aria-label', (on ? 'Hide ' : 'Show ') + name);
    box.addEventListener('change', function () { onToggle(box.checked); });
    sw.appendChild(box); sw.appendChild(el('i'));
    li.appendChild(sw);
    var nm = el('span', { class: 'ss-order-name' }, name);
    if (sub) nm.appendChild(el('small', null, sub));
    li.appendChild(nm);
    var tools = el('div', { class: 'ss-order-tools' });
    var up = el('button', { type: 'button', 'aria-label': 'Move ' + name + ' up' }); up.appendChild(svg('M12 19V5M5 12l7-7 7 7', true)); up.disabled = !canUp;
    var dn = el('button', { type: 'button', 'aria-label': 'Move ' + name + ' down' }); dn.appendChild(svg('M12 5v14M5 12l7 7 7-7', true)); dn.disabled = !canDown;
    up.addEventListener('click', function () { onMove(-1); });
    dn.addEventListener('click', function () { onMove(1); });
    tools.appendChild(up); tools.appendChild(dn);
    li.appendChild(tools);
    return li;
  }
  function move(order, name, dir) {
    var i = order.indexOf(name), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return order;
    order.splice(i, 1); order.splice(j, 0, name);
    return order;
  }

  function buildOrderLists() {
    // Home shelves
    var home = $('#order-home'); home.textContent = '';
    var hAll = ['lists'].concat(shelfSlugs());
    var hOrder = ordered(hAll, state.homeOrder);
    hOrder.forEach(function (slug, i) {
      var name = slug === 'lists' ? 'Your lists' : shelfTitle(slug);
      var sub = slug === 'lists' ? 'Your wish lists, at the top of Home' : products && countOn(slug) + ' product' + (countOn(slug) === 1 ? '' : 's');
      home.appendChild(orderRow(name, sub, state.homeHidden.indexOf(slug) < 0, i > 0, i < hOrder.length - 1,
        function (on) {
          state.homeHidden = state.homeHidden.filter(function (x) { return x !== slug; });
          if (!on) state.homeHidden.push(slug);
          save(); layoutHome(); buildOrderLists();
        },
        function (dir) { state.homeOrder = move(hOrder.slice(), slug, dir); save(); layoutHome(); buildOrderLists(); }));
    });
    // Sidebar
    var side = $('#order-side'); side.textContent = '';
    var sAll = ['lists'].concat(shelfSlugs()).concat(['more']);
    var sOrder = ordered(sAll, state.sideOrder);
    sOrder.forEach(function (key, i) {
      var name = key === 'lists' ? 'Your lists' : key === 'more' ? 'More from Lavish Leaf' : shelfTitle(key);
      var sub = key === 'lists' ? 'Wish lists and the cart' : key === 'more' ? 'Links to the rest of lavishleaf.org' : 'A shelf, under Shop';
      side.appendChild(orderRow(name, sub, state.sideHidden.indexOf(key) < 0, i > 0, i < sOrder.length - 1,
        function (on) {
          state.sideHidden = state.sideHidden.filter(function (x) { return x !== key; });
          if (!on) state.sideHidden.push(key);
          save(); buildSidebar(); buildOrderLists();
        },
        function (dir) { state.sideOrder = move(sOrder.slice(), key, dir); save(); buildSidebar(); buildOrderLists(); }));
    });
    // Wish lists
    var ol = $('#order-lists'); ol.textContent = '';
    if (!state.lists.length) ol.appendChild(el('li', null, 'No lists yet. Tap the heart on any product to start one.'));
    state.lists.forEach(function (l) {
      var li = el('li');
      var nm = el('span', { class: 'ss-order-name' }, l.name);
      nm.appendChild(el('small', null, l.items.length + ' saved'));
      li.appendChild(nm);
      var tools = el('div', { class: 'ss-order-tools' });
      var open = el('button', { type: 'button', 'aria-label': 'Open ' + l.name }); open.appendChild(svg('M5 12h14M13 6l6 6-6 6', true));
      open.addEventListener('click', function () { location.hash = '#list/' + l.id; });
      var ren = el('button', { type: 'button', 'aria-label': 'Rename ' + l.name }); ren.appendChild(svg('M4 20h4l10-10-4-4L4 16v4zM13 7l4 4', true));
      ren.addEventListener('click', function () { askListName(l); });
      var del = el('button', { type: 'button', 'aria-label': 'Delete ' + l.name }); del.appendChild(svg('M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13', true));
      del.addEventListener('click', function () { deleteList(l); });
      tools.appendChild(open); tools.appendChild(ren); tools.appendChild(del);
      li.appendChild(tools);
      ol.appendChild(li);
    });
  }
  function countOn(slug) {
    var d = shelfDefs.filter(function (x) { return x.slug === slug; })[0];
    return d ? d.ids.length : 0;
  }

  // ------------------------------------------------------------ sidebar
  function buildSidebar() {
    var nav = $('#ss-nav');
    var sOrder = ordered(['lists'].concat(shelfSlugs()).concat(['more']), state.sideOrder);
    // Shelves under Shop
    var shop = $('#ss-shelves'); shop.textContent = '';
    sOrder.forEach(function (key) {
      if (key === 'lists' || key === 'more') return;
      if (state.sideHidden.indexOf(key) >= 0) return;
      var a = el('a', { class: 'ss-item', href: '#shelf/' + key, 'data-nav': 'shelf/' + key });
      a.appendChild(document.createTextNode(shelfTitle(key)));
      a.appendChild(el('span', { class: 'ss-n' }, String(countOn(key))));
      shop.appendChild(a);
    });
    var anyShelf = sOrder.some(function (k) { return k !== 'lists' && k !== 'more' && state.sideHidden.indexOf(k) < 0; });
    $$('[data-nav-group="shop"]', nav).forEach(function (n) { n.hidden = !anyShelf; });
    var listsOn = state.sideHidden.indexOf('lists') < 0;
    $$('[data-nav-group="lists"]', nav).forEach(function (n) { n.hidden = !listsOn; });
    var moreOn = state.sideHidden.indexOf('more') < 0;
    $$('[data-nav-group="more"]', nav).forEach(function (n) { n.hidden = !moreOn; });
    // Group order: move the three groups' nodes into the chosen order, after Search.
    var anchor = $('[data-nav="search"]', nav);
    var groups = { lists: $$('[data-nav-group="lists"]', nav).concat([$('#ss-cart')]), shop: $$('[data-nav-group="shop"]', nav), more: $$('[data-nav-group="more"]', nav) };
    var placed = [];
    sOrder.forEach(function (key) {
      var g = key === 'lists' ? 'lists' : key === 'more' ? 'more' : 'shop';
      if (placed.indexOf(g) >= 0) return;
      placed.push(g);
      groups[g].forEach(function (n) { anchor.parentNode.insertBefore(n, $('.ss-item-quiet', nav)); });
    });
    renderSideLists();
    markCurrent();
  }
  function renderSideLists() {
    var box = $('#ss-lists'); box.textContent = '';
    state.lists.forEach(function (l) {
      var a = el('a', { class: 'ss-item', href: '#list/' + l.id, 'data-nav': 'list/' + l.id });
      a.appendChild(svg(HEART));
      a.appendChild(document.createTextNode(l.name));
      a.appendChild(el('span', { class: 'ss-n' }, String(l.items.length)));
      box.appendChild(a);
    });
  }

  // ------------------------------------------------------------ wish lists
  function newId() { return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function listById(id) { return state.lists.filter(function (l) { return l.id === id; })[0]; }
  function inAnyList(pid) { return state.lists.some(function (l) { return l.items.indexOf(pid) >= 0; }); }
  function refreshHearts() {
    $$('[data-wish]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(inAnyList(b.getAttribute('data-wish'))));
    });
  }
  function afterListsChange() {
    save(); refreshHearts(); renderSideLists(); renderHomeLists(); buildOrderLists();
    if (current.view === 'list') showList(current.arg);
  }
  function askListName(existing) {
    var d = $('#listname'), input = $('#listname-input');
    $('#listname-title').textContent = existing ? 'Rename list' : 'New list';
    input.value = existing ? existing.name : '';
    d.returnValue = '';
    pendingRename = existing;
    openDialog(d);
    setTimeout(function () { input.focus(); input.select(); }, 30);
  }
  var pendingRename = null;
  function deleteList(l) {
    if (!window.confirm('Delete "' + l.name + '"? The ' + l.items.length + ' saved product' + (l.items.length === 1 ? '' : 's') + ' will be forgotten.')) return;
    state.lists = state.lists.filter(function (x) { return x.id !== l.id; });
    afterListsChange();
    if (current.view === 'list' && current.arg === l.id) location.hash = '#home';
    toast('"' + l.name + '" deleted.');
  }
  function toggleIn(list, pid) {
    var i = list.items.indexOf(pid);
    if (i >= 0) list.items.splice(i, 1); else list.items.push(pid);
    afterListsChange();
    toast((i >= 0 ? 'Removed from ' : 'Saved to ') + list.name + '.');
  }
  var pendingPick = null;
  function heart(pid) {
    if (!state.lists.length) {
      state.lists.push({ id: newId(), name: 'Wishlist', items: [] });
    }
    if (state.lists.length === 1) { toggleIn(state.lists[0], pid); return; }
    // Several lists: ask which. Tapping a list toggles the product in it.
    pendingPick = pid;
    renderPick();
    openDialog($('#pick'));
  }
  function renderPick() {
    var ul = $('#pick-list'); ul.textContent = '';
    state.lists.forEach(function (l) {
      var li = el('li');
      var b = el('button', { type: 'button', 'aria-pressed': String(l.items.indexOf(pendingPick) >= 0) }, l.name);
      b.addEventListener('click', function () { toggleIn(l, pendingPick); renderPick(); });
      li.appendChild(b); ul.appendChild(li);
    });
    var li = el('li');
    var nb = el('button', { type: 'button', class: 'ss-pick-new' }, '+ New list');
    nb.addEventListener('click', function () { $('#pick').close(); askListName(null); });
    li.appendChild(nb); ul.appendChild(li);
  }
  function renderHomeLists() {
    var row = $('#home-lists'); row.textContent = '';
    state.lists.forEach(function (l) {
      var a = el('a', { class: 'sp-list', href: '#list/' + l.id });
      a.appendChild(svg(HEART));
      var foot = el('div');
      foot.appendChild(el('div', { class: 'sp-list-name' }, l.name));
      foot.appendChild(el('div', { class: 'sp-list-n' }, l.items.length ? l.items.length + ' saved' : 'Nothing saved yet'));
      a.appendChild(foot);
      row.appendChild(a);
    });
    var nb = el('button', { type: 'button', class: 'sp-list sp-list-new' });
    nb.appendChild(svg('M12 5v14M5 12h14', true));
    var f = el('div'); f.appendChild(el('div', { class: 'sp-list-name' }, 'New list'));
    f.appendChild(el('div', { class: 'sp-list-n' }, 'Name it anything'));
    nb.appendChild(f);
    nb.addEventListener('click', function () { askListName(null); });
    row.appendChild(nb);
  }

  // ------------------------------------------------------------ views
  var current = { view: 'home', arg: null };
  var TITLES = { home: 'Store', search: 'Search', settings: 'Settings' };
  function show(view) {
    $$('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view-name') !== view; });
    current.view = view;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function setTitle(t) { $('#ss-title').textContent = t; document.title = (t === 'Store' ? '' : t + ': ') + 'Lavish Leaf Store'; }
  function markCurrent() {
    var key = current.view === 'home' ? 'home' : current.view === 'search' ? 'search' : current.view === 'list' ? current.arg : current.view === 'shelf' ? 'shelf/' + current.arg : '';
    $$('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $$('.ss-top [data-view]').forEach(function (a) {
      if (a.getAttribute('data-view') === current.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function route() {
    var h = location.hash.replace(/^#/, '');
    var path = h.split('?')[0], q = new URLSearchParams(h.split('?')[1] || '');
    closeMenu();
    if (path === 'cart') {
      if (window.LLCart) window.LLCart.open();
      history.replaceState(null, '', location.pathname + (current.view === 'home' ? '' : '#' + current.view));
      return;
    }
    if (path === 'search') {
      show('search'); setTitle('Search');
      var input = $('#search-input');
      if (q.get('q') != null && input.value !== q.get('q')) input.value = q.get('q');
      runSearch();
      setTimeout(function () { input.focus(); }, 50);
    } else if (path.indexOf('settings') === 0) {
      show('settings'); setTitle('Settings');
      var sec = path.split('/')[1];
      var target = sec === 'home' ? '#set-home' : sec === 'sidebar' ? '#set-sidebar' : sec === 'lists' ? '#set-lists' : null;
      if (target) setTimeout(function () { $(target).scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
    } else if (path.indexOf('list/') === 0) {
      current.arg = path.slice(5);
      if (!listById(current.arg)) { location.hash = '#home'; return; }
      show('list'); showList(current.arg);
    } else if (path.indexOf('shelf/') === 0) {
      current.arg = path.slice(6);
      if (shelfSlugs().indexOf(current.arg) < 0) { location.hash = '#home'; return; }
      show('list'); current.view = 'shelf'; showShelf(current.arg);
    } else {
      show('home'); setTitle('Store');
      if (path === 'donate') {
        // Other pages' "Donate" buttons land here. The control is in the
        // sidebar, so on a phone the drawer opens to show it.
        if (window.innerWidth <= 1000) openMenu();
        setTimeout(function () { $('#donate').focus(); }, 80);
      } else if (path && path !== 'home' && $('#' + CSS.escape(path))) {
        // an old-style anchor such as #shelf-rec-sports
        setTimeout(function () { $('#' + CSS.escape(path)).scrollIntoView({ block: 'start' }); }, 30);
      }
    }
    markCurrent();
  }

  // A product card, cloned for a list page or a whole-shelf page. The clone
  // has no listeners of its own: hearts and cart buttons are delegated.
  function cardFor(pid) {
    var p = products[pid]; if (!p) return null;
    var c = p.card.cloneNode(true); c.hidden = false;
    return c;
  }
  function showList(id) {
    var l = listById(id); if (!l) return;
    setTitle(l.name);
    $('#list-kicker').textContent = l.items.length ? l.items.length + ' saved. Tap a heart to remove one.' : '';
    var acts = $('#list-actions'); acts.textContent = '';
    var ren = el('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, 'Rename');
    ren.addEventListener('click', function () { askListName(l); });
    var del = el('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, 'Delete');
    del.addEventListener('click', function () { deleteList(l); });
    acts.appendChild(ren); acts.appendChild(del);
    var grid = $('#list-grid'); grid.textContent = '';
    var empty = $('#list-empty');
    var shown = 0;
    l.items.forEach(function (pid) { var c = cardFor(pid); if (c) { grid.appendChild(c); shown++; } });
    empty.hidden = shown > 0;
    empty.textContent = 'Nothing here yet. The heart on any product saves it to a list.';
    refreshHearts();
  }
  function showShelf(slug) {
    setTitle(shelfTitle(slug));
    var d = shelfDefs.filter(function (x) { return x.slug === slug; })[0];
    $('#list-kicker').textContent = d.ids.length + ' product' + (d.ids.length === 1 ? '' : 's') + ' on this shelf.';
    $('#list-actions').textContent = '';
    var grid = $('#list-grid'); grid.textContent = '';
    d.ids.forEach(function (pid) { var c = cardFor(pid); if (c) grid.appendChild(c); });
    $('#list-empty').hidden = d.ids.length > 0;
    $('#list-empty').textContent = 'Nothing on this shelf yet.';
    refreshHearts();
  }

  // ------------------------------------------------------------ search
  var chip = 'all';
  function buildSearch() {
    var chips = $('#search-chips');
    var all = el('button', { type: 'button', class: 'ss-chip', 'data-chip': 'all', 'aria-pressed': 'true' }, 'Everything');
    chips.appendChild(all);
    shelfDefs.forEach(function (d) {
      chips.appendChild(el('button', { type: 'button', class: 'ss-chip', 'data-chip': d.slug, 'aria-pressed': 'false' }, d.title));
    });
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('[data-chip]'); if (!b) return;
      chip = b.getAttribute('data-chip');
      $$('[data-chip]', chips).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      runSearch();
    });
    var input = $('#search-input'), clear = $('#search-clear'), timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        history.replaceState(null, '', location.pathname + '#search' + (input.value ? '?q=' + encodeURIComponent(input.value) : ''));
        runSearch();
      }, 120);
    });
    $('#search-form').addEventListener('submit', function (e) { e.preventDefault(); runSearch(); });
    clear.addEventListener('click', function () { input.value = ''; input.focus(); history.replaceState(null, '', location.pathname + '#search'); runSearch(); });
    $$('[data-sort]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-sort') === state.sort));
      b.addEventListener('click', function () {
        state.sort = b.getAttribute('data-sort'); save();
        $$('[data-sort]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        runSearch();
      });
    });
    $('#filter-onetime').addEventListener('change', runSearch);
  }
  function words(s) { return s.toLowerCase().replace(/[^a-z0-9$.]+/g, ' ').trim().split(' ').filter(Boolean); }
  function score(p, ws) {
    if (!ws.length) return 1;
    var name = p.name.toLowerCase(), blurb = p.blurb.toLowerCase(), cat = p.category.toLowerCase(), tags = p.tags.join(' ').toLowerCase();
    var total = 0;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i], s = 0;
      if (name.indexOf(w) >= 0) s = name.indexOf(w) === 0 ? 10 : 6;
      else if (tags.indexOf(w) >= 0) s = 4;
      else if (cat.indexOf(w) >= 0) s = 3;
      else if (blurb.indexOf(w) >= 0) s = 2;
      if (!s) return 0; // every word must land somewhere
      total += s;
    }
    return total;
  }
  function highlight(text, ws) {
    if (!ws.length) return document.createTextNode(text);
    var frag = document.createDocumentFragment();
    var re = new RegExp('(' + ws.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'ig');
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(el('mark', null, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }
  function runSearch() {
    var input = $('#search-input'), q = input.value.trim(), ws = words(q);
    $('#search-clear').hidden = !q;
    var onetime = $('#filter-onetime').checked;
    var rows = Object.keys(products).map(function (id) { return products[id]; })
      .filter(function (p) { return chip === 'all' || p.shelf === chip; })
      .filter(function (p) { return !onetime || !p.interval; })
      .map(function (p) { return { p: p, s: score(p, ws) }; })
      .filter(function (r) { return r.s > 0; });
    if (state.sort === 'price-asc') rows.sort(function (a, b) { return a.p.price - b.p.price; });
    else if (state.sort === 'price-desc') rows.sort(function (a, b) { return b.p.price - a.p.price; });
    else rows.sort(function (a, b) { return b.s - a.s || a.p.name.localeCompare(b.p.name); });
    var ul = $('#search-results'); ul.textContent = '';
    var count = $('#search-count');
    count.textContent = rows.length
      ? rows.length + ' product' + (rows.length === 1 ? '' : 's') + (q ? ' for "' + q + '"' : '') + (chip !== 'all' ? ' in ' + shelfTitle(chip) : '')
      : (q ? 'Nothing matches "' + q + '"' + (chip !== 'all' ? ' in ' + shelfTitle(chip) : '') + '. Try fewer words, or Everything.' : 'Nothing on this shelf yet.');
    rows.forEach(function (r) {
      var p = r.p;
      var li = el('li', { class: 'ss-result' });
      var th = el('div', { class: 'ss-result-thumb' });
      var img = $('.sp-media img', p.card);
      if (img) th.appendChild(el('img', { src: img.getAttribute('src'), alt: '', loading: 'lazy' }));
      else th.textContent = ($('.sp-icon', p.card) || {}).textContent || '';
      li.appendChild(th);
      var body = el('div');
      var t = el('div', { class: 'ss-result-title' }); t.appendChild(highlight(p.name, ws)); body.appendChild(t);
      var meta = el('div', { class: 'ss-result-meta' });
      var bits = [p.category, '$' + (p.price / 100).toFixed(2) + (p.interval ? ' every ' + p.interval : '')];
      meta.appendChild(highlight(bits.join(' · '), ws));
      if (p.blurb) { meta.appendChild(document.createTextNode(' · ')); meta.appendChild(highlight(p.blurb, ws)); }
      body.appendChild(meta);
      li.appendChild(body);
      var side = el('div', { class: 'ss-result-side' });
      var h = el('button', { type: 'button', class: 'sp-wish', 'data-wish': p.id, 'aria-pressed': String(inAnyList(p.id)), 'aria-label': 'Save ' + p.name + ' to a wish list' });
      h.appendChild(svg(HEART));
      side.appendChild(h);
      var btn = $('.sp-foot .btn', p.card);
      if (btn) side.appendChild(btn.cloneNode(true));
      li.appendChild(side);
      ul.appendChild(li);
    });
  }

  // ------------------------------------------------------------ drawer, dialogs, report
  function openMenu() { document.body.classList.add('menu-open'); $('#scrim').hidden = false; $('#menu-open').setAttribute('aria-expanded', 'true'); }
  function closeMenu() { document.body.classList.remove('menu-open'); $('#scrim').hidden = true; $('#menu-open').setAttribute('aria-expanded', 'false'); }
  function openDialog(d) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }

  function buildChrome() {
    $('#menu-open').addEventListener('click', function () { document.body.classList.contains('menu-open') ? closeMenu() : openMenu(); });
    $('#scrim').addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    $('#year').textContent = String(new Date().getFullYear());

    // Report a problem: the Netlify "contact" form, posted without leaving.
    var rep = $('#report'), form = $('#report-form'), status = $('#report-status');
    $('#report-open').addEventListener('click', function () { closeMenu(); status.textContent = ''; openDialog(rep); });
    $('#report-close').addEventListener('click', function () { rep.close(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.textContent = 'Sending…';
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)).toString() })
        .then(function (r) { if (!r.ok) throw new Error(); status.textContent = 'Sent. A person will reply from support@lavishleaf.org.'; form.reset(); setTimeout(function () { rep.close(); }, 1800); })
        .catch(function () { status.textContent = 'That did not send. Please email support@lavishleaf.org.'; });
    });

    // Naming a list
    var ln = $('#listname');
    $('#listname-close').addEventListener('click', function () { ln.close(); });
    $('#listname-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#listname-input').value.trim();
      if (!name) return;
      if (pendingRename) { pendingRename.name = name; toast('Renamed to ' + name + '.'); }
      else { var l = { id: newId(), name: name, items: [] }; state.lists.push(l); toast('"' + name + '" created.'); if (pendingPick) { l.items.push(pendingPick); pendingPick = null; } }
      pendingRename = null;
      ln.close(); afterListsChange();
    });
    $('#pick-close').addEventListener('click', function () { $('#pick').close(); });

    // Hearts and cloned cart buttons, wherever they are drawn.
    document.addEventListener('click', function (e) {
      var w = e.target.closest('[data-wish]');
      if (w) { heart(w.getAttribute('data-wish')); return; }
      var inView = e.target.closest('#view-list, #view-search');
      if (!inView || !window.LLCart) return;
      var add = e.target.closest('[data-cart-add]');
      if (add) { window.LLCart.add(add.getAttribute('data-cart-add')); return; }
      var sub = e.target.closest('[data-subscribe]');
      if (sub) { window.LLCart.subscribe(sub.getAttribute('data-subscribe'), sub); }
    });

    // The cart, only on a deploy that has one.
    if (document.body.getAttribute('data-checkout') === 'cart') {
      $('#cart-open').hidden = false;
      $('#ss-cart').hidden = false;
      $('#cart-open').addEventListener('click', function () { if (window.LLCart) window.LLCart.open(); });
      document.addEventListener('ll-cart', function (e) {
        var n = e.detail.count;
        $$('[data-cart-count]').forEach(function (b) { b.textContent = String(n); b.hidden = n === 0; });
      });
    }

    window.addEventListener('hashchange', route);
  }

  // ------------------------------------------------------------ go
  readCatalogue();
  fetchTags();
  applyTheme();
  buildSettings();
  buildChrome();
  buildSearch();
  layoutHome();
  buildSidebar();
  buildOrderLists();
  refreshHearts();
  route();
})();
