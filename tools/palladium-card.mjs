// One Palladium Boots card and our Ascend (Partnerize) affiliate link
// (2026-10-15). Shared by tools/palladium-shelf.mjs (Green Swaps) and
// tools/render-store.mjs (the Home shelf and the Recreation & Outdoors picks).
// A deep link is our tracking link plus ?url=<the Palladium page>: Partnerize
// sends the shopper to that page with our click id (measured 2026-10-15).
export const TRACK = 'https://www.pjtra.com/t/8-12824-393795-275481';
export const FALL20 = 'https://www.pjatr.com/t/2-634650-393795-275481';
export const palladiumLink = (path = '/') => TRACK + '?url=' + encodeURIComponent('https://palladiumboots.com' + path);
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export const money = (n) => '$' + Number(n).toFixed(2);
export const priceText = (x) => x.was && x.was > x.price ? money(x.price) + ', was ' + money(x.was) : money(x.price);

export function palladiumCard(x, category = 'Palladium Boots') {
  const href = esc(palladiumLink('/products/' + x.handle));
  return [
    `  <article class="sp-card gs-pd-card" data-id="pd-${esc(x.handle)}" data-category="${esc(category)}">`,
    '    <div class="sp-media">',
    `      <img src="${esc(x.img)}" alt="${esc(x.name)}" loading="lazy">`,
    '      <span class="sp-badge sp-partner">Palladium</span>',
    // A small "Sale" tag top right (owner, 2026-10-15); store.js keeps it current.
    `      <span class="sp-sale"${x.was && x.was > x.price ? '' : ' hidden'}>Sale</span>`,
    '    </div>',
    `    <h3 class="sp-name">${esc(x.name)}</h3>`,
    `    <p class="sp-blurb">${esc(x.blurb)}</p>`,
    '    <div class="sp-foot">',
    `      <span class="sp-price" data-pd-price="${esc(x.handle)}">${esc(priceText(x))}</span>`,
    `      <a class="btn btn-sm" href="${href}" target="_blank" rel="sponsored noopener" data-affiliate="Palladium Boots">View at Palladium</a>`,
    '    </div>',
    '  </article>',
  ].join('\n');
}
