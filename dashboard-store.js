// The dashboard's "Store products" section (2026-10-06). The owner: "add a
// store portion in the dashboard, this store portion will list all of the
// product details by tiers."
//
// Two sources, kept apart on purpose:
//   * store-tiers.json: every tier from docs/STORE-PRODUCTS.md, written by
//     tools/demo-store.mjs. Public facts only (the document is public).
//   * store-costs (a Netlify function, owner only): his own costs, stock and
//     pack weights, from the Bangalla product data CSV he loads here. It is
//     parsed in this browser and only the useful rows are sent; the costs
//     never touch the website's files or GitHub.
// Rows are matched by Bangalla SKU. A product with no cost data shows a dash.
(function () {
  'use strict';

  var TIERS = [
    { key: '0', label: 'Tier 0', note: 'Costs nothing to start. These are the products on the Store page now.' },
    { key: '1', label: 'Tier 1', note: 'The first stock, when there is money: opening orders from $30 to $150 a brand.' },
    { key: '2', label: 'Tier 2', note: 'The second round: heavier, dearer or slower, still postable.' },
    { key: '3', label: 'Tier 3', note: 'Gifts, serving pieces, seed gifts and bundles.' },
    { key: '4', label: 'Tier 4', note: 'Heavy, bulk and perishable: for a shop or a stall, never posted.' },
    { key: 'Misc', label: 'Misc', note: 'Real and priced, in no tier.' },
    { key: 'more', label: 'More from Bangalla', note: 'Everything else in stock in your categories from your Bangalla file, not yet in a tier. Any of it can join Tier 0 on the same terms.' },
  ];
  // His categories in Bangalla's file: what is worth keeping from a 21,901 row file.
  var KEEP_SECTIONS = /^NON FOODS|SOAP BARS|BEAUTY TOOLS|DEODORANTS|ORAL CARE|LIFESTYLE ACCESSORIES|BATH & SHOWER/;

  var PAGE = 50;
  var st = { tiers: null, costs: null, tab: '0', q: '', sort: 'rank', preview: false, limit: PAGE };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function usd(n) { return n == null || isNaN(n) ? '-' : '$' + Number(n).toFixed(2); }
  function api(body) {
    var u = window.netlifyIdentity && window.netlifyIdentity.currentUser();
    if (!u) return Promise.reject(new Error('Please sign in.'));
    return u.jwt().then(function (t) {
      return fetch('/.netlify/functions/store-costs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ').'); return j; });
    });
  }

  // ------------------------------------------------------------ the CSV
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function rowsFromBangalla(text, wantSkus) {
    var rows = parseCsv(text);
    var head = (rows.shift() || []).map(function (h) { return h.trim().toUpperCase(); });
    var at = function (name) { return head.indexOf(name); };
    var need = ['SKU', 'PRODUCT NAME', 'WHOLESALE', 'BANGALLA', 'INVENTORY'];
    var missing = need.filter(function (n) { return at(n) < 0; });
    if (missing.length) throw new Error('This does not look like the Bangalla product data CSV (missing ' + missing.join(', ') + '). Choose "Bangalla Product Data csv.csv".');
    var I = { sku: at('SKU'), brand: at('MANUFACTURER'), name: at('PRODUCT NAME'), s1: at('SUB CATEGORY1'), s2: at('SUB CATEGORY2'), lb: at('WEIGHT'), pack: at('PACK SIZE'), per: at('PER CASE'), stock: at('INVENTORY'), restr: at('THIRD PARTY RESTRICTION'), list: at('BANGALLA'), cost: at('WHOLESALE'), gold: at('GOLD'), map: at('MAP'), eta: at('ETA') };
    var num = function (v) { var n = parseFloat(String(v || '').replace(/[$,]/g, '')); return isFinite(n) ? n : null; };
    var out = [];
    rows.forEach(function (r) {
      if (r.length < 10) return;
      var sku = (r[I.sku] || '').trim();
      var section = ((r[I.s1] || '').trim() + ' > ' + (r[I.s2] || '').trim());
      if (!wantSkus[sku] && !KEEP_SECTIONS.test(section)) return;
      out.push({
        sku: sku, brand: (r[I.brand] || '').trim(), name: (r[I.name] || '').replace(/\s+/g, ' ').trim(), section: section,
        pack: (r[I.pack] || '').trim(), perCase: num(r[I.per]), lb: num(r[I.lb]), stock: num(r[I.stock]),
        cost: num(r[I.cost]), list: num(r[I.list]), gold: I.gold < 0 ? null : num(r[I.gold]), map: I.map < 0 ? null : num(r[I.map]),
        restricted: I.restr >= 0 && /^y/i.test((r[I.restr] || '').trim()), eta: I.eta < 0 ? '' : (r[I.eta] || '').trim(),
      });
    });
    return out;
  }

  // ------------------------------------------------------------ the view
  var root, body, status;
  function build(container) {
    root = el('section', 'db-section'); root.id = 'sec-products';
    root.innerHTML = '<h2><i class="fas fa-store"></i>Store products, by tier</h2>' +
      '<p class="db-why">Every product researched for the store, from docs/STORE-PRODUCTS.md. Tier 0 is what the Store page shows now. Load your Bangalla file and each Bangalla product shows your cost, your margin at their list price, and the stock on the day of the file. Your costs stay in your private storage: never on the website, never on GitHub.</p>';
    var load = el('div', 'db-card db-store-load');
    load.innerHTML = '<div class="db-store-file"><label class="db-btn-ghost" for="db-store-csv"><i class="fas fa-file-csv"></i> Load the Bangalla file</label>' +
      '<input type="file" id="db-store-csv" accept=".csv,text/csv" hidden><span class="db-hint" id="db-store-loaded">Checking for a file you loaded before&hellip;</span></div>' +
      '<p class="db-hint">Choose <b>Bangalla Product Data csv.csv</b> (the CSV, not the Excel). Download a fresh one from Bangalla, Account, Data Downloads, whenever you want new stock numbers. It is read in this browser; only the rows for your categories are kept.</p>';
    root.appendChild(load);
    var tabs = el('div', 'db-range db-store-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Tier');
    TIERS.forEach(function (t) { var b = el('button', null, t.label); b.type = 'button'; b.dataset.tab = t.key; tabs.appendChild(b); });
    root.appendChild(tabs);
    var tools = el('div', 'db-store-tools');
    tools.innerHTML = '<input type="search" id="db-store-q" placeholder="Search products, brands, shelves" aria-label="Search products">' +
      '<label class="db-hint" for="db-store-sort">Sort</label><select id="db-store-sort"><option value="rank">Rank</option><option value="margin">Margin, highest first</option><option value="price">Price, lowest first</option><option value="stock">Stock, most first</option><option value="name">Name</option></select>';
    root.appendChild(tools);
    status = el('p', 'db-hint db-store-note'); root.appendChild(status);
    body = el('div', 'db-store-body'); root.appendChild(body);
    container.appendChild(root);

    tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; st.tab = b.dataset.tab; st.limit = PAGE; draw(); });
    root.querySelector('#db-store-q').addEventListener('input', function (e) { st.q = e.target.value.trim().toLowerCase(); st.limit = PAGE; draw(); });
    root.querySelector('#db-store-sort').addEventListener('change', function (e) { st.sort = e.target.value; draw(); });
    root.querySelector('#db-store-csv').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; if (f) upload(f); e.target.value = ''; });
  }

  function costFor(sku) { return st.costs && sku ? st.costs.rows[sku] || null : null; }
  function marginOf(price, cost) { return price && cost != null && price > 0 ? { usd: price - cost, pct: Math.round(((price - cost) / price) * 100) } : null; }

  function rowsForTab() {
    if (st.tab === 'more') {
      if (!st.costs) return [];
      var inTiers = {}; st.tiers.forEach(function (p) { if (p.sku) inTiers[p.sku] = true; });
      return Object.keys(st.costs.rows).map(function (k) { return st.costs.rows[k]; }).filter(function (c) { return !inTiers[c.sku] && c.stock > 0; }).map(function (c) {
        return { rank: '', name: c.name, brand: c.brand, url: '', price: c.list, kind: 'LIST', supplier: 'Bangalla', shelf: c.section, min: 'none', why: '', sku: c.sku, cost: c };
      });
    }
    return st.tiers.filter(function (p) { return String(p.tier) === st.tab; }).map(function (p) {
      var o = {}; for (var k in p) o[k] = p[k];
      o.price = p.price ? p.price / 100 : null; o.cost = costFor(p.sku); return o;
    });
  }

  function draw() {
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      var n = b.dataset.tab === 'more' ? (st.costs ? rowsCountMore() : 0) : st.tiers.filter(function (p) { return String(p.tier) === b.dataset.tab; }).length;
      b.textContent = TIERS.filter(function (t) { return t.key === b.dataset.tab; })[0].label + ' (' + n + ')';
      b.setAttribute('aria-pressed', String(b.dataset.tab === st.tab));
    });
    var rows = rowsForTab();
    if (st.q) rows = rows.filter(function (r) { return (r.name + ' ' + (r.brand || '') + ' ' + r.shelf + ' ' + r.supplier + ' ' + (r.sku || '') + ' ' + (r.why || '')).toLowerCase().indexOf(st.q) >= 0; });
    rows.forEach(function (r) { r.margin = r.cost ? marginOf(r.price, r.cost.cost) : null; });
    var by = {
      rank: function (a, b) { return (parseInt(a.rank, 10) || 0) - (parseInt(b.rank, 10) || 0); },
      margin: function (a, b) { return (b.margin ? b.margin.usd : -1e9) - (a.margin ? a.margin.usd : -1e9); },
      price: function (a, b) { return (a.price || 1e9) - (b.price || 1e9); },
      stock: function (a, b) { return (b.cost ? b.cost.stock : -1) - (a.cost ? a.cost.stock : -1); },
      name: function (a, b) { return a.name.localeCompare(b.name); },
    }[st.sort];
    rows.sort(by);

    var tier = TIERS.filter(function (t) { return t.key === st.tab; })[0];
    var withCost = rows.filter(function (r) { return r.margin; });
    var summary = tier.note + ' ' + rows.length + ' shown.';
    if (withCost.length) {
      var avg = Math.round(withCost.reduce(function (a, r) { return a + r.margin.pct; }, 0) / withCost.length);
      var out = rows.filter(function (r) { return r.cost && !(r.cost.stock > 0); }).length;
      summary += ' ' + withCost.length + ' have your cost: average margin ' + avg + '% at the public price' + (out ? ', ' + out + ' out of stock in your file' : '') + '.';
    }
    if (st.tab === 'more' && !st.costs) summary = 'Load your Bangalla file above to see everything else Bangalla has in stock in your categories.';
    status.textContent = summary;

    body.innerHTML = '';
    if (!rows.length) { body.appendChild(el('p', 'db-empty', st.q ? 'Nothing matches that search.' : 'Nothing here yet.')); return; }
    var t = el('table', 'db-table db-store-table');
    t.innerHTML = '<thead><tr><th class="num">#</th><th>Product</th><th>Shelf</th><th>Supplier</th><th class="num">Price</th><th class="num">Your cost</th><th class="num">Margin</th><th class="num">Stock</th><th class="num">lb</th><th>Notes</th></tr></thead>';
    var tb = el('tbody');
    rows.slice(0, st.limit).forEach(function (r) {
      var c = r.cost;
      var flags = [];
      if (c && c.restricted) flags.push('<span class="db-flag" title="Bangalla marks this brand Third Party Restricted: usually no Amazon or marketplaces. Ask whether your own site is fine.">TPR</span>');
      if (c && c.map != null) flags.push('<span class="db-flag" title="Minimum advertised price">MAP ' + esc(usd(c.map)) + '</span>');
      if (c && !(c.stock > 0)) flags.push('<span class="db-flag warn">out of stock</span>');
      if (c && c.lb > 10) flags.push('<span class="db-flag warn">over 10 lb</span>');
      if (c && c.perCase > 1) flags.push('<span class="db-flag" title="Bangalla sells this by the case">case of ' + esc(c.perCase) + '</span>');
      var name = r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a>' : esc(r.name);
      var sub = [r.sku, r.min && r.min !== 'none' ? 'min ' + r.min : ''].filter(Boolean).join(' &middot; ');
      var why = r.why ? '<div class="db-store-why">' + esc(r.why) + '</div>' : '';
      tb.insertAdjacentHTML('beforeend', '<tr>' +
        '<td class="num">' + esc(r.rank) + '</td>' +
        '<td>' + name + (sub ? '<div class="db-store-sub">' + sub + '</div>' : '') + why + '</td>' +
        '<td>' + esc(r.shelf) + '</td>' +
        '<td>' + esc(r.supplier) + '</td>' +
        '<td class="num">' + (r.price ? esc(usd(r.price)) + (r.kind ? '<div class="db-store-sub">' + esc(r.kind.toLowerCase()) + '</div>' : '') : '<span class="db-store-sub">not listed</span>') + '</td>' +
        '<td class="num">' + (c ? esc(usd(c.cost)) : '-') + '</td>' +
        '<td class="num">' + (r.margin ? esc(usd(r.margin.usd)) + '<div class="db-store-sub">' + r.margin.pct + '%</div>' : '-') + '</td>' +
        '<td class="num">' + (c && c.stock != null ? esc(c.stock) : '-') + '</td>' +
        '<td class="num">' + (c && c.lb != null ? esc(c.lb) : '-') + '</td>' +
        '<td>' + flags.join(' ') + '</td></tr>');
    });
    t.appendChild(tb);
    var wrap = el('div', 'db-store-scroll'); wrap.appendChild(t); body.appendChild(wrap);
    if (rows.length > st.limit) {
      var more = el('button', 'db-btn-ghost db-store-more', 'Show ' + Math.min(PAGE, rows.length - st.limit) + ' more (' + (rows.length - st.limit) + ' left)');
      more.type = 'button';
      more.addEventListener('click', function () { st.limit += PAGE; draw(); });
      body.appendChild(more);
    }
  }
  function rowsCountMore() {
    var inTiers = {}; st.tiers.forEach(function (p) { if (p.sku) inTiers[p.sku] = true; });
    return Object.keys(st.costs.rows).filter(function (k) { var c = st.costs.rows[k]; return !inTiers[k] && c.stock > 0; }).length;
  }
  function loadedText() {
    var el2 = root.querySelector('#db-store-loaded');
    if (!st.costs || !st.costs.loaded) { el2.textContent = 'No Bangalla file loaded yet: costs and margins show a dash.'; return; }
    el2.textContent = 'Loaded ' + new Date(st.costs.loaded).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ': ' + st.costs.count.toLocaleString('en-US') + ' Bangalla products' + (st.costs.file ? ' from ' + st.costs.file : '') + (st.preview ? ' (preview: not saved)' : '') + '.';
  }

  function upload(file) {
    var msg = root.querySelector('#db-store-loaded');
    if (!/\.csv$/i.test(file.name)) { msg.textContent = 'That is not the CSV. Choose "Bangalla Product Data csv.csv" (the file beside the Excel one).'; return; }
    msg.textContent = 'Reading ' + file.name + '...';
    var reader = new FileReader();
    reader.onload = function () {
      var want = {}; st.tiers.forEach(function (p) { if (p.sku) want[p.sku] = true; });
      var rows;
      try { rows = rowsFromBangalla(String(reader.result), want); } catch (e) { msg.textContent = e.message; return; }
      var map = {}; rows.forEach(function (r) { map[r.sku] = r; });
      if (st.preview) { st.costs = { loaded: new Date().toISOString(), file: file.name, count: rows.length, rows: map }; loadedText(); draw(); return; }
      msg.textContent = 'Saving ' + rows.length.toLocaleString('en-US') + ' products to your private storage...';
      api({ action: 'save', file: file.name, rows: rows }).then(function () { return api({ action: 'get' }); })
        .then(function (c) { st.costs = c.loaded ? c : null; loadedText(); draw(); })
        .catch(function (e) { msg.textContent = e.message; });
    };
    reader.onerror = function () { msg.textContent = 'That file could not be read.'; };
    reader.readAsText(file);
  }

  function start(container, preview) {
    if (root) return;
    st.preview = !!preview;
    build(container);
    fetch('store-tiers.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      st.tiers = j.products || [];
      draw();
      if (preview) { loadedText(); return; }
      return api({ action: 'get' }).then(function (c) { st.costs = c.loaded ? c : null; loadedText(); draw(); })
        .catch(function (e) { root.querySelector('#db-store-loaded').textContent = 'Could not read your saved file: ' + e.message; });
    }).catch(function () { status.textContent = 'The product list (store-tiers.json) could not be loaded.'; });
  }

  window.DBStore = { start: start, _rowsFromBangalla: rowsFromBangalla };
})();
