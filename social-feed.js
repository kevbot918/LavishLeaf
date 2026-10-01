// The Social page's post cards (2026-10-01).
//
// Asks /.netlify/functions/social-feed for our latest Instagram and Facebook
// posts and draws each one as a small card in a full-width grid. When a
// network is not set up yet (no Meta keys in Netlify, docs/SOCIAL-FEEDS.md)
// or the request fails, that network's old widget stays: the Behold
// Instagram widget, loaded only then, and Facebook's Page plugin.
(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function when(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function safeUrl(u, host) {
    return typeof u === 'string' && /^https:\/\//.test(u) && (!host || host.test(u)) ? u : null;
  }

  function card(post, network) {
    var url = safeUrl(post.url, network === 'ig' ? /^https:\/\/(www\.)?instagram\.com\// : /^https:\/\/(www\.|m\.)?facebook\.com\//);
    if (!url) return null;
    var a = el('a', 'post-card');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    var img = safeUrl(post.image);
    if (img) {
      var media = el('div', 'post-media');
      var i = el('img');
      i.src = img; i.loading = 'lazy'; i.decoding = 'async';
      i.alt = post.text ? post.text.slice(0, 120) : (network === 'ig' ? 'Instagram post' : 'Facebook post');
      i.addEventListener('error', function () { media.remove(); a.classList.add('post-text-only'); });
      media.appendChild(i);
      if (post.video) media.appendChild(el('span', 'post-badge', 'Video'));
      else if (post.album) media.appendChild(el('span', 'post-badge', 'Album'));
      a.appendChild(media);
    } else {
      a.classList.add('post-text-only');
    }
    var body = el('div', 'post-body');
    if (post.text) body.appendChild(el('p', 'post-text', post.text));
    body.appendChild(el('span', 'post-date', when(post.date)));
    a.appendChild(body);
    return a;
  }

  function fill(gridId, fallbackId, posts, network) {
    var grid = document.getElementById(gridId);
    if (!grid || !posts || !posts.length) return false;
    posts.forEach(function (p) { var c = card(p, network); if (c) grid.appendChild(c); });
    if (!grid.children.length) return false;
    grid.hidden = false;
    var fb = document.getElementById(fallbackId);
    if (fb) fb.remove();
    return true;
  }

  function loadBehold() {
    if (!document.getElementById('ig-fallback')) return;
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://w.behold.so/widget.js';
    document.head.appendChild(s);
  }

  fetch('/.netlify/functions/social-feed')
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (feed) {
      if (!fill('ig-grid', 'ig-fallback', feed.ig, 'ig')) loadBehold();
      fill('fb-grid', 'fb-fallback', feed.fb, 'fb');
    })
    .catch(loadBehold);
})();
