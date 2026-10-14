// One Azure Standard card, and our affiliate link (2026-10-14). Shared by
// tools/azure-shelf.mjs (the Green Swaps shelves) and tools/render-store.mjs
// (the Home shelf). The a_aid parameter is Azure's affiliate tracking.
export const AID = 'aac4bd548d';
export const azureLink = (path) => `https://www.azurestandard.com${path}${path.includes('?') ? '&' : '?'}a_aid=${AID}`;
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function azureCard(x) {
  const href = esc(azureLink(`/shop/product/${x.slug}/${x.id}?package=${x.code}`));
  return [
    `  <article class="sp-card gs-az-card" data-id="az-${esc(x.code.toLowerCase())}" data-category="Azure Standard">`,
    '    <div class="sp-media">',
    `      <img src="${esc(x.img)}" alt="${esc(x.name)}" loading="lazy">`,
    '      <span class="sp-badge sp-partner">Azure</span>',
    '    </div>',
    `    <h3 class="sp-name">${esc(x.name)}</h3>`,
    `    <p class="sp-blurb">${esc(x.size)} from Azure Standard, delivered to a Drop near you or to your door.</p>`,
    '    <div class="sp-foot">',
    `      <span class="sp-price" data-az-price="${esc(x.code)}">${x.price != null ? '$' + Number(x.price).toFixed(2) : ''}</span>`,
    `      <a class="btn btn-sm" href="${href}" target="_blank" rel="sponsored noopener" data-affiliate="Azure Standard">View at Azure</a>`,
    '    </div>',
    '  </article>',
  ].join('\n');
}

