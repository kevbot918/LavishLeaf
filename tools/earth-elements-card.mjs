// One Earth Elements Organics card and our Refersion affiliate link
// (2026-10-23). Shared by tools/earth-elements-shelf.mjs (Green Swaps) and
// tools/render-store.mjs (the "Herbal Oils & Balms" Home shelf). Every link,
// to the shop or to a product, carries our Refersion code.
export const AFF = 'rfsn=9384641.e38de7&utm_source=refersion&utm_medium=affiliate&utm_campaign=9384641.e38de7';
export const SHELF = 'Herbal Oils & Balms';
export const eeLink = (path = '/') => 'https://earthelementsorganics.net' + path + (path.includes('?') ? '&' : '?') + AFF;
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export const money = (n) => '$' + Number(n).toFixed(2);
export const priceText = (x) => (x.from ? 'from ' : '') + money(x.price);
// Under every herbal card's pop-up and on the shelves: these are cosmetics
// and traditional herbal products, not medicine.
export const FDA = 'These statements have not been evaluated by the Food and Drug Administration. These products are not intended to diagnose, treat, cure, or prevent any disease.';

export function eeCard(x, category = SHELF) {
  const href = esc(eeLink('/products/' + x.handle));
  return [
    `  <article class="sp-card gs-ee-card" data-id="ee-${esc(x.handle)}" data-category="${esc(category)}">`,
    '    <div class="sp-media">',
    `      <img src="${esc(x.img)}" alt="${esc(x.name)}" loading="lazy">`,
    '      <span class="sp-badge sp-partner">Earth Elements</span>',
    `      <button type="button" class="sp-wish" data-wish="ee-${esc(x.handle)}" aria-pressed="false" aria-label="Save ${esc(x.name)} to a wish list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 4.5 6.4 4.1c2-.2 3.8.8 5.6 2.9 1.8-2.1 3.6-3.1 5.6-2.9 3.8.4 5.5 4.3 4 7.7C19.5 16.4 12 21 12 21z"/></svg></button>`,
    '    </div>',
    `    <h3 class="sp-name">${esc(x.name)}</h3>`,
    `    <p class="sp-blurb">${esc(x.blurb)}</p>`,
    '    <div class="sp-foot">',
    `      <span class="sp-price" data-ee-price="${esc(x.handle)}">${esc(priceText(x))}</span>`,
    `      <a class="btn btn-sm" href="${href}" target="_blank" rel="sponsored noopener" data-affiliate="Earth Elements Organics">View at Earth Elements</a>`,
    '    </div>',
    '  </article>',
  ].join('\n');
}
