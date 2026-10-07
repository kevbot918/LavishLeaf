# The store: a plan to make money from nothing

Written 2026-10-07 for the owner's ask: *"Research and analyze a plan for a
profitable online store with essentially no capital ... dropshipper with no
fee; OK to front the first handful of orders ... ways to grow more profitable
with small capital. Bangalla shipping is brutal; products are cheaper
elsewhere. Ideally affordable to help people switch to green, but
profitability first."*

**This repository is public.** No supplier cost appears here; "margin" means
what is left per sale after supplier cost, shipping and PayPal's fee (3.49% +
$0.49), worked from public list prices. The owner's own costs stay in the
dashboard.

## What the numbers say

* **A single dropshipped item loses money or barely breaks even.** At
  Bangalla's list price the margin is about 30%, so a $10 item earns about
  $3 before shipping, and USPS Ground Advantage (commercial, from 4 Oct 2026)
  costs $8.01 (Zone 1) to $11.22 (Zone 8) for 1 lb. Bangalla bills its own
  carrier rate by weight, distance and speed, which is no lower.
* **So the buyer pays what the postage costs, no more.** The owner,
  2026-10-07: no money made on shipping, none lost, and no prices that send
  buyers away. The flat bands are the cost of posting to the middle of the
  country (USPS Zone 5): up to 1 lb $8.95, 1 to 3 lb $12.95, 3 to 10 lb
  $18.95. (Zone 8 bands tried earlier that day were far too high.) The
  $4.95-over-$100 rate is gone. Check Bangalla's real charges against these
  bands (OWNER-STEPS G item 4).
* **National brands are cheaper on Amazon.** Seventh Generation, Mrs.
  Meyer's and the like are discounted everywhere; a small shop cannot win on
  their price. It wins on what Amazon does not do: local, bundled, explained.
* **The highest margins are already on the page**: the two soccer
  registrations and the two $20 pick-up services cost nothing to stock and
  ship nothing.

## The lanes, best first

| | Lane | Margin per sale | To start | Notes |
|---|---|---|---|---|
| 1 | **Services and leagues** (compost, recycling, soccer) | Highest; nothing to buy or ship | $0 | Already priced. Every new route customer is also a free-delivery customer for lane 3 |
| 2 | **Digital products**: printable Oklahoma seed-starting calendars and garden planners on the site; Unity assets on the Asset Store and itch.io | $5 printable about $4.33 (87%); $20 Unity asset about $14 (70%) | $0 | Make once, sell for ever. PayPal allows digital goods |
| 3 | **Bangalla, batched to the farm and handed out on the pick-up routes** | About 30% of list, less one shared freight bill | $0 (pre-paid by the buyers) | Collect a week of pre-orders, place ONE Bangalla order to the farm, deliver free with the compost and recycling runs. This is the only way the freight is shared |
| 4 | **Print-on-demand eco merch** (Printful or Printify, free plans) | Organic tee at $32 with shipping included about $11; organic tote at $28 about $6 | $0 | No stock, no minimum. Orders placed by hand at first |
| 5 | **"Green Swaps" guide with affiliate links** (Blueland 8% of new customers, Who Gives A Crap 1.6%, Amazon 3% as a backup) | Small: $2.40 on a $30 Blueland order | $0 | Helps people switch without the store holding anything. FTC disclosure beside the links; Amazon closes an account without 3 sales in 180 days |
| 6 | **Bangalla or Arbico shipped one at a time** | Thin; the buyer pays the shipping | $0 | Fine as a convenience, never the engine |

## Pricing rules for the dropship lines

1. **Never free shipping on a single dropshipped item.** The flat bands cover
   Zone 8; keep them.
2. **Sell at list price, not above it.** That keeps the store affordable (the
   owner's aim) and the 30% is the margin.
3. **Cut the widely discounted national brands from the shipped catalogue**;
   keep them for the batched local orders only, where the free delivery is
   the advantage.
4. **Bundles with shipping built in**: a "Kitchen Switch Kit" or "Green
   Laundry Kit" at one fixed price, priced so the Zone 8 band is covered.
5. **Show the whole total early**: 70% of carts are abandoned and surprise
   costs are the top reason (Baymard, 2025). The store bar already states the
   shipping; the cart shows shipping and sales tax before PayPal.

## Phases

**Phase 0, now, $0**
1. The resale certificate and the Arbico distributor application
   (OWNER-STEPS G1, G5). Arbico: no dropship fee, no minimum, blind shipping;
   not allowed on Amazon or Walmart; ask the discount in writing.
2. Two to four printable PDFs on the site (Claude can build the page and
   the PayPal button; the content is the owner's knowledge).
3. The pre-order batch for route customers (lane 3): a "Delivered with your
   pick-up" note on the products and a weekly order cut-off.
4. A Printful or Printify store with two organic tees and a tote, priced with
   shipping included.
5. The "Green Swaps" page with affiliate links and the disclosures.

**Phase 1, the first $500 to $1,000 of profit**
* Nursery dealer licence, **$38 a location** (ODAFF), then seedling and plant
  pre-orders collected at the farm.
* Fertilizer licence, **$50 a location a year** (OWNER-STEPS G6), before any
  fertilizer is sold.
* Bagged compost: **$100 per product** soil-amendment registration (OAC
  35:30-30-2) before the farm's own compost is sold by the bag.
* One sample of the best-selling tee, to check the print.
* A small stock of Bangalla's fastest-moving refills at the farm, so local
  orders are filled the same day.

**Phase 2, a few thousand dollars**
* Faire wholesale for stock to hold (brand minimums often $100 or less, Net
  60 terms for eligible shops). Faire does not dropship: it is a stocking
  source.
* A bulk refill station (detergent, soap by weight) at the farm or a market
  stall: the cheapest way for a buyer to go green, and the best margin in
  the catalogue.

## Sales tax (built 2026-10-07, the owner's rule)

`tax.mjs`: **6%** (Oklahoma 4.5% + Pittsburg County 1.5%) on every product
wherever it ships; groceries carry only the county 1.5% (the Tax
Commission: the 2024 grocery exemption "applies only to the state portion
... All local sales and use taxes still apply"). Shipping is a separate line,
so it is not taxed (OAC 710:65-1-9(b)(5)).

What the 2026-10-07 legal check found against the owner's rule, for him and
his CPA to settle (the switch is in `tax.mjs` only):

1. **Goods shipped out of state.** OAC 710:65-15-1(b)(2): "If tangible
   personal property is sold within this State and possession is taken by
   the buyer outside this State, the tax does not apply", and handing it to
   a carrier or the mail for delivery outside Oklahoma counts. So the 6% on
   those orders would be a tax that is not owed.
   https://www.law.cornell.edu/regulations/oklahoma/OAC-710-65-15-1
2. **Parcels shipped within Oklahoma** are sourced to the buyer's address
   (OAC 710:65-18-3), so a Tulsa parcel is 4.5% plus Tulsa's rates. 6% is
   right for pickup at his own place, and only if it is outside city limits
   (McAlester's combined rate is about 11%).
   https://www.law.cornell.edu/regulations/oklahoma/OAC-710-65-18-3
3. **Pick-up services** (compost, recycling) are probably NOT taxable:
   Oklahoma taxes only the services 68 O.S. 1354 lists, and its utilities
   line excludes "water, sewage and refuse". League fees probably ARE
   (dues, admissions, "the privilege of entering or engaging in any kind of
   activity"). A letter ruling from the Tax Commission settles both.
4. **Live plants and garden seeds are not groceries**: full rate
   (OAC 710:65-19-307; the OTC food product list names live plants).

## Returns (checked 2026-10-07)

No federal or Oklahoma law requires a return period for online sales (the
FTC Cooling-Off Rule excludes sales "made entirely online"). New York
requires an online retailer to post its policy (GBL 218-a); a posted policy
satisfies it. A seller may require unused items in original packaging, the
buyer paying return postage, and a short damage-report window, provided it
is stated before purchase. 30 days is practice, not law. refunds.html now
says: asked for within 30 days of delivery, posted back within 14 days of
approval, unused and in its packaging, return postage and original shipping
on the buyer unless we got it wrong. The FTC Mail Order Rule still applies:
ship within the stated time (30 days if none) or offer cancellation, refund
within 7 working days.

## More sources (owner, 2026-10-07)

**"TeamDrop" is TeemDrop** (teemdrop.com; teamdrop.com is an unrelated
project-management copy). Free, no monthly fee, takes orders as a CSV from a
custom site and PayPal payment. China-sourced, launched May 2025, delivery
10 to 20 business days, shipping and duty terms behind the login, and
Trustpilot has removed fake reviews for it. Its catalogue has the right
things (beeswax wraps, bamboo cutlery and brushes, loofah scrubbers, wool
dryer balls, compost bags, grow bags, plant labels, frog and mushroom
lights). Costs are the owner's, not for this file.

**AliExpress Choice**: free shipping, about 8 to 12 days, real order counts,
no automation for a custom site (orders placed by hand), returns to China.
Plan on the REGULAR price: many listings show a timed $1.09 deal. Fits:
fabric grow bags, seed trays with domes, bamboo plant labels, cotton mesh
produce bags, wool dryer balls, bamboo dish brushes, coconut bowls, solar
mushroom garden lights, kitchen compost bins, and the earthy fun items
(pickle, tomato and carrot squishies, jumping frogs, dancing cactus). Listings (checked
2026-10-07, prices left out on purpose):
* Grow bags https://www.aliexpress.com/item/3256811824629124.html
* Seed tray with grow light https://www.aliexpress.com/item/3256810162225391.html
* 80-cell seed trays https://www.aliexpress.com/item/3256805883135727.html
* Bamboo plant labels https://www.aliexpress.com/item/3256806226447404.html and https://www.aliexpress.com/item/3256811675856276.html
* Cotton mesh produce bags https://www.aliexpress.com/item/3256806851828021.html
* Wool dryer balls https://www.aliexpress.com/item/3256812035396029.html
* Bamboo dish brushes https://www.aliexpress.com/item/3256808420805552.html
* Coconut bowls https://www.aliexpress.com/item/3256808314252070.html
* Beeswax wraps https://www.aliexpress.com/item/3256808322919507.html
* Bamboo cutlery set https://www.aliexpress.com/item/3256802068386077.html
* Kitchen compost bin https://www.aliexpress.com/item/3256810190220289.html
* Solar mushroom lights https://www.aliexpress.com/item/3256812453773029.html
* Pickle squishy https://www.aliexpress.com/item/3256812288616633.html, tomato https://www.aliexpress.com/item/3256811638249866.html, carrot/banana https://www.aliexpress.com/item/3256812006724893.html
* Jumping frogs https://www.aliexpress.com/item/3256806752931503.html, dancing cactus https://www.aliexpress.com/item/3256809902826753.html

Rules for both: order one sample of anything before listing it; never copy
a supplier's "organic", "eco" or "biodegradable" claim (FTC Green Guides,
16 CFR 260.8: "biodegradable" needs proof it breaks down within a year);
say "reusable", "bamboo handle" and so on instead; and **squishies and
fidget toys aimed at children 12 and under need third-party lab testing
and a Children's Product Certificate** (CPSC), so they are sold as adult
desk toys or not at all. US duties apply to every parcel from China now
(no de minimis since 29 Aug 2025). US-warehouse alternatives: Spocket,
Syncee, AppScenic, Faire.

**Organic print on demand** (all take quantity-1 orders and work with our
own site by manual order or API):
* **Printful**: free, no monthly fee. US-made organic: Stanley/Stella SATU001
  tee (GOTS + OCS), Econscious EC8000 organic tote, Stanley/Stella Cruiser
  hoodie (organic/recycled); recycled Bella+Canvas 3001ECO. Labels extra.
* **Gelato**: GOTS organic tee, US production, free plan (2 stores).
* **Printify**: Econscious and Stanley/Stella organic; Free plan, Premium
  $24.99 to $39 a month for about 20% off; check each listing ships from the
  US.
* **Teemill**: the strongest eco story (all organic, renewable energy, take-
  back) but ships from the UK.
* A customer's own text on a shirt: by order note and a manual order now;
  automatic through the Printful API later (new code). The built-in
  personalisation tools need Shopify or Etsy.

**Books, brochures, calendars**: GrowOrganic sells gardening books (Storey
"Starting Seeds" and others) and has a wholesale programme with no case
minimums; Faire has garden books and journals (Fox Chapel, Peter Pauper);
Hachette (Storey, Timber Press) sells to small retailers at 46% off books
and 55% off calendars and journals, free freight from $150. Ingram can ship
books straight to customers. Bookshop.org pays 10% as an affiliate. Own
brochures: Vistaprint tri-fold, 100 for about $76 to $84. Own wall calendar
printed and shipped one at a time: Lulu (about $13 to print) or Printful.
Digital printables need a download link after payment (new code on the
checkout). Oklahoma is zones 6a to 8a; the calendar follows OSU Extension
HLA-6004 with regional columns.

## Green Swaps (affiliate page)

How: (1) a real page of swaps with our own words and photos; (2) join the
networks, free: Awin (ShareASale closed into it, 6 Oct 2025), Impact, CJ,
FlexOffers, plus brand programmes; (3) apply brand by brand; (4) put each
link in with rel="sponsored"; (5) the FTC disclosure beside the links, e.g.
"We earn a commission if you buy through these links"; (6) a W-9 with the
EIN to each network; payouts from $10 (Impact) to $50 (CJ).

Best fits found: **SeedsNow 25%**, **Botanical Interests 15%** (Awin, garden
content), **True Leaf Market 10 to 20%**, **EarthHero 3 to 8%** (280 eco
brands), **Blueland 8% new customers** (Impact), **ThredUp 15% new**,
**Azure Standard's Share Azure** ($25 credit per new customer), Earth Breeze
and Public Goods (rates to confirm). Backups: Grove, Tru Earth, Patagonia,
Package Free, Gardener's Supply, Pact, Who Gives A Crap; Bookshop.org for
books. Not available: Baker Creek (no programme), Arbico (closed to new
affiliates).

## Bulk pickup instead of shipping (for later)

* **Azure Standard** has a community drop **in McAlester ("Azure at the
  Expo")**, no base fee, 8.5% shipping fee in Oklahoma, a $550 minimum
  shared by the whole drop, $5 on orders under $50. Fine for the farm's own
  supplies and for testing products; buying to RESELL needs a wholesale
  account ($10,000 a year), and a retailer cannot be a drop host for credits.
* **Frontier Co-op** wholesale: no pickup, but free freight from $250.
* **BWI Companies** (garden-centre distributor, Oklahoma City branch, own
  trucks): ask about minimums and branch pickup.
* **Freight terminal pickup**: any pallet order (GrowOrganic, Hummert) can be
  marked "hold at terminal" and collected at Estes in Atoka or Old Dominion
  in Tulsa, saving the residential and liftgate fees (often $50 to $150 and
  $75 to $200).
* Not in reach: Bountiful Baskets, Country Life Natural Foods.

## Not verified (pages blocked or behind a login)

Faire's current terms, Kole Imports, Grove and Bee's Wrap commission rates,
a Printify provider in Oklahoma, Arbico's distributor discount, Oklahoma's
Homemade Food Freedom Act limits, and whether fresh produce needs a licence.

## Sources

* https://www.printful.com/pricing and https://www.printful.com/shipping
* https://printify.com/pricing/
* https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ (fee rates)
* https://affiliate-program.amazon.com/help/node/topic/G8TW5AE9XL2VX9VM (3 sales in 180 days)
* https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
* https://www.flexoffers.com/affiliate-programs/blueland-affiliate-program/
* https://www.flexoffers.com/affiliate-programs/who-gives-a-crap-us-affiliate-program
* https://unity.com/legal/as-provider and https://itch.io/updates/introducing-open-revenue-sharing
* https://www.paypal.com/us/business/paypal-business-fees
* https://www.bangalla.com/dropshipping-services/
* https://www.arbico-organics.com/category/distributor-program-information
* https://greendropship.com/membership-account/membership-levels/
* https://pe.usps.com/text/dmm300/Notice123.htm (Ground Advantage commercial, effective 4 Oct 2026)
* https://baymard.com/lists/cart-abandonment-rate
* https://ag.ok.gov/wp-content/uploads/2025/10/Final-Website-10162025-Dealer-Application.pdf (nursery dealer, $38)
* https://ag.ok.gov/wp-content/uploads/2025/06/Fertilizer-License-Application.pdf (fertilizer licence, $50)
* https://www.law.cornell.edu/regulations/oklahoma/OAC-35-30-30-2 (soil amendment registration, $100)
* https://oklahoma.gov/tax/businesses/sales-use-tax.html
* https://www.salestaxinstitute.com/resources/economic-nexus-state-guide
