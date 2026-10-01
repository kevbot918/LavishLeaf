# Customer accounts: the recommendation

Written 2026-10-01 for the owner's ask: wish lists (and later the cart, the
sidebar order and other settings) should survive clearing the browser and
follow a customer to another device, which means customer accounts. This
reverses the 2026-09-30 store line "no accounts ever", at his instruction.

**Built 2026-10-01.** What is in the code:

* `netlify/functions/account.mjs`: get, put, export and delete, for the
  signed-in customer only (Lambda-style, so Netlify hands it the verified
  user and the Identity admin token that deleting a sign-in needs).
* `netlify/lib/accounts.mjs`: the record in Netlify Blobs (store
  `accounts`), cleaned on every write; the browser can never write an order.
* `netlify/lib/identity.mjs`: checkout asks Identity who a token belongs to.
* `netlify/functions/checkout.mjs` and `capture.mjs`: a signed-in buyer's id
  rides on the PayPal order (custom_id `u=`) and the paid order is filed in
  their history at capture.
* `store.html` / `store.js`: the person icon in the store bar, the Netlify
  Identity widget for sign-in and sign-up, the Your account dialog (lists,
  orders, sign out, download my data, delete my account), the merge on sign
  in, and saving every change to the account. Shelf order (drag a shelf in
  the sidebar, or Reorder) saves to the browser for guests and to the account
  when signed in; Home follows it.
* `privacy.html#accounts` and `terms-of-sale.html#accounts`.
* Tests: `npm test` (tools/test/shipping-accounts.test.mjs).

**Until Identity is switched on in Netlify, the person icon says "Accounts
are being switched on" and everything works for guests as before.**

## Switching it on (the owner, in the Netlify dashboard, about 10 minutes)

1. Site configuration, **Identity**, Enable Identity.
2. Registration preferences: **Open** (anyone can sign up).
3. External providers: add **Google** (the default Netlify-managed keys are
   fine to start).
4. Emails: the confirmation, recovery and invitation emails. Change the
   sender to `no-reply@lavishleaf.org` once the domain's SPF and DKIM records
   allow Netlify to send for it; until then Netlify's own sender works.
5. Nothing to set up for Blobs: the store is created on first write.
6. Test with two browsers: sign up in one, heart a product, sign in in the
   other, see it there; then Download my data, then Delete my account.

Sign-in is email and password (with a confirmation email) or Google. The
original plan said "magic link"; Netlify's widget does not offer one, and
Google sign-in covers the no-password wish for most people.

## What an account is for, and what it is not

**For:** wish lists, a saved cart, the sidebar and Home shelf order, order
history, a saved shipping address, newsletter preference.

**Not for:** buying. Checkout stays open to guests: forcing an account before
paying is one of the most common reasons carts are abandoned. PayPal handles
the payment and the card; we never see or store card numbers.

**Not the app.** Symphonymph's "no accounts" promise is about the app and
stays true. Website accounts are optional and only for the store.

## The options, compared

| Option | Cost | Fit | The catch |
|---|---|---|---|
| **Netlify Identity + Netlify Blobs** | Free tier on the plan we already use | Built into the host; the store's Netlify functions already run there and see the signed-in user | Netlify announced Identity's deprecation in 2025 and **reversed it on 19 Feb 2026**. It is staying, but keep our data out of it (see below) so the sign-in could be swapped later |
| Supabase (auth + Postgres) | Free, then $25/month | Excellent: real database, row-level security | **Free projects pause after 7 days without traffic** and go offline until restored by hand. A small store can easily have a quiet week. Fine once on the paid plan |
| Firebase (auth + Firestore) | Free tier, no pausing | Good, Google sign-in built in | A second vendor and a second console; its data rules are easy to get wrong |
| Auth0 / Clerk | Free tiers, then per user | Sign-in only | Still need somewhere to keep the lists |
| Move the store to Shopify | $39+/month plus fees | Accounts, cart, shipping, tax all included | Throws away the store we built and the site's look; a separate decision |

## The recommendation: Netlify Identity for sign-in, Netlify Blobs for the data

* **Sign-in:** email and a magic link (no password to forget or leak), plus
  "Continue with Google". Netlify Identity's widget does both.
* **The data:** one record per customer in Netlify Blobs, keyed by the
  Identity user id: `{ lists, cart, sideOrder, homeOrder, address, prefs }`.
  Read and written only through one new Netlify function, `account.mjs`, which
  checks the signed-in user on every call. The browser never writes the
  store directly.
* **Guests keep working exactly as today**, in this browser. When a guest
  signs in, their browser lists and cart **merge** into the account (nothing
  is lost), and from then on the account is the copy that counts.
* **Order history:** `capture.mjs` (already built) also writes each paid order
  into the customer's record when they are signed in.
* Because the data lives in Blobs and not in Identity, the sign-in could be
  moved to Auth0 or Supabase later without moving anyone's lists.

## What must be included (the checklist)

1. **Privacy page:** what an account stores, where (Netlify, United States),
   for how long, and that we never sell it. Plain words, like the rest of
   `privacy.html`.
2. **Delete my account** in the account page: removes the Blobs record and
   the Identity user at once. **Download my data** beside it (a JSON file).
3. **Terms of sale:** one paragraph on accounts (one per person, we may close
   an abused account, orders are kept for tax records even after deletion,
   because the law requires sales records).
4. **Email that arrives:** magic links from our own domain
   (`no-reply@lavishleaf.org`) with SPF, DKIM and DMARC set in DNS, or they
   land in spam. Netlify's default sender works for testing only.
5. **Age:** accounts for 13 and over (COPPA). A line in the terms and the
   sign-up form.
6. **Security:** rate limits on sign-in, the function checks the user on
   every call, no secrets in the browser, and `_headers` unchanged.
7. **Settings come back as an account feature:** the sidebar and Home order
   (dragging the sidebar reorders the Home shelves), saved per account, with
   "Reset to the store's order".
8. **The store bar:** a person icon beside the heart and cart: "Sign in"
   when signed out, the customer's initial when signed in, opening a small
   account page (lists, orders, address, settings, sign out, delete).

## Order of work (when you say go)

1. Turn on Identity in Netlify (Site configuration, Identity, enable; then
   Registration: open; External providers: Google; Emails: custom sender).
2. `account.mjs` and the Blobs store; the merge on sign-in.
3. The account page and the person icon.
4. Sidebar drag-to-reorder, saved to the account (and to the browser for
   guests).
5. Privacy and terms updates, then a test with two devices before it goes
   live.

## Sources

* [Netlify Identity deprecation discussion and its reversal (Decap CMS)](https://github.com/decaporg/decap-cms/discussions/7419)
* [Netlify blog: Auth0 extension and Identity changes](https://preview--www.netlify.com/blog/auth0-extension-identity-changes/)
* [Netlify forums: Auth0 as successor of Identity](https://answers.netlify.com/t/role-based-access-with-auth0-as-successor-of-netlify-identity/155205)
* [Supabase pricing 2026: free tier limits and pausing](https://uibakery.io/blog/supabase-pricing)
* [Supabase free tier limits 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
