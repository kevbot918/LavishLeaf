# Newsletters, order automation and analytics: the recommendation

Written 2026-10-02 for the owner's three asks: automatic newsletters that
this session mostly writes; automatic ordering, shipping, receipts and labels;
and one place to see how people find and use the site and the social posts.
Nothing here is built yet. Each part ends with what building it involves.

---

## 1. Automatic newsletters

**Today:** the Newsletter form on every page is a Netlify form named
`newsletter`. Sign-ups sit in Netlify's Forms tab and nothing is sent to them.

### The services, compared (free plans, read 2026-10-02)

| Service | Free plan | Automations on free | API on free | Fit |
|---|---|---|---|---|
| **Brevo** | Unlimited contacts (some sources say a 100,000 cap), **300 emails a day** | Yes, limited | Yes, full (and transactional email) | **Recommended** |
| MailerLite | 250 subscribers, 2,500 emails a month (cut in June 2026) | 3 | Yes | Good editor, small cap |
| Kit (ConvertKit) | 10,000 subscribers, unlimited sends | No (newsletters only) | Limited | Big list, no automations |
| Buttondown | 100 subscribers | Yes | Yes | Simple, smallest cap |

**Why Brevo:** the list can grow without a bill, 300 a day is about 9,000 a
month (a newsletter to 300 people every day of the week, more than we need),
and the SAME account sends the store's order receipts (part 2), so there is
one email service, not two. When the list passes about 300 people, a
newsletter goes out over two days, or the paid plan (about $9 a month) lifts
the daily limit.

### How it would work

1. **Sign-up:** a Netlify function named `submission-created` runs on every
   form submission (Netlify calls it by that name). For the `newsletter`
   form it adds the person to the Brevo list through the API. The form on the
   page stays exactly as it is.
2. **Welcome email:** a Brevo automation sends a welcome the moment someone
   joins (the farm, the league, the store, Symphonymph, one line each).
3. **The newsletter itself:** this session writes each issue from what
   actually happened (new products, league dates, farm news, the newest
   social posts) as an HTML email in the site's colours, saved in
   `newsletters/2026-10.html` in this repository so there is a record. A
   small script creates it in Brevo as a **draft campaign**.
4. **You approve and send.** You open Brevo, read it, press Send or
   Schedule. Nothing goes to subscribers without your click: one bad email
   to the whole list cannot be taken back.
5. A monthly reminder (a scheduled session) can start the draft on the first
   of each month so it is waiting for you.

### Two rules that apply to every newsletter

* **A postal address must be in every newsletter** (CAN-SPAM). It does not
  have to be a street address: a **USPS PO box** or a private mailbox works.
  The website keeps its no-address rule; the address goes only in the
  email footer. **This needs a PO box from you before the first send.**
* An unsubscribe link in every email (Brevo adds it automatically) and only
  people who signed up (the form's checkbox).

### What building it involves
A free Brevo account (you), its API key into Netlify as `BREVO_API_KEY`
(you, marked secret), a PO box address, then this session builds the
`submission-created` function, the welcome automation's text, the newsletter
template and the draft script, and imports the people already in Netlify's
Forms tab who ticked "Sign up for news and updates".

---

## 2. Automatic ordering, shipping, receipts and labels

### What can be automated, and what cannot

| Step | Can it be automatic? | How |
|---|---|---|
| Customer's payment receipt | **Yes, already** | PayPal emails the buyer a receipt on every payment |
| Our own order confirmation | **Yes** | The capture function sends a branded email through Brevo |
| Telling you there is an order | **Yes** | The same function emails you the order and packing list |
| Ordering from a **dropship** supplier (Arbico) | **Mostly** | The function emails the supplier a purchase order with the customer's address. Arbico has no public ordering API; whether they take orders by email or only their portal is a question for the distributor application |
| Ordering from **Faire, Bangalla, WebstaurantStore** | **No** | None offers a retailer ordering API. These are stock orders anyway: you buy by the case, it ships to you |
| Shipping labels for what you ship yourself | **Yes, with Shippo** | The function buys the label through Shippo's API and emails you the PDF to print |
| Tracking emails to the customer | **Yes** | Shippo returns the tracking number; Brevo emails it |
| Invoices for email orders (teams, businesses) | **Yes** | PayPal's Invoicing API, or by hand from PayPal |

### Labels: Shippo versus Pirate Ship

**Pirate Ship has no API**, so it cannot be automated; it stays free and is
fine by hand. **Shippo** has an API on every plan: free for the first 30
labels a month, then about 5 cents a label on the free plan, at USPS
commercial rates like Pirate Ship. **Recommended: Shippo**, because a label
that prints itself is worth 5 cents. Start with Pirate Ship by hand until
orders arrive; switch when it is a chore.

### The order flow, once built

1. A customer pays (PayPal, already built). PayPal sends its receipt.
2. `capture.mjs` saves the order (already built, Blobs) and then:
   * emails the customer a Lavish Leaf confirmation (Brevo);
   * for a dropship line, emails the supplier a purchase order;
   * for a line you ship, buys a Shippo label and emails it to you to print;
   * emails you one summary: what sold, what was ordered, what to print.
3. When a tracking number exists, the customer gets it by email.

**What stays manual on purpose:** paying the supplier (their card or terms),
any order over a set amount (a check before money moves), and stock orders.

### What building it involves
This waits on the store going live (PayPal keys, `docs/STORE-STEPS.md`) and on
the first supplier accounts. Brevo from part 1, then a Shippo account and
`SHIPPO_API_KEY` in Netlify, then the Arbico answer on how orders are placed.

---

## 3. Analytics: one place to see what works

### What is already there
**Google Analytics 4 is installed** (`G-8SKVQ74TF6`) on 8 of the 14 pages.
Missing: `app-feedback`, `p`, `privacy`, `refunds`, `terms-of-sale`,
`waiver`. It already counts visitors, where they came from (Google,
Facebook, Instagram, direct) and which pages they read.

### The recommendation: three free tools, then one dashboard

| Tool | What it answers | Cost |
|---|---|---|
| **Google Analytics 4** (keep) | How many people, from where, over time; which pages; what they click (with events) | Free |
| **Microsoft Clarity** (add) | Heatmaps (where people click and how far they scroll) and recordings of real visits, so you SEE what draws attention and where people give up | Free, no limits that matter |
| **Meta Business Suite** (use) | Reach, likes, comments, shares and followers for every Facebook and Instagram post | Free, already yours |
| **Google Search Console** (add) | What people typed into Google to find us | Free |
| **Looker Studio** (the dashboard) | GA4 and Search Console on one page of charts you can open any time | Free |

Why not something else: Plausible and Fathom are simpler and more private,
but cost about $9 a month and show less; GA4 is free and already running.
Meta's own numbers only live in Meta (and the paid connectors that copy them
into Looker Studio cost $20 or more a month), so there are two options for
social numbers: read them in Meta Business Suite, or have this session build a
**private dashboard page** on our own site that reads the post numbers with
the Page token already in Netlify and shows them beside the website numbers,
visible only to you when signed in.

### What makes the numbers useful (the part this session would build)

* **Events in GA4** for the things that matter, named once: a store card
  opened, add to cart, "Supplier page" clicked (which demo products people
  are curious about), sign-up buttons (compost, recycling, soccer), the
  donate pop-up, newsletter and contact sent, the app download, social
  links. Then GA4 can say which products and which pages lead to a sign-up.
* **UTM tags on every link we post** (for example
  `?utm_source=instagram&utm_campaign=compost-oct`), so GA4 can say which
  post brought people and what they did after.
* The GA4 tag on the six pages that lack it.
* The privacy page updated to name Clarity beside Google Analytics.

### What building it involves
You: a Clarity account (clarity.microsoft.com, sign in, "Add project",
copy the project id), and Search Console (verify lavishleaf.org). This
session: the events, the missing tags, Clarity, the privacy wording, a
Looker Studio template to copy, and the UTM links. Optional: the private
social dashboard.

---

## Suggested order

1. **Analytics first** (an hour of work here, two free sign-ups for you):
   every day without it is data lost.
2. **Newsletter** (Brevo account, API key, a PO box).
3. **Order automation** once the store is taking real orders.

## Sources

* MailerLite free plan cut, June 2026: [emailsoftwareinsights.com](https://www.emailsoftwareinsights.com/reviews/mailerlite/pricing/free-plan/), [mailsoftly.com](https://mailsoftly.com/blog/mailerlite-free-plan-changes/)
* Free plan comparison: [sequenzy.com](https://www.sequenzy.com/blog/best-email-tools-with-free-tier), [omnisend.com](https://www.omnisend.com/blog/brevo-vs-mailerlite/)
* Brevo free plan and API: [emailtooltester.com](https://www.emailtooltester.com/en/reviews/brevo/pricing/), [emailsoftwareinsights.com](https://www.emailsoftwareinsights.com/reviews/brevo/pricing/free-plan/)
* CAN-SPAM address rule: [FTC compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
* Netlify form event functions: [docs.netlify.com](https://docs.netlify.com/build/functions/trigger-on-events/)
* Shippo pricing, Pirate Ship has no API: [goshippo.com](https://goshippo.com/blog/shippo-vs-pirate-ship-vs-shipstation-how-the-top-shipping-platforms-compare), [ecommerceparadise.com](https://ecommerceparadise.com/shippo-vs-pirate-ship-2026/)
* PayPal Invoicing API: [developer.paypal.com](https://developer.paypal.com/docs/invoicing/integrate/)
* Analytics tools: [martech.surf](https://martech.surf/2026/03/04/ga4-alternatives-free-open-source-2026), [aversusb.net](https://www.aversusb.net/blog/ga4-vs-plausible-analytics-2026-privacy-first-website-analytics)
* Microsoft Clarity limits: [productanalytics.tools](https://productanalytics.tools/tools/microsoft-clarity/)
* Meta Business Suite insights: [metricool.com](https://metricool.com/meta-business-suite/)
* Looker Studio and GA4: [twominutereports.com](https://twominutereports.com/blog/looker-studio-connectors)
