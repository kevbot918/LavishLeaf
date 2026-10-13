// The owner's dashboard (2026-10-02, docs/DASHBOARD.md).
//
// Signs in with Netlify Identity (the store's sign-in), asks
// dashboard-data.mjs for the numbers, and draws them in plain words: a few
// "what stands out" sentences, tiles, then one section per question
// ("How many people came?", "How did they find us?" ...). A source that is
// not connected yet shows how to connect it instead of a blank.
(function () {
  'use strict';

  var state = { days: 28, data: null, user: null };
  var $ = function (s, r) { return (r || document).querySelector(s); };

  // ------------------------------------------------------------ helpers
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return n == null || isNaN(n) ? '-' : Math.round(n).toLocaleString('en-US'); }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(n) { return n == null || isNaN(n) ? '-' : Math.round(n) + '%'; }
  function dur(sec) {
    if (sec == null || isNaN(sec)) return '-';
    sec = Math.round(sec);
    return sec < 60 ? sec + 's' : Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
  }
  function change(now, before) {
    if (!before) return null;
    return Math.round(((now - before) / before) * 100);
  }
  function deltaHtml(now, before, days) {
    var c = change(now, before);
    if (c == null) return '<span>No earlier numbers to compare yet</span>';
    if (c === 0) return '<span>Same as the ' + days + ' days before</span>';
    return '<span class="db-delta ' + (c > 0 ? 'up' : 'down') + '">' + (c > 0 ? '▲ ' : '▼ ') + Math.abs(c) + '%</span> vs the ' + days + ' days before';
  }
  function niceDate(iso) {
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function pageName(path) {
    var names = { '/': 'Home', '/index.html': 'Home', '/index': 'Home', '/dashboard.html': 'Dashboard', '/farms.html': 'Farms', '/rec-sports.html': 'Rec Sports', '/gaming.html': 'Gaming', '/symphonymph.html': 'Symphonymph', '/store.html': 'Online Store', '/company.html': 'Company', '/social.html': 'Social', '/privacy.html': 'Privacy', '/refunds.html': 'Refunds', '/terms-of-sale.html': 'Terms of Sale', '/waiver.html': 'Waiver', '/app-feedback.html': 'App feedback', '/p.html': 'Shared playlist', '/p': 'Shared playlist' };
    var clean = String(path).split('?')[0];
    return names[clean] || names[clean + '.html'] || clean;
  }
  // Google reports /store and /store.html (and the same with the domain in
  // front) as different pages; they are one page here (2026-10-12).
  function byPage(rows) {
    var sum = {};
    (rows || []).forEach(function (r) { var n = pageName(String(r.name).replace(/^https?:\/\/[^/]+/, '')); sum[n] = (sum[n] || 0) + (r.value || 0); });
    return Object.keys(sum).map(function (k) { return { name: k, value: sum[k] }; }).sort(function (x, y) { return y.value - x.value; });
  }
  function productName(id) {
    var card = null;
    try { card = document.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(String(id)) : '') + '"] .sp-name'); } catch (e) { card = null; }
    return card ? card.textContent : String(id).replace(/^demo-/, '').replace(/-/g, ' ');
  }

  // ------------------------------------------------------------ the tooltip
  var tip = $('#db-tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14));
    var top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // ------------------------------------------------------------ building blocks
  function section(id, icon, title, why) {
    var s = el('section', 'db-section'); s.id = 'sec-' + id;
    s.appendChild(h('<h2><i class="fas ' + icon + '"></i>' + esc(title) + '</h2>'));
    if (why) s.appendChild(el('p', 'db-why', why));
    return s;
  }
  function card(title, hint) {
    var c = el('div', 'db-card');
    if (title) c.appendChild(el('h3', null, title));
    if (hint) c.appendChild(el('p', 'db-hint', hint));
    return c;
  }
  function notice(part, extra) {
    var isErr = part && part.status === 'error';
    var box = el('div', 'db-setup' + (isErr ? ' err' : ''));
    box.innerHTML = (isErr
      ? '<strong>Could not load this just now.</strong> ' + esc(part.message) + ' Try Refresh in a minute; if it stays, the steps in docs/DASHBOARD.md cover the usual causes.'
      : '<strong>Not connected yet.</strong> ' + esc((part && part.message) || '')) + (extra || '');
    return box;
  }
  /** A bar list: rows of { name, value }, one hue, the number as text. */
  function bars(rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return el('p', 'db-empty', opts.empty || 'Nothing yet for this period.');
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    var ul = el('ul', 'db-bars');
    rows.slice(0, opts.limit || 10).forEach(function (r) {
      var li = el('li');
      var name = opts.label ? opts.label(r) : r.name;
      li.appendChild(el('span', 'n', name));
      li.appendChild(el('span', 'v', opts.fmt ? opts.fmt(r.value) : num(r.value)));
      var track = el('span', 'track'); var fill = el('span', 'fill');
      fill.style.width = Math.max(1, (r.value / max) * 100) + '%';
      track.appendChild(fill); li.appendChild(track);
      li.addEventListener('mousemove', function (e) { showTip('<b>' + esc(name) + '</b><br>' + esc(opts.fmt ? opts.fmt(r.value) : num(r.value)) + (opts.unit ? ' ' + opts.unit : ''), e.clientX, e.clientY); });
      li.addEventListener('mouseleave', hideTip);
      ul.appendChild(li);
    });
    return ul;
  }
  function table(head, rows) {
    var t = el('table', 'db-table');
    t.innerHTML = '<thead><tr>' + head.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead>';
    var tb = el('tbody');
    rows.forEach(function (r) {
      tb.appendChild(h('<tr>' + r.map(function (v, i) { return '<td' + (head[i].num ? ' class="num"' : '') + '>' + esc(v) + '</td>'; }).join('') + '</tr>'));
    });
    t.appendChild(tb);
    return t;
  }

  /** Visitors per day: one line, a crosshair and a tooltip on hover. */
  function lineChart(rows) {
    var wrap = el('div', 'db-chart');
    if (!rows || rows.length < 2) { wrap.appendChild(el('p', 'db-empty', 'Not enough days yet to draw a line.')); return wrap; }
    var W = 800, H = 240, L = 40, R = 12, T = 12, B = 28;
    var max = Math.max.apply(null, rows.map(function (r) { return r.visitors; }));
    var step = niceStep(max);
    var top = Math.max(step, Math.ceil(max / step) * step);
    var x = function (i) { return L + (i / (rows.length - 1)) * (W - L - R); };
    var y = function (v) { return T + (1 - v / top) * (H - T - B); };
    var grid = '', axis = '';
    for (var g = 0; g <= top; g += step) {
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>';
      axis += '<text x="' + (L - 8) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + num(g) + '</text>';
    }
    var every = Math.ceil(rows.length / 7);
    rows.forEach(function (r, i) {
      if (i % every === 0 || i === rows.length - 1) axis += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + niceDate(r.date) + '</text>';
    });
    var pts = rows.map(function (r, i) { return x(i).toFixed(1) + ',' + y(r.visitors).toFixed(1); });
    var area = 'M' + x(0) + ',' + y(0) + ' L' + pts.join(' L') + ' L' + x(rows.length - 1) + ',' + y(0) + ' Z';
    wrap.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Visitors per day">' +
      '<g class="grid">' + grid + '</g><path class="area" d="' + area + '"/><path class="line" d="M' + pts.join(' L') + '"/>' +
      '<g class="axis">' + axis + '</g><line class="cross" y1="' + T + '" y2="' + (H - B) + '" visibility="hidden"/><circle class="dot" r="5" visibility="hidden"/>' +
      '<rect x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" fill="transparent"/></svg>';
    var svg = wrap.querySelector('svg'), cross = svg.querySelector('.cross'), dot = svg.querySelector('.dot');
    svg.addEventListener('mousemove', function (e) {
      var b = svg.getBoundingClientRect();
      var fx = ((e.clientX - b.left) / b.width) * W;
      var i = Math.max(0, Math.min(rows.length - 1, Math.round(((fx - L) / (W - L - R)) * (rows.length - 1))));
      var r = rows[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(r.visitors)); dot.setAttribute('visibility', 'visible');
      showTip('<b>' + niceDate(r.date) + '</b><br>' + num(r.visitors) + ' visitors<br>' + num(r.pageViews) + ' pages viewed', e.clientX, e.clientY);
    });
    svg.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); });
    return wrap;
  }
  function niceStep(max) {
    if (max <= 5) return 1;
    var raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  // ------------------------------------------------------------ the page
  function render(d) {
    state.data = d;
    var days = d.days;
    var ga = d.ga.status === 'ok' ? d.ga.data : null;
    var social = d.social.status === 'ok' ? d.social.data : null;
    var list = d.list.status === 'ok' ? d.list.data : null;
    var orders = d.orders.status === 'ok' ? d.orders.data : null;
    var gsc = d.gsc.status === 'ok' ? d.gsc.data : null;
    var clarity = d.clarity.status === 'ok' ? d.clarity.data : null;

    var when = new Date(d.generated);
    $('#db-updated').textContent = 'The last ' + days + ' days. Numbers from ' + when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + (d.cached ? ' (saved copy; Refresh for the newest)' : '') + '.';

    // ---- what stands out, in sentences
    var ins = $('#db-insights'); ins.textContent = '';
    var lines = [];
    if (ga) {
      var c = change(ga.totals.visitors, ga.before.visitors);
      lines.push(['fa-users', num(ga.totals.visitors) + ' people visited in the last ' + days + ' days' + (c == null ? '.' : c >= 0 ? ', ' + c + '% more than the ' + days + ' days before.' : ', ' + Math.abs(c) + '% fewer than the ' + days + ' days before.')]);
      if (ga.channels[0]) lines.push(['fa-compass', 'Most visits came through ' + ga.channels[0].name.toLowerCase() + ' (' + num(ga.channels[0].value) + ' visits).']);
      var top = byPage(ga.pages)[0];
      if (top) lines.push(['fa-file-lines', 'The most-viewed page was ' + top.name + ', with ' + num(top.value) + ' views.']);
    }
    if (social) {
      var best = [].concat(social.facebook ? social.facebook.posts.map(function (p) { p.net = 'Facebook'; return p; }) : [], social.instagram ? social.instagram.posts.map(function (p) { p.net = 'Instagram'; return p; }) : []).sort(function (a, b) { return b.total - a.total; })[0];
      if (best && best.total) lines.push(['fa-heart', 'Your most-liked recent post is on ' + best.net + ' (' + num(best.total) + ' likes, comments and shares): "' + (best.text || 'a photo').slice(0, 60) + (best.text && best.text.length > 60 ? '...' : '') + '"']);
    }
    if (list && list.newThisMonth) lines.push(['fa-envelope-open-text', list.newThisMonth + ' new newsletter subscriber' + (list.newThisMonth === 1 ? '' : 's') + ' in the last 30 days.']);
    lines.slice(0, 4).forEach(function (l) { ins.appendChild(h('<div class="db-insight"><i class="fas ' + l[0] + '"></i><span>' + esc(l[1]) + '</span></div>')); });

    // ---- tiles
    var tiles = $('#db-tiles'); tiles.textContent = '';
    function tile(label, icon, value, note, off, href, id) {
      var tag = href ? 'a' : 'div';
      tiles.appendChild(h('<' + tag + (href ? ' href="' + href + '"' : '') + (id ? ' id="' + id + '"' : '') + ' class="db-tile' + (off ? ' off' : '') + (href ? ' db-tile-link' : '') + '"><div class="db-tile-label"><i class="fas ' + icon + '"></i>' + esc(label) + (href ? ' <i class="fas fa-arrow-down db-tile-go"></i>' : '') + '</div><div class="db-tile-value">' + esc(value) + '</div><div class="db-tile-note">' + note + '</div></' + tag + '>'));
    }
    if (ga) {
      tile('Visitors', 'fa-users', num(ga.totals.visitors), deltaHtml(ga.totals.visitors, ga.before.visitors, days));
      tile('Pages viewed', 'fa-eye', num(ga.totals.pageViews), deltaHtml(ga.totals.pageViews, ga.before.pageViews, days));
      tile('Time on the site', 'fa-clock', dur(ga.totals.avgVisitSeconds), 'An average visit. Longer means people are reading.');
      var signups = (ga.events.filter(function (e) { return e.key === 'sign_up_click'; })[0] || { now: 0, before: 0 });
      tile('Sign-up clicks', 'fa-hand-pointer', num(signups.now), deltaHtml(signups.now, signups.before, days));
    } else {
      tile('Visitors', 'fa-users', 'Connect Google', 'See "How many people came" below.', true);
    }
    if (list) tile('Newsletter', 'fa-envelope', num(list.active), num(list.newThisMonth) + ' joined in the last 30 days');
    // Orders and sign-ups: each tile jumps to its section (owner, 2026-10-12);
    // the counts fill in as the sections load.
    tile('Orders', 'fa-bag-shopping', '...', orders ? money(orders.revenue) + ' in the last ' + days + ' days' : 'loading', false, '#sec-orders', 'tile-orders');
    tile('Compost sign-ups', 'fa-seedling', '...', 'loading', false, '#sec-pickups', 'tile-compost');
    tile('Recycling sign-ups', 'fa-recycle', '...', 'loading', false, '#sec-pickups', 'tile-recycle');
    tile('Sports registrations', 'fa-futbol', '...', 'loading', false, '#sec-registrations', 'tile-regs');
    if (social) {
      var f = (social.facebook && social.facebook.followers) || 0, ig = (social.instagram && social.instagram.followers) || 0;
      var gr = social.growth;
      var sign = function (n) { return n == null ? '-' : (n > 0 ? '+' : '') + num(n); };
      tile('New followers', 'fa-share-nodes', gr ? sign((gr.facebook || 0) + (gr.instagram || 0)) : '-',
        gr ? sign(gr.facebook) + ' Facebook, ' + sign(gr.instagram) + ' Instagram ' + (gr.complete ? 'in the last ' + days + ' days' : 'since ' + niceDate(gr.from) + ' (counting began then)') + '. Now ' + num(f) + ' and ' + num(ig) + '.'
           : num(f) + ' on Facebook, ' + num(ig) + ' on Instagram. Growth appears from tomorrow.');
    }

    // ---- sections
    var root = $('#db-sections'); root.textContent = '';

    // 1. visitors over time
    var s1 = section('visitors', 'fa-chart-line', 'How many people came', 'Visitors are counted once per person per day. Hover over the line to see any day.');
    if (ga) { var c1 = card(null); c1.appendChild(lineChart(ga.daily)); s1.appendChild(c1); }
    else s1.appendChild(notice(d.ga));
    root.appendChild(s1);

    // 2. how they found us
    var s2 = section('sources', 'fa-compass', 'How people found us', 'Where each visit started. "Organic social" is Facebook and Instagram posts; "Organic search" is Google; "Direct" is typing the address or a bookmark.');
    if (ga) {
      var g2 = el('div', 'db-grid');
      var a = card('By kind of visit'); a.appendChild(bars(ga.channels, { unit: 'visits' })); g2.appendChild(a);
      var b = card('By website or app', 'The exact site each visit came from.'); b.appendChild(bars(ga.sources, { unit: 'visits' })); g2.appendChild(b);
      var cc = card('Where they are', 'Cities, from the visitor\'s internet connection (approximate).'); cc.appendChild(bars(ga.cities, { unit: 'people' })); g2.appendChild(cc);
      var dv = card('What they use'); dv.appendChild(bars(ga.devices.map(function (r) { return { name: r.name.charAt(0).toUpperCase() + r.name.slice(1), value: r.value }; }), { unit: 'people' })); g2.appendChild(dv);
      s2.appendChild(g2);
    } else s2.appendChild(notice(d.ga));
    root.appendChild(s2);

    // 3. what they read and did
    var s3 = section('activity', 'fa-hand-pointer', 'What people looked at and clicked', 'The pages people read, and the buttons that matter.');
    if (ga) {
      var g3 = el('div', 'db-grid');
      var p3 = card('Most-viewed pages'); p3.appendChild(bars(byPage(ga.pages), { unit: 'views' })); g3.appendChild(p3);
      var e3 = card('Clicks that matter', 'Counted on every page since 2 October 2026.'); e3.appendChild(bars(ga.events.map(function (e) { return { name: e.label, value: e.now }; }), { unit: 'times', empty: 'No clicks counted yet. They start the day this dashboard went live.' })); g3.appendChild(e3);
      s3.appendChild(g3);
    } else s3.appendChild(notice(d.ga));
    root.appendChild(s3);

    // 4. store interest
    var s4 = section('store', 'fa-store', 'What people want from the store', 'Which products get attention, and what people search for. Use this to decide what to stock.');
    if (ga) {
      var g4 = el('div', 'db-grid');
      var interest = {};
      ga.products.forEach(function (r) { interest[r.name] = (interest[r.name] || 0) + r.value; });
      var pRows = Object.keys(interest).map(function (k) { return { name: productName(k), value: interest[k] }; }).sort(function (x, y) { return y.value - x.value; });
      var c4 = card('Products people clicked', 'Add to cart, wish-list hearts, sign-ups and supplier pages, added together.');
      c4.appendChild(ga.customDimensions ? bars(pRows, { unit: 'clicks', empty: 'No product clicks yet.' }) : notice({ status: 'setup', message: 'Register the custom dimension "product" in Google Analytics (docs/DASHBOARD.md, step 5) to see this.' }));
      g4.appendChild(c4);
      var c5 = card('Searched in the store');
      c5.appendChild(ga.customDimensions ? bars(ga.searches, { unit: 'searches', empty: 'No store searches yet.' }) : notice({ status: 'setup', message: 'Register the custom dimension "search_term" in Google Analytics (docs/DASHBOARD.md, step 5).' }));
      g4.appendChild(c5);
      if (orders && orders.bestSellers.length) { var c6 = card('Best sellers'); c6.appendChild(bars(orders.bestSellers, { unit: 'sold' })); g4.appendChild(c6); }
      s4.appendChild(g4);
    } else s4.appendChild(notice(d.ga));
    root.appendChild(s4);

    // 5. Google search
    var s5 = section('google', 'fa-magnifying-glass', 'What people searched on Google', 'From Search Console. "Shown" is how often Google showed us in its results; "Clicks" is how often someone chose us. Google reports two days late.');
    if (gsc) {
      var g5 = el('div', 'db-grid');
      var q = card('Searches that found us', num(gsc.clicks) + ' clicks from ' + num(gsc.impressions) + ' times shown, ' + niceDate(gsc.from) + ' to ' + niceDate(gsc.to) + '.');
      q.appendChild(gsc.queries.length ? table([{ label: 'Search' }, { label: 'Clicks', num: true }, { label: 'Shown', num: true }, { label: 'Place', num: true }], gsc.queries.map(function (r) { return [r.name, num(r.clicks), num(r.impressions), r.position]; })) : el('p', 'db-empty', 'No searches yet. New sites take a few weeks to appear.'));
      g5.appendChild(q);
      var pg = card('Pages people reached from Google'); pg.appendChild(bars(byPage(gsc.pages.map(function (r) { return { name: r.name, value: r.clicks }; })), { unit: 'clicks' })); g5.appendChild(pg);
      s5.appendChild(g5);
    } else s5.appendChild(notice(d.gsc));
    root.appendChild(s5);

    // 6. social
    var s6 = section('social', 'fa-share-nodes', 'Facebook and Instagram', 'Your recent posts, most liked first. For reach (how many people saw a post), open Meta Business Suite.');
    if (social) {
      ['facebook', 'instagram'].forEach(function (net) {
        var nd = social[net];
        if (!nd) return;
        var c7 = card((net === 'facebook' ? 'Facebook' : 'Instagram') + ': ' + num(nd.followers) + ' followers', 'Recent posts, ranked by likes + comments + shares.');
        var grid = el('div', 'db-posts');
        nd.posts.slice().sort(function (x, y) { return y.total - x.total; }).slice(0, 8).forEach(function (p) {
          var a7 = el('a', 'db-post'); a7.href = p.url; a7.target = '_blank'; a7.rel = 'noopener';
          a7.appendChild(p.image ? h('<img src="' + esc(p.image) + '" alt="" loading="lazy">') : el('div', 'ph', p.text || 'A post'));
          a7.appendChild(h('<div class="meta"><div class="t">' + esc(niceDate(p.date)) + (p.text ? ': ' + esc(p.text) : '') + '</div><div class="s"><span><i class="fas fa-heart"></i>' + num(p.likes) + '</span><span><i class="fas fa-comment"></i>' + num(p.comments) + '</span>' + (net === 'facebook' ? '<span><i class="fas fa-share"></i>' + num(p.shares) + '</span>' : '') + '</div></div>'));
          grid.appendChild(a7);
        });
        c7.appendChild(nd.posts.length ? grid : el('p', 'db-empty', 'No posts yet.'));
        s6.appendChild(c7);
        s6.appendChild(el('div')).style.height = '12px';
      });
      (social.errors || []).forEach(function (m) { s6.appendChild(notice({ status: 'error', message: m })); });
    } else s6.appendChild(notice(d.social));
    s6.appendChild(h('<div class="db-links"><a href="https://business.facebook.com/latest/insights" target="_blank" rel="noopener"><i class="fas fa-chart-simple"></i>Meta Business Suite insights</a></div>'));
    root.appendChild(s6);

    // 7. behaviour (Clarity)
    var s7 = section('behavior', 'fa-arrow-pointer', 'How people use the pages', 'From Microsoft Clarity, the last 3 days. Open Clarity to watch real visits and see heatmaps of where people click and how far they scroll.');
    if (clarity) {
      var st = el('div', 'db-stats');
      function stat(v, l, e, good) { st.appendChild(h('<div class="db-stat"><div class="v ' + (good === true ? 'good' : good === false ? 'watch' : '') + '">' + esc(v) + '</div><div class="l">' + esc(l) + '</div><div class="e">' + esc(e) + '</div></div>')); }
      stat(num(clarity.sessions), 'Visits recorded', 'Every visit Clarity saw (bots left out).');
      stat(pct(clarity.scrollDepth), 'How far people scroll', 'On average. Under 50% means most never see the bottom of a page.', clarity.scrollDepth == null ? null : clarity.scrollDepth >= 50);
      stat(dur(clarity.activeSeconds), 'Active time per visit', 'Time spent actually reading, moving or clicking.');
      stat(pct(clarity.rageClicks), 'Visits with rage clicks', 'Clicking the same spot again and again: something looks clickable and is not, or is slow.', clarity.rageClicks == null ? null : clarity.rageClicks < 5);
      stat(pct(clarity.deadClicks), 'Visits with dead clicks', 'A click that did nothing. Worth checking in the heatmaps.', clarity.deadClicks == null ? null : clarity.deadClicks < 15);
      stat(pct(clarity.quickBacks), 'Quick backs', 'Opened a page and left at once: it was not what they expected.', clarity.quickBacks == null ? null : clarity.quickBacks < 10);
      s7.appendChild(st);
    } else s7.appendChild(notice(d.clarity));
    s7.appendChild(h('<div class="db-links"><a href="https://clarity.microsoft.com/projects/view/yrei9vub09/heatmaps" target="_blank" rel="noopener"><i class="fas fa-fire"></i>Heatmaps</a><a href="https://clarity.microsoft.com/projects/view/yrei9vub09/impressions" target="_blank" rel="noopener"><i class="fas fa-circle-play"></i>Recordings</a><a href="https://clarity.microsoft.com/projects/view/yrei9vub09/dashboard" target="_blank" rel="noopener"><i class="fas fa-gauge"></i>Clarity dashboard</a></div>'));
    root.appendChild(s7);

    // 7b. Symphonymph downloads (owner, 2026-10-10)
    var sd = section('downloads', 'fa-mobile-screen', 'Symphonymph downloads', 'Taps on the APK download links on the Symphonymph page, counted by Google Analytics. A visitor with an ad blocker is not counted, so the real number is somewhat higher.');
    if (ga) {
      var dl = ga.downloads || { daily: [], allTime: 0, byFile: [] };
      var tapsNow = (ga.events.filter(function (e) { return e.key === 'app_download'; })[0] || { now: 0, before: 0 });
      var gd = el('div', 'db-grid');
      var cd = card('Download taps');
      var st2 = el('div', 'db-stats');
      st2.appendChild(h('<div class="db-stat"><div class="v">' + esc(num(tapsNow.now)) + '</div><div class="l">In the last ' + days + ' days</div><div class="e">' + deltaHtml(tapsNow.now, tapsNow.before, days) + '</div></div>'));
      st2.appendChild(h('<div class="db-stat"><div class="v">' + esc(num(dl.allTime)) + '</div><div class="l">Since ' + esc(niceDate(dl.since || '2026-10-02')) + '</div><div class="e">Every tap since counting began.</div></div>'));
      cd.appendChild(st2);
      gd.appendChild(cd);
      var bb = dl.byBuild || { store: 0, alpha: 0, unknown: 0 };
      var cf = card('By build', 'Since counting began. Both are phone apps: the App Store build, and the Alpha build with the extra sources. Taps before 10 October did not record which link.');
      var bRows = [{ name: 'App Store build', value: bb.store }, { name: 'Alpha build', value: bb.alpha }];
      if (bb.unknown) bRows.push({ name: 'Before 10 Oct (link not recorded)', value: bb.unknown });
      cf.appendChild(bars(bRows, { unit: 'taps', empty: 'No taps yet.' }));
      gd.appendChild(cf);
      var cdd = card('Day by day');
      cdd.appendChild(bars(dl.daily.slice().reverse().map(function (r) { return { name: niceDate(r.date), value: r.value }; }), { unit: 'taps', limit: 14, empty: 'No taps in this period.' }));
      gd.appendChild(cdd);
      sd.appendChild(gd);
    } else sd.appendChild(notice(d.ga));
    root.appendChild(sd);

    // 7c. affiliates (owner, 2026-10-10: "save our affiliates somewhere so I
    // remember to check payouts"). The list is affiliates.json.
    var sa = section('affiliates', 'fa-handshake', 'Affiliate programs and suppliers', 'Green Swaps partners (where to check earnings and when they pay) and the suppliers we sell from or are applying to. Both lists live in affiliates.json; ask Claude to update them.');
    var ca = card(null);
    ca.appendChild(el('p', 'db-hint', 'Loading the list...'));
    sa.appendChild(ca);
    root.appendChild(sa);
    fetch('/affiliates.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      ca.textContent = '';
      var rows = (j.programmes || []).map(function (p) { return [p.name, p.status, p.commission || '-', p.network || '-', (p.payout || '-') + (p.where ? '. ' + p.where : '')]; });
      ca.appendChild(el('h3', null, 'Affiliate programs'));
      ca.appendChild(rows.length ? table([{ label: 'Program' }, { label: 'Status' }, { label: 'Pays' }, { label: 'Network' }, { label: 'Payout' }], rows) : el('p', 'db-empty', 'No programs yet.'));
      var lk = el('div', 'db-links');
      (j.programmes || []).forEach(function (p) {
        if (p.dashboard) lk.appendChild(h('<a href="' + esc(p.dashboard) + '" target="_blank" rel="noopener"><i class="fas fa-sack-dollar"></i>' + esc(p.name) + ' earnings</a>'));
      });
      ca.appendChild(lk);
      if (j.check) ca.appendChild(el('p', 'db-hint', j.check));
      var sup = j.suppliers || [];
      if (sup.length) {
        var cs = card('Suppliers', 'Approved first, then waiting, then the ones to apply to.');
        var rank = function (x) { return /^approved/i.test(x.status) ? 0 : /appl|wait/i.test(x.status) ? 1 : 2; };
        var srt = sup.slice().sort(function (x, y) { return rank(x) - rank(y); });
        var stt = el('table', 'db-table'); stt.innerHTML = '<thead><tr><th>Supplier</th><th>Status</th><th>What they carry</th><th>How</th></tr></thead>';
        var stb = el('tbody');
        srt.forEach(function (x) { var tr = el('tr'); var tdN = el('td'); var a = el('a', null, x.name); a.href = x.url; a.target = '_blank'; a.rel = 'noopener'; tdN.appendChild(a); tr.appendChild(tdN); tr.appendChild(el('td', 'db-st-' + rank(x), x.status)); tr.appendChild(el('td', null, x.what)); tr.appendChild(el('td', null, x.how)); stb.appendChild(tr); });
        stt.appendChild(stb);
        var sw = el('div', 'db-table-wrap'); sw.appendChild(stt); cs.appendChild(sw); sa.appendChild(cs);
      }
      // Clicks on the partner links, from Google Analytics.
      var aff = ga && ga.affiliates;
      if (aff) {
        var g9 = el('div', 'db-grid');
        var k1 = card('Partner link clicks, last ' + days + ' days', 'Every click on a Green Swaps or SeedsNow link, by site.');
        k1.appendChild(bars(aff.now.bySite, { unit: 'clicks', empty: 'No partner clicks in this period yet.' }));
        g9.appendChild(k1);
        var k2 = card('Most-clicked partner links', 'Since counting began on 10 October 2026.');
        k2.appendChild(bars(aff.allTime.byLink, { unit: 'clicks', limit: 12, empty: 'No partner clicks yet.' }));
        g9.appendChild(k2);
        sa.appendChild(g9);
      } else sa.appendChild(notice(d.ga));
    }).catch(function () { ca.textContent = ''; ca.appendChild(el('p', 'db-empty', 'Could not read affiliates.json just now.')); });

    // 7c2. Making a Difference (2026-10-11): the totals on the Home and Farms
    // pages. Change a number and Save; the pages show it within 10 minutes.
    var si = section('impact', 'fa-seedling', 'Making a Difference', 'The running totals on the Home and Farms pages. Add to them after each pick-up run; the pages update within 10 minutes. Leave a value at 0 to hide that stat.');
    var ci = card(null); si.appendChild(ci); root.appendChild(si);
    var rowsBox = el('div', 'db-impact'); ci.appendChild(rowsBox);
    var imsg = el('p', 'db-hint', '');
    function impactRow(st) {
      var r = el('div', 'db-impact-row');
      r.innerHTML = '<input type="text" class="db-imp-label" maxlength="120" placeholder="What it counts, e.g. Households on our pick-up routes"><input type="number" class="db-imp-value" min="0" step="1"><input type="text" class="db-imp-unit" maxlength="12" placeholder="lb"><label class="db-imp-plus"><input type="checkbox"> show +</label><button type="button" class="db-btn-ghost db-imp-del" title="Remove">&times;</button>';
      r.querySelector('.db-imp-label').value = st.label || '';
      r.querySelector('.db-imp-value').value = st.value || 0;
      r.querySelector('.db-imp-unit').value = st.unit || '';
      r.querySelector('.db-imp-plus input').checked = !!st.plus;
      r.dataset.key = st.key || ('stat-' + Date.now().toString(36));
      r.querySelector('.db-imp-del').addEventListener('click', function () { r.remove(); });
      rowsBox.appendChild(r);
    }
    var ibar = el('div', 'db-links');
    var bAdd = h('<button type="button" class="db-btn-ghost"><i class="fas fa-plus"></i> Add a stat</button>');
    var bSave = h('<button type="button" class="db-btn-ghost"><i class="fas fa-floppy-disk"></i> Save to the website</button>');
    ibar.appendChild(bAdd); ibar.appendChild(bSave); ci.appendChild(ibar); ci.appendChild(imsg);
    bAdd.addEventListener('click', function () { impactRow({ label: '', value: 0, unit: '', plus: false }); });
    bSave.addEventListener('click', function () {
      var stats = Array.prototype.map.call(rowsBox.querySelectorAll('.db-impact-row'), function (r) {
        return { key: r.dataset.key, label: r.querySelector('.db-imp-label').value.trim(), value: Number(r.querySelector('.db-imp-value').value) || 0, unit: r.querySelector('.db-imp-unit').value.trim(), plus: r.querySelector('.db-imp-plus input').checked };
      }).filter(function (x) { return x.label; });
      imsg.textContent = 'Saving...';
      api('impact', { action: 'save', stats: stats }).then(function (r) { imsg.textContent = 'Saved (' + r.stats.length + ' stats, ' + r.updated + '). The pages show it within 10 minutes.'; })
        .catch(function (e) { imsg.textContent = e.message; });
    });
    fetch('/.netlify/functions/impact', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      (d.stats || []).forEach(impactRow);
      imsg.textContent = d.updated ? 'Last saved ' + d.updated + '.' : '';
    }).catch(function () { imsg.textContent = 'Could not read the current totals.'; });
    ci.appendChild(el('p', 'db-hint', 'Ideas worth tracking: households on the compost and recycling routes; pick-ups made; bags or buckets of finished compost given back to gardens; seedlings or trees planted; players and teams in the leagues; community events hosted.'));

    // 7c3. Pick-ups (2026-10-11, reworked 2026-10-12): every compost and
    // recycling sign-up, the pick-up day and status (saved to Blobs "pickups",
    // strong reads, so a change shows on the next load), cancel the PayPal
    // subscription, email the customer their day, remove unfinished ones, a
    // spreadsheet export, and the route planner (routes.mjs).
    var sp = section('pickups', 'fa-truck', 'Pick-ups and routes', 'Compost and recycling customers, their pick-up day, and each day\'s route in driving order. PayPal keeps this up to date by itself once its webhook is set (OWNER-STEPS): payments, refunds and cancellations land here.');
    var cp = card(null); sp.appendChild(cp); root.appendChild(sp);
    var cr = card('Routes', 'Active customers only. Miles are estimates (straight line x 1.25); the Maps links give the real road route.'); sp.appendChild(cr);
    cp.appendChild(el('p', 'db-hint', 'Loading...'));
    var PDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var signups = [], R = null, showAllPick = false;
    var DAY_MS = 864e5;
    function routeDay(s) { return s.assignedDay || s.day; }
    function onRoute(s) { return s.status === 'active' || s.status === 'approved'; }
    function unfinished(s) { return s.status === 'pending' && Date.now() - Date.parse(s.created) > 2 * DAY_MS; }
    function stopOf(s) { return { id: s.id, lat: s.lat, lon: s.lon, day: s.day, name: s.name, address: s.street + ', ' + s.city + ', OK ' + s.zip, s: s }; }
    function phoneFmt(p) { return String(p || '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3'); }
    function pickAct(s, action, extra, msgEl) {
      if (msgEl) msgEl.textContent = 'Saving...';
      return api('pickups', Object.assign({ action: action, id: s.id }, extra || {})).then(function (r) {
        if (r.removed) signups = signups.filter(function (x) { return x !== s; }); else Object.assign(s, r.signup);
        drawTable(); drawRoutes(); fillTiles();
      }).catch(function (e) { if (msgEl) msgEl.textContent = e.message; else alert(e.message); });
    }
    function csv(rows, cols, name) {
      var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([cols.join(',') + '\n' + rows.map(function (x) { return cols.map(function (c) { return q(x[c]); }).join(','); }).join('\n')], { type: 'text/csv' }));
      a.download = name + '-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
    }
    function drawTable() {
      cp.textContent = '';
      if (!signups.length) { cp.appendChild(el('p', 'db-empty', 'No sign-ups yet. Each one appears here with its address, preferred day, bucket and instructions.')); return; }
      var hidden = signups.filter(unfinished);
      var shown = showAllPick ? signups : signups.filter(function (s) { return !unfinished(s); });
      var bar = el('div', 'db-links');
      var bx = h('<button type="button" class="db-btn-ghost"><i class="fas fa-file-csv"></i> Download as a spreadsheet (CSV)</button>');
      bx.addEventListener('click', function () { csv(signups.map(function (s) { return Object.assign({}, s, { pickupDay: routeDay(s) }); }), ['created', 'productName', 'status', 'name', 'phone', 'email', 'street', 'city', 'zip', 'day', 'pickupDay', 'bucket', 'notes', 'subscriptionId'], 'lavish-leaf-pickups'); });
      bar.appendChild(bx);
      if (hidden.length) {
        var bh = h('<button type="button" class="db-btn-ghost"><i class="fas fa-eye"></i> ' + (showAllPick ? 'Hide' : 'Show') + ' ' + hidden.length + ' unfinished sign-up' + (hidden.length === 1 ? '' : 's') + '</button>');
        bh.addEventListener('click', function () { showAllPick = !showAllPick; drawTable(); });
        bar.appendChild(bh);
      }
      cp.appendChild(bar);
      cp.appendChild(el('p', 'db-hint', '"Pending" means they did not finish on PayPal; after 2 days they are hidden, after 30 days deleted. Refunding a payment in PayPal does NOT stop the monthly charge: use Cancel subscription.'));
      var t = el('table', 'db-table db-pick');
      t.innerHTML = '<thead><tr><th>Signed up</th><th>Customer</th><th>Address</th><th>Asked for</th><th>Pick-up day</th><th>Status</th><th>Bucket</th><th>Instructions</th><th></th></tr></thead>';
      var tb = el('tbody');
      shown.forEach(function (s) {
        var tr = el('tr');
        tr.appendChild(el('td', null, String(s.created || '').slice(0, 10) + ' · ' + s.productName));
        tr.appendChild(el('td', null, s.name + ' · ' + phoneFmt(s.phone) + ' · ' + s.email));
        tr.appendChild(el('td', null, s.street + ', ' + s.city + ' ' + s.zip + (s.area && s.area.miles != null ? ' (' + s.area.miles + ' mi)' : '') + (Number.isFinite(s.lat) ? '' : ' · not on the map')));
        tr.appendChild(el('td', null, s.day));
        var msg = el('span', 'db-hint');
        var dsel = el('select'); dsel.setAttribute('aria-label', 'Pick-up day for ' + s.name);
        PDAYS.forEach(function (d) { var o = el('option', null, d); o.value = d; if (d === routeDay(s)) o.selected = true; dsel.appendChild(o); });
        dsel.addEventListener('change', function () { pickAct(s, 'update', { assignedDay: dsel.value }, msg); });
        var td1 = el('td'); td1.appendChild(dsel);
        if (s.dayMailed) td1.appendChild(el('div', 'db-hint', 'Emailed ' + niceDate(s.dayMailed) + (s.dayMailedFor && s.dayMailedFor !== routeDay(s) ? ' (' + s.dayMailedFor + ')' : '')));
        tr.appendChild(td1);
        var st = s.status === 'approved' ? 'active' : s.status;
        var stTd = el('td', null, st + (s.lastPaid ? ' · paid ' + niceDate(s.lastPaid) : '') + ((s.refunds || []).length ? ' · refunded ' + money(s.refunds.reduce(function (a, r) { return a + r.cents; }, 0) / 100) : ''));
        tr.appendChild(stTd);
        tr.appendChild(el('td', null, s.bucket ? 'Ours ($10)' : 'Own'));
        tr.appendChild(el('td', null, s.notes || ''));
        var act = el('td', 'db-actions');
        if (st === 'active') {
          var be = h('<button type="button" class="db-btn-ghost db-btn-sm"><i class="fas fa-envelope"></i> Email pick-up day</button>');
          be.addEventListener('click', function () {
            var note = window.prompt('Email ' + s.name + ' that their pick-up day is ' + routeDay(s) + '. Add a short note (optional):', '');
            if (note === null) return;
            pickAct(s, 'emailDay', { note: note }, msg);
          });
          act.appendChild(be);
          var bc = h('<button type="button" class="db-btn-ghost db-btn-sm"><i class="fas fa-ban"></i> Cancel subscription</button>');
          bc.addEventListener('click', function () { if (window.confirm('Cancel ' + s.name + '\'s ' + s.productName + ' in PayPal? They will not be charged again and get an email saying so.')) pickAct(s, 'cancel', {}, msg); });
          act.appendChild(bc);
        }
        if (st === 'pending' || st === 'canceled' || st === 'paused') {
          var br = h('<button type="button" class="db-btn-ghost db-btn-sm"><i class="fas fa-trash"></i> Remove</button>');
          br.addEventListener('click', function () { if (window.confirm('Remove ' + s.name + ' from this list for good?')) pickAct(s, 'remove', {}, msg); });
          act.appendChild(br);
        }
        act.appendChild(msg);
        tr.appendChild(act);
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      var wrap = el('div', 'db-table-wrap'); wrap.appendChild(t); cp.appendChild(wrap);
    }
    function routeBlock(day, stops) {
      var box = el('div', 'db-route');
      var r = R.orderRoute(stops);
      box.appendChild(el('h4', null, day + ': ' + r.stops.length + ' stop' + (r.stops.length === 1 ? '' : 's') + ', about ' + r.miles + ' miles'));
      var ol = el('ol');
      r.stops.forEach(function (st) { ol.appendChild(el('li', null, st.name + ', ' + st.address + (st.s.bucket ? ' · bring a bucket' : '') + (st.s.notes ? ' · ' + st.s.notes : ''))); });
      box.appendChild(ol);
      var links = el('div', 'db-links');
      R.mapsLinks(r.stops).forEach(function (u, i, all) {
        var a = el('a', 'db-btn-ghost', all.length > 1 ? 'Open in Google Maps, part ' + (i + 1) : 'Open in Google Maps');
        a.href = u; a.target = '_blank'; a.rel = 'noopener'; links.appendChild(a);
      });
      box.appendChild(links);
      return { box: box, miles: r.miles };
    }
    function drawRoutes() {
      if (!R) return;
      cr.querySelectorAll('.db-route, .db-suggest, .db-empty, .db-total').forEach(function (n) { n.remove(); });
      var live = signups.filter(onRoute);
      var mapped = live.filter(function (s) { return Number.isFinite(s.lat); });
      if (!live.length) { cr.appendChild(el('p', 'db-empty', 'No active customers yet. Their routes appear here as soon as PayPal says they are active.')); return; }
      var total = 0;
      PDAYS.forEach(function (d) {
        var stops = mapped.filter(function (s) { return routeDay(s) === d; }).map(stopOf);
        if (!stops.length) return;
        var b = routeBlock(d, stops); total += b.miles; cr.appendChild(b.box);
      });
      var unmapped = live.length - mapped.length;
      cr.appendChild(el('p', 'db-total', 'This week: about ' + Math.round(total) + ' miles over ' + new Set(mapped.map(routeDay)).size + ' day(s).' + (unmapped ? ' ' + unmapped + ' customer(s) could not be placed on the map; add them by hand.' : '')));
      var sg = el('div', 'db-suggest');
      sg.appendChild(el('h4', null, 'Save fuel: group customers by area'));
      sg.appendChild(el('p', 'db-hint', 'Splits active customers into route days by direction from the farm, so each day drives one area. Each group keeps the day most of its customers asked for when it can. After you apply it, use "Email pick-up day" to tell each customer.'));
      var row = el('div', 'db-links');
      var kIn = el('input'); kIn.type = 'number'; kIn.min = '1'; kIn.max = '7'; kIn.value = String(Math.max(1, Math.min(7, Math.ceil(mapped.length / 12)))); kIn.setAttribute('aria-label', 'Route days per week'); kIn.style.width = '4em';
      var bS = h('<button type="button" class="db-btn-ghost"><i class="fas fa-route"></i> Suggest route days</button>');
      row.appendChild(el('span', 'db-hint', 'Route days a week:')); row.appendChild(kIn); row.appendChild(bS);
      sg.appendChild(row);
      var out = el('div'); sg.appendChild(out);
      bS.addEventListener('click', function () {
        out.textContent = '';
        var plan = R.suggestDays(mapped.map(stopOf), Number(kIn.value) || 1);
        var miles = 0, kept = 0;
        plan.forEach(function (g) { miles += g.route.miles; kept += g.kept; });
        out.appendChild(el('p', null, 'Suggested: about ' + Math.round(miles) + ' miles a week (now ' + Math.round(total) + '). ' + kept + ' of ' + mapped.length + ' customers keep the day they asked for.'));
        var t = el('table', 'db-table'); t.innerHTML = '<thead><tr><th>Day</th><th>Customers</th><th>Miles</th></tr></thead>';
        var tb = el('tbody');
        plan.forEach(function (g) { var tr = el('tr'); tr.appendChild(el('td', null, g.day)); tr.appendChild(el('td', null, g.customers.map(function (c) { return c.name + ' (' + c.s.city + ')'; }).join(', '))); tr.appendChild(el('td', 'num', String(g.route.miles))); tb.appendChild(tr); });
        t.appendChild(tb); out.appendChild(t);
        var bA = h('<button type="button" class="db-btn-ghost"><i class="fas fa-check"></i> Use these days</button>');
        var msg = el('p', 'db-hint', '');
        bA.addEventListener('click', function () {
          bA.disabled = true; msg.textContent = 'Saving...';
          var moves = [];
          plan.forEach(function (g) { g.customers.forEach(function (c) { if (routeDay(c.s) !== g.day) moves.push({ s: c.s, day: g.day }); }); });
          moves.reduce(function (p, m) { return p.then(function () { return api('pickups', { action: 'update', id: m.s.id, assignedDay: m.day }).then(function (r) { Object.assign(m.s, r.signup); }); }); }, Promise.resolve())
            .then(function () {
              msg.textContent = moves.length ? 'Saved. ' + moves.length + ' customer(s) have a new day; email each one from the list above.' : 'Nothing to change.';
              drawTable(); drawRoutes();
            }).catch(function (e) { msg.textContent = e.message; bA.disabled = false; });
        });
        out.appendChild(bA); out.appendChild(msg);
      });
      cr.appendChild(sg);
    }
    Promise.all([api('pickups', { action: 'list' }), import('/routes.mjs')]).then(function (res) {
      signups = res[0].signups || []; R = res[1];
      drawTable(); drawRoutes(); fillTiles();
    }).catch(function (e) { cp.textContent = ''; cp.appendChild(el('p', 'db-empty', e.message)); });

    // 7c4. League registrations (2026-10-12): every player and team roster,
    // filtered by league, with Remove (refunded, dropped out) and a
    // spreadsheet export (one row a person).
    var sr = section('registrations', 'fa-futbol', 'League registrations', 'Every player and team roster from the registration forms. A refund in PayPal takes the registration off by itself once the webhook is set; Remove does it by hand.');
    var crg = card(null); sr.appendChild(crg); root.appendChild(sr);
    crg.appendChild(el('p', 'db-hint', 'Loading...'));
    var regsAll = [], regLeague = 'all', regShowAll = false;
    function regRows(list) {
      var rows = [];
      list.forEach(function (o) {
        o.regs.forEach(function (g) {
          var people = g.kind === 'team' ? [Object.assign({ role: 'Captain' }, g.captain)].concat(g.players.map(function (p) { return Object.assign({ role: 'Player' }, p); })) : [{ role: 'Player', name: g.name, phone: g.phone, email: g.email }];
          people.forEach(function (p) { rows.push({ o: o, date: String(o.created || '').slice(0, 10), status: o.status, league: g.league || g.productName, kind: g.kind === 'team' ? 'Team' : 'Player', team: g.team || '', role: p.role, name: p.name, phone: phoneFmt(p.phone), email: p.email, order: o.orderId }); });
        });
      });
      return rows;
    }
    function liveReg(o) { return o.status === 'paid'; }
    function drawRegs() {
      crg.textContent = '';
      if (!regsAll.length) { crg.appendChild(el('p', 'db-empty', 'No registrations yet. Each one appears here with every player\'s name, phone and email.')); return; }
      var leagues = []; regsAll.forEach(function (o) { o.regs.forEach(function (g) { var L = g.league || g.productName; if (leagues.indexOf(L) < 0) leagues.push(L); }); });
      var bar = el('div', 'db-links');
      var sel = el('select'); sel.setAttribute('aria-label', 'League');
      [['all', 'Every league']].concat(leagues.map(function (L) { return [L, L]; })).forEach(function (x) { var o = el('option', null, x[1]); o.value = x[0]; if (x[0] === regLeague) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () { regLeague = sel.value; drawRegs(); });
      bar.appendChild(el('span', 'db-hint', 'League:')); bar.appendChild(sel);
      var other = regsAll.filter(function (o) { return !liveReg(o); }).length;
      if (other) {
        var bh = h('<button type="button" class="db-btn-ghost"><i class="fas fa-eye"></i> ' + (regShowAll ? 'Hide' : 'Show') + ' ' + other + ' removed, refunded or unpaid</button>');
        bh.addEventListener('click', function () { regShowAll = !regShowAll; drawRegs(); });
        bar.appendChild(bh);
      }
      var list = regsAll.filter(function (o) { return (regShowAll || liveReg(o)) && (regLeague === 'all' || o.regs.some(function (g) { return (g.league || g.productName) === regLeague; })); });
      var rows = regRows(list).filter(function (x) { return regLeague === 'all' || x.league === regLeague; });
      var bx = h('<button type="button" class="db-btn-ghost"><i class="fas fa-file-csv"></i> Download this list (CSV)</button>');
      bx.addEventListener('click', function () { csv(rows, ['date', 'status', 'league', 'kind', 'team', 'role', 'name', 'phone', 'email', 'order'], 'lavish-leaf-registrations'); });
      bar.appendChild(bx);
      crg.appendChild(bar);
      var paidPeople = regRows(regsAll.filter(liveReg)).filter(function (x) { return regLeague === 'all' || x.league === regLeague; }).length;
      crg.appendChild(el('p', 'db-hint', paidPeople + ' registered player(s)' + (regLeague === 'all' ? '' : ' in this league') + '.'));
      var t = el('table', 'db-table');
      t.innerHTML = '<thead><tr><th>Date</th><th>Status</th><th>League</th><th>Team</th><th>Role</th><th>Name</th><th>Phone</th><th>Email</th><th></th></tr></thead>';
      var tb = el('tbody'), lastOrder = null;
      rows.forEach(function (x) {
        var tr = el('tr');
        [x.date, x.status, x.league, x.team, x.role, x.name, x.phone, x.email].forEach(function (v) { tr.appendChild(el('td', null, v)); });
        var td = el('td', 'db-actions');
        if (x.order !== lastOrder) {
          var removing = x.status !== 'removed';
          var b = h('<button type="button" class="db-btn-ghost db-btn-sm">' + (removing ? '<i class="fas fa-user-minus"></i> Remove' : '<i class="fas fa-rotate-left"></i> Restore') + '</button>');
          b.addEventListener('click', function () {
            if (removing && !window.confirm('Take this registration (order ' + x.order + ') off the roster? Refund it in PayPal separately if you have not.')) return;
            api('registrations', { action: removing ? 'remove' : 'restore', orderId: x.order }).then(function (r) { Object.assign(x.o, r.registration); drawRegs(); fillTiles(); }).catch(function (e) { alert(e.message); });
          });
          td.appendChild(b);
        }
        lastOrder = x.order;
        tr.appendChild(td); tb.appendChild(tr);
      });
      t.appendChild(tb);
      var wrap = el('div', 'db-table-wrap'); wrap.appendChild(t); crg.appendChild(wrap);
    }
    api('registrations', { action: 'list' }).then(function (r) { regsAll = r.registrations || []; drawRegs(); fillTiles(); })
      .catch(function (e) { crg.textContent = ''; crg.appendChild(el('p', 'db-empty', e.message)); });

    // Top tiles for sign-ups and registrations, filled once their lists load
    // (owner, 2026-10-12), each a link to its section.
    function fillTiles() {
      var set = function (id, v, note) { var t = document.getElementById(id); if (!t) return; t.querySelector('.db-tile-value').textContent = v; t.querySelector('.db-tile-note').textContent = note; };
      if (signups.length || R) {
        var act = signups.filter(onRoute);
        var comp = act.filter(function (s) { return /compost/i.test(s.productName); }).length, rec = act.filter(function (s) { return /recycl/i.test(s.productName); }).length;
        var newWeek = signups.filter(function (s) { return onRoute(s) && Date.now() - Date.parse(s.created) < 7 * DAY_MS; }).length;
        set('tile-compost', num(comp), 'active customers' + (newWeek ? ', ' + newWeek + ' new this week' : ''));
        set('tile-recycle', num(rec), 'active customers');
      }
      if (regsAll) {
        var paid = regsAll.filter(liveReg);
        var people = regRows(paid).length, teams = 0; paid.forEach(function (o) { o.regs.forEach(function (g) { if (g.kind === 'team') teams++; }); });
        set('tile-regs', num(people), 'players registered' + (teams ? ', ' + teams + ' team' + (teams === 1 ? '' : 's') : ''));
      }
    }

    // 7d. AliExpress (2026-10-10): connect the buyer account once, then read
    // live prices and stock for the AliExpress lines in the store tiers.
    var sx = section('aliexpress', 'fa-box', 'AliExpress', 'Connect the shop\'s AliExpress account once; then check the live price, stock and photos of every AliExpress line in the store tiers.');
    var cx = card(null);
    var flag = (location.search.match(/[?&]aliexpress=([^&]+)/) || [])[1];
    if (flag) cx.appendChild(el('p', 'db-hint', 'AliExpress: ' + decodeURIComponent(flag) + '.'));
    var stx = el('p', 'db-hint', 'Checking the connection...');
    cx.appendChild(stx);
    var rowx = el('div', 'db-links');
    var bConnect = h('<button type="button" class="db-btn-ghost"><i class="fas fa-link"></i> Connect AliExpress</button>');
    var bItems = h('<button type="button" class="db-btn-ghost"><i class="fas fa-rotate"></i> Check our AliExpress items</button>');
    rowx.appendChild(bConnect); rowx.appendChild(bItems); cx.appendChild(rowx);
    var outx = el('div'); cx.appendChild(outx);
    sx.appendChild(cx); root.appendChild(sx);
    api('aliexpress', { action: 'status' }).then(function (r) {
      stx.textContent = r.connected ? 'Connected' + (r.account ? ' as ' + r.account : '') + (r.expires ? ', key renews itself (now valid to ' + niceDate(new Date(r.expires).toISOString()) + ').' : '.') : 'Not connected yet. Press Connect AliExpress and approve on AliExpress\'s page.';
    }).catch(function (e) { stx.textContent = e.message; });
    bConnect.addEventListener('click', function () {
      api('aliexpress', { action: 'connect' }).then(function (r) { location.href = r.url; }).catch(function (e) { stx.textContent = e.message; });
    });
    bItems.addEventListener('click', function () {
      outx.textContent = 'Reading AliExpress...';
      fetch('/store-tiers.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
        var ids = [], names = {};
        (j.products || []).forEach(function (p) { var m = /aliexpress\.com\/item\/(\d+)/.exec(p.url || ''); if (m && ids.indexOf(m[1]) < 0) { ids.push(m[1]); names[m[1]] = p.name; } });
        return api('aliexpress', { action: 'items', ids: ids }).then(function (r) {
          outx.textContent = '';
          outx.appendChild(table([{ label: 'Our line' }, { label: 'On AliExpress now' }, { label: 'Price', num: true }, { label: 'Regular', num: true }, { label: 'Stock', num: true }, { label: 'Rating' }],
            r.items.map(function (it) { return it.ok ? [names[it.id] || it.id, (it.title || '').slice(0, 60), it.price == null ? '-' : money(it.price), it.regular == null ? '-' : money(it.regular), num(it.stock), it.rating || '-'] : [names[it.id] || it.id, it.error, '-', '-', '-', '-']; })));
        });
      }).catch(function (e) { outx.textContent = e.message; });
    });

    // 8. newsletter, forms, orders
    var s8 = section('people', 'fa-envelope', 'Newsletter and messages', 'Your own lists: who signed up and who wrote in.');
    var g8 = el('div', 'db-grid');
    var nl = card('Newsletter');
    if (list) {
      nl.appendChild(bars([{ name: 'Subscribed', value: list.active }, { name: 'Joined in the last 30 days', value: list.newThisMonth }, { name: 'Unsubscribed in the last 30 days', value: list.unsubscribedThisMonth }], { unit: 'people' }));
      var m = list.mail;
      nl.appendChild(el('p', 'db-hint', m.ready ? (num(m.sentToday) + ' of ' + num(m.daily) + ' emails sent today.' + (m.postal ? '' : ' Add MAIL_POSTAL_ADDRESS before sending a newsletter.')) : 'Email is not connected yet (the Amazon SES keys, docs/OWNER-STEPS.md). Sign-ups are still being saved.'));
      if (list.job) nl.appendChild(el('p', 'db-hint', (list.job.done ? 'Last newsletter: ' : 'Sending now: ') + list.job.subject + ', ' + num(list.job.sent) + ' sent' + (list.job.failed ? ', ' + list.job.failed + ' failed' : '') + '.'));
      nl.appendChild(sender());
    } else nl.appendChild(notice(d.list));
    g8.appendChild(nl);
    var fm = card('Forms', 'Every submission, ever. Read them in Netlify under Forms.');
    fm.appendChild(d.forms.status === 'ok' ? bars(d.forms.data.map(function (r) { return { name: ({ contact: 'Contact', newsletter: 'Newsletter', 'app-report': 'App reports', 'artist-submission': 'Artist submissions' })[r.name] || r.name, value: r.value }; }), { unit: 'sent' }) : notice(d.forms));
    g8.appendChild(fm);
    s8.appendChild(g8);
    root.appendChild(s8);

    // 9. Orders to place (owner, 2026-10-12): its own section, one card per
    // order with everything needed to place it with the supplier: the
    // customer's name and address, each line's supplier, SKU or item number
    // and variant, what we charged, copy buttons, a "placed" tick per line,
    // and a "Send shipped email" with the tracking number.
    var so = section('orders', 'fa-bag-shopping', 'Orders', 'Every paid order with what to place, where. Copy the code and the address into Bangalla or AliExpress, tick each line when placed, then send the customer the shipped email.');
    root.appendChild(so);
    var ordersBox = el('div'); so.appendChild(ordersBox);
    ordersBox.appendChild(el('p', 'db-hint', 'Loading orders...'));
    var ordersAll = [], ordersShow = 'open', prodById = {};
    function copyBtn(text, label) {
      var b = h('<button type="button" class="db-copy" title="Copy">' + esc(label || 'Copy') + '</button>');
      b.addEventListener('click', function () {
        var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = label || 'Copy'; }, 1400); };
        try { navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this:', text); }); } catch (e) { window.prompt('Copy this:', text); }
      });
      return b;
    }
    function lineSource(it) {
      // sku is the product id, or "id:Option" for an option line (paypal.mjs).
      var sku = String(it.sku || ''), cut = sku.indexOf(':');
      var id = cut > 0 ? sku.slice(0, cut) : sku, opt = cut > 0 ? sku.slice(cut + 1) : '';
      var p = prodById[id];
      if (!p) return { supplier: '', code: '', note: 'Not in the store any more: check the order in PayPal', name: it.name };
      if (!p.ship) return { supplier: 'Our own service', code: '', note: p.registration ? 'See League registrations' : (p.interval ? 'See Pick-ups' : ''), name: p.name, own: true };
      var src = p.source || {}, v = null;
      if (opt && p.options) v = p.options.values.filter(function (x) { return x.name === opt; })[0];
      var code = (v && (v.sku || v.item)) || src.sku || src.item || '';
      var variant = (v && v.note) || src.variant || '';
      return { supplier: src.supplier || '', code: String(code), kind: (v && v.item) || src.item ? 'Item number' : 'SKU', variant: variant, option: opt ? p.options.label + ': ' + opt : '', name: p.name };
    }
    function orderOpen(o) { return !/refunded/.test(o.status || '') && !(o.shipments && o.shipments.length); }
    function drawOrders() {
      ordersBox.textContent = '';
      var bar = el('div', 'db-links');
      [['open', 'To place and ship'], ['shipped', 'Shipped'], ['refunded', 'Refunded'], ['all', 'All']].forEach(function (x) {
        var n = ordersAll.filter(function (o) { return x[0] === 'all' || (x[0] === 'open' ? orderOpen(o) : x[0] === 'shipped' ? (o.shipments || []).length : /refunded/.test(o.status || '')); }).length;
        var b = h('<button type="button" class="db-btn-ghost' + (ordersShow === x[0] ? ' db-on' : '') + '">' + esc(x[1]) + ' (' + n + ')</button>');
        b.addEventListener('click', function () { ordersShow = x[0]; drawOrders(); });
        bar.appendChild(b);
      });
      ordersBox.appendChild(bar);
      var list = ordersAll.filter(function (o) { return ordersShow === 'all' || (ordersShow === 'open' ? orderOpen(o) : ordersShow === 'shipped' ? (o.shipments || []).length : /refunded/.test(o.status || '')); });
      if (!list.length) { ordersBox.appendChild(el('p', 'db-empty', ordersAll.length ? 'Nothing here.' : 'No orders yet. They appear here the moment one is paid.')); return; }
      list.forEach(function (o) {
        var c = el('div', 'db-card db-order');
        var head = el('div', 'db-order-head');
        head.appendChild(el('strong', null, niceDate(o.date) + ' · ' + money(o.total)));
        head.appendChild(el('span', 'db-pill' + (/refunded/.test(o.status || '') ? ' db-pill-warn' : (o.shipments || []).length ? ' db-pill-ok' : ''), o.status ? o.status : (o.shipments || []).length ? 'shipped' : 'paid'));
        head.appendChild(el('span', 'db-hint', 'PayPal order ' + o.id));
        c.appendChild(head);
        // the customer, ready to paste into the supplier's checkout
        var name = o.first_last || (o.shipTo ? o.shipTo.split(', ')[0] : '') || o.first || '';
        var addrParts = o.shipTo ? o.shipTo.split(', ').slice(name && o.shipTo.indexOf(name) === 0 ? 1 : 0) : [];
        var cust = el('div', 'db-cust');
        var addRow = function (label, value) { if (!value) return; var r = el('div', 'db-cust-row'); r.appendChild(el('span', 'db-cust-k', label)); r.appendChild(el('span', 'db-cust-v', value)); r.appendChild(copyBtn(value)); cust.appendChild(r); };
        addRow('Name', name);
        if (addrParts.length) {
          // PayPal's order: the street line(s), then the city, then "OK 74462".
          var sz = /^([A-Z]{2})\s+(\S+)$/.exec(addrParts[addrParts.length - 1] || '');
          if (sz && addrParts.length >= 3) {
            addRow('Street', addrParts.slice(0, -2).join(', '));
            addRow('City', addrParts[addrParts.length - 2]); addRow('State', sz[1]); addRow('ZIP', sz[2]);
          } else {
            addRow('Street', addrParts.slice(0, -1).join(', '));
            addRow('City, state, ZIP', addrParts[addrParts.length - 1] || '');
          }
          addRow('Whole address', addrParts.join(', '));
        }
        addRow('Email', o.email);
        c.appendChild(cust);
        // the lines
        var t = el('table', 'db-table');
        t.innerHTML = '<thead><tr><th>Placed</th><th>Product</th><th>Qty</th><th class="num">Sold at</th><th>Order from</th><th>Code</th><th>Variant</th></tr></thead>';
        var tb = el('tbody');
        (o.items || []).forEach(function (it) {
          var src = lineSource(it), tr = el('tr');
          var tdP = el('td');
          if (!src.own) {
            var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!(o.ordered && o.ordered[it.sku]); cb.setAttribute('aria-label', 'Placed with the supplier');
            cb.addEventListener('change', function () { api('orders-admin', { action: 'ordered', id: o.id, sku: it.sku, done: cb.checked }).then(function (r) { Object.assign(o, r.order); }).catch(function (e) { cb.checked = !cb.checked; alert(e.message); }); });
            tdP.appendChild(cb);
          }
          tr.appendChild(tdP);
          var tdN = el('td'); tdN.appendChild(el('div', null, src.name)); if (src.option) tdN.appendChild(el('div', 'db-hint', src.option)); if (!src.own) tdN.appendChild(copyBtn(src.name + (src.option ? ' (' + src.option + ')' : ''), 'Copy name'));
          tr.appendChild(tdN);
          tr.appendChild(el('td', null, String(it.qty)));
          tr.appendChild(el('td', 'num', money(it.each * it.qty)));
          tr.appendChild(el('td', null, src.supplier || src.note));
          var tdC = el('td'); if (src.code) { tdC.appendChild(el('div', null, src.kind + ' ' + src.code)); tdC.appendChild(copyBtn(src.code)); } else if (src.own) tdC.appendChild(el('span', 'db-hint', src.note)); tr.appendChild(tdC);
          var tdV = el('td', null, src.variant || ''); if (src.variant) tdV.appendChild(copyBtn(src.variant)); tr.appendChild(tdV);
          tb.appendChild(tr);
        });
        t.appendChild(tb);
        var wrap = el('div', 'db-table-wrap'); wrap.appendChild(t); c.appendChild(wrap);
        // what we charged
        c.appendChild(el('p', 'db-hint', 'Items ' + money(o.itemTotal) + ' · Shipping charged ' + money(o.shipping || 0) + (o.tax ? ' · Sales tax ' + money(o.tax) : '') + ' · Total paid ' + money(o.total) + ((o.refunds || []).length ? ' · Refunded ' + money(o.refunds.reduce(function (a, r) { return a + r.cents; }, 0) / 100) : '')));
        // shipped email
        (o.shipments || []).forEach(function (s) { c.appendChild(el('p', 'db-hint', 'Shipped email sent ' + niceDate(s.at) + (s.carrier ? ', ' + s.carrier : '') + (s.tracking ? ' ' + s.tracking : '') + '.')); });
        if (o.delivery === 'ship' && !/refunded/.test(o.status || '')) {
          var shipRow = el('div', 'db-links db-ship');
          var carrier = el('select'); ['USPS', 'UPS', 'FedEx', 'AliExpress / other'].forEach(function (x) { var op = el('option', null, x); carrier.appendChild(op); }); carrier.setAttribute('aria-label', 'Carrier');
          var track = el('input'); track.placeholder = 'Tracking number (optional)'; track.setAttribute('aria-label', 'Tracking number');
          var bs = h('<button type="button" class="db-btn-ghost"><i class="fas fa-paper-plane"></i> Send shipped email</button>');
          var msg = el('span', 'db-hint');
          bs.addEventListener('click', function () {
            if (!window.confirm('Email ' + (o.email || 'the customer') + ' that order ' + o.id + ' is on its way?')) return;
            bs.disabled = true; msg.textContent = 'Sending...';
            api('orders-admin', { action: 'ship', id: o.id, carrier: carrier.value, tracking: track.value.trim() }).then(function (r) { Object.assign(o, r.order); drawOrders(); })
              .catch(function (e) { msg.textContent = e.message; bs.disabled = false; });
          });
          shipRow.appendChild(carrier); shipRow.appendChild(track); shipRow.appendChild(bs); shipRow.appendChild(msg);
          c.appendChild(shipRow);
        }
        // A refund the webhook did not see (given before it was set up).
        var refRow = el('div', 'db-links');
        var refunded = /refunded/.test(o.status || '');
        var bRef = h('<button type="button" class="db-btn-ghost db-btn-sm">' + (refunded ? '<i class="fas fa-rotate-left"></i> Not refunded' : '<i class="fas fa-money-bill-transfer"></i> Mark refunded') + '</button>');
        bRef.addEventListener('click', function () {
          if (!refunded && !window.confirm('Mark order ' + o.id + ' as refunded here? This does not refund it in PayPal; do that in PayPal first.')) return;
          api('orders-admin', { action: 'refunded', id: o.id, undo: refunded }).then(function (r) { Object.keys(o).forEach(function (k) { delete o[k]; }); Object.assign(o, r.order); drawOrders(); }).catch(function (e) { alert(e.message); });
        });
        refRow.appendChild(bRef);
        c.appendChild(refRow);
        ordersBox.appendChild(c);
      });
      ordersBox.appendChild(el('p', 'db-hint', 'Bangalla: in your Bangalla account, add each SKU to the cart and check out with the customer\'s name and address as the ship-to. AliExpress: open the item number, pick the variant shown, and check out with the customer\'s address. Then send the shipped email here. Refunds you give in PayPal mark the order Refunded by themselves once the webhook is set.'));
    }
    Promise.all([api('orders-admin', { action: 'list' }), fetch('/products.json', { cache: 'no-store' }).then(function (r) { return r.json(); })]).then(function (res) {
      ordersAll = res[0].orders || [];
      (res[1].products || []).forEach(function (p) { prodById[p.id] = p; });
      drawOrders();
      var open = ordersAll.filter(orderOpen).length;
      var t = document.getElementById('tile-orders');
      if (t) { t.querySelector('.db-tile-value').textContent = num(open); t.querySelector('.db-tile-note').textContent = 'to place and ship (' + num(ordersAll.length) + ' in all)'; }
    }).catch(function (e) { ordersBox.textContent = ''; ordersBox.appendChild(el('p', 'db-empty', e.message)); });

    var links = section('elsewhere', 'fa-up-right-from-square', 'Open the full tools', 'Everything here comes from these. Each has far more detail when you need it.');
    links.appendChild(h('<div class="db-links">' +
      '<a href="https://analytics.google.com/" target="_blank" rel="noopener"><i class="fas fa-chart-pie"></i>Google Analytics</a>' +
      '<a href="https://search.google.com/search-console" target="_blank" rel="noopener"><i class="fab fa-google"></i>Search Console</a>' +
      '<a href="https://lookerstudio.google.com/" target="_blank" rel="noopener"><i class="fas fa-table-columns"></i>Looker Studio</a>' +
      '<a href="https://clarity.microsoft.com/projects/view/yrei9vub09/dashboard" target="_blank" rel="noopener"><i class="fas fa-fire"></i>Clarity</a>' +
      '<a href="https://business.facebook.com/latest/insights" target="_blank" rel="noopener"><i class="fab fa-meta"></i>Meta Business Suite</a>' +
      '<a href="https://console.aws.amazon.com/ses/home" target="_blank" rel="noopener"><i class="fas fa-paper-plane"></i>Amazon SES</a>' +
      '<a href="https://app.netlify.com/" target="_blank" rel="noopener"><i class="fas fa-server"></i>Netlify</a>' +
      '<a href="https://www.paypal.com/myaccount/summary" target="_blank" rel="noopener"><i class="fab fa-paypal"></i>PayPal</a></div>'));
    root.appendChild(links);
  }

  /** Test, send or stop a newsletter issue. */
  function sender() {
    var wrap = el('div');
    var month = new Date().toISOString().slice(0, 7);
    wrap.innerHTML = '<p class="db-hint" style="margin-top:10px">Send a newsletter: the file name in <code>emails/</code>, without .html. Always send yourself a test first.</p>' +
      '<div class="db-send"><input id="db-issue" value="newsletter-' + month + '" aria-label="Newsletter file name">' +
      '<button type="button" class="db-btn-ghost" data-act="test">Send me a test</button>' +
      '<button type="button" class="btn" data-act="send">Send to everyone</button></div>' +
      '<div class="db-send"><button type="button" class="db-btn-ghost" data-act="welcome-test">Send me the welcome email</button><button type="button" class="db-btn-ghost" data-act="cancel">Stop a send</button><button type="button" class="db-btn-ghost" data-act="import">Import past sign-ups</button>' +
      '<a class="db-btn-ghost" style="text-decoration:none" href="emails/newsletter-' + month + '.html" target="_blank" rel="noopener">Preview</a></div><p class="db-msg" id="db-msg"></p>';
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act');
      var issue = $('#db-issue').value.trim();
      if (act === 'send' && !window.confirm('Send "' + issue + '" to every subscriber? This cannot be undone.')) return;
      var msg = $('#db-msg'); msg.className = 'db-msg'; msg.textContent = 'Working...';
      api('newsletter-admin', { action: act, issue: issue }).then(function (r) { msg.textContent = r.message || 'Done.'; })
        .catch(function (err) { msg.className = 'db-msg err'; msg.textContent = err.message; });
    });
    return wrap;
  }

  // ------------------------------------------------------------ data + sign-in
  function token() {
    var u = window.netlifyIdentity && window.netlifyIdentity.currentUser();
    return u ? u.jwt() : Promise.reject(new Error('Please sign in.'));
  }
  function api(fn, body) {
    return token().then(function (t) {
      return fetch('/.netlify/functions/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body || {}) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong (' + r.status + ').'); e.status = r.status; throw e; } return j; });
    });
  }
  function load(refresh) {
    $('#db-refresh').disabled = true;
    if (!state.data) $('#db-sections').innerHTML = '<p class="db-loading">Gathering the numbers from Google, Meta and Clarity. This takes a few seconds.</p>';
    var get = PREVIEW ? Promise.resolve(window.DB_SAMPLE(state.days)) : api('dashboard-data', { days: state.days, refresh: !!refresh });
    get.then(render).catch(function (e) {
      if (e.status === 403) { gate('This account is not the owner\'s. Sign out and sign in with the owner account, or give this account the "admin" role in Netlify (docs/DASHBOARD.md).', true); return; }
      $('#db-sections').innerHTML = ''; $('#db-sections').appendChild(notice({ status: 'error', message: e.message }));
    }).then(function () { $('#db-refresh').disabled = false; });
  }
  function gate(text, signedIn) {
    $('#db-app').hidden = true; $('#db-gate').hidden = false;
    $('#db-gate-text').textContent = text;
    $('#db-signin').textContent = signedIn ? 'Sign out' : 'Sign in';
    $('#db-signin').onclick = function () { var id = window.netlifyIdentity; if (!id) return; if (signedIn) id.logout(); else id.open('login'); };
  }
  function start(user) {
    state.user = user;
    $('#db-gate').hidden = true; $('#db-app').hidden = false;
    var name = (user && user.user_metadata && user.user_metadata.full_name) || '';
    var hour = new Date().getHours();
    $('#db-hello').textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name.split(' ')[0] : '');
    load(false);
    // The store section has its own data (dashboard-store.js), so it draws
    // whether or not the analytics sources are connected.
    if (window.DBStore) window.DBStore.start($('#db-store'), PREVIEW);
  }

  document.querySelectorAll('.db-range button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.db-range button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      state.days = Number(b.getAttribute('data-days'));
      load(false);
    });
  });
  $('#db-refresh').addEventListener('click', function () { load(true); });
  $('#db-signout').addEventListener('click', function () { if (window.netlifyIdentity) window.netlifyIdentity.logout(); });

  // A local preview with sample numbers (never on the live site).
  var PREVIEW = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]preview\b/.test(location.search);
  if (PREVIEW) {
    var s = document.createElement('script'); s.src = 'tools/dashboard-sample.js';
    s.onload = function () { start({ user_metadata: { full_name: 'Preview' } }); };
    document.head.appendChild(s);
    return;
  }

  function boot() {
    var id = window.netlifyIdentity;
    if (!id) { gate('Sign-in could not load. Check your connection and reload.', false); return; }
    // The widget starts itself; this only listens, like the store does.
    id.on('init', function (u) { if (u && !state.user) start(u); });
    id.on('login', function (u) { id.close(); start(u); });
    id.on('logout', function () { state.data = null; state.user = null; gate('Signed out.', false); });
    if (id.currentUser()) start(id.currentUser());
    else gate('This page is for the owner. Sign in to see how the website, the store and the social pages are doing.', false);
  }
  if (window.netlifyIdentity) boot();
  else window.addEventListener('load', boot);
})();
