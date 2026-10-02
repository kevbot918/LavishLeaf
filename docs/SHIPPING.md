# Shipping rates: the recommendation

Written 2026-10-01 for the owner's ask: *"I don't want to lose money on
shipping, but I don't want it to deter customers from buying. Maybe even
include a cheaper/reduced/flat shipping rate for orders over $100."*

**Built 2026-10-01**, as below. The rules live in ONE file, `shipping.mjs` at
the site root: the cart imports it to show the charge, and the checkout and
capture functions import it to charge it and to check the address before any
money moves. Tests: `npm test`. Every product now says `"ship": true` with a
packed `"shipOz"`, or `"ship": false`; the renderer refuses a product without
one. The three products today are all `false` (compost, two registrations),
so no order is charged shipping until a posted product is added. There is
no local delivery (owner, 2026-10-01: "We don't do any delivery really, at
least not yet"), and no pickup either (owner, 2026-10-02: no stock is held, so
a pickup order would have to be shipped to him first). Shipping only; add a
pickup back in `SHIPPING.pickup` in `shipping.mjs` once there is stock. Not yet done: the $1 built into light items' prices (that is
pricing, when products are chosen).

## What the numbers say

**What postage costs us** (USPS Ground Advantage, commercial rates, which
Pirate Ship gives free with no volume minimum; 2026 rates as published after
the 12 July 2026 change, measured 2026-10-01):

| Package | Zone 1 (local) | Zone 5 (mid-country) | Zone 8 (coast) |
|---|---|---|---|
| Under 1 lb (one rate since 12 July 2026) | $6.93 | about $7.70 | $8.40 |
| 1 lb | $7.05 | $8.74 | $10.67 |
| 2 lb | $7.40 | $9.95 | $12.87 |
| 5 lb | $8.36 | $13.48 | $19.19 |

Priority Mail Flat Rate, commercial: Small box $12.10, Medium $21.17, Large
$31.00. Flat Rate only wins for heavy, dense items going far (a 10 lb box of
fertiliser to Zone 8); for most of our light Tier 1 lines Ground Advantage is
cheaper. Add about $0.50 to $1.00 a parcel for the box, paper filler and tape.

**What it does to buyers** (Baymard Institute, as reported 2026): about 70% of
carts are abandoned, and extra costs (shipping, tax, fees) are the top reason,
named by roughly 48% of shoppers who left. The average free-shipping
threshold among US shops is about $64, while shoppers say they would spend
about $43 to reach one. A progress bar in the cart ("$18 away from $4.95
shipping") lifts threshold conversion by roughly 15 to 25%.

The lesson: the shock is what loses the sale, not the amount. A small, clear,
flat number shown on the product and in the cart from the start beats a
surprise at checkout.

## The recommendation

**1. Flat rates by weight band, shown up front.** Every product gets a
shipping weight in `products.json` (`shipOz`, packed weight in ounces). The
cart adds up the order's weight and charges one flat amount for the band:

| Order weight (packed) | Customer pays | Our cost range, US 48 states | Notes |
|---|---|---|---|
| Under 1 lb | **$6.95** | $7.40 to $9.40 with packing | Most Tier 1 lines: cloths, brushes, soap bars, seeds, card games |
| 1 to 3 lb | **$9.95** | $7.55 to $14.50 | Two or three items, a 1 to 2 lb fertiliser box |
| 3 to 10 lb | **$14.95** | $9 to $30 | Mixed orders, a 4 or 5 lb fertiliser box |
| Over 10 lb | **Local pickup or local delivery only** | | The heavy goods are Tier 4: never posted (STORE-PRODUCTS §6) |

The flat amounts sit a little under our average cost on purpose: at zone 1 to
4 (Oklahoma, Texas, Kansas, Arkansas, Missouri, where most early customers
will be) they roughly break even; at zones 7 and 8 we lose $2 to $5. To make
that up without a visible charge, **build $1 into the retail price of every
light item** (a $6.95 dishcloth becomes $7.95). Shoppers compare shipping
lines far more than they compare a dollar on a shelf price.

**2. Orders of $100 or more: $4.95 flat** (your idea, and it is a good one).
On a $100 order at the store's typical 40 to 50% margin there is $40 to $50 of
gross margin; real postage on a $100 order of light goods is usually $9 to
$15, so $4.95 still leaves $30 or more. It keeps a small charge, so it does
not train customers to expect "free". If the numbers hold after a few months,
try **free shipping at $125** and measure.

**3. Free local options, always offered.** At checkout:
* **Local pickup**, free: Eufaula only (owner, 2026-10-01: no shop in McAlester), on a day you choose (the
  soccer Sundays are an easy handover).
* **Local delivery**, free over $50 within the compost pick-up area, $5 under
  it: the compost route is already driving past those doors.
These make the heavy Tier 4 goods sellable online without posting them.

**4. Things that never pay shipping:** compost pick-up, league registrations,
and anything else that is a service or a pickup item. Mark these
`"ship": false` in `products.json`.

**5. Drop-shipped lines** (Arbico posts straight to the customer): charge
what Arbico charges us for that order, shown as its own line, or fold it into
the price if Arbico's charge is flat. Check this per supplier when the
account opens.

**6. Labels: Pirate Ship** (free, commercial USPS and UPS rates, no monthly
fee, prints from the browser). Order a free supply of USPS Priority Mail and
Flat Rate boxes from USPS for Priority shipments; buy plain boxes and
compostable mailers for Ground Advantage.

**7. Where it shows:**
* Under every price on a product card: "Ships for $6.95, or $4.95 on orders
  over $100. Free local pickup."
* In the cart: the shipping line before the total, and the progress bar
  toward $100.
* On `terms-of-sale.html` and `refunds.html`: the same table, so the rule is
  written down.
* Contiguous US only to start. Alaska, Hawaii and overseas by email request.

## What building it involves (when you say go)

1. `shipOz` and `ship` on every product in `products.json`, and the renderer
   refusing a postable product without a weight.
2. `cart.js`: the weight sum, the band, the $100 rule, the pickup and local
   delivery choice, the progress bar.
3. `netlify/functions/checkout.mjs`: the SAME calculation on the server (the
   browser is never trusted for a price), sent to PayPal as the order's
   `shipping` amount, and the shipping address collected by PayPal.
4. The two policy pages updated, and one line under each card's price.

Weigh a sample of each product packed, once, when it arrives. A guessed
weight is how a flat rate quietly loses money.

## Sources

* [USPS Ground Advantage rates 2026, zones and weight breaks](https://idshipthat.app/shipping-rates/usps-ground-advantage/)
* [USPS Ground Advantage rate change, sub-1 lb tiers collapsed 12 July 2026](https://selleressentials.com/usps-ground-advantage-rate-increase-2026/)
* [Federal Register, USPS 2026 prices (90 FR, 19 Nov 2025)](https://www.govinfo.gov/content/pkg/FR-2025-11-19/html/2025-20281.htm)
* [Pirate Ship: 2026 USPS rate changes](https://support.pirateship.com/en/articles/13216719-2026-usps-rate-changes)
* [Flat Rate box prices 2026](https://idshipthat.app/shipping-rates/usps-flat-rate/)
* [Free shipping statistics 2026 (Baymard figures)](https://www.dontpayfull.com/explore/free-shipping-statistics)
* [Free shipping threshold strategy 2026](https://www.digitalapplied.com/blog/free-shipping-threshold-strategy-2026-ecommerce-playbook)
* [Cart abandonment rate 2026](https://www.geysera.com/blog/abandoned-cart-email/cart-abandonment-rate-by-industry-in-2026-benchmarks-that-actually-mean-something)
