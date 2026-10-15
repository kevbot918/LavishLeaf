# lavishleaf.org: the standing rules for this repository

**This repository IS the public website.** Netlify publishes its root on every
push to `main` at https://github.com/kevbot918/LavishLeaf. Anything committed
here can be downloaded by anyone; secrets live only in `.env` (ignored) and in
Netlify's environment variables. Never commit a key, a password or a PIN.

Written 2026-09-28 by the Symphonymph app session when the website work was
handed to this session. The app (Symphonymph, `C:\Users\kevow\Projects\OpenAudio`)
is a separate repository and a separate session; this one owns the site, the
store and its research.

## What the site is

Plain HTML, CSS and JS. No framework, no build step for pages. Ten pages:
`index`, `farms`, `rec-sports`, `gaming`, `symphonymph`, `store`, `company`,
`social`, `privacy`, `app-feedback`, plus `p.html` (the personal-lane page),
`refunds.html` and `terms-of-sale.html`. `compost.html`, `adult-sports.html`,
`careers.html` and `oscilla.html` are 301s in `_redirects`, not files. `_headers` carries the
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

## The store shell (2026-09-30): the site's header, then the app's shell

The owner, 2026-09-30: *"I want our online store to look fairly identical to
our Symphonymph app user interface"*, and *"more elegant than the app"*.
Then, the same day: *"use the same top header on our store page that we have
for our entire website ... add back the store header ... with the vision
written below it. Then have the store side bar and home page be below that
header."* So `store.html` is, top to bottom: the site's own `<header>`
and `.page-hero` ("Lavish Leaf Online Store" and a `hero-lede`), styled
by `style.css` and grey like every other page; then `.ss-shell`, the
app-style store, styled by `store.css` on the app's ground (`#14171C`
dark, `#F7F8FA` light, true black). Rule 1 is intact everywhere outside
the shell.

**Two stylesheets share one page, and they share variable names.** Every
rule in `store.css` is scoped to `.ss-shell` or a dialog, the names
`style.css` uses (`--leaf`, `--white`, `--card` ...) are remapped
inside those scopes ONLY (never on `:root`, which would recolour the site
header), and the scoped element rules use `:where()` so a component's own
class still wins. The sidebar and the store bar stick under the site header
through `--site-h`, which `store.js` measures.

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
  shelves), Customize. Links to the rest of the site are the site header's.
* **The store bar** (under the hero): a "Browse" button that opens the
  drawer on a phone, the view's name, search, settings, and the cart,
  which appears only on a deploy with
  `"checkout": "cart"` (the renderer stamps `<body data-checkout>`;
  `cart.js` exposes `window.LLCart` and a `ll-cart` event for the badge).
* **2026-10-01, the owner:** the store is on the site's GREY (store.css maps
  its tokens to `#3d3d3d` / `#2e2e2e` / `#474747` and the leaf greens), and
  **Settings are gone**: no theme, no accent, no shelf or sidebar editors.
  Home shows every shelf, 30 products each (`SHELF_LENGTH` in store.js).
  The top bar holds a search field typed into directly, a wish-lists heart
  and the cart (always shown; with `"checkout": "links"` it says checkout is
  coming). The sidebar is 340px and the visitor can drag its edge (260 to
  560px, kept in localStorage `ll-store`). Cards are compact (180px, 4:3
  photo, full-width button). The page ends with the site's Contact &
  Newsletter band and footer like every other page.
* **The demo catalogue (2026-10-01, the owner: "fill shelves using those
  products as our demo store so I can then analyze and decide").**
  `node tools/demo-store.mjs` reads every linked product in Tiers 1 to 4 and
  the Miscellany of `docs/STORE-PRODUCTS.md` into `products.json` as
  `"demo": true` (434 today, 104 at $0.00 where no price is published), one
  shelf per kind of product. A demo card says its tier, rank, supplier, price
  kind and minimum, and its button is "Supplier page"; demo products never
  reach `netlify/lib/catalog.mjs`, so they cannot be bought. A notice above
  the shelves says so. `node tools/demo-store.mjs --remove` and a render
  take them all off. The sidebar is the page grey and carries the header's
  `logo-oval.png`.
* **Run the tests** before a push that touches the store or the functions:
  `npm test` (node --test, no install needed for the tests themselves).
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

## Open since 2026-10-01

6. **Home page logos.** The Rec Sports, Gaming and Lawn & Garden cards on
   `index.html` still use the drawn CSS `.oval-badge`; each needs its real
   logo image like Farms, Store, Restaurant and the rest. Symphonymph's card
   now carries `symphonymph-mark.png` as a stand-in (owner: "for now").
7. **Shipping is BUILT** (2026-10-01): `shipping.mjs` at the root is the one
   set of rules (cart shows, checkout charges, capture checks the address),
   per `docs/SHIPPING.md`. Every non-demo product must say `"ship"` and, when
   true, `"shipOz"`; the renderer refuses otherwise. The catalog now carries
   `waiver`, so the server really does refuse a registration without it (it
   did not before: catalog.mjs had no waiver field).
8. **Customer accounts are BUILT** (2026-10-01) and waiting on the owner to
   enable Netlify Identity (steps in `docs/ACCOUNTS.md`): Identity for
   sign-in, Netlify Blobs (`package.json` brings `@netlify/blobs`) for lists,
   cart, shelf order and order history, guest checkout kept. This reverses
   "no accounts ever" for the store, at his instruction; the app still has
   none. Shelf order (sidebar drag or Reorder) is back, and Home follows it.
9. **YouTube on the Social page** shows a Subscribe card because the channel
   (`UCIX4zWMxDkpMFnEnS96gGow`) has no videos. After the first upload, delete
   the `.feed-soon` card in `social.html` and move the iframe out of
   `<template id="yt-embed">`.
10. **Marketing videos and social posts**: the owner wants help making them
    soon (farm, league, studio). Not started.
11. **Social page feeds (2026-10-01): BUILT, waiting on Meta keys.** Our own
    Instagram (21) and Facebook (21) posts as cards, 7 to a row, full width, each network
    its own section (owner: not side by side). `social-feed.mjs` + daily
    `social-refresh.mjs` (keeps the 60-day Instagram token alive), cached in
    Blobs store `social`. Needs only `FB_PAGE_ID` + `FB_PAGE_TOKEN` in
    Netlify: with Instagram linked to the Page, that one non-expiring Page
    token reads both (2026-10-02; Meta's Instagram tester form refused the
    account). `IG_ACCESS_TOKEN` is optional. Steps: `docs/SOCIAL-FEEDS.md`. Until then
    the Behold widget (free tier: 6 posts) and the Page plugin stand in.
12. **Shipping only, for now** (owner, 2026-10-02): no pickup and no local
    delivery until there is stock in storage (otherwise goods are shipped to
    him first, at his cost). `SHIPPING.pickup` in `shipping.mjs` is `{}`;
    over 10 lb is "email us for a quote". The shipping line sits in the
    store bar on every view, one line, small, a fixed-width title slot so it
    never moves; full or short wording by a container query on `.ss-main`.

## Changed 2026-10-02

13. **Careers is now Company** (`company.html`, owner: "change it to Company
    for now"; `_redirects` 301s `/careers.html` and `/careers`). It holds About
    Us, the organisation chart (shareholders, board, founder, five divisions)
    and Future Roles. The board are also the officers, all equal (owner, 2026-10-02:
    no Founder and President box); a founder card with a placeholder photo
    waits for his name, picture and story. **No unpaid internships**: a for-profit company must pay
    interns who do productive work (DOL Fact Sheet #71), so the roles intro says each
    will be paid when its division earns, and asks for an email of interest. **No investment
    offer on the site**: "We are not offering shares or any other investment
    through this website" stays (a public ask for investors is general
    solicitation under SEC Rule 506). The founder's name, photo and story are
    still to come from the owner.
14. **Recycling Pick-Up** on `farms.html#recycling` and in `products.json`
    (`recycle-monthly`, $20 a month since 2026-10-06 by the owner, ship false, customer's own bin):
    cardboard, mixed paper, cans, glass, plastics #1 and #2, to the McAlester
    and Checotah centres. Price is a proposal for the owner to confirm.
15. **Shelves scroll sideways** by arrows and the mouse wheel (`store.js`
    `buildShelfArrows`); the wheel lets go at either end so the page scrolls.
16. **Supplier accounts**: `docs/SUPPLIER-ACCOUNTS.md`, the checklist from
    STORE-PRODUCTS §2 and §11. The Bangalla Excel and CSV files the owner
    named are not in the repository yet.

## Built 2026-10-02 (evening): analytics, dashboard, email

17. **Analytics everywhere.** GA4 `G-8SKVQ74TF6` on all 14 pages (p.html sends
    no #fragment) and `analytics.js` on every page: Microsoft Clarity
    (`yrei9vub09`, not on p.html) and the click events listed at its top. The
    privacy page names both. A new page gets the GA block and
    `<script src="analytics.js" defer>` in its head.
18. **The owner's dashboard**, `dashboard.html` (+ `dashboard.js`,
    `dashboard.css`, `netlify/functions/dashboard-data.mjs`,
    `netlify/lib/dashboard.mjs`, `google.mjs`, `admin.mjs`): owner only
    (Identity role `admin` or `ADMIN_EMAILS`), noindex, no GA on it. GA4 and
    Search Console through a read-only service account, Meta through the
    existing Page token, Clarity's export API, Netlify Forms, our own lists.
    Setup: `docs/DASHBOARD.md`. Local preview with sample numbers:
    `dashboard.html?preview` on localhost.
19. **Email** (`docs/EMAIL.md`): our own subscriber list in Blobs `newsletter`,
    Brevo delivers (`netlify/lib/mail.mjs`, one `send()` to swap for Amazon
    SES later). Single opt-in (owner's choice; CAN-SPAM needs no
    confirmation), signed one-click unsubscribe, a postal address
    (`MAIL_POSTAL_ADDRESS`, a PO box, never on the website) or no marketing
    mail goes. Automatic: welcome, contact auto-reply (`submission-created`),
    order confirmation + owner alert (`orders.mjs`, from capture), one cart
    reminder per cart (`cart-reminders`, daily, signed-in customers, only
    once PayPal is live), newsletter batches within the daily budget
    (`newsletter-drip`, hourly). Templates in `emails/`, one family, site
    colours, no em dashes. The monthly issue is `emails/newsletter-YYYY-MM.html`
    copied from the last one; the owner sends it from the dashboard after a test.
20. **Every account to open**: `docs/ACCOUNTS-TO-OPEN.md`.
21. **App usage counts and download taps: BUILT, NOT PUSHED** (2026-10-02).
    The Symphonymph session relayed the owner's ask (anonymous usage
    analytics, no personal data) and his hold on deploys until the app
    release and the site updates go out together. So this sits in a local
    commit: `netlify/lib/usage.mjs`, `netlify/functions/app-usage.mjs`,
    22 tests, the download-tap beacon on `symphonymph.html`, and
    `privacy.html` rewritten to say what the app now sends. **Do not push it
    ahead of the app version that sends the count (2.8)**: the policy
    describes that version. The owner's one step is `APP_STATS_KEY` in
    Netlify; everything is in `docs/APP-USAGE.md`. A stale day is dropped
    with a 204, not refused, because the app retries every non-2xx for ever.
22. **Tier 0, and the owner's private costs** (2026-10-05 and 06). Owner: the
    first stage must be products that cost nothing to start, from
    dropshippers. `docs/STORE-PRODUCTS.md` now has a **Tier 0** (section 3:
    his own services, Bangalla dropship, Arbico dropship), then **3A Tier 1**
    (the old opening order) and Tier 2 onward as before; appendix K lists
    every in-stock Bangalla line in his categories. **The Store page shows
    Tier 0 only** (`tools/demo-store.mjs`; `--all` restores every tier),
    and the same run writes `store-tiers.json` with every tier for the
    dashboard's **Store products** section (`dashboard-store.js`).
    **This GitHub repository is public, so a supplier's cost may never be
    written into it**: the document carries Bangalla's public LIST price and
    SKU only. His costs, stock and margins come from the Bangalla product
    CSV he loads in the dashboard; it is parsed in his browser and the useful
    rows are kept in the Blobs store `store-costs` through
    `netlify/functions/store-costs.mjs` (owner only). At list price the
    margin is about 30%. The owner's click-by-click steps for everything
    left are `docs/OWNER-STEPS.md`.
23. **Email is Amazon SES** (2026-10-07, owner: Brevo's 300 a day was too few).
    `mail.mjs` picks SES when `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY`
    exist (SES_*, not AWS_*: Lambda reserves those); SigV4 in
    `netlify/lib/aws-sign.mjs`, checked against AWS's own examples. Sandbox
    limit 200 a day until production access; then `MAIL_DAILY_LIMIT`. Also
    2026-10-07: the founder card (Kevin Wright, `images/founder.jpg`), and
    compost and recycling pick-up both $20 a month. **Sales tax**: the owner
    says league fees and registrations, services and shipped goods are all
    taxable; built 2026-10-07 as item 24.

24. **Shipping, prices and sales tax** (2026-10-07, the owner). Demo cards show
    **no price** (only the registrations and the two pick-ups do); search sorts
    unpriced products last. Shipping bands are the USPS Zone 5 cost ($8.95 /
    $12.95 / $18.95; he rejected Zone 8 bands as "way too high": no profit on
    shipping, no loss, no scared buyers), over-$100 rate removed.
    **`tax.mjs`** is the one tax rule (cart, checkout, subscriptions), HIS
    rule: 6% on every product wherever it ships, groceries ("grocery": true)
    1.5% county only. The legal check that disagrees (out-of-state shipments
    exempt, in-state parcels at the buyer's rate, pick-ups probably untaxed)
    is in docs/STORE-PLAN.md for his CPA; do not change the rule without him. The
    money plan is `docs/STORE-PLAN.md`. The refund page still promises 30-day
    returns while Bangalla approves returns case by case; he chose to keep
    returns: 30 days from delivery, posted back within 14 days, buyer pays
    return postage (refunds.html, 2026-10-07). Company page: division boxes
    are names only; how each division is led is the list under them.

25. **Green Swaps and the second supplier round** (2026-10-07). The Store has
    a **Green Swaps** view (sidebar, `#swaps`, static HTML in store.html, styles
    `.gs-*` in store.css): ten swap cards linking to brands with
    `rel="sponsored"` and an FTC disclosure; each brand's home-page link is
    replaced by its affiliate link as he is approved (OWNER-STEPS G7). Tier 0
    gained TeemDrop and AliExpress Choice (ranks 30 to 46, "see page" because
    their prices ARE our cost), worm dropship and Oklahoma-registered pest
    lines (47 to 51); Tier 1 gained Faire books and journals (87 to 96, new
    shelf "Books & Journals") and seed, fertiliser, Faire and garden suppliers
    (97 to 106). GrowOrganic REFUSED him (online-only); the register lists who
    else is closed. Decisions with recommendations (Printful for merch, Lulu,
    Greener Printer and Mixam for print, the affiliate list, bulk sources) are
    in docs/STORE-PLAN.md; his ordered checklist is the top of
    docs/OWNER-STEPS.md. Seed now needs the $25 Oklahoma retail seed licence.

26. **2026-10-10, the owner's list.** Company: the division cards carry their
    own leadership line again (reworded); the board box says an officer
    oversees a division; new shareholder and structure wording in his words;
    roles intro no longer says "not hiring". Gaming roadmap: Phase 2 starts
    with community server hosting, no educational mechanics; Phase 3 adds
    "Complete Game System assets". Farms recycling list = everything the
    McAlester center, Options Inc. (Checotah) and the Choctaw Nation centers
    accept (sources in STORE-PLAN). Store: sidebar starts at 390px (a saved
    340 moves up), and the mouse wheel no longer scrolls shelves sideways.
    Dashboard: a **Symphonymph downloads** section (GA4 app_download: period,
    since 2026-10-02, by file once the "file" custom dimension exists) and an
    **Affiliate programmes** section read from `affiliates.json` (public
    facts only). Facebook posts need `pages_read_user_content` on the Page
    token (SOCIAL-FEEDS D1b, D2); the dashboard now shows followers and
    Instagram even when the posts call fails. SeedsNow is the first approved
    affiliate (Refersion, 25%).

27. **2026-10-10, second list.** Green Swaps leads with **SeedsNow** (the one
    approved affiliate): a feature block with a Shop button, then seven
    SeedsNow shelves (58 products, their photos and prices, every link with
    our Refersion code) written by **`node tools/seedsnow-shelf.mjs`** between
    the SEEDSNOW markers in store.html (rerun it now and then: prices are
    theirs); the other swaps follow under "More green swaps". Every
    rel="sponsored" link sends GA4 `affiliate_click` with `link_url`, and APK
    taps send `link_url` and `build`, so the dashboard splits App Store vs
    Alpha builds and counts partner clicks with GA4's own linkUrl dimension
    (no custom dimension). Follower growth: one reading a day in Blobs
    "dashboard"/"followers" (dashboard load + daily social-refresh); 7/28/90
    day growth is computed from it, so history starts 2026-10-10. Header cart
    (`nav-cart.js`, every page but the dashboard): store.html, or
    store.html#cart when ll-cart has items. Home logos: logo-rec-sports.png,
    logo-gaming.png (black made transparent), logo-lawn-garden.png; no
    .oval-badge left on the home page.

28. **2026-10-10, third list.** Store Home carries the SeedsNow block (button
    to #swaps); the sidebar lists APPROVED affiliates under Green Swaps (only
    SeedsNow). Earth Breeze card removed (programme ended). **Bangalla on the
    Store = store-picks.json only** (20 SKUs worth selling, with Bangalla's
    photos downloaded to images/store/; the margin analysis used his cost and
    lives only in the session scratchpad). TeemDrop removed (needs a partner
    platform). AliExpress: `netlify/lib/aliexpress.mjs` (both signatures,
    OAuth state, token refresh, product facts; tests) and
    `netlify/functions/aliexpress.mjs` (owner Connect, callback, live item
    check), env `AE_APP_KEY` / `AE_APP_SECRET` (never in the repo); the
    secret must not be written anywhere but Netlify. AliExpress terms forbid
    copying seller photos: own sample photos only. affiliates.json carries
    the six pending applications and a notAvailable list.

29. **The store sells (built 2026-10-11, NOT deployed: the owner's Netlify
    credits are low until October 18).** `"checkout": "cart"`, the demo
    catalogue removed, 29 real products: 19 Bangalla picks (`bg-*`, shipFrom
    bangalla, source.sku) and 10 AliExpress items (`ae-*`, shipFrom
    aliexpress, source.item; photos from the DS API under the dropshipping
    programme), priced at cost x 1.3 + PayPal for 40% (AliExpress) or the
    market price (Bangalla). Under 10 in stock, food-contact and battery-less
    gone listings were left out. **Shipping per supplier** (shipping.mjs
    SHIPPING.suppliers): Bangalla items by the weight bands on their own
    weight; AliExpress free from $9.99 or 3 items, else $2.99; the cart and
    PayPal show the parts. Subscriptions without a PayPal plan keep their
    mailto sign-up in cart mode (render-store hasPlan). The dashboard's
    Orders card shows "Order from" per line (products.json source). PayPal
    is still sandbox (PAYPAL_ENV not live); the go-live list is OWNER-STEPS
    "GO LIVE". DNS is at Squarespace now (2026-10-11).

30. **2026-10-11, the owner's 15-point store list.** Store: product pop-up on
    any card click (`#pop`, store.js openProduct: photo, price, full text,
    weight, delivery, shipping on its own via shipping.mjs, tax, returns,
    buttons); add-to-cart notice (`.cart-toast`, cart.js notify); waiver
    ticks persist across cart redraws (acceptedW); waiver, Terms and Refunds
    open over the cart (`.cart-doc`, cart.js openDoc); the order note only
    for registrations under a green "Rec Sports registration" heading; cart
    shipping wording without supplier names ("by weight, up to 1 lb: $8.95 +
    direct-ship items under $9.99: $2.99"); header cart opens the cart on
    any page (store.js waits for `ll-cart-ready`); sidebar "New list" wired;
    the heart always asks which list; the top-bar heart opens `#lists`
    (every list as a shelf). Green Swaps shows ONLY approved partners
    (SeedsNow); SeedsNow prices refresh live from
    `/.netlify/functions/seedsnow-prices` (SeedsNow's products.json, CDN
    cached 12 h; sold out hides the card). **Making a Difference** on Home
    (above Future) and Farms (bottom): `impact.js` reads
    `/.netlify/functions/impact` (Blobs "impact"; dashboard section to edit;
    starting estimates 1,000+ lb composted, 1,500+ lb recycled, 200+ lb
    reused). New pick-up photos (Pexels, docs/PHOTO-SOURCES.md). 10 more
    Bangalla lines (Aura Cacia shower tablets and frankincense, Andalou
    lotions with MAP, Crystal deodorants); the no-margin ones (Schmidt's,
    hello, Spry, Clearly Natural, Jason, Aura Cacia single oils) were left out.

31. **2026-10-11, the owner's 9-point list.** Making a Difference: no
    "Updated" line, no archery targets (impact.mjs also strips it from a
    saved copy), intro "What Lavish Leaf and its community has kept out of
    the landfill so far." Company: his partnership/volunteer/board/shareholder
    invite and "Division leaders create additional roles...". Pop-up: one
    Delivery sentence for every product ("allow 1-3 weeks"); Shipping says
    "$2.99. Items from the same supplier share costs." (flat) or "from this
    supplier is per US Postal weight, minimum of $8.95" (bands); delivery
    sentences are gone from blurbs. **Cart weight meter**: band parts carry
    `oz` and `upToOz`, so the cart says "Shipped by weight: 3.5 oz / 16 oz =
    $8.95. Add up to 12.5 oz more for the same shipping." **Product options**:
    a product may carry `"options": { "label": "Scent", "values": [{ "name",
    "sku" | "item", "note"? }] }`; its card says "Choose scent" and opens the
    pop-up's select; cart lines carry `opt`; catalog.mjs carries the names;
    validateCart refuses a missing or unknown option and keeps options apart;
    PayPal's item reads "Name (Scent: Almond)", sku "id:Almond"; the
    dashboard's "Order from" gives each option's own supplier code; signed-in
    carts keep `opt` (accounts.mjs). 45 more Bangalla lines at list price
    (new shelves Oral Care and Bath & Body), photos resized to 600px JPEG.
    Search matches plurals ("squishies" finds Squishy) and a result row opens
    the pop-up.

32. **2026-10-11, second list.** Shelves are seven (owner): Farm & Garden,
    Recreation & Outdoors, Personal Care, Home & Kitchen, Cleaning Supplies,
    Games & Gifts, Pets; products.json is sorted in that order. **Pricing
    rule now**: AliExpress = today's dropship price x 1.15, then (c + 0.49) /
    0.5651 to .49/.99, and only if it is within 10% of the comparable Amazon or
    Walmart price; Bangalla at least 25% after PayPal and within 10% of list,
    else dropped (23 raised, 15 dropped). AliExpress Choice charges about
    $1.99 on a small order; our $2.99 covers it and margins stay over 25%.
    Products whose listing photo shows a range say which one the buyer gets.
    **50% off** registrations and pick-ups (oldPrice, a "% off" badge). **Pick-up
    sign-up** (netlify/lib/pickups.mjs, functions/subscribe.mjs + pickups.mjs):
    name, phone, email, address, day, instructions, optional $10 bucket
    (compost only, "bucket": 1000); address within 25 miles of the farm or in
    McAlester/Stigler/Checotah by the Census geocoder, else a ZIP list; the
    subscription carries our price and the bucket setup fee as a plan
    override; Blobs "pickups"; owner email on return; dashboard section;
    privacy.html#pickups. **Search engines**: tools/seo.mjs writes sitemap.xml,
    robots.txt, google-shopping.xml (Merchant Center feed) and store.html
    JSON-LD; pages have canonical links, local titles and JSON-LD;
    store.html?p=<id> opens a product; og-card.jpg is the 1200x630 preview.
    Owner steps: docs/SEO.md. Run render-store then seo after any products.json
    change. **Marketing**: tools/social-graphics.mjs draws marketing/social/*.png
    (gitignored, with the screenshots and VIDEO-PLAN.md); the kit is the
    artifact https://claude.ai/artifact/XtL53cixfCtdPm9BRpLM67. The held
    app-usage commit went out with Symphonymph 3.0.0 (the app session pushed it).

33. **2026-10-11, third list.** Margin floor is now **15%** (owner) for
    Bangalla and AliExpress, still "fairly competitive": Bangalla at its list
    price rounded up to .99 when that clears 15% after PayPal (29 prices went
    back down to list, 86 lines added, 12 scents added to existing option
    products; 245 products). Brands that sell well below list online stay out
    (bulkbg skipBrand list), and so do medical, supplement and sun-care lines.
    **Pick-up routes**: each sign-up stores lat/lon (Census point, or the ZIP
    centre from ZIP_POINTS); the dashboard section "Pick-ups and routes" sets
    the day we come (assignedDay) and status, exports CSV, and plans each
    day's route with routes.mjs (nearest stop + 2-opt, farm to farm, Google
    Maps links of 9 stops) plus "Suggest route days" (sweep by direction from
    the farm into k days, each keeping its customers' most-asked day). The
    form and the confirmation email say the day may change to save fuel.

34. **2026-10-11, fourth list.** **Seeds shelf** on Home, after Farm &
    Garden: tools/seedsnow-shelf.mjs also writes seedsnow-home.json (94
    SeedsNow products, public data) and tools/render-store.mjs draws it as
    the "Seeds" shelf (cards .gs-sn-card, data-id sn-<handle>, every link with
    the Refersion code, a disclosure line under the title; store.js shows a
    partner pop-up with no tax or returns line; prices refresh live). Rerun
    seedsnow-shelf then render-store to refresh it. **Shelves** show every
    product (SHELF_LENGTH 1000), arrows 56px, a thicker scrollbar, and "See
    all" is a bold green pill. **More products**: 34 Bangalla lines that came
    within 10% of Amazon/Walmart (an agent checked 119; brands Amazon
    undercuts stay out), including cases (compostable cutlery, cups, bowls,
    recycled foil, Snapware, sponges), and 25 AliExpress lines. AliExpress
    research lessons: the "10,000+ sold" on a search card counts every seller,
    the item page's "This seller" count is the real one, and most listings
    under 5,000 sold have fewer than 10 left; 12 searches and 25 item pages
    per agent with 5 s waits never met a robot check.

35. **2026-10-11, fifth list.** **Groceries shelf** (owner: "call this
    category Groceries"), after Farm & Garden and Seeds: 52 Bangalla listings
    (organic and fair trade preferred; 200 candidates price-checked against
    Walmart/Amazon per unit; a line is kept at list price, or priced down to
    the 15% floor when that lands within 10% of the comparable). Every one is
    "grocery": true, so tax.mjs charges 1.5%; the cart label and the pop-up
    name the grocery rate. Most Bangalla food comes only in cases of 4 to 6.
    **Eco badge**: tools/eco.mjs marks "eco": true and an "eco" tag from what a
    product is made of or replaces (compostable, recycled, bamboo, organic,
    plant-based, reusable, wool, jute, sisal, loofah, fair trade, and the If
    You Care / Full Circle / World Centric / Preserve / Repurpose brands);
    render-store draws a small "Eco" badge; 80 products. Run eco.mjs, then
    render-store, then seo after any products.json change. Blueland denied
    the affiliate application (2026-10-11); Arbico has not answered.

36. **2026-10-12, league registrations.** Player Registration and Team
    Registration ("registration": "player" | "team") open a form before the
    cart: player name, phone, email and optional team; or team name, captain
    and every player (7 to 15) with phone and email; both ticks required
    (league communication; play in both Eufaula and McAlester). Each
    registration is its own cart line (rid + reg), checked again on the server
    (netlify/lib/registrations.mjs via validateCart), named on the PayPal item,
    kept in Blobs "registrations" under the PayPal order id at checkout,
    marked paid with a roster email to the owner at capture
    (registration-mail.mjs), and listed with a CSV export in the dashboard
    (functions/registrations.mjs). privacy.html#registrations. Email: SES
    must run in the region where lavishleaf.org is verified (SES_REGION).

37. **2026-10-12, the owner's 33-item list** (tracked in
    docs/WORKLIST-2026-10-12.md). **PayPal webhook**
    (functions/paypal-webhook.mjs): every event verified with PayPal
    (PAYPAL_WEBHOOK_ID) and acted on once (Blobs "webhooks"); subscription
    activated/canceled/suspended/expired, monthly payment, pick-up refund, and
    store-order refund (order marked refunded or partly refunded, a league
    registration marked refunded, customer emailed). **Emails**: one branded
    template for notices (emails/notice.html, lib/notice-mail.mjs): pick-up
    welcome WITHOUT a day, "your pick-up day" (dashboard button), shipped,
    refund, canceled; receipts promise no turnaround and thank "us and our
    cause at Lavish Leaf Inc"; receipts show sales tax. **Dashboard**: Orders
    is its own section above Open the full tools (functions/orders-admin.mjs:
    list, a "placed" tick per line, Send shipped email with carrier and
    tracking); every line's supplier, SKU or item number and variant come
    from the order's sku (id or id:Option), with copy buttons for each part of
    the customer's address; top tiles Orders, Compost sign-ups, Recycling
    sign-ups and Sports registrations link to their sections; Pick-ups and
    routes has Pick-up day, Cancel subscription (PayPal cancel API), Email
    pick-up day, Remove, unfinished sign-ups hidden after 2 days and deleted
    after 30; League registrations has a league filter (products.json
    "league") and Remove/Restore; page names merge /store and /store.html;
    "Affiliate programs and suppliers" reads affiliates.json "suppliers".
    Pickups, registrations and orders stores use strong reads (the default
    eventual reads made the owner's saves look lost). **Store**: PayPal opens
    in a pop-up window (cart.js payWindow/goPayPal, postMessage from the
    return page, full-page fallback); waiver must be opened before it can be
    ticked; the "player or team name" box is gone and a registration is shown
    and editable in the cart; roster 7 to 12; "Team name or Free Agent";
    shipping parts on separate lines; tax wording "6% sales tax added in the
    cart" with no "Oklahoma"; Sunday pick-ups; the mouse wheel slides a shelf
    only after the pointer rests on it and never while the page scrolls.
    **American spelling** everywhere a person reads (color, flavor, fulfill,
    gray, canceled). google-shopping.tsv sits beside the XML feed for a Google
    Sheet (=IMPORTDATA). The owner's current to-dos: OWNER-STEPS "THE CURRENT
    ACTION LIST".

38. **2026-10-13, the owner's list** (docs/WORKLIST-2026-10-13.md).
    **Contacts**: every order, paid pick-up, registration (every player and
    the payer), contact and newsletter form, account (functions/
    identity-signup.mjs) and donation is kept in the newsletter store with
    phone and sources (lib/newsletter.mjs addContact/saveContact; somebody who
    unsubscribed is never re-added; an unticked form box is "declined"). The
    dashboard's Contacts card downloads them (newsletter-admin "contacts",
    which backfilled earlier customers once, flag backfilled-v1). Receipts,
    notices and the contact reply carry a one-click unsubscribe line
    (notice-mail optOutHtml). **Donations**: our own donate.html pop-up and
    functions/donate.mjs (Orders v2, category DONATION, division choice,
    Blobs "donations", branded thank-you, owner alert); the hosted PayPal
    donate button is gone. **Webhook** also handles disputes, chargebacks,
    denied captures, failed subscription payments and donation refunds.
    **Pick-ups** ask PayPal for the real status (a subscription canceled in
    PayPal before the webhook existed read "active" and could not be removed).
    **Tiles**: 14, two rows of 7 (APK downloads, Accounts created, Contact
    forms submitted, Donations raised added). Notice emails no longer greet
    twice. **Products**: margin floor may go to 10% for a FEW lines (owner);
    target 15-30%. Technology shelf (AliExpress brand stores).
    **Deploys failed 2026-10-13 (06:50 to 08:15)**: Lambda-style functions
    (`export const handler`) get every environment variable and AWS caps them
    at 4 KB; PAYPAL_WEBHOOK_ID tipped it over and EVERY deploy failed at
    "Deploying" (the owner's Trigger deploy too). account, submission-created
    and identity-signup are now modern (`export default async (request)`);
    account deletes the sign-in with globalThis.netlifyIdentityContext's
    admin token. NEVER add a Lambda-style function again; after any push,
    confirm the deploy is live (curl a changed file).

39. **2026-10-13, second list.** Tiles Visitors, Pages viewed, Newsletter and
    New followers link to their sections. **Shipping is Bangalla's own
    dropship table** (bangalla.com/shipping-returns, 26 tiers, $5.75 under
    0.5 lb to $85.79 at 55-59.99 lb; 60 lb+ asks for a quote) in shipping.mjs,
    terms-of-sale and the store note; the old Zone 5 bands are history.
    **20% first-order offer**: store-offer.js pop-up on store.html (4 s, once,
    asks the server first), functions/discount.mjs (status/claim/check),
    lib/discounts.mjs (Blobs "discounts": code, email, phone, HMAC of the IP;
    one claim per IP, email and phone, none after a paid order), root
    discount.mjs (20% off posted products only; tax on the discounted price),
    cart code box (localStorage ll-discount), checkout puts the discount line
    and d=CODE on the PayPal order, capture REFUSES before charging when the
    PayPal email differs or the code was used, then marks it used; receipts
    and the dashboard show it. A 20% code on a 10-15% margin line loses money
    (owner told). Awin denied the account; Ascend by Partnerize (ex Pepperjam)
    approved: apply to brands inside it.

40. **2026-10-14.** **Texting** (lib/sms.mjs, AWS End User Messaging SMS v2
    SendTextMessage via SigV4, service "sms-voice"; env SMS_ORIGINATION_NUMBER,
    SMS_REGION optional, SES_* keys with sms-voice permissions): consent only
    from the "Text me offers" box (every newsletter form, name="sms"; the
    store offer pop-up) stored as smsConsent on the contact; every text is
    "Lavish Leaf: ... Reply STOP to opt out."; AWS's Default opt-out list is
    read before a send (smsOptOut); sends run in batches (lib/sms-job.mjs,
    functions/sms-drip.mjs every 10 min) only 9 am to 8 pm Central; dashboard
    card "Text messages" (functions/sms-admin.mjs). privacy.html#sms carries
    the carrier-required terms. **Stock check** (lib/stock.mjs, stock-run.mjs,
    functions/stock-check.mjs every 2 h, functions/stock.mjs): Bangalla's
    private feed BANGALLA_FEED_URL (any CSV/TSV/JSON with SKU and quantity
    columns; under 50 SKUs = untrusted, nothing hidden) and the AliExpress DS
    API (30 items a run, round robin); under 5 left or gone = out: store.js
    removes the card, cart.js blocks paying, checkout refuses; catalog.mjs now
    carries supplier codes. Dashboard "Stock at our suppliers". Offer is 15%
    (LL15- codes; LL20- still accepted). Unsubscribe footer and page say
    receipts and notices keep coming (they never checked the list). Tile
    links: .db-section scroll-margin-top under the measured header.

41. **2026-10-14, afternoon.** **CJ Dropshipping** for Recreation & Outdoors:
    lib/cj.mjs (API 2.0, CJ_API_KEY -> access token in Blobs "cj", 180 days,
    refresh; QPS 1), functions/cj.mjs (status; "order": the CJ lines of a paid
    order, cheapest US freight, createOrderV2 payType 3 = created unpaid, the
    owner pays in CJ; o.cj recorded), the dashboard order card's "Place the CJ
    items on CJ", the stock check (US-warehouse stock per vid), shipping.mjs
    supplier "cj" (product "shipCents" = CJ's freight to 74462; the dearest
    item plus $1.50 per further item), products carry source.supplier
    "CJ Dropshipping", source.pid, source.vid (options: values[].vid).
    tools/cj-research.mjs reads CJ_API_KEY from .env for product research
    (output outside the repo). Orders now keep the address in parts (o.addr).
    **Offer**: email is enough; phone and texts optional. **Suppliers**: the
    owner's "not for us" list (demo-store DECLINED; affiliates.json group 4).
    AWS texting needs the account on the Paid plan.

42. **2026-10-14, evening.** **CJ from both warehouses**: products carry
    source.warehouse "US" | "CN", shipCents (CJ freight, one unit, to 74462)
    and shipAddCents (what a second unit adds); shipping.mjs charges a US and
    an overseas parcel apart (dearest item in full + each further unit's
    add-on); the pop-up says the warehouse and delivery time; Terms of Sale
    explains it; functions/cj.mjs places one CJ order per warehouse.
    tools/cj-research.mjs --from CN. 75 CJ products (10 + 65, 455 in all);
    photos checked against names on a contact sheet (a photo showing other
    colors gets "you receive the one named"). Fillaree approved (wholesale,
    not dropship): no products yet (owner). Texting: the number and
    registration are in the Management Account, us-east-1, with its own
    IAM user lavishleaf-website-sms (SMS_* keys); a number without + is fixed
    in code. Twilio not used (owner: AWS is cheaper).

43. **2026-10-14, night.** **One CJ rate, no location anywhere** (owner: "I
    don't want anything that says overseas ... Nor do I want to distinguish or
    insinuate that items come from any location"; "keep the 1-3 weeks"; "keep
    shipping the same as the $2.99"). shipping.mjs `suppliers.cj` is the
    AliExpress flat rule with `sameAs: 'aliexpress'`, so CJ and AliExpress
    items share ONE direct-ship part (free from $9.99 or 3 items, else $2.99).
    CJ's own freight is folded into each CJ price (`shipIncluded`, 54
    products), so the flat rate never loses money; `shipCents`/`shipAddCents`
    and source.warehouse stay for the owner's CJ ordering only. The pop-up and
    Terms of Sale say "allow 1 to 3 weeks" for every order. Never write
    warehouse, overseas, US or China wording where a visitor reads it.
    **Azure Standard approved** (affiliate link a_aid=aac4bd548d):
    tools/azure-shelf.mjs (8 lines, 86 products, no seeds, Azure's public API
    api.azurestandard.com/packaged-products with limit=100; photos 360px via
    tools/thumbs.ps1) writes azure-home.json, netlify/lib/azure-codes.mjs and
    the Green Swaps Azure section (feature, Find a Drop, Anchor Drops, How it
    works, shelves) between the AZURE markers; tools/render-store.mjs draws
    the "Azure Standard" Home shelf after Pets (4 per line); store.js
    refreshAzure() reads functions/azure-prices.mjs (CDN 12 h; out of stock
    hides the card); #azure opens Green Swaps at Azure; sidebar partner link
    and a Home feature block. Rerun azure-shelf then render-store to change
    the selection.

44. **2026-10-14, late.** **Azure**: the Anchor Drop card is gone (owner: it
    is a coordinator program, and the Drop locator does not show which Drops
    are Anchor Drops); Find a Drop and How Azure works share the row. 135
    products in 8 lines; new ones ranked by Azure "favorites" from Azure's
    own public Algolia search index (app J8N8I8KE2Y, the search-only key its
    site uses; index "products"; hitsPerPage 1000, two pages), seeds and
    supplements left out; Home shows 6 per line (HOME_PER_SHELF). **AliExpress
    signed in** (owner's Chrome): prices without the new-shopper deal; 10
    more Recreation & Outdoors lines including clothing (rain pants, leggings,
    sports bra, joggers, gloves) with a "Color and size" or "Size" option;
    clothing blurbs give the size M measurement because there is no size
    chart on our pop-up. **Merch**: docs/MERCH-SUPPLIERS.md (Printful first,
    Printify backup, Custom Ink for league jerseys).

45. **2026-10-14, night. Printful is live.** netlify/lib/printful.mjs (the
    token is account-wide, so the "Lavish Leaf" store id is looked up from
    /stores, never "Personal orders"); tools/printful-import.mjs reads the
    store's products, keeps hand-written names and blurbs on reruns, prices
    each product at one price for every size: the OWNER'S Printful prices (item 46)
    exactly; the tool only warns when one is under 15%. It places them at the start of Recreation & Outdoors
    (owner: on that shelf, not their own). Shipping rule "printful" =
    Printful's own rate to 74462 (dearest item + each extra unit's add-on).
    Dashboard: "Send the apparel to Printful" = a DRAFT order; the owner
    confirms it in Printful. Azure Home shelf = every Azure product (135).
    The owner's Printful tracking-page logo (800 x 500) is in his Downloads.

46. **2026-10-15.** **Palladium Boots** (Ascend/Partnerize, 10%):
    tools/palladium-shelf.mjs reads palladiumboots.com's public Shopify
    collections (men's and women's best sellers, waterproof, cold-weather;
    boots and shoes only, at most two colors of a style, Palladium's
    abbreviations spelled out only where certain; "WL" stays) and writes the
    Green Swaps section between the PALLADIUM markers (after AZURE:END: feature,
    a FALL20 card with its own tracking link, a free shipping over $90 card,
    4 shelves), palladium-home.json and netlify/lib/palladium-handles.mjs.
    render-store draws the "Palladium Boots" Home shelf right after Azure and
    10 waterproof picks at the end of Recreation & Outdoors. Every link is
    the tracking link with ?url=<palladium page> (deep link, measured).
    functions/palladium-prices.mjs (each product's .js, 8 at a time, CDN 12 h)
    keeps prices and hides sold-out cards. Remove the FALL20 card when the
    code ends. **Printful prices are the owner's own** (he set them;
    printful-import uses them exactly and only warns under 15%). The two
    white-shirt photos are Printful "Flat" PNG mockups set on #d3d7d3 (the
    women's design placed where his Printful mockup had it). Sidebar rows
    6px padding. The owner will not press his own apparel: Printful stays.

47. **2026-10-15, second list.** Palladium cards always badge "Palladium";
    a small `.sp-sale` tag top right shows a sale (store.js keeps it current).
    Palladium picks sit right after the Printful apparel on Recreation &
    Outdoors. Wording: "We earn commission on orders using these links, at no
    extra cost." and "Check out our Green Swaps affiliates for even more
    products!". More partner products: Palladium shelves 24/24/23/18 + Kids
    (Palladium's KIDS/CHILDREN tags across the catalog: only 2 in stock
    2026-10-15; its "kids" collection is mostly adult styles), 3 colors per
    style, Home 75; SeedsNow Green Swaps shelves about +50% (136); Azure +47
    (182, next-favorited per line). Home banners: SeedsNow, Azure, then
    Palladium ("Our Outdoor Footwear Partner"), all shorter. Sidebar partner
    links open their Green Swaps section (#seedsnow, #azure, #palladium; the
    SeedsNow block has id="seedsnow"). Sidebar, shelves and cards condensed
    (the overrides at the end of store.css).

48. **2026-10-15, third list.** Home: Recycling Pick-Up is a division card
    (out of Future); the hero line is smaller on phones. **Registration from
    Rec Sports** (store.html?add=<registration>) opened the empty cart over the
    form: cart.js handleArrival no longer opens the cart for a registration or
    an options product. **Donate**: nav-cart.js adds a green Donate button
    beside the header cart on every page (a heart on phones, where the email
    icon leaves the header so the logo keeps its size) and loads donate.js,
    which now listens on the whole document; Home and Company donate buttons
    open the donate.html pop-up; every donate button is green. Founder photo is
    a fixed 160px circle (the phone layout had stretched it). Future Roles
    cards fill a phone's width. Store: the Your lists row is gone from Home;
    the foot note has Green Swaps on its own line; new hero lede; **Groceries
    ends with 20 Azure items** (first four of each food line, azureCard(x,
    'Groceries')); phones get a green labeled Browse pill, a one-time hint
    (localStorage ll-browse-hint) and a 280px drawer. **Texting**: AWS
    ResourceNotFound for the phone number = wrong region or account; the
    error and the dashboard card now name the region and key set in use.

49. **2026-10-15, fourth list.** **Donate sits beside "Online Store" in each
    page's black header** (.hero-btns, 12 pages; the home hero already had
    it); the top-bar Donate pill was the WRONG place and is gone (email icon
    back on phones); nav-cart.js only loads donate.js now. Home cards: Online
    Store 3rd, Rec Sports 6th. Black headers 18px top and bottom. Store:
    sidebar default 310px (340 and 390 move to it); hearts on Azure and
    Palladium cards; partner tags smaller at the corner, the Sale tag under
    them; 3:2 photos, tighter shelves, titles nearer their cards; shorter
    partner banners; "Back to Store Home Shelves" on shelf and list pages;
    Green Swaps lede reworded.
