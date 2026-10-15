// One Azure Standard card, and our affiliate link (2026-10-14). Shared by
// tools/azure-shelf.mjs (the Green Swaps shelves) and tools/render-store.mjs
// (the Home shelf). The a_aid parameter is Azure's affiliate tracking.
export const AID = 'aac4bd548d';
export const azureLink = (path) => `https://www.azurestandard.com${path}${path.includes('?') ? '&' : '?'}a_aid=${AID}`;
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function azureCard(x, category = 'Azure Standard') {
  const href = esc(azureLink(`/shop/product/${x.slug}/${x.id}?package=${x.code}`));
  return [
    `  <article class="sp-card gs-az-card" data-id="az-${esc(x.code.toLowerCase())}" data-category="${esc(category)}">`,
    '    <div class="sp-media">',
    `      <img src="${esc(x.img)}" alt="${esc(x.name)}" loading="lazy">`,
    '      <span class="sp-badge sp-partner">Azure</span>',
    `      <button type="button" class="sp-wish" data-wish="az-${esc(x.code.toLowerCase())}" aria-pressed="false" aria-label="Save ${esc(x.name)} to a wish list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 4.5 6.4 4.1c2-.2 3.8.8 5.6 2.9 1.8-2.1 3.6-3.1 5.6-2.9 3.8.4 5.5 4.3 4 7.7C19.5 16.4 12 21 12 21z"/></svg></button>`,
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

