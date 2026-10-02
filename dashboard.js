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
    var names = { '/': 'Home', '/index.html': 'Home', '/farms.html': 'Farms', '/rec-sports.html': 'Rec Sports', '/gaming.html': 'Gaming', '/symphonymph.html': 'Symphonymph', '/store.html': 'Online Store', '/company.html': 'Company', '/social.html': 'Social', '/privacy.html': 'Privacy', '/refunds.html': 'Refunds', '/terms-of-sale.html': 'Terms of Sale', '/waiver.html': 'Waiver', '/app-feedback.html': 'App feedback', '/p.html': 'Shared playlist', '/p': 'Shared playlist' };
    var clean = String(path).split('?')[0];
    return names[clean] || names[clean + '.html'] || clean;
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
      if (ga.pages[0]) lines.push(['fa-file-lines', 'The most-viewed page was ' + pageName(ga.pages[0].name) + ', with ' + num(ga.pages[0].value) + ' views.']);
    }
    if (social) {
      var best = [].concat(social.facebook ? social.facebook.posts.map(function (p) { p.net = 'Facebook'; return p; }) : [], social.instagram ? social.instagram.posts.map(function (p) { p.net = 'Instagram'; return p; }) : []).sort(function (a, b) { return b.total - a.total; })[0];
      if (best && best.total) lines.push(['fa-heart', 'Your most-liked recent post is on ' + best.net + ' (' + num(best.total) + ' likes, comments and shares): "' + (best.text || 'a photo').slice(0, 60) + (best.text && best.text.length > 60 ? '...' : '') + '"']);
    }
    if (list && list.newThisMonth) lines.push(['fa-envelope-open-text', list.newThisMonth + ' new newsletter subscriber' + (list.newThisMonth === 1 ? '' : 's') + ' in the last 30 days.']);
    lines.slice(0, 4).forEach(function (l) { ins.appendChild(h('<div class="db-insight"><i class="fas ' + l[0] + '"></i><span>' + esc(l[1]) + '</span></div>')); });

    // ---- tiles
    var tiles = $('#db-tiles'); tiles.textContent = '';
    function tile(label, icon, value, note, off) {
      tiles.appendChild(h('<div class="db-tile' + (off ? ' off' : '') + '"><div class="db-tile-label"><i class="fas ' + icon + '"></i>' + esc(label) + '</div><div class="db-tile-value">' + esc(value) + '</div><div class="db-tile-note">' + note + '</div></div>'));
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
    if (orders) tile('Orders', 'fa-bag-shopping', num(orders.count), money(orders.revenue) + ' in the last ' + days + ' days');
    if (social) {
      var f = (social.facebook && social.facebook.followers) || 0, ig = (social.instagram && social.instagram.followers) || 0;
      tile('Social followers', 'fa-share-nodes', num(f + ig), num(f) + ' on Facebook, ' + num(ig) + ' on Instagram');
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
      var p3 = card('Most-viewed pages'); p3.appendChild(bars(ga.pages, { label: function (r) { return pageName(r.name); }, unit: 'views' })); g3.appendChild(p3);
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
      var pg = card('Pages people reached from Google'); pg.appendChild(bars(gsc.pages.map(function (r) { return { name: pageName(r.name), value: r.clicks }; }), { unit: 'clicks' })); g5.appendChild(pg);
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
    var s7 = section('behaviour', 'fa-arrow-pointer', 'How people use the pages', 'From Microsoft Clarity, the last 3 days. Open Clarity to watch real visits and see heatmaps of where people click and how far they scroll.');
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

    // 8. newsletter, forms, orders
    var s8 = section('people', 'fa-envelope', 'Newsletter, messages and orders', 'Your own lists: who signed up, who wrote in, who bought.');
    var g8 = el('div', 'db-grid');
    var nl = card('Newsletter');
    if (list) {
      nl.appendChild(bars([{ name: 'Subscribed', value: list.active }, { name: 'Joined in the last 30 days', value: list.newThisMonth }, { name: 'Unsubscribed in the last 30 days', value: list.unsubscribedThisMonth }], { unit: 'people' }));
      var m = list.mail;
      nl.appendChild(el('p', 'db-hint', m.ready ? (num(m.sentToday) + ' of ' + num(m.daily) + ' emails sent today.' + (m.postal ? '' : ' Add MAIL_POSTAL_ADDRESS before sending a newsletter.')) : 'Email is not connected yet (BREVO_API_KEY). Sign-ups are still being saved.'));
      if (list.job) nl.appendChild(el('p', 'db-hint', (list.job.done ? 'Last newsletter: ' : 'Sending now: ') + list.job.subject + ', ' + num(list.job.sent) + ' sent' + (list.job.failed ? ', ' + list.job.failed + ' failed' : '') + '.'));
      nl.appendChild(sender());
    } else nl.appendChild(notice(d.list));
    g8.appendChild(nl);
    var fm = card('Forms', 'Every submission, ever. Read them in Netlify under Forms.');
    fm.appendChild(d.forms.status === 'ok' ? bars(d.forms.data.map(function (r) { return { name: ({ contact: 'Contact', newsletter: 'Newsletter', 'app-report': 'App reports', 'artist-submission': 'Artist submissions' })[r.name] || r.name, value: r.value }; }), { unit: 'sent' }) : notice(d.forms));
    g8.appendChild(fm);
    var od = card('Orders');
    if (orders) {
      od.appendChild(el('p', 'db-hint', num(orders.count) + ' orders, ' + money(orders.revenue) + ' in the last ' + days + ' days. ' + num(orders.accounts) + ' customer accounts, ' + num(orders.openCarts) + ' with something in the cart.'));
      od.appendChild(orders.latest.length ? table([{ label: 'Date' }, { label: 'Items' }, { label: 'Total', num: true }], orders.latest.map(function (o) { return [niceDate(o.date), o.items, money(o.total)]; })) : el('p', 'db-empty', 'No orders yet. They appear here the moment one is paid.'));
    } else od.appendChild(notice(d.orders));
    g8.appendChild(od);
    s8.appendChild(g8);
    root.appendChild(s8);

    var links = section('elsewhere', 'fa-up-right-from-square', 'Open the full tools', 'Everything here comes from these. Each has far more detail when you need it.');
    links.appendChild(h('<div class="db-links">' +
      '<a href="https://analytics.google.com/" target="_blank" rel="noopener"><i class="fas fa-chart-pie"></i>Google Analytics</a>' +
      '<a href="https://search.google.com/search-console" target="_blank" rel="noopener"><i class="fab fa-google"></i>Search Console</a>' +
      '<a href="https://lookerstudio.google.com/" target="_blank" rel="noopener"><i class="fas fa-table-columns"></i>Looker Studio</a>' +
      '<a href="https://clarity.microsoft.com/projects/view/yrei9vub09/dashboard" target="_blank" rel="noopener"><i class="fas fa-fire"></i>Clarity</a>' +
      '<a href="https://business.facebook.com/latest/insights" target="_blank" rel="noopener"><i class="fab fa-meta"></i>Meta Business Suite</a>' +
      '<a href="https://app.brevo.com/" target="_blank" rel="noopener"><i class="fas fa-paper-plane"></i>Brevo</a>' +
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
