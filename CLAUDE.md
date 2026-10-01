# lavishleaf.org: the standing rules for this repository

**This repository IS the public website.** Netlify publishes its root on every
push to `master` at https://github.com/kevbot918/LavishLeaf. Anything committed
here can be downloaded by anyone; secrets live only in `.env` (ignored) and in
Netlify's environment variables. Never commit a key, a password or a PIN.

Written 2026-09-28 by the Symphonymph app session when the website work was
handed to this session. The app (Symphonymph, `C:\Users\kevow\Projects\OpenAudio`)
is a separate repository and a separate session; this one owns the site, the
store and its research.

## What the site is

Plain HTML, CSS and JS. No framework, no build step for pages. Ten pages:
`index`, `farms`, `rec-sports`, `gaming`, `symphonymph`, `store`, `careers`,
`social`, `privacy`, `app-feedback`, plus `p.html` (the personal-lane page),
`refunds.html` and `terms-of-sale.html`. `compost.html`, `adult-sports.html`
and `oscilla.html` are 301s in `_redirects`, not files. `_headers` carries the
security and download headers; do not weaken it to make a download "work".

Deploy: `git add . && git commit && git push`. Netlify deploys the push. There
is no staging; check the live site with `curl -sI` after a deploy.

## Rules the owner has set (each one was learned the hard way)

1. **The ground is GREY** (`#3d3d3d`, bands `#2e2e2e` / `#252525`, heroes
   `#0f1210`). A rebuild once inverted it to cream and he said *"This is not
   okay, I did not ask you to do this."* Do the thing that was named and raise
   the rest as a question. Palette: `--leaf #4AB73C` is a FILL only (4.21:1);
   `--leaf-bright #6FD65F` is green text; `--ink #14261A` on green buttons;
   `--white #F2F4F2` body; `--gray #C8CFC8` secondary. Buttons lighten on hover.
   Fonts: Sriracha (wordmark and oval line only, single weight) and Nunito
   Sans for everything else.
2. **No em dashes anywhere a visitor can read.** Commas, colons or a full
   stop. (Docs and commit messages may keep theirs.)
3. **No street address, no phone number** on any page. Footers are name and
   email only: support@ / careers@ / gaming@lavishleaf.org.
4. **"Lavish Leaf", never "LavishLeaf"** in copy. The two exceptions are the
   real Facebook page path and donate.js's internal window name.
5. **Lavish Leaf Inc is a regular Oklahoma corporation, not a charity.** No
   page may imply nonprofit status. "Donations support the work directly and
   are not tax-deductible" stays; the line "not a charity" was removed at his
   instruction and does not come back.
6. **The donate button is a POP-UP.** `donate.js` intercepts `a.donate-paypal`
   and calls `window.open`; PayPal's `donate-sdk.js` is NOT used (its image
   navigated the whole page). Hosted button `FK2ME6A2QUFWG`.
7. **Card grids are centred flex rows, not CSS grid** (`.cards-grid`,
   `.future-grid`, `flex: 0 1 340px`), so a short row centres.
8. **The Symphonymph download page follows the app's release cadence:** one
   deploy per release, never per build. Both APKs land in `downloads/` with
   the version in the name; `_redirects` sends every old version link to the
   current file and the bare `/downloads/symphonymph.apk` too. **Never download
   a published APK to check it** (Netlify bandwidth is metered); `curl -sI` for
   the 200, the byte size and the 302s is the whole check. The app session
   hands over the two files and the version; this session deploys.
9. **Before deleting or overwriting anything, look at the target**, and
   report what actually happened, including a failed deploy.

## The store: what exists and what is switched off

* `products.json` at the root is the ONE place a product, its price (in cents)
  and its checkout link live. `node tools/render-store.mjs` rewrites the Store
  grid and every `<a data-product="id">`; `--check` fails if a page is stale.
  A product without a photo is refused by the renderer on purpose.
* The cart (`cart.js`), the three Netlify functions
  (`netlify/functions/checkout|capture|subscribe.mjs`) and `netlify/lib/paypal.mjs`
  are BUILT and deployed, and answer **503 on purpose** until
  `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` and `PAYPAL_ENV` exist in Netlify.
  `products.json` says `"checkout": "links"`, so buttons are `mailto:` today.
  Switching on is: a sandbox order end to end, `"checkout": "cart"`, one
  render, one deploy. The step-by-step, with PayPal's screens in order, is
  `docs/STORE-STEPS.md`. Stripe only if he asks (he had it removed 09-18).
* The soccer registrations carry a waiver block; the cart and the server both
  refuse an order until it is ticked.
* **The owner's rule (2026-09-25): the online store is up before the app goes
  to the App Store.** So the store is a release gate for the app session, and
  the product pages are this session's work.

## The store shell (2026-09-30): the one page that is not grey

The owner, 2026-09-30: *"I want our online store to look fairly identical to
our Symphonymph app user interface"*, and *"more elegant than the app"*. So
`store.html` is the app's shell and NOT the site's: it loads `store.css`
(not `style.css`), its ground is the app's (`#14171C` dark, `#F7F8FA`
light, true black), and rule 1 above stays true for every other page.

* **Home is shelves**, one per `category` in `products.json`, rendered by
  `tools/render-store.mjs` between the PRODUCTS markers so the page works
  with JavaScript off. A shelf shows `shelfLength` products (10 by default,
  the app's `kShelfLength`; 10 to 30 in Settings) and "See all" opens the
  whole shelf. `data-category` is required on every product now; `tags`
  feed the search.
* **The sidebar is always there on a wide screen** (300px) and a drawer
  under 1000px: the oval logo top-right drawn as inline SVG so it follows
  the accent, Support (the donate pop-up, `donate.js`, with the
  not-tax-deductible line beside it), Report a problem (the Netlify
  `contact` form in a dialog), Home, Search, Your lists, Shop (the
  shelves), More from Lavish Leaf (the rest of the site), Customize.
* **The top bar**: menu (phone), title, search, settings, the three social
  icons, and the cart, which appears only on a deploy with
  `"checkout": "cart"` (the renderer stamps `<body data-checkout>`;
  `cart.js` exposes `window.LLCart` and a `ll-cart` event for the badge).
* **Settings** (`store.js`, localStorage `ll-store`, no accounts ever):
  Light / Dark / Black / Match my device; the app's nine accents with the
  app's own light and dark seeds (`lib/ui/theme.dart`), which recolour the
  chrome AND the logo; which Home shelves show and in what order; what the
  sidebar shows and in what order; products per shelf; named wish lists
  (the heart on every card; one list toggles, several ask which); reset.
* **Search** has a chip per shelf, three sorts, a one-time-only filter,
  and matches every typed word against name, tags, shelf and sentence.
* The old `#donate` anchor still works: other pages' Donate buttons land
  on the sidebar's Support link (the drawer opens on a phone).

## The store research, and how it must be done

`docs/STORE-PRODUCTS.md` is the one store document: five tiers plus a
Miscellany, a supplier register, and every product row linked to the
supplier's own page with a price kind and a price. Rebuilt 2026-09-28 from
about 110 Faire product pages, 22 Faire grids, GrowOrganic, Hummert,
WebstaurantStore, Bangalla, Arbico, Frontier and Azure. The raw rows are in
`docs/research/store-research-log-2026-09-28.jsonl`.

What the owner called "piss poor research", so it is not repeated:
recommending a supplier from its TERMS without opening its CATALOGUE for his
categories (Fun Express: a $100 minimum and a catalogue of party novelties),
and writing "the only route" where a list belonged (BWI). The standard:
open the product pages, link every product, give the price kind (WHOLESALE,
RETAIL, MSRP, LISTED, HIDDEN), the opening minimum and the date; never write
"the only", "the best" or "the answer" without the alternatives beside it;
never guess a URL (a pattern says where to look, not what exists); repeat a
negative measurement before it cuts a supplier.

How Faire is read without an account: `faire.com/discover/<term>` grids and
every `faire.com/product/p_...` page are server-rendered, so a grid walk
gives token, name, brand and rating, and a product page gives MSRP, minimum,
rating and "Made in" from its text, even with the browser pane hidden. Brand
pages and `faire.com/search` render nothing to automation. Search engines:
Brave answers `site:faire.com/product` queries and rate-limits after about
a dozen; DuckDuckGo challenges; Bing returns nothing; curl gets a 403.

## Regulatory, in one paragraph (the long form is STORE-PRODUCTS appendix A)

Pesticides and devices are registered in Oklahoma by their manufacturers at
$210 a label, including federally "minimum risk" ones; a retailer checks the
ODAFF lookup and copies the label's claims exactly. Fertiliser under 30 lb is
"specialty", registered by the manufacturer at $100 a product; the $50 annual
licence is the seller's; three Down To Earth products are barred from the
state. Reselling a brand's cosmetics carries no MoCRA duty; an own label does.
"Compostable" means BPI industrial unless a TUV home mark is present. The
FTC thirty-day rule applies to every dropshipped order. De minimis is gone.

## Where things are

* `docs/STORE-PRODUCTS.md`: the catalogue and supplier register.
* `docs/STORE-STEPS.md`: finishing the checkout, step by step.
* `docs/research/`: the research log.
* The app repository's `docs/ACTIONS.md` and `docs/BUILD-PLAN.md` still carry
  the owner's app-side list and the history of how the store was decided; they
  point here for the store itself.
* Memory (shared across sessions on this machine): `project-lavishleaf-website`,
  `project-lavishleaf-payments`, `feedback-store-research-standard`,
  `feedback-no-em-dashes`, `project-lavishleaf-501c3-revoked`.

## What is open, in order (2026-09-28)

1. The store decisions are his: `STORE-PRODUCTS.md` §11 gives the order
   (resale certificate, EIN, Arbico and GrowOrganic the same week, Hummert
   for Espoma, a first Faire order at 50% off, the $378.84 Bangalla soap
   order after a shelf-price check, one WebstaurantStore case order).
2. Photographs and one sentence per product for the three products in
   `products.json`, then for every Tier 1 line he picks.
3. PayPal: sandbox app, keys into Netlify, a sandbox order, then live
   (`STORE-STEPS.md`). Deferred by him on 09-27 until he chooses.
4. Oklahoma sales tax on league fees and compost pickups; the refund policy
   and terms of sale pages exist.
5. Product pages for the chosen lines, with the registration check done for
   every pest product before it is listed.
