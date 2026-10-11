// "Making a Difference": fills the running totals on the Home and Farms pages
// from /.netlify/functions/impact (the owner updates them in the dashboard).
// The numbers written into the page are the fallback when this cannot run.
(function () {
  'use strict';
  var box = document.querySelector('[data-impact]');
  if (!box) return;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  fetch('/.netlify/functions/impact').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
    var stats = (d.stats || []).filter(function (s) { return s.value > 0; });
    if (!stats.length) return;
    var grid = box.querySelector('.impact-grid');
    grid.innerHTML = stats.map(function (s) {
      return '<div class="impact-stat"><div class="impact-num">' + esc(Number(s.value).toLocaleString('en-US')) + (s.plus ? '+' : '') +
        (s.unit ? ' <span>' + esc(s.unit) + '</span>' : '') + '</div><div class="impact-label">' + esc(s.label) + '</div></div>';
    }).join('');
  }).catch(function () { /* the numbers in the page stay */ });
})();
