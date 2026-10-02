// The Social page's post cards (2026-10-01).
//
// Asks /.netlify/functions/social-feed for our latest Instagram and Facebook
// posts and draws each one as a small card in a full-width grid.
//
// Instagram, in order (2026-10-02: Meta's own setup kept refusing the
// account, so Behold does the Meta part):
//   1. our function, if Meta keys are ever set in Netlify;
//   2. Behold's JSON feed (feeds.behold.so/<feed id>, the id on #ig-grid's
//      data-behold-feed): Behold talks to Meta, we draw the cards. The free
//      plan returns 6 posts; Starter returns up to 50;
//   3. the Behold widget, as before, if neither answers.
// Facebook: our function's cards, else Facebook's Page plugin stays.
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

  // Behold's JSON feed, as our cards. Accepts both shapes Behold has used:
  // { posts: [...] } and a bare array.
  function fromBehold(json) {
    var list = Array.isArray(json) ? json : (json && Array.isArray(json.posts) ? json.posts : []);
    return list.map(function (p) {
      var sz = p.sizes || {};
      var img = (sz.medium && sz.medium.mediaUrl) || (sz.small && sz.small.mediaUrl) || p.thumbnailUrl ||
        (p.mediaType === 'VIDEO' ? null : p.mediaUrl);
      return {
        id: String(p.id || ''),
        image: img || null,
        video: p.mediaType === 'VIDEO',
        album: p.mediaType === 'CAROUSEL_ALBUM',
        text: typeof p.prunedCaption === 'string' ? p.prunedCaption : (typeof p.caption === 'string' ? p.caption : ''),
        url: p.permalink,
        date: p.timestamp,
      };
    });
  }
  function tryBeholdJson() {
    var grid = document.getElementById('ig-grid');
    var id = grid && grid.getAttribute('data-behold-feed');
    if (!id || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) { loadBehold(); return; }
    fetch('https://feeds.behold.so/' + id)
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (json) { if (!fill('ig-grid', 'ig-fallback', fromBehold(json), 'ig')) loadBehold(); })
      .catch(loadBehold);
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
      if (!fill('ig-grid', 'ig-fallback', feed.ig, 'ig')) tryBeholdJson();
      fill('fb-grid', 'fb-fallback', feed.fb, 'fb');
    })
    .catch(tryBeholdJson);
})();
