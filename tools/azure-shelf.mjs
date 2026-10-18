// Azure Standard on the Store (owner, 2026-10-14: "add them into our online
// store ... display their lines and products in an organized manner ... their
// own home shelf category below pets ... prices can stay up to date and
// products in stock can stay up to date and each product has our link").
//
//   node tools/azure-shelf.mjs
//
// Reads Azure's public product API (api.azurestandard.com/packaged-products,
// the same one azurestandard.com uses) for each product below: size, retail
// price, stock and photo. Writes:
//   * azure-home.json: every product, by shelf, for tools/render-store.mjs
//     (the "Azure Standard" Home shelf, after Pets);
//   * netlify/lib/azure-codes.mjs: the package codes the live-price function
//     (functions/azure-prices.mjs) asks Azure about;
//   * store.html between the AZURE markers: the Azure section of Green Swaps
//     (what Azure is, Find a Drop and How Azure works, then one shelf per line);
//   * images/azure/<code>.jpg: 360 px thumbnails (Azure's own photos are
//     about 3 MB each), through tools/thumbs.ps1.
// No seeds (owner: SeedsNow covers seeds). Every link carries our affiliate
// id (a_aid). Rerun it to change the selection; prices and stock refresh by
// themselves on the page.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AID, azureCard, azureLink, esc } from './azure-card.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// [slug, product id, package code, name] per shelf, from Azure's most-reviewed
// products in each category (read 2026-10-14).
const SHELVES = [
  ['Flour and grains', 'Organic wheat, oats, rice, and flours, by the bag or in bulk.', [
    ['all-purpose-flour-unbleached-organic', 11444, 'FL080', 'All Purpose Flour, Unbleached, Organic'],
    ['hard-red-wheat-organic', 11656, 'GR062', 'Hard Red Wheat, Organic'],
    ['hard-white-wheat-organic', 9635, 'GR112', 'Hard White Wheat, Organic'],
    ['oats-rolled-organic', 9496, 'CE202', 'Rolled Oats, Organic'],
    ['artisan-bakers-craft-unbleached-white-wheat-flour-organic', 11445, 'DFL076', 'Artisan Bakers Craft White Flour, Organic'],
    ['soft-white-wheat-organic', 11650, 'GR120', 'Soft White Wheat, Organic'],
    ['spelt-grain-organic', 10847, 'GR102', 'Spelt Grain, Organic'],
    ['quinoa-white-organic', 10219, 'GR128', 'White Quinoa, Organic'],
    ['rice-white-basmati-organic-gluten-free', 17148, 'GR073', 'White Basmati Rice, Organic'],
    ['polenta-corn-grits-organic', 24936, 'CE123', 'Polenta Corn Grits, Organic'],
    ['oats-steel-cut-organic', 10944, 'CE229', 'Steel Cut Oats, Organic'],
    ['bread-flour-100-whole-white-wheat-unifine-organic', 8434, 'FL034', 'Whole White Wheat Bread Flour, Organic'],
    ['spelt-flour-unifine-organic', 6425, 'FL084', 'Spelt Flour, Organic'],
    ['einkorn-flour-unifine-organic', 15702, 'FL250', 'Einkorn Flour, Organic'],
    ['rice-thai-jasmine-white-organic', 27872, 'GR361', 'Thai Jasmine White Rice, Organic'],
    ['popcorn-yellow-organic', 10088, 'GR071', 'Yellow Popcorn, Organic'],
    ['cornmeal-organic', 7430, 'FL013', 'Cornmeal, Organic'],
    ['rolled-oats-gf-organic', 17886, 'CE617', 'Rolled Oats, Gluten Free, Organic'],
    ['popcorn-multicolored-organic', 10083, 'GR174', 'Popcorn, Multicolored, Organic'],
    ['rice-jasmine-brown-organic-gluten-free', 8669, 'GR134', 'Rice, Jasmine Brown, Organic, Gluten Free'],
    ['pastry-flour-whole-wheat-unifine-organic', 11726, 'FL051', 'Pastry Flour, Whole Wheat (Unifine), Organic'],
    ['amaranth-organic', 6202, 'GR079', 'Amaranth, Organic'],
    ['rice-sprouted-brown-calrose-organic', 10906, 'GR184', 'Rice, Sprouted, Brown, Calrose, Organic'],
    ['einkorn-grain-organic', 14760, 'GR198', 'Einkorn Grain, Organic'],
  ]],
  ['Beans and baking', 'Dry beans, lentils, and the baking shelf.', [
    ['black-beans-organic', 6625, 'BE094', 'Black Beans, Organic'],
    ['pinto-beans-organic', 10007, 'BE086', 'Pinto Beans, Organic'],
    ['garbanzo-beans-chick-peas-organic', 12542, 'BE246', 'Garbanzo Beans, Organic'],
    ['lentils-red-organic', 18374, 'BE049', 'Red Lentils, Organic'],
    ['real-salt-fine-granular', 10302, 'BP104', 'Real Salt, Fine'],
    ['celtic-sea-salt-fine', 7054, 'BP112', 'Celtic Sea Salt, Fine'],
    ['yeast-dry-active', 11811, 'BP334', 'Dry Active Yeast'],
    ['rumford-baking-powder-non-aluminum', 10538, 'BP005', 'Rumford Baking Powder'],
    ['himalayan-pink-crystal-salt', 14168, 'HS1694', 'Himalayan Pink Salt'],
    ['arrowroot-powder-gluten-free', 6334, 'BP794', 'Arrowroot Powder'],
    ['lentils-green-organic', 8887, 'BE010', 'Green Lentils, Organic'],
    ['peas-green-split-organic', 8361, 'BE059', 'Green Split Peas, Organic'],
    ['cane-sugar-organic', 7883, 'SW079', 'Cane Sugar, Organic'],
    ['baking-soda', 6490, 'BP008', 'Baking Soda'],
    ['baking-powder', 29726, 'BP713', 'Baking Powder'],
    ['vanilla-extract-organic', 9024, 'BP046', 'Vanilla Extract, Organic'],
    ['cocoa-powder-organic', 7282, 'BP833', 'Cocoa Powder, Organic'],
    ['chocolate-chips-semi-sweet-organic', 15112, 'BP323', 'Semi-Sweet Chocolate Chips, Organic'],
    ['sea-salt', 10607, 'BP066', 'Sea Salt'],
    ['celtic-sea-salt-crystals-light-grey', 10608, 'BP110', 'Celtic Sea Salt Crystals, Light Grey'],
    ['extract-pure-vanilla-organic', 7911, 'BP019', 'Extract, Pure Vanilla, Organic'],
    ['cacao-powder-organic', 21702, 'BP444', 'Cacao Powder, Organic'],
    ['corn-starch-organic', 21242, 'BP431', 'Corn Starch, Organic'],
    ['onion-powder-organic', 9556, 'HS601', 'Onion Powder, Organic'],
  ]],
  ['Oils, honey, and condiments', 'Cooking oils, raw honey, maple syrup, vinegar, and sauces.', [
    ['olive-oil-extra-virgin-cold-pressed-organic', 18556, 'OL427', 'Extra Virgin Olive Oil, Organic'],
    ['coconut-oil-expeller-pressed-organic', 17888, 'OL377', 'Coconut Oil, Expeller Pressed, Organic'],
    ['avocado-oil-cold-pressed-refined-organic', 28250, 'OL429', 'Avocado Oil, Organic'],
    ['honey-raw-berrywildflower', 8557, 'SW356', 'Raw Honey, Berry and Wildflower'],
    ['honey-raw-clover', 8558, 'SW084', 'Raw Clover Honey'],
    ['palm-fruit-shortening-organic', 14562, 'OL219', 'Palm Fruit Shortening, Organic'],
    ['liquid-aminos', 8932, 'CO012', 'Liquid Aminos'],
    ['sucanat-organic-fair-trade', 11037, 'SW061', 'Sucanat, Organic, Fair Trade'],
    ['tamari-soy-sauce-gold-gluten-free-organic', 11151, 'CO107', 'Tamari Soy Sauce, Organic'],
    ['tomato-paste-in-glass-organic', 11325, 'GY179', 'Tomato Paste in Glass, Organic'],
    ['maple-syrup-grade-a-dark-robust-organic', 9086, 'SW018', 'Maple Syrup, Grade A Dark, Organic'],
    ['molasses-blackstrap-organic', 26862, 'SW453', 'Blackstrap Molasses, Organic'],
    ['coconut-sugar-crystals-organic', 18554, 'SW406', 'Coconut Sugar, Organic'],
    ['vinegar-raw-apple-cider-organic', 11564, 'CO894', 'Raw Apple Cider Vinegar, Organic'],
    ['ketchup-organic', 30634, 'CO1048', 'Ketchup, Organic'],
    ['dijon-mustard-organic', 30456, 'CO1025', 'Dijon Mustard, Organic'],
    ['coconut-aminos-organic', 28464, 'CO942', 'Coconut Aminos, Organic'],
    ['vinegar-balsamic-organic', 27356, 'CO1050', 'Balsamic Vinegar, Organic'],
    ['molasses-blackstrap-organic-fair-trade', 9272, 'SW052', 'Molasses, Blackstrap, Organic, Fair Trade'],
    ['sauerkraut', 10581, 'CO164', 'Sauerkraut'],
    ['honey-raw-orange-blossom', 8559, 'SW355', 'Honey, Raw, Orange Blossom'],
    ['honey-raw-wildflower-organic', 27166, 'SW438', 'Honey, Raw, Wildflower, Organic'],
    ['kosher-dill-pickles', 28260, 'CO160', 'Kosher Dill Pickles'],
    ['pumpkin-canned-organic', 10176, 'GY232', 'Pumpkin, Canned, Organic'],
  ]],
  ['Snacks, nuts, and drinks', 'Nuts, chips, coffee, and herbal tea.', [
    ['peanuts-dry-roasted-no-salt-organic', 9829, 'NU052', 'Dry Roasted Peanuts, Organic'],
    ['almonds-raw-organic', 6163, 'NU114', 'Raw Almonds, Organic'],
    ['pistachios-in-shell-roasted-salted-organic', 31736, 'NU417', 'Pistachios, Roasted and Salted, Organic'],
    ['banana-chips-organic', 9618, 'DF128', 'Banana Chips, Organic'],
    ['raisins-thompson-select-organic', 10231, 'DF062', 'Thompson Raisins, Organic'],
    ['cranberries-dried-apple-juice-infused-organic', 7473, 'DF175', 'Dried Cranberries, Organic'],
    ['coconut-medium-shredded-organic', 7331, 'BP259', 'Shredded Coconut, Organic'],
    ['walnuts-raw-organic', 9668, 'NU058', 'Raw Walnuts, Organic'],
    ['cashews-raw-large-white-pieces-organic', 7018, 'NU018', 'Raw Cashew Pieces, Organic'],
    ['medjool-dates-unpitted-organic', 9122, 'DF018', 'Medjool Dates, Organic'],
    ['pumpkin-seeds-dry-roasted-salted-organic', 26908, 'SE350', 'Pumpkin Seeds, Roasted and Salted, Organic'],
    ['tortilla-chips-organic', 35656, 'SN2548', 'Tortilla Chips, Organic'],
    ['coffee-whole-bean-private-reserve-medium-roast-organic', 29116, 'CS258', 'Whole Bean Coffee, Medium Roast, Organic'],
    ['coffee-ground-cornerstone-dark-roast-organic', 29114, 'CS253', 'Ground Coffee, Dark Roast, Organic'],
    ['chamomile-flowers-whole-organic', 7059, 'HS683', 'Chamomile Flowers, Organic'],
    ['hibiscus-flower-cut-sifted-organic', 30598, 'HS1951', 'Hibiscus Flowers, Organic'],
    ['coconut-milk-17-19-fat-no-guar-organic', 30660, 'GY1459', 'Coconut Milk, Organic'],
    ['king-coconut-water-organic', 30392, 'JS796', 'King Coconut Water, Organic'],
    ['mango-dried-organic', 9061, 'DF104', 'Mango, Dried, Organic'],
    ['lemon-juice-100-organic', 5933, 'JS025', 'Lemon Juice, 100%, Organic'],
    ['brazil-nuts-raw-organic', 19196, 'NU020', 'Brazil Nuts, Raw, Organic'],
    ['chocolate-chips-mini-semi-sweet-organic', 15110, 'BP320', 'Chocolate Chips, Mini, Semi Sweet, Organic'],
    ['chocolate-chips-dark-allergen-free-organic', 15724, 'BP832', 'Chocolate Chips, Dark, Allergen Free, Organic'],
    ['coconut-chipped-organic', 7293, 'DBP035', 'Coconut, Chipped, Organic'],
  ]],
  ['Fresh and frozen, to a Drop', 'Produce, dairy, and meat travel on Azure\'s refrigerated trucks to a local Drop.', [
    ['onions-yellow-organic', 9564, 'QP018', 'Yellow Onions, Organic'],
    ['potatoes-russet-organic', 10100, 'QP139', 'Russet Potatoes, Organic'],
    ['carrots-1-organic', 7004, 'QP165', 'Carrots, Organic'],
    ['garlic-organic', 8160, 'QP324', 'Garlic, Organic'],
    ['garden-peas-frozen-organic', 8146, 'FG164', 'Garden Peas, Frozen, Organic'],
    ['potatoes-yellow-organic', 10101, 'QP172', 'Yellow Potatoes, Organic'],
    ['sweet-corn-frozen-organic', 11105, 'FG163', 'Sweet Corn, Frozen, Organic'],
    ['mozzarella-cheese-whole-milk', 9302, 'CH064', 'Whole Milk Mozzarella'],
    ['blueberries-whole-frozen-organic', 23328, 'FG975', 'Blueberries, Frozen, Organic'],
    ['broccoli-florets-frozen-organic', 6780, 'FG168', 'Broccoli Florets, Frozen, Organic'],
    ['lemons-organic', 8877, 'QP058', 'Lemons, Organic'],
    ['avocado-medium-organic', 6382, 'QP004', 'Avocados, Organic'],
    ['butter-salted-organic', 19624, 'DP295', 'Salted Butter, Organic'],
    ['sour-cream-organic', 10788, 'DP006', 'Sour Cream, Organic'],
    ['cream-cheese-organic', 7495, 'CH135', 'Cream Cheese, Organic'],
    ['whole-milk-a2-4-organic', 28576, 'DP571', 'Whole Milk, A2, Organic'],
    ['ground-beef-8020-grass-fed-frozen', 27768, 'MT975', 'Ground Beef 80/20, Grass-Fed, Frozen'],
    ['chicken-breast-boneless-skinless-organic-frozen-random-weight', 20006, 'MT869', 'Chicken Breast, Organic, Frozen'],
    ['green-beans-frozen-organic', 8341, 'FG161', 'Green Beans, Frozen, Organic'],
    ['celery-organic', 7046, 'QP063', 'Celery, Organic'],
    ['potatoes-red-organic', 10340, 'QP034', 'Potatoes, Red, Organic'],
    ['carrots-2-organic', 7005, 'QP170', 'Carrots #2, Organic'],
    ['hashbrowns-southern-style-frozen-organic', 27162, 'FG661', 'Hashbrowns, Southern Style, Frozen, Organic'],
    ['beets-red-fresh-organic', 6576, 'QP033', 'Beets, Red, Fresh, Organic'],
    ['buttermilk-powder-non-instant-organic', 6874, 'BP151', 'Buttermilk Powder, Non-Instant, Organic'],
  ]],
  ['Household and canning', 'Azure Clean soaps and cleaners, canning jars, bamboo paper.', [
    ['dish-soap-citrus', 26878, 'NF1621', 'Dish Soap, Citrus'],
    ['dish-soap-fragrance-free', 21068, 'NF1618', 'Dish Soap, Fragrance Free'],
    ['dishwasher-gel', 29820, 'NF1756', 'Dishwasher Gel'],
    ['automatic-dishwasher-powder', 21088, 'NF2120', 'Dishwasher Powder'],
    ['wide-mouth-glass-gallon-jars-without-lids', 11737, 'PS018', 'Glass Gallon Jars, Wide Mouth'],
    ['gamma-seal-lid-for-5-gallon-plastic-pail', 8135, 'NF094', 'Gamma Seal Lid, 5 Gallon Pail'],
    ['empty-5-gallon-plastic-pailbucket-without-lid', 7838, 'PS092', 'Plastic Bucket, 5 Gallon'],
    ['wide-mouth-glass-12-gallon-jars-without-lids', 11919, 'PS140', 'Glass Half-Gallon Jars, Wide Mouth'],
    ['6-everyday-beeswax-candles-value-size', 5990, 'NF392', 'Beeswax Candles, 6 in'],
    ['parchment-baking-paper', 12222, 'NF669', 'Parchment Baking Paper'],
    ['all-purpose-household-cleaner', 21078, 'NF997', 'All Purpose Household Cleaner'],
    ['castile-liquid-soap-pure-unscented-aloe-mild-organic', 34402, 'HB2269', 'Castile Liquid Soap, Unscented, Organic'],
    ['canning-jars-quart-wide-mouth-with-lids-bands', 32032, 'NF010', 'Canning Jars, Quart, Wide Mouth'],
    ['canning-jars-pint-wide-mouth-with-lids-bands', 34376, 'NF811', 'Canning Jars, Pint, Wide Mouth'],
    ['canning-jars-half-gallon-wide-mouth-with-lids-bands', 32034, 'NF011', 'Canning Jars, Half-Gallon, Wide Mouth'],
    ['bamboo-toilet-paper-3-ply-365-sheets', 34598, 'NF2290', 'Bamboo Toilet Paper, 3 Ply'],
    ['wide-metal-lids', 11735, 'PS019', 'Lid Wide Mouth Metal, Gallon & 1/2 Gallon Jars'],
    ['large-baking-cups-fsc-certified-2-12-in', 12216, 'NF663', 'Large Baking Cups, FSC Certified, 2 1/2 in.'],
    ['empty-2-gallon-plastic-pailbucket-without-lid', 12390, 'PS087', 'Plastic Bucket, No Lid, 2 Gallon'],
    ['gamma-seal-lid-for-2-gallon-pail', 12388, 'NF086', 'Gamma Seal Lid for 2 Gallon Pail'],
    ['cheesecloth-unbleached', 12196, 'NF643', 'Cheesecloth, Unbleached'],
    ['clamp-on-lid-for-5-gallon-plastic-pail', 7247, 'PS093', 'Lid for Plastic Bucket, 5 Gallon'],
  ]],
  ['Health and beauty', 'Simple body care and pantry staples for the medicine cabinet.', [
    ['hand-soap-citrus', 27144, 'NF1700', 'Hand Soap, Citrus'],
    ['hand-soap-fragrance-free', 27142, 'NF1694', 'Hand Soap, Fragrance Free'],
    ['castile-liquid-soap-pure-citrus-organic', 34408, 'HB2221', 'Castile Liquid Soap, Citrus, Organic'],
    ['shampoo-bar-castile-rosemary-lavender-organic', 35798, 'HB1964', 'Shampoo Bar, Rosemary and Lavender, Organic'],
    ['cream-manuka-honey-intensive-skin-healing-grass-fed-tallow-paleo', 27310, 'HB1475', 'Manuka Honey Tallow Cream'],
    ['hemp-baby-mild-pure-castile-soap-organic', 8474, 'HB019', 'Hemp Baby Mild Castile Soap, Organic'],
    ['xylitol-gum-spearmint', 11883, 'HB408', 'Xylitol Gum, Spearmint'],
    ['tea-tree-neem-toothpaste-wintergreen', 11179, 'HB696', 'Tea Tree Neem Toothpaste, Wintergreen'],
    ['all-in-one-pure-castile-soap-fragrance-free', 17422, 'HB1011', 'All-In-One Castile Soap, Fragrance Free'],
    ['shampoo-bar-handcrafted-herbal-fusion-normal-to-dry-hair-chemical-free', 12776, 'HB427', 'Shampoo Bar, Herbal, Normal to Dry Hair'],
    ['castor-oil-organic', 32820, 'HB1767', 'Castor Oil, Organic'],
    ['epsom-salt', 7868, 'HB1121', 'Epsom Salt'],
    ['beeswax-granules-yellow-organic', 34614, 'NF2297', 'Beeswax Granules, Organic'],
    ['activated-charcoal-powder', 7074, 'HS386', 'Activated Charcoal Powder'],
    ['cream-eucalyptus-tea-tree-soothing-itch-relief-grass-fed-tallow-paleo', 27302, 'HB1463', 'Cream, Eucalyptus & Tea Tree, Soothing Itch-Relief, Grass-Fed Tallow, Paleo'],
    ['cream-frankincense-sweet-myrrh-intensive-skin-healing', 33262, 'HB1810', 'Cream, Frankincense & Sweet Myrrh, Intensive Skin Healing'],
    ['smart-floss', 14068, 'HB826', 'Smart Floss'],
    ['pure-and-natural-crystal-stick', 10190, 'HB948', 'Pure and Natural Crystal Stick'],
    ['coconut-shampoo', 7627, 'HB361', 'Coconut Shampoo'],
  ]],
  ['Farm and animal feed', 'Organic feed grains and farm supplies (no seeds: see SeedsNow).', [
    ['whole-oats-with-hulls-animal-feed-organic', 11712, 'GP034', 'Whole Oats, Animal Feed, Organic'],
    ['chicken-wheat-animal-feed-organic', 7134, 'GP073', 'Chicken Wheat, Animal Feed, Organic'],
    ['whole-barley-animal-feed-organic', 11698, 'GP168', 'Whole Barley, Animal Feed, Organic'],
    ['alfalfa-pellets-organic', 14652, 'GP491', 'Alfalfa Pellets, Organic'],
    ['chicken-and-duck-feed-16-soy-and-corn-free-organic', 14948, 'GP493', 'Chicken and Duck Feed 16%, Organic'],
    ['poultry-layer-mash-no-cornsoy-organic', 14658, 'GP492', 'Poultry Layer Mash, No Corn or Soy, Organic'],
    ['whole-field-peas-animal-feed-organic', 17274, 'GP559', 'Whole Field Peas, Animal Feed, Organic'],
    ['poultry-scratch-no-cornsoy-organic', 15962, 'GP520', 'Poultry Scratch, No Corn or Soy, Organic'],
    ['naturally-free-poultry-grower-feed-organic', 15974, 'GP521', 'Poultry Grower Feed, Organic'],
    ['fertilizer-granules-4-3-2-organic', 7979, 'GP272', 'Organic Fertilizer Granules 4-3-2'],
    ['poultry-6x10-grit-calcium-carbonate', 17332, 'GP1359', 'Poultry Grit, Calcium Carbonate'],
    ['whole-yellow-corn-animal-feed-organic', 25340, 'GP850', 'Whole Yellow Corn, Animal Feed, Organic'],
    ['diatomaceous-earth-codex-grade', 7664, 'GP009', 'Diatomaceous Earth, Codex Grade'],
    ['kelp-granules-asco-animal-blue-label-organic', 8729, 'GP100', 'Kelp Granules for Animals, Organic'],
    ['poultry-layer-pellets-soy-free-corn-free-organic', 19954, 'GP003', 'Poultry Layer Pellets, Soy Free, Corn Free, Organic'],
    ['animal-salt-trace-mineral-selenium-90', 13882, 'GP040', 'Animal Salt, Trace Mineral Selenium 90'],
    ['chicken-and-duck-feed-layer-pellets-16-soy-and-corn-free-organic', 28296, 'GP1069', 'Chicken and Duck Feed, Layer Pellets 16%, Soy and Corn Free, Organic'],
    ['rabbit-pellets-organic', 19960, 'GP602', 'Rabbit Pellets, Organic'],
    ['chick-starter-poultry-grower-crumbles-organic', 19964, 'GP030', 'Chick Starter & Poultry Grower Crumbles, Organic'],
    ['corn-coarse-ground-animal-feed-organic', 29542, 'GP1141', 'Coarse Ground Corn, Animal Feed, Organic'],
  ]],
];
// The Home shelf: the first few of each line, so it shows the range.
const HOME_PER_SHELF = Infinity; // every product (owner, 2026-10-14: side-scroll through all of them)


async function facts(codes) {
  const out = {};
  for (let i = 0; i < codes.length; i += 40) {
    const res = await fetch('https://api.azurestandard.com/packaged-products?limit=100&code=' + codes.slice(i, i + 40).join(','), { headers: { 'User-Agent': 'Mozilla/5.0 (lavishleaf.org affiliate shelf)' } });
    if (!res.ok) throw new Error('Azure said ' + res.status);
    for (const p of await res.json()) out[p.code] = p;
  }
  return out;
}

const codes = [...new Set(SHELVES.flatMap(([, , items]) => items.map((x) => x[2])))];
const F = await facts(codes);
const dl = [];
const shelves = SHELVES.map(([title, note, items]) => ({
  title, note,
  items: items.filter((x) => F[x[2]]).map(([slug, id, code, name]) => {
    const p = F[code];
    const img = 'images/azure/' + code.toLowerCase() + '.jpg';
    if (p.images && p.images[0] && !existsSync(join(ROOT, img))) dl.push([p.images[0], img]);
    return { code, id, slug, name, size: p.size || '', price: p.price && p.price.retail ? p.price.retail.dollars : null, stock: p.stock, img };
  }),
}));
mkdirSync(join(ROOT, 'images', 'azure'), { recursive: true });
if (dl.length) {
  const list = join(ROOT, 'tools', '.thumbs-azure.json');
  writeFileSync(list, JSON.stringify(dl));
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT, 'tools', 'thumbs.ps1'), list, ROOT], { stdio: 'inherit' });
}
for (const s of shelves) s.items = s.items.filter((x) => existsSync(join(ROOT, x.img)));

const today = new Date().toISOString().slice(0, 10);
const home = shelves.flatMap((s) => s.items.slice(0, HOME_PER_SHELF).map((x) => x.code));
writeFileSync(join(ROOT, 'azure-home.json'), JSON.stringify({ _help: 'Written by tools/azure-shelf.mjs; drawn by tools/render-store.mjs (Home shelf "Azure Standard") and in Green Swaps. Public facts only; prices and stock refresh live from functions/azure-prices.mjs.', aid: AID, at: today, home, shelves }, null, 1) + '\n');
writeFileSync(join(ROOT, 'netlify', 'lib', 'azure-codes.mjs'), `// GENERATED by tools/azure-shelf.mjs on ${today}. The Azure Standard package codes on the Store.\nexport const AZURE_CODES = ${JSON.stringify(shelves.flatMap((s) => s.items.map((x) => x.code)))};\n`);

const DROP = azureLink('/drop-point-locator');
const HOW = azureLink('/get-organic-products-delivered');
const html = [
  `<!-- AZURE:START (generated by tools/azure-shelf.mjs on ${today}; do not edit by hand) -->`,
  '      <div class="gs-feature gs-feature-azure" id="azure">',
  '        <div class="gs-feature-text">',
  '          <p class="gs-feature-kicker">Our pantry partner</p>',
  '          <h2>Azure Standard</h2>',
  '          <p>Organic and natural groceries, bulk staples, household goods, and farm feed from a family-owned company. Order online and pick up at a <strong>Drop</strong>, a shared delivery point where Azure\'s truck stops each month, or have it delivered to your door. Bulk sizes keep the price per pound low, and Drop delivery keeps shipping low.</p>',
  '        </div>',
  `        <a class="btn gs-feature-btn" href="${esc(azureLink('/'))}" target="_blank" rel="sponsored noopener" data-affiliate="Azure Standard">Shop Azure Standard</a>`,
  '      </div>',
  '      <div class="az-drops">',
  '        <div class="az-drop-card">',
  '          <h3>Find a Drop near you</h3>',
  '          <p>Neighbors order together and Azure delivers to one place on a set day each month: dry, chilled, and frozen goods arrive together, and you collect your order there.</p>',
  `          <a class="btn btn-sm" href="${esc(DROP)}" target="_blank" rel="sponsored noopener" data-affiliate="Azure Standard">Find a Drop</a>`,
  '        </div>',
  '        <div class="az-drop-card">',
  '          <h3>How Azure works</h3>',
  '          <p>Create a free account, choose your Drop or home delivery, and order before the cutoff. New customers are welcome through our link.</p>',
  `          <a class="btn btn-sm" href="${esc(HOW)}" target="_blank" rel="sponsored noopener" data-affiliate="Azure Standard">How it works</a>`,
  '        </div>',
  '      </div>',
  ...shelves.filter((s) => s.items.length).map((s) => [
    '<section class="shelf gs-az-shelf">',
    `  <div class="shelf-head"><h2>${esc(s.title)}</h2><a class="shelf-all" href="${esc(azureLink('/shop/category'))}" target="_blank" rel="sponsored noopener" data-affiliate="Azure Standard">More at Azure</a></div>`,
    `  <p class="shelf-note">${esc(s.note)}</p>`,
    '  <div class="shelf-row">',
    s.items.map((x) => azureCard(x)).join('\n'),
    '  </div>',
    '</section>',
  ].join('\n')),
  '<!-- AZURE:END -->',
].join('\n');

const file = join(ROOT, 'store.html');
let page = readFileSync(file, 'utf8');
const nl = page.includes('\r\n') ? '\r\n' : '\n';
const re = /<!-- AZURE:START[\s\S]*?<!-- AZURE:END -->/;
if (!re.test(page)) {
  const anchor = '<!-- SEEDSNOW:END -->';
  if (!page.includes(anchor)) throw new Error('store.html has neither AZURE markers nor the SEEDSNOW:END marker');
  page = page.replace(anchor, anchor + nl + nl + '<!-- AZURE:START --><!-- AZURE:END -->');
}
page = page.replace(re, () => html.replace(/\n/g, nl));
writeFileSync(file, page);
console.log(`Azure: ${shelves.map((s) => `${s.title} ${s.items.length}`).join(', ')}; home ${home.length}; photos fetched ${dl.length}.`);
