// The Lavish Leaf store shell: the behaviour behind store.html.
//
// Modelled on the Symphonymph app's Home and sidebar (2026-09-30, at the
// owner's request). 2026-10-01, the owner: "remove the settings on the
// online store page. We will just set what that store page looks like." So
// the look is fixed (the site's grey, store.css), Home shows every shelf in
// products.json order, and a shelf holds SHELF_LENGTH products. What THIS
// browser keeps, under one localStorage key "ll-store": the named wish
// lists, the shelf order (drag the sidebar's shelves, or Reorder; Home
// follows), the search sort, and how wide the visitor dragged the sidebar.
//
// Customer accounts (2026-10-01, docs/ACCOUNTS.md): a visitor who signs in
// (Netlify Identity) has the lists, the cart and the shelf order saved to
// their account through netlify/functions/account.mjs, so they survive a
// cleared browser and follow them to another device. Signing in merges this
// browser's lists and cart into the account; nothing is lost. Guests keep
// everything in this browser, exactly as before.
//
// The products themselves are rendered into the page by tools/render-store.mjs
// from products.json, so Home works with JavaScript off. This file reads
// those cards back as the catalogue (and fetches products.json for the
// search tags), then rearranges, searches and decorates them.
(function () {
  'use strict';

  var KEY = 'll-store';
  var SHELF_LENGTH = 30; // products on a Home shelf; "See all" shows the rest
  var SIDE_W = 340, SIDE_MIN = 260, SIDE_MAX = 560; // the sidebar's width, px
  var DEFAULTS = { sort: 'relevance', sideW: SIDE_W, lists: [], shelfOrder: [] };

  // ------------------------------------------------------------ state
  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    var out = {};
    for (var k in DEFAULTS) out[k] = s[k] !== undefined ? s[k] : clone(DEFAULTS[k]);
    if (!Array.isArray(out.lists)) out.lists = [];
    out.lists = out.lists.filter(function (l) { return l && l.id && typeof l.name === 'string'; })
      .map(function (l) { return { id: String(l.id), name: l.name, items: Array.isArray(l.items) ? l.items.filter(isStr) : [] }; });
    out.sideW = clampSide(parseInt(out.sideW, 10) || SIDE_W);
    if (!Array.isArray(out.shelfOrder)) out.shelfOrder = [];
    out.shelfOrder = out.shelfOrder.filter(isStr);
    return out;
  }
  function clampSide(w) { return Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(w))); }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: lives until the tab closes */ }
    schedulePush();
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
          price: m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) : null, // null: no price shown (a demo card)
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

  // ------------------------------------------------------------ home
  function shelfSlugs() { return shelfDefs.map(function (d) { return d.slug; }); }
  function shelfTitle(slug) {
    var d = shelfDefs.filter(function (x) { return x.slug === slug; })[0];
    return d ? d.title : slug;
  }

  // The visitor's shelf order: the names they arranged first, then any
  // shelf added since, in the page's order.
  function ordered(all, order) {
    var seen = {}, out = [];
    order.forEach(function (n) { if (all.indexOf(n) >= 0 && !seen[n]) { out.push(n); seen[n] = 1; } });
    all.forEach(function (n) { if (!seen[n]) { out.push(n); seen[n] = 1; } });
    return out;
  }
  function shelfOrderNow() { return ordered(shelfSlugs(), state.shelfOrder); }
  function setShelfOrder(order) { state.shelfOrder = order; save(); layoutHome(); buildSidebar(); }

  function layoutHome() {
    var wrap = $('#shelves');
    shelfOrderNow().forEach(function (slug) {
      var sh = $('#shelf-' + slug);
      if (!sh) return;
      wrap.appendChild(sh);
      $$('.sp-card', sh).forEach(function (c, i) { c.hidden = i >= SHELF_LENGTH; });
    });
    renderHomeLists();
  }

  function countOn(slug) {
    var d = shelfDefs.filter(function (x) { return x.slug === slug; })[0];
    return d ? d.ids.length : 0;
  }

  // ------------------------------------------------------------ sidebar
  // Shelves under Shop, in the visitor's order. Drag one onto another to
  // move it (a mouse), or press Reorder for up and down buttons (a phone, a
  // keyboard). Home follows the same order.
  var reordering = false, dragSlug = null;
  function buildSidebar() {
    var shop = $('#ss-shelves'); shop.textContent = '';
    var order = shelfOrderNow();
    order.forEach(function (slug, i) {
      var title = shelfTitle(slug);
      if (reordering) {
        var row = el('div', { class: 'ss-item ss-reorder-row' });
        row.appendChild(el('span', { class: 'ss-reorder-name' }, title));
        var up = el('button', { type: 'button', 'aria-label': 'Move ' + title + ' up' }); up.appendChild(svg('M12 19V5M5 12l7-7 7 7', true));
        var dn = el('button', { type: 'button', 'aria-label': 'Move ' + title + ' down' }); dn.appendChild(svg('M12 5v14M5 12l7 7 7-7', true));
        up.disabled = i === 0; dn.disabled = i === order.length - 1;
        up.addEventListener('click', function () { moveShelf(slug, -1, up); });
        dn.addEventListener('click', function () { moveShelf(slug, 1, dn); });
        row.appendChild(up); row.appendChild(dn);
        shop.appendChild(row);
        return;
      }
      var a = el('a', { class: 'ss-item', href: '#shelf/' + slug, 'data-nav': 'shelf/' + slug, draggable: 'true', 'data-slug': slug });
      a.appendChild(document.createTextNode(title));
      a.appendChild(el('span', { class: 'ss-n' }, String(countOn(slug))));
      shop.appendChild(a);
    });
    $$('[data-nav-group="shop"]').forEach(function (n) { n.hidden = !shelfDefs.length; });
    var t = $('#reorder-toggle');
    if (t) { t.textContent = reordering ? 'Done' : 'Reorder'; t.setAttribute('aria-pressed', String(reordering)); }
    var r = $('#reorder-reset');
    if (r) r.hidden = !reordering || !state.shelfOrder.length;
    renderSideLists();
    markCurrent();
  }
  function moveShelf(slug, dir, btn) {
    var order = shelfOrderNow(), i = order.indexOf(slug), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    order.splice(i, 1); order.splice(j, 0, slug);
    setShelfOrder(order);
    // Keep the keyboard on the shelf that moved.
    var again = $$('#ss-shelves .ss-reorder-row button[aria-label="' + btn.getAttribute('aria-label') + '"]')[0];
    if (again && !again.disabled) again.focus();
  }
  function buildReorder() {
    var shop = $('#ss-shelves');
    $('#reorder-toggle').addEventListener('click', function () { reordering = !reordering; buildSidebar(); });
    $('#reorder-reset').addEventListener('click', function () { setShelfOrder([]); toast('Shelves back in the store\'s order.'); });
    shop.addEventListener('dragstart', function (e) {
      var a = e.target.closest('[data-slug]'); if (!a) return;
      dragSlug = a.getAttribute('data-slug');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragSlug); } catch (x) { /* old browsers */ }
      a.classList.add('ss-dragging');
    });
    shop.addEventListener('dragover', function (e) {
      var a = e.target.closest('[data-slug]'); if (!a || !dragSlug) return;
      e.preventDefault();
      $$('.ss-drag-over', shop).forEach(function (x) { if (x !== a) x.classList.remove('ss-drag-over'); });
      a.classList.add('ss-drag-over');
    });
    shop.addEventListener('dragleave', function (e) {
      var a = e.target.closest('[data-slug]'); if (a) a.classList.remove('ss-drag-over');
    });
    shop.addEventListener('drop', function (e) {
      var a = e.target.closest('[data-slug]'); if (!a || !dragSlug) return;
      e.preventDefault();
      var target = a.getAttribute('data-slug');
      if (target !== dragSlug) {
        var order = shelfOrderNow().filter(function (x) { return x !== dragSlug; });
        order.splice(order.indexOf(target), 0, dragSlug);
        setShelfOrder(order);
      }
      dragSlug = null;
    });
    shop.addEventListener('dragend', function () {
      dragSlug = null;
      $$('.ss-dragging, .ss-drag-over', shop).forEach(function (x) { x.classList.remove('ss-dragging', 'ss-drag-over'); });
    });
  }

  // The sidebar's width: drag the handle on its right edge (or focus it and
  // use the arrow keys; a double click puts it back). Wide screens only; on
  // a phone the sidebar is a drawer.
  function applySideWidth() {
    $('#shell').style.setProperty('--side-w', state.sideW + 'px');
    $('#side-resize').setAttribute('aria-valuenow', String(state.sideW));
  }
  function buildResize() {
    var handle = $('#side-resize'), shell = $('#shell'), dragging = false;
    applySideWidth();
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      dragging = true; handle.setPointerCapture(e.pointerId);
      document.body.classList.add('ss-resizing'); e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      state.sideW = clampSide(e.clientX - shell.getBoundingClientRect().left);
      applySideWidth();
    });
    function end() {
      if (!dragging) return;
      dragging = false; document.body.classList.remove('ss-resizing'); save();
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('dblclick', function () { state.sideW = SIDE_W; applySideWidth(); save(); });
    handle.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0;
      if (e.key === 'Home') { state.sideW = SIDE_MIN; } else if (e.key === 'End') { state.sideW = SIDE_MAX; } else if (d) { state.sideW = clampSide(state.sideW + d); } else return;
      e.preventDefault(); applySideWidth(); save();
    });
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
    save(); refreshHearts(); renderSideLists(); renderHomeLists();
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
  var firstShow = true;
  function siteHeaderHeight() { var h = $('body > header'); return h ? h.offsetHeight : 0; }
  function show(view) {
    $$('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view-name') !== view; });
    current.view = view;
    // The search field lives in the top bar; leaving Search empties it.
    if (view !== 'search') { $('#search-input').value = ''; $('#search-clear').hidden = true; }
    // Arriving on the page leaves the hero in view; after that, a change of
    // view puts the top of the shell just under the site header.
    var top = $('#shell').getBoundingClientRect().top + window.scrollY - siteHeaderHeight();
    if (!firstShow && window.scrollY > top) window.scrollTo({ top: top, behavior: 'auto' });
    firstShow = false;
  }
  function setTitle(t) { $('#ss-title').textContent = t; document.title = (t === 'Home' ? '' : t + ': ') + 'Lavish Leaf Online Store'; }
  // The sidebar and the store bar stick under the site header, whose height
  // changes with the viewport (and with its own phone menu).
  function measureSite() { document.documentElement.style.setProperty('--site-h', siteHeaderHeight() + 'px'); }
  function markCurrent() {
    var key = current.view === 'home' ? 'home' : current.view === 'search' ? 'search' : current.view === 'list' ? current.arg : current.view === 'shelf' ? 'shelf/' + current.arg : '';
    $$('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
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
    } else if (path.indexOf('list/') === 0) {
      current.arg = path.slice(5);
      if (!listById(current.arg)) { location.hash = '#home'; return; }
      show('list'); showList(current.arg);
    } else if (path.indexOf('shelf/') === 0) {
      current.arg = path.slice(6);
      if (shelfSlugs().indexOf(current.arg) < 0) { location.hash = '#home'; return; }
      show('list'); current.view = 'shelf'; showShelf(current.arg);
    } else {
      show('home'); setTitle('Home');
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
      var hash = '#search' + (input.value ? '?q=' + encodeURIComponent(input.value) : '');
      // Typing on any other view opens Search; on Search it just refines.
      if (current.view !== 'search') { location.hash = hash; return; }
      timer = setTimeout(function () {
        history.replaceState(null, '', location.pathname + hash);
        runSearch();
      }, 120);
    });
    $('#search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (current.view !== 'search') location.hash = '#search' + (input.value ? '?q=' + encodeURIComponent(input.value) : '');
      else runSearch();
    });
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
    // Unpriced products (the demo catalogue) sort after the priced ones either way.
    var unpriced = function (a, b) { return (a.p.price == null) - (b.p.price == null); };
    if (state.sort === 'price-asc') rows.sort(function (a, b) { return unpriced(a, b) || a.p.price - b.p.price; });
    else if (state.sort === 'price-desc') rows.sort(function (a, b) { return unpriced(a, b) || b.p.price - a.p.price; });
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
      var bits = [p.category];
      if (p.price != null) bits.push('$' + (p.price / 100).toFixed(2) + (p.interval ? ' every ' + p.interval : ''));
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

    // The cart button is always in the top bar. Until the deploy has a cart
    // ("checkout": "cart" in products.json), each product's own button is
    // how to buy, and the cart button says so.
    var hasCart = document.body.getAttribute('data-checkout') === 'cart';
    $('#cart-open').addEventListener('click', function () {
      if (hasCart && window.LLCart) window.LLCart.open();
      else toast('Online checkout is coming soon. For now, each product\'s button emails us to order.');
    });
    if (hasCart) {
      $('#ss-cart').hidden = false;
      document.addEventListener('ll-cart', function () { schedulePush(); });
      document.addEventListener('ll-cart', function (e) {
        var n = e.detail.count;
        $$('[data-cart-count]').forEach(function (b) { b.textContent = String(n); b.hidden = n === 0; });
      });
    }

    window.addEventListener('hashchange', route);
    measureSite();
    window.addEventListener('resize', measureSite);
    if (window.ResizeObserver && $('body > header')) new ResizeObserver(measureSite).observe($('body > header'));
  }

  // ------------------------------------------------------------ account
  // Netlify Identity signs the customer in (its widget draws the sign-in and
  // sign-up forms); account.mjs keeps their record. See docs/ACCOUNTS.md.
  var account = { user: null, synced: false, record: null };
  var pushTimer = null;
  function identity() { return window.netlifyIdentity || null; }
  function token() {
    var id = identity(), u = id && id.currentUser();
    return u ? u.jwt() : Promise.resolve(null);
  }
  window.LLAccount = { token: token };
  function accountApi(action, extra) {
    return token().then(function (t) {
      if (!t) throw new Error('Please sign in again.');
      return fetch('/.netlify/functions/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Your account could not be reached just now.');
        return j;
      });
    });
  }
  function localCart() {
    try { var c = JSON.parse(localStorage.getItem('ll-cart') || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; }
  }
  function snapshot() { return { lists: state.lists, cart: localCart(), shelfOrder: state.shelfOrder }; }
  function schedulePush() {
    if (!account || !account.user || !account.synced) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      accountApi('put', snapshot()).then(function (rec) { account.record = rec; }).catch(function () { /* the next change tries again */ });
    }, 800);
  }
  // Signing in merges, never replaces: a list on both sides keeps every
  // product from either; the cart keeps the larger quantity of each thing.
  function mergeIn(rec) {
    (rec.lists || []).forEach(function (sl) {
      var mine = listById(sl.id) || state.lists.filter(function (l) { return l.name.toLowerCase() === sl.name.toLowerCase(); })[0];
      if (mine) sl.items.forEach(function (i) { if (mine.items.indexOf(i) < 0) mine.items.push(i); });
      else state.lists.push({ id: sl.id, name: sl.name, items: sl.items.slice() });
    });
    if (!state.shelfOrder.length && rec.shelfOrder && rec.shelfOrder.length) state.shelfOrder = rec.shelfOrder.slice();
    var c = localCart();
    (rec.cart || []).forEach(function (sl) {
      var m = c.filter(function (x) { return x.id === sl.id; })[0];
      if (m) m.qty = Math.min(20, Math.max(m.qty, sl.qty)); else c.push({ id: sl.id, qty: sl.qty });
    });
    try { localStorage.setItem('ll-cart', JSON.stringify(c)); } catch (e) { /* fine */ }
    if (window.LLCart && window.LLCart.reload) window.LLCart.reload();
  }
  function signedIn(user) {
    if (account.user && account.user.id === user.id) return;
    account.user = user; account.synced = false;
    renderAccountButton();
    accountApi('get').then(function (rec) {
      account.record = rec;
      mergeIn(rec);
      account.synced = true;
      afterListsChange(); // saves, which sends the merged copy to the account
      layoutHome(); buildSidebar();
    }).catch(function (e) { toast(e.message); });
  }
  function renderAccountButton() {
    var b = $('#account-open');
    var u = account.user;
    b.classList.toggle('is-signed-in', !!u);
    b.setAttribute('aria-label', u ? 'Your account' : 'Sign in or create an account');
    b.setAttribute('title', u ? 'Your account: ' + (u.email || '') : 'Sign in or create an account');
    $('#account-initial').textContent = u && u.email ? u.email.charAt(0).toUpperCase() : '';
  }
  function money(v) { return '$' + Number(v || 0).toFixed(2); }
  function fillAccount() {
    var u = account.user, rec = account.record || { orders: [] };
    $('#acct-email').textContent = u ? u.email : '';
    // The owner (Identity role "admin") gets a way into the dashboard.
    var roles = ((u && u.app_metadata && u.app_metadata.roles) || []).map(function (r) { return String(r).toLowerCase(); });
    $('#acct-dashboard').hidden = roles.indexOf('admin') < 0;
    var n = state.lists.reduce(function (sum, l) { return sum + l.items.length; }, 0);
    $('#acct-lists').textContent = state.lists.length
      ? state.lists.length + ' list' + (state.lists.length === 1 ? '' : 's') + ', ' + n + ' saved product' + (n === 1 ? '' : 's') + ', on every device you sign in on.'
      : 'No lists yet. Tap the heart on any product to start one.';
    var ul = $('#acct-orders'); ul.textContent = '';
    if (!rec.orders || !rec.orders.length) {
      ul.appendChild(el('li', { class: 'acct-empty' }, 'No orders yet. Orders you pay for while signed in appear here.'));
    } else {
      rec.orders.forEach(function (o) {
        var li = el('li');
        var d = new Date(o.date);
        li.appendChild(el('strong', null, (isNaN(d) ? '' : d.toLocaleDateString()) + '  ' + money(o.total)));
        li.appendChild(el('span', null, (o.items || []).map(function (i) { return i.qty + ' x ' + i.name; }).join(', ')));
        ul.appendChild(li);
      });
    }
  }
  function openAccount() {
    fillAccount();
    openDialog($('#account'));
    accountApi('get').then(function (rec) { account.record = rec; fillAccount(); }).catch(function () { /* shows what we have */ });
  }
  function buildAccount() {
    var btn = $('#account-open');
    renderAccountButton();
    btn.addEventListener('click', function () {
      var id = identity();
      if (account.user) { openAccount(); return; }
      // Identity has to be switched on in Netlify first; until then say so
      // plainly rather than open a form that cannot work.
      fetch('/.netlify/identity/settings').then(function (r) {
        if (!r.ok || !id) throw new Error();
        closeMenu();
        id.open('login');
      }).catch(function () {
        toast('Accounts are being switched on. Your lists are saved in this browser meanwhile.');
      });
    });
    $('#account-close').addEventListener('click', function () { $('#account').close(); });
    $('#acct-signout').addEventListener('click', function () {
      $('#account').close();
      var id = identity(); if (id) id.logout();
    });
    $('#acct-export').addEventListener('click', function () {
      accountApi('export').then(function (data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = el('a', { href: URL.createObjectURL(blob), download: 'lavish-leaf-account.json' });
        document.body.appendChild(a); a.click(); a.remove();
      }).catch(function (e) { toast(e.message); });
    });
    $('#acct-delete').addEventListener('click', function () {
      if (!window.confirm('Delete your account? Your saved lists, cart and order history are removed from our records, and you are signed out. Lists in this browser stay until you clear them.')) return;
      accountApi('delete').then(function () {
        $('#account').close();
        account.synced = false;
        var id = identity();
        try { if (id) id.logout(); } catch (e) { /* the sign-in is already gone */ }
        account.user = null; account.record = null; renderAccountButton();
        toast('Your account is deleted.');
      }).catch(function (e) { toast(e.message); });
    });
    var id = identity();
    if (!id) return;
    id.on('init', function (user) { if (user) signedIn(user); });
    id.on('login', function (user) { id.close(); signedIn(user); toast('Signed in. Your lists and cart are saved to your account.'); });
    id.on('logout', function () {
      clearTimeout(pushTimer);
      account.user = null; account.synced = false; account.record = null;
      renderAccountButton();
    });
    if (id.currentUser()) signedIn(id.currentUser());
  }

  // ------------------------------------------------------------ shelf arrows
  // Owner, 2026-10-02: an arrow to press to scroll each shelf, and the mouse
  // wheel sliding the shelf sideways. The wheel only takes over while the
  // shelf can still move that way; at either end the page scrolls as usual.
  var CHEV_L = 'M15 18l-6-6 6-6', CHEV_R = 'M9 18l6-6-6-6';
  function buildShelfArrows() {
    $$('#shelves .shelf-row').forEach(function (row) {
      if (row.parentNode.classList.contains('shelf-track')) return;
      var track = el('div', { class: 'shelf-track' });
      row.parentNode.insertBefore(track, row);
      track.appendChild(row);
      function arrow(dir) {
        var b = el('button', { type: 'button', class: 'shelf-arrow shelf-arrow-' + dir, 'aria-label': dir === 'left' ? 'Scroll left' : 'Scroll right' });
        b.appendChild(svg(dir === 'left' ? CHEV_L : CHEV_R, true));
        b.addEventListener('click', function () {
          var step = Math.max(200, row.clientWidth * 0.85);
          row.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
        });
        track.appendChild(b);
        return b;
      }
      var left = arrow('left'), right = arrow('right');
      function update() {
        var max = row.scrollWidth - row.clientWidth - 2;
        left.hidden = row.scrollLeft <= 2;
        right.hidden = row.scrollLeft >= max;
      }
      row.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      row.addEventListener('wheel', function (e) {
        if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // pinch zoom, or a trackpad already going sideways
        var dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
        var max = row.scrollWidth - row.clientWidth;
        if ((dy < 0 && row.scrollLeft <= 0) || (dy > 0 && row.scrollLeft >= max - 1)) return;
        e.preventDefault();
        row.scrollLeft += dy;
      }, { passive: false });
      update();
      setTimeout(update, 400); // after the photos have laid out
    });
  }

  // ------------------------------------------------------------ go
  readCatalogue();
  fetchTags();
  buildResize();
  buildChrome();
  buildSearch();
  layoutHome();
  buildShelfArrows();
  buildSidebar();
  buildReorder();
  buildAccount();
  refreshHearts();
  route();
})();
