# The launch checklist: everything left to finish the website and open the store

Written 2026-10-02 after a full audit, for the owner: *"give me a full action
list of things I need to do to complete our full website setup, including
opening the store and finalizing products."* In order. Each line says who
does it ("You" or "Claude", meaning this session) and where the steps are.

Rule for every secret below: it goes ONLY into Netlify -> Site configuration ->
Environment variables (tick "Contains secret values"), then Deploys ->
Trigger deploy. Never into chat, email or this repository.

---

## Phase 1: business papers (this week; everything else asks for them)

| # | Who | Do | Steps |
|---|---|---|---|
| 1 | You | Get the **EIN** for Lavish Leaf Inc (free, ~10 min) | SUPPLIER-ACCOUNTS.md |
| 2 | You | Get the **Oklahoma resale certificate** from the sales tax permit | SUPPLIER-ACCOUNTS.md |
| 3 | You | Rent a **PO box** (USPS or a UPS Store mailbox). It goes in email footers only, never on the site | EMAIL.md |
| 4 | You | Ask a **CPA about Oklahoma sales tax** on league fees, compost and recycling pick-up, and on shipped goods. The single most expensive thing to get wrong | STORE-STEPS.md step 7 |

## Phase 2: switch on what is already built (an evening)

| # | Who | Do | Steps |
|---|---|---|---|
| 5 | You | **Enable Netlify Identity**, sign up on the store with your email, give yourself the `admin` role | DASHBOARD.md step 1 |
| 6 | You | **Search Console**: add the Domain property, add Google's TXT record in Netlify DNS, verify | DASHBOARD.md step 2A |
| 7 | You | **Google Cloud service account**: enable the 2 APIs, make the key, add it as Viewer in Analytics and as a user in Search Console; put `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GA4_PROPERTY_ID`, `GSC_SITE_URL` in Netlify | DASHBOARD.md step 2B to 2D |
| 8 | You | **Three custom dimensions** in Google Analytics: `product`, `search_term`, `network` | DASHBOARD.md step 2E |
| 9 | You | **Clarity API token** -> `CLARITY_API_TOKEN` | DASHBOARD.md step 3 |
| 10 | You | **Netlify personal access token** -> `NETLIFY_API_TOKEN` | DASHBOARD.md step 4 |
| 11 | You | **Brevo**: account, verify the lavishleaf.org domain (DNS records + DMARC), API key. Put `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_POSTAL_ADDRESS` (the PO box), `OWNER_EMAIL`, `NEWSLETTER_SECRET` (long random text, never changed later) in Netlify | EMAIL.md |
| 12 | You | Trigger a deploy, open lavishleaf.org/dashboard.html. Press **Send me the welcome email**, then **Import past sign-ups** | DASHBOARD.md |
| 13 | You | In Clarity -> Settings -> Masking, choose **Strict** if you want even page text hidden in recordings (forms are already masked) | |
| 14 | Claude | When you say "keys are in": read the dashboard's sections with you, fix anything a real account answers differently from the docs | |

## Phase 3: finish the website content

| # | Who | Do |
|---|---|---|
| 15 | You | **Founder card** on the Company page: send your name, a photo (square, at least 600 px) and a few sentences about why you started Lavish Leaf. Claude puts them in |
| 16 | You | **Home page logos** for Rec Sports, Gaming and Lawn & Garden (still drawn ovals), and the real Symphonymph mark if the stand-in should change |
| 17 | You | **Confirm the recycling price** ($15 a month is a proposal) and the compost price ($20) |
| 18 | You | A **photo for Recycling Pick-Up** (your trailer or a bin; landscape, at least 800 px wide). The card shows a ♻ until then |
| 19 | You | **Bangalla Excel and CSV files**: attach them here or put them in `docs/research/`. Claude analyses them and adds the products |
| 20 | You | **First YouTube video**; then Claude swaps the Social page's Subscribe card for the feed |
| 21 | Claude | When 15 to 20 arrive: put each in, render, test, deploy |

## Phase 4: suppliers and the first real products

| # | Who | Do | Steps |
|---|---|---|---|
| 22 | You | Week 1 accounts: **Faire**, **Arbico** distributor programme, **GrowOrganic** wholesale, **Hummert**, **Bangalla** | SUPPLIER-ACCOUNTS.md |
| 23 | You | Week 2: **WebstaurantStore**, **Frontier Co-op** ($10), **Matr Boomie**, **eeBoo**, **Vermont Soap**; and the free applications (Rustic Strength, Fillaree, Blueland, Meliora, Who Gives A Crap, High Mowing) | SUPPLIER-ACCOUNTS.md |
| 24 | You | Send Claude **screenshots of the wholesale prices** each account shows | |
| 25 | You | **Pick the opening lines** from the demo shelves. Use the dashboard's "What people want from the store" (clicks, wish lists, searches) to decide | |
| 26 | Claude | For each picked line: real price (cost + margin + the $1 shipping cushion), one sentence, `ship` and packed weight, category, and the Oklahoma pesticide registration check for any pest product. Then turn it from demo into a real product | STORE-PRODUCTS.md, SHIPPING.md |
| 27 | You | **Photograph** each picked product when it arrives (or use the supplier's photo only where their terms allow it), and **weigh each packed** | STORE-STEPS.md step 3 |
| 28 | You | Place the **first orders** (Faire at 50% off first; the Bangalla soap order after the shelf-price check) | STORE-PRODUCTS.md §11 |
| 29 | Claude | **Remove the demo shelves** (`tools/demo-store.mjs --remove`) once enough real products exist, or keep a few as "coming soon"; your call | |

## Phase 5: payments and shipping

| # | Who | Do | Steps |
|---|---|---|---|
| 30 | You | **PayPal Business** account; a **sandbox** REST app; `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV=sandbox` in Netlify | STORE-STEPS.md steps 1 to 2 |
| 31 | You | **Subscription plans** for compost and recycling: put the sandbox keys in a `.env.tools` file beside the repository on your computer and run `node tools/paypal-plans.mjs --apply` (Claude can walk you through it) | tools/paypal-plans.mjs |
| 32 | Claude | **Sandbox test, end to end**: set `"checkout": "cart"`, buy each product with the sandbox buyer, check the order record, both emails, the waiver, shipping, a subscription sign-up | STORE-STEPS.md step 5 |
| 33 | You | **Pirate Ship** account (labels by hand from the first posted order) and a **USPS business account** (free boxes) | ACCOUNTS-TO-OPEN.md |
| 34 | You | **Shippo** account when posted orders are regular; Claude then builds the automatic label (paid per label, emailed to you) | ACCOUNTS-TO-OPEN.md |
| 35 | You | **Live PayPal app**, swap to the live keys and `PAYPAL_ENV=live`, run `paypal-plans.mjs --live --apply` | STORE-STEPS.md step 6 |
| 36 | You + Claude | **One real order** for a small amount, then refund it. The store is open | STORE-STEPS.md step 6 |

## Phase 6: after opening

| # | Who | Do |
|---|---|---|
| 37 | You | The **monthly newsletter**: ask Claude to write the month's issue (or copy `emails/newsletter-2026-10.html` and edit), send yourself a test from the dashboard, then Send to everyone. The October draft is ready now |
| 38 | You | **Weekly look at the dashboard**: what people clicked, searched and liked; feed it back into products and posts |
| 39 | You | **UTM links** on social posts, e.g. `https://lavishleaf.org/farms.html?utm_source=instagram&utm_campaign=recycling-oct` (Claude can make a list each month) |
| 40 | You | **Marketing videos and posts** (farm, league, studio): Claude helps plan and script them |
| 41 | You | **Symphonymph to the App Store** only after the store is open (your rule, 2026-09-25) |

---

## The audit, 2026-10-02: what was checked

* Every page: Google Analytics present (14 of 14), `analytics.js` present
  (14 of 14), no em dashes, no phone number or street address, "Lavish Leaf"
  spelled as two words (the Facebook page path is the only "LavishLeaf").
* Every Netlify function bundles; the tests pass; the store pages match
  `products.json`.
* Email: templates fill and escape, the welcome and newsletters carry one-click
  unsubscribe headers and the postal address, the daily limit keeps 40 for
  order emails, a newsletter cannot be marked finished while people are still
  waiting, scripts are stripped from sent mail, a sign-up posted straight to the
  function is checked against Netlify when the Netlify token exists.
* Netlify Identity is supported in 2026 (Netlify reversed its deprecation
  plan; Git Gateway is what went), so the dashboard and store accounts can
  rely on it.
* Known gap: a compost or recycling **subscription** is approved on PayPal's
  own pages, so it is not filed on the dashboard and gets PayPal's emails, not
  ours. Closing it needs a PayPal webhook; Claude builds it during step 32.
* Not checkable from here: the live site itself (this environment cannot reach
  lavishleaf.org), and anything that needs your keys. Phase 2 step 14 is that
  check.
