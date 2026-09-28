# Finishing the store: every step, in order

Written 2026-09-27, for Kevin, at his request: *"Give me the precise steps that
I need to do to complete the store, including the paypal links and setup."*

**What is already built and switched off.** The cart, the three Netlify
functions and server-side pricing exist and are deployed. `products.json` says
`"checkout": "links"`, so the buttons on the site are `mailto:` links today and
the functions answer **503 on purpose** until PayPal keys exist. Nothing here
asks you to write code: every step below is an account, a value to paste, a
photograph or a sentence.

**Roughly how long.** Step 1 is twenty minutes. Steps 2 and 3 are an evening
with a camera. Step 4 is ten minutes. Step 5 is mine and takes a session. Steps
6 and 7 are the ones with a clock on them: PayPal can take a day to approve a
live app.

**Sequencing, 2026-09-27, his call:** *"I’ll get the Paypal links/items setup
later."* So **steps 1, 2, 5 and 6 are deferred to when he chooses**, and the
store stays on `"checkout": "links"` meanwhile. What is NOT waiting on PayPal
is step 3, and step 3 is the release gate: the App Store listing points at a
page that must not read "coming soon". **`docs/STORE-PRODUCTS.md` is now the
list to photograph**: five tiers, a link to every product on its supplier’s
own page, and **Tier 1 is the opening order** (garden, non-liquid cleaning,
bamboo kitchen tools, soap by the single bar, the games shelf and the four
lightest items). Tier 4 is deliberately **not** for this website: it is the
retail store and pickup, because a 50 lb sack cannot be posted at a profit.

---

## Step 1: a PayPal REST app, in SANDBOX first

1. Go to **developer.paypal.com** and log in with your normal PayPal account.
2. Top right, **Dashboard**. Make sure the toggle at the top of the page says
   **Sandbox**, not Live.
3. **Apps & Credentials** in the left menu, then **Create App**.
   * App Name: `Lavish Leaf store (sandbox)`
   * Type: **Merchant**
   * Press **Create App**.
4. The page that opens shows **Client ID** and, behind a **Show** link,
   **Secret**. Copy both somewhere for a minute. They are for the sandbox only,
   so no real money can ever move with them.
5. While you are there, open **Testing Tools > Sandbox Accounts**. PayPal has
   already made you two: a **business** one (the shop) and a **personal** one
   (the buyer). Click the personal one, **View/Edit account**, and note its
   email and system-generated password. That is the account you will "buy"
   with in step 5.

**The direct links**, since the dashboard moves things around:

* Dashboard: `https://developer.paypal.com/dashboard/`
* Apps and credentials: `https://developer.paypal.com/dashboard/applications/sandbox`
* Sandbox accounts: `https://developer.paypal.com/dashboard/accounts`

## Step 2: put the keys into Netlify

1. **app.netlify.com** > your site > **Site configuration** >
   **Environment variables**.
2. **Add a variable** three times:

   | Key | Value | Tick "Contains secret values" |
   |---|---|---|
   | `PAYPAL_CLIENT_ID` | the sandbox Client ID | no |
   | `PAYPAL_SECRET` | the sandbox Secret | **yes** |
   | `PAYPAL_ENV` | `sandbox` | no |

3. **Deploys > Trigger deploy > Deploy site.** This is not optional: a Netlify
   function only sees a new environment variable after a deploy, so without
   this the keys are there and the store still answers 503.

## Step 3: a photograph and a sentence for each product

The renderer **refuses to publish a product with a missing photo**, on purpose:
a typo must never put a broken image on a page that asks for money. So each of
the three needs three things in `products.json`:

```json
"image": "images/compost.jpg",
"imageAlt": "A full compost bin on a porch",
"blurb": "Weekly pickup from your door, turned into soil for the farm."
```

* **compost-monthly** - a photo of a full bin or a pickup, and one sentence
  saying what is collected, how often, and where you collect.
* **soccer-player-fall** - a photo from a league night, and one sentence
  saying what $25 covers and when the season runs.
* **soccer-team-fall** - the same for $250 a team, and how many players that
  covers.

Put the files in `images/` and send them to me, or drop them in the repo
yourself and run `node tools/render-store.mjs`.

**What I will not do:** write the descriptions. Only you know what is included
and where you deliver.

## Step 4: the waiver, which the cart now enforces

You said on 2026-09-27 that both soccer registrations already carry a waiver
that players and teams accept before paying. **That waiver lives in the email
flow the site uses today, and the day `checkout` flips to `"cart"` it would
have disappeared** - nobody would have noticed until it mattered.

So the cart takes one now, and refuses to open PayPal without it, in the
browser AND on the server. To turn it on, add this to each soccer product in
`products.json`:

```json
"waiver": {
  "version": "2026-09",
  "url": "waiver.html",
  "label": "I have read and accept the liability waiver"
}
```

and put the waiver text at `waiver.html`. Two notes:

* **`version` is the record.** Whatever the buyer ticked travels to PayPal as
  the order's `custom_id` (`waiver:2026-09`), so the order itself says which
  waiver was accepted. Change the text, change the version.
* A product with no `waiver` field is unchanged: the compost pickup will not
  grow a checkbox.

## Step 5: a sandbox order, end to end (mine)

Once steps 1 to 4 are done, tell me and I will:

1. Flip `products.json` to `"checkout": "cart"` on a branch.
2. Buy each product with your sandbox buyer account: add to cart, tick the
   waiver, pay, and come back through `?paypal=return`.
3. Check the capture, the amount, the note and the waiver id on the sandbox
   transaction.
4. Report what the three known gaps do in practice: **there is no order
   record, no confirmation email to the buyer, and no address collection for a
   physical pickup.** That is a session's work and it is the last piece before
   real money.

## Step 6: the live PayPal app

Only after a sandbox order has gone through.

1. developer.paypal.com > toggle **Live** at the top.
2. **Apps & Credentials > Create App**, name it `Lavish Leaf store`.
3. PayPal may ask to confirm your business details. This is the step that can
   take a day, which is why it is not last.
4. In Netlify, change the three variables to the **live** Client ID and Secret
   and set `PAYPAL_ENV=live`. Trigger a deploy.
5. Buy one real thing from yourself, for a dollar if you can, and refund it.

## Step 7: the things a shop needs before it takes money

These are not optional and they are not mine to write:

* **Oklahoma sales tax.** League fees and compost pickups are both taxable in
  ways that depend on how they are classified. Your CPA answers this in ten
  minutes and it is the single most expensive thing to get wrong.
* **A refund policy**, a **terms of sale** page, and a **privacy** line about
  what PayPal receives. The privacy page exists; the other two do not.
* **The two "coming soon" banners** (household products, gaming assets) get
  real products or come down. A reviewer following your App Store marketing URL
  to a page of "coming soon" is exactly what App Store guideline 2.1 is about.

---

## The order of it, on one line each

1. Sandbox PayPal app, keys and sandbox buyer account. *(20 minutes)*
2. Three variables into Netlify, then **trigger a deploy**. *(5 minutes)*
3. Photos and one sentence per product. *(an evening)*
4. Waiver text at `waiver.html`, and the `waiver` block in `products.json`.
5. Tell me: I run the sandbox order and close the three gaps. *(a session)*
6. Live PayPal app, swap the keys, deploy, one real order and a refund.
7. CPA on sales tax; refund policy and terms of sale; the two banners.

**What blocks the App Store:** you said the store must be live before the app
ships, so 1 to 7 are the release gate. Nothing in the app is waiting on any of
it.
