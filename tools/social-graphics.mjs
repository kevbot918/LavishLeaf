// Social media graphics (owner, 2026-10-11): square posts, stories and the
// link-preview card, drawn as HTML in the site's colours and photographed by
// headless Chrome. Prices and photos come from products.json, so a rerun
// after a price change redraws them.
//   node tools/social-graphics.mjs
// Writes marketing/social/*.png (not committed: marketing/ is in .gitignore)
// and og-card.jpg at the root (the link preview every page points to).
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'marketing', 'social');
const BUILD = join(ROOT, 'marketing', 'build');
mkdirSync(OUT, { recursive: true }); mkdirSync(BUILD, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);
const { products } = JSON.parse(readFileSync(join(ROOT, 'products.json'), 'utf8'));
const P = (id) => { const p = products.find((x) => x.id === id); if (!p) throw new Error('no product ' + id); return p; };
const url = (f) => pathToFileURL(join(ROOT, f)).href;
const money = (c) => '$' + (c / 100).toFixed(2).replace(/\.00$/, '');
// Short names for the tiles, where the store name is too long to fit.
const LABEL = {
  'bg-south-of-france-foaming-hand-soap-8-oz': 'Foaming Hand Soap', 'bg-alba-botanica-very-emollient-body-lotion-32-oz': 'Alba Body Lotion',
  'bg-grandpa-soap-co-pine-tar-body-wash-95-oz': 'Pine Tar Body Wash', 'bg-earth-therapeutics-natural-bristle-body-brush': 'Bristle Body Brush',
  'bg-dr-plotkas-mouthwatchers-adult-toothbrush': 'Mouthwatchers Brush', 'bg-soothing-touch-bath-salts-32-oz': 'Bath Salts, 2 lb',
  'ae-waterproof-hiking-leg-gaiters': 'Hiking Gaiters', 'ae-quick-dry-microfiber-towel-20-x-47-in': 'Quick-Dry Towel', 'ae-crochet-lily-of-the-valley-with-pot': 'Crochet Lily Pot',
  'ae-crochet-penguin-with-coffee-mug': 'Coffee Penguin', 'ae-pressed-flower-crystal-bookmark': 'Flower Bookmark', 'ae-round-bird-wooden-jigsaw-puzzle': 'Bird Jigsaw',
  'ae-mini-garden-hand-tool-set-3-pieces': 'Mini Garden Tools', 'ae-self-watering-plant-pot-small': 'Self-Watering Pot', 'ae-animal-on-a-bicycle-wind-spinner': 'Wind Spinner',
  'ae-hanging-wooden-bird-feeder': 'Bird Feeder', 'ae-reflective-padded-dog-leash-5-ft': 'Reflective Leash', 'ae-carrot-rope-chew-toys-3-pack': 'Carrot Rope Toys',
  'ae-athletic-running-shorts-navy': 'Running Shorts', 'ae-soccer-shin-guards-neon-green': 'Shin Guards', 'ae-non-slip-yoga-mat-3-mm': 'Yoga Mat',
  'ae-secret-wooden-puzzle-box': 'Secret Puzzle Box', 'ae-vintage-pirate-playing-cards': 'Pirate Cards', 'ae-cotton-rope-ball-dog-toy': 'Rope Ball Toy',
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const BASE = `
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;700;800;900&family=Sriracha&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: var(--w); height: var(--h); background: #2e2e2e; color: #F2F4F2; font-family: 'Nunito Sans', sans-serif; overflow: hidden; position: relative; }
  .logo { height: 92px; }
  .leaf { color: #6FD65F; }
  .pill { display: inline-block; background: #4AB73C; color: #14261A; font-weight: 900; border-radius: 999px; padding: 10px 28px; }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; height: 110px; background: #252525; display: flex; align-items: center; justify-content: space-between; padding: 0 56px; font-size: 34px; font-weight: 800; }
  .foot .url { color: #6FD65F; }
  .photo { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,20,20,.15) 0%, rgba(20,20,20,.55) 45%, rgba(25,25,25,.96) 78%); }
  h1 { font-weight: 900; line-height: 1.02; letter-spacing: -.5px; }
  .grid { display: grid; gap: 22px; }
  .tile { background: #F2F4F2; border-radius: 22px; overflow: hidden; display: flex; flex-direction: column; }
  .tile .img { flex: 1; background: #fff center / contain no-repeat; margin: 14px; }
  .tile .cap { background: #3d3d3d; padding: 12px 16px; font-size: 24px; font-weight: 800; display: flex; justify-content: space-between; gap: 10px; }
  .tile .cap span:last-child { color: #6FD65F; white-space: nowrap; }
</style>`;

function page(name, w, h, body) {
  const html = `<!doctype html><html><head><meta charset="utf-8">${BASE}<style>:root{--w:${w}px;--h:${h}px}</style></head><body>${body}</body></html>`;
  const file = join(BUILD, name + '.html');
  writeFileSync(file, html);
  return { name, w, h, file };
}

// ---- a sale on a photo: compost, recycling, soccer
function offer(name, img, kicker, title, priceLine, oldLine, place, w = 1080, h = 1080) {
  return page(name, w, h, `
  <div class="photo" style="background-image:url('${url(img)}')"></div><div class="shade"></div>
  <img class="logo" src="${url('logo-oval.png')}" style="position:absolute;left:52px;top:46px">
  <div style="position:absolute;left:56px;right:56px;bottom:${h > 1100 ? 260 : 150}px">
    <div class="pill" style="font-size:40px;margin-bottom:22px">50% OFF</div>
    <div style="font-size:34px;font-weight:800;color:#C8CFC8;margin-bottom:8px">${esc(kicker)}</div>
    <h1 style="font-size:${h > 1100 ? 104 : 92}px">${esc(title)}</h1>
    <div style="font-size:56px;font-weight:900;margin-top:18px"><span class="leaf">${esc(priceLine)}</span> <s style="color:#9aa39a;font-size:40px">${esc(oldLine)}</s></div>
    <div style="font-size:32px;color:#C8CFC8;margin-top:12px">${esc(place)}</div>
  </div>
  <div class="foot"><span>Sign up online</span><span class="url">lavishleaf.org</span></div>`);
}

// ---- a shelf of products
function shelf(name, kicker, title, ids, cols = 3, sub = '') {
  const ps = ids.map(P);
  const rows = Math.ceil(ps.length / cols);
  return page(name, 1080, 1080, `
  <div style="padding:46px 52px 0;display:flex;align-items:center;justify-content:space-between">
    <div><div style="font-size:30px;font-weight:800;color:#6FD65F">${esc(kicker)}</div><h1 style="font-size:64px">${esc(title)}</h1>${sub ? `<div style="font-size:28px;color:#C8CFC8;margin-top:6px">${esc(sub)}</div>` : ''}</div>
    <img class="logo" src="${url('logo-oval.png')}" style="height:84px">
  </div>
  <div class="grid" style="position:absolute;left:52px;right:52px;top:${sub ? 236 : 196}px;bottom:140px;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">
    ${ps.map((p) => `<div class="tile"><div class="img" style="background-image:url('${url(p.image)}')"></div><div class="cap"><span>${esc(LABEL[p.id] || p.name.replace(/,.*$/, ''))}</span><span>${p.oldPrice ? '' : money(p.price)}</span></div></div>`).join('')}
  </div>
  <div class="foot"><span>Shop the store</span><span class="url">lavishleaf.org/store</span></div>`);
}

// ---- SeedsNow (affiliate: say so on the image, FTC)
function seeds(name, img, title, lines, w = 1080, h = 1080) {
  return page(name, w, h, `
  <div class="photo" style="background-image:url('${url(img)}')"></div><div class="shade"></div>
  <img class="logo" src="${url('logo-oval.png')}" style="position:absolute;left:52px;top:46px">
  <div style="position:absolute;left:56px;right:56px;bottom:${h > 1100 ? 260 : 150}px">
    <div class="pill" style="font-size:30px;margin-bottom:22px">OUR PARTNER: SEEDSNOW</div>
    <h1 style="font-size:${h > 1100 ? 100 : 88}px">${esc(title)}</h1>
    ${lines.map((l) => `<div style="font-size:36px;font-weight:700;margin-top:14px;color:#E3E8E3">${esc(l)}</div>`).join('')}
    <div style="font-size:24px;color:#9aa39a;margin-top:18px">Affiliate link: Lavish Leaf earns a commission on SeedsNow orders, at no extra cost to you.</div>
  </div>
  <div class="foot"><span>Link in bio</span><span class="url">lavishleaf.org/store</span></div>`);
}

const jobs = [
  offer('compost-50', 'images/compost-bucket.jpg', 'Compost Pick-Up', 'Turn kitchen scraps into living soil', '$15 a month', '$30', 'Stigler, McAlester, Checotah and 25 miles around'),
  offer('recycling-50', 'images/recycling-bins.jpg', 'Recycling Pick-Up', 'We pick up your recycling', '$15 a month', '$30', 'Cardboard, paper, cans, glass and plastics. You pick the day.'),
  offer('soccer-50', 'images/soccer-player.jpg', 'Adult 7v7 Soccer League', 'Sunday soccer in Eufaula and McAlester', '$15 a player', '$30', 'Or register a whole team for $150 (was $300)'),
  offer('compost-50-story', 'images/compost-bucket.jpg', 'Compost Pick-Up', 'Turn kitchen scraps into living soil', '$15 a month', '$30', 'Stigler, McAlester, Checotah and 25 miles around', 1080, 1920),
  shelf('squishies', 'New in Games & Gifts', 'Squishies', ['ae-strawberry-mochi-squishy', 'ae-dumpling-squishy', 'ae-fluffy-taba-cat-squishy-13-cm', 'ae-toast-bread-squishy', 'ae-strawberry-bread-bun-squishy', 'ae-chubby-cat-squishy'], 3, 'Slow-rising, squeezable, stress-melting'),
  shelf('personal-care', 'Natural brands', 'Personal Care', ['bg-soothing-touch-bath-salts-32-oz', 'bg-south-of-france-foaming-hand-soap-8-oz', 'bg-dr-plotkas-mouthwatchers-adult-toothbrush', 'bg-alba-botanica-very-emollient-body-lotion-32-oz', 'bg-grandpa-soap-co-pine-tar-body-wash-95-oz', 'bg-earth-therapeutics-natural-bristle-body-brush'], 3, 'Soaps, lotions, oral care and bath'),
  shelf('outdoors', 'Gear for game day and the trail', 'Recreation & Outdoors', ['ae-soccer-shin-guards-neon-green', 'ae-athletic-running-shorts-navy', 'ae-non-slip-yoga-mat-3-mm', 'ae-waterproof-hiking-leg-gaiters', 'ae-quick-dry-microfiber-towel-20-x-47-in', 'ae-hiking-compass'], 3, 'Athletic wear, soccer, hiking and camping'),
  shelf('games-gifts', 'Wholesome and handmade', 'Games & Gifts', ['ae-secret-wooden-puzzle-box', 'ae-elephant-wooden-jigsaw-puzzle', 'ae-vintage-pirate-playing-cards', 'ae-crochet-lizard-coaster', 'ae-walnut-phone-stand', 'ae-pressed-flower-crystal-bookmark'], 3, 'Wooden puzzles, cards, crochet and keepsakes'),
  shelf('garden', 'Grow something', 'Farm & Garden', ['ae-mini-garden-hand-tool-set-3-pieces', 'ae-fabric-grow-bag', 'ae-long-spout-watering-can', 'ae-self-watering-plant-pot-small', 'ae-hanging-wooden-bird-feeder', 'ae-animal-on-a-bicycle-wind-spinner'], 3, 'Tools, pots and garden decor'),
  shelf('pets', 'For the dog and the cat', 'Pets', ['ae-reflective-padded-dog-leash-5-ft', 'ae-padded-dog-collar', 'ae-pet-grooming-glove', 'ae-poop-bag-dispenser', 'ae-cotton-rope-ball-dog-toy', 'ae-carrot-rope-chew-toys-3-pack'], 3, 'Leashes, collars, grooming and toys'),
  seeds('seedsnow-grow', 'marketing/photos/sprouts.jpg', 'Grow your own food', ['Non-GMO, open-pollinated seeds', 'Vegetables, herbs, flowers and garlic', 'Shipped to your door']),
  seeds('seedsnow-fall', 'marketing/photos/seedlings.jpg', 'Fall is for planting', ['Garlic, greens and cover crops', 'Start now, harvest in spring']),
  seeds('seedsnow-story', 'marketing/photos/sprouts.jpg', 'Grow your own food', ['Non-GMO, open-pollinated seeds', 'Vegetables, herbs, flowers and garlic'], 1080, 1920),
  // The link preview for every page (Facebook, texts, Slack): 1200 x 630.
  page('og-card', 1200, 630, `
  <div class="photo" style="background-image:url('${url('marketing/photos/sprouts.jpg')}');left:600px"></div>
  <div style="position:absolute;left:0;top:0;bottom:0;width:640px;background:linear-gradient(90deg,#2e2e2e 88%,rgba(46,46,46,0));padding:56px 60px">
    <img src="${url('logo-oval.png')}" style="height:120px">
    <h1 style="font-size:52px;margin-top:30px">Organic living, local sports and an eco store</h1>
    <div style="font-size:26px;color:#C8CFC8;margin-top:16px">Compost and recycling pick-up, adult soccer, natural goods. Eastern Oklahoma.</div>
    <div style="font-size:30px;font-weight:900;color:#6FD65F;margin-top:22px">lavishleaf.org</div>
  </div>`),
];

const prof = join(tmpdir(), 'll-social-chrome');
for (const j of jobs) {
  const png = j.name === 'og-card' ? join(BUILD, 'og-card.png') : join(OUT, j.name + '.png');
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${prof}`,
    `--window-size=${j.w},${j.h}`, '--virtual-time-budget=8000', `--screenshot=${png}`, pathToFileURL(j.file).href], { stdio: 'ignore' });
  console.log('wrote', png);
}
