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
* **So the buyer pays the shipping, in full.** Done 2026-10-07: the store's
  flat bands now cover the farthest zone (up to 1 lb $11.95, 1 to 3 lb $17.95,
  3 to 10 lb $27.95) and the $4.95-over-$100 rate is gone. Check the first
  three Bangalla shipping charges against these bands (OWNER-STEPS G4).
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

## Sales tax (built 2026-10-07)

`tax.mjs` charges 6% (Oklahoma 4.5% + Pittsburg County 1.5%) on
registrations, services, and goods shipped to an Oklahoma address; nothing on
goods shipped to another state. Two questions for the CPA, because the
research found them:

1. **In-state deliveries.** The Oklahoma Tax Commission's guidance is that
   a delivered sale is taxed where the buyer receives it ("the location where
   receipt by the purchaser occurs becomes the 'source'"), so a buyer in
   Tulsa would be charged Tulsa's rate, not ours. The owner's rule (one 6%
   rate) is built; if the CPA confirms destination rates, `tax.mjs` changes
   in one place (Oklahoma publishes rate files by address as a Streamlined
   Sales Tax member).
2. **Shipping charges.** Whether Oklahoma taxes a separately stated delivery
   charge. They are not taxed today.

Other states: no collection until sales into a state pass its economic-nexus
threshold ($100,000 in most states; $500,000 in Texas, California and New
York; Arkansas $100,000 or 200 sales).

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
