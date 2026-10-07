# Every step left for the owner, click by click

Written 2026-10-06, after the owner: *"they are too vague to even understand
what exactly I am supposed to do. So give me the full steps here for every
action left that I need to take."* This replaces the short versions in
DASHBOARD.md step 2 and LAUNCH-CHECKLIST.md phase 2. Done so far: Netlify
Identity, the owner sign-in, the dashboard, Google Analytics and Clarity on
every page, the Bangalla product file.

**The one rule for every key below:** it goes ONLY into Netlify -> the site ->
**Site configuration -> Environment variables**. Never into chat, email or
the repository (the GitHub repository is public).

**How to add a Netlify variable** (used many times below): app.netlify.com ->
click the site -> **Site configuration** (left menu) -> **Environment
variables** -> **Add a variable** -> **Add a single variable** -> type the
**Key** exactly as written here -> paste the **Value** -> tick **Contains
secret values** when the step says *secret* -> leave Scopes on "All scopes"
and the value the same for every deploy context -> **Create variable**.
A function only sees a new variable after a deploy: **Deploys -> Trigger
deploy -> Deploy site** once you have added a batch.

---

## A. Google Search Console (10 minutes, then up to an hour of waiting)

**What it is for:** the dashboard's "What people searched on Google" section.
It can only be set up for a website you own, which is lavishleaf.org.

**A1. Remove the Instagram and YouTube properties.** Search Console cannot
verify a site you do not own (you cannot put Google's code on instagram.com
or youtube.com), so those two will never work and only add clutter.
search.google.com/search-console -> the property menu at the top left -> pick
the Instagram one -> **Settings** (left menu, bottom) -> **Remove property**
-> confirm. Same for YouTube.

**A2. Verify lavishleaf.org.** In the property menu pick the one called
**lavishleaf.org** (the Domain kind; it has no https:// in front).
* If it opens to the Overview page with no warning, it is **already
  verified**: go to A3.
* If it shows **"Verify domain ownership"** with a code that starts
  `google-site-verification=`, compare it with the one your domain already
  has: `google-site-verification=9hkd2ccv_pV3G-N1Zb93lyxFkM9WlU0MM_58khWrfCc`.
  If the code shown is exactly that, just press **Verify**.
* If the code is different, add it as a new record **in both places below**
  (your domain answers from two DNS services at once, Netlify's and
  Squarespace's, so a record in only one of them works only half the time):
  1. **Netlify**: app.netlify.com -> **Domains** (in the team menu at the
     top) -> **lavishleaf.org** -> **Add new record** -> Record type **TXT**,
     Name **@** (or leave blank), Value: the whole `google-site-verification=...`
     text -> **Save**.
  2. **Squarespace**: account.squarespace.com -> **Domains** ->
     **lavishleaf.org** -> **DNS** -> **DNS Settings** -> **Add record** (under
     Custom records) -> Type **TXT**, Host **@**, Data: the same text -> **Save**.
  3. Wait 10 to 60 minutes, then press **Verify** in Search Console.

**A3. Give the dashboard's robot read access** (do this after step B, when
you have its email): Search Console -> lavishleaf.org -> **Settings** ->
**Users and permissions** -> **Add user** -> paste the service account email
-> Permission **Restricted** -> **Add**.

**Do this first (recommended 2026-10-06): stop the double DNS.** Squarespace
is where the domain is REGISTERED (you pay them for the name); Netlify is
where its records are SERVED. Both sets of nameservers are listed at the
registry today. Checked 2026-10-06: Netlify holds every record Squarespace
does, identically (website, www, Google email MX, SPF, DMARC, the Google
code, domainconnect), so removing Squarespace's four changes nothing anybody
sees. account.squarespace.com -> **Domains** -> **lavishleaf.org** -> **DNS**
-> **Domain nameservers**. If it lists custom nameservers, delete the four
`ns01.squarespacedns.com` to `ns04.squarespacedns.com` rows and keep
`dns1.p01.nsone.net` to `dns4.p01.nsone.net`; if it says it uses Squarespace
nameservers, choose
**Use custom nameservers** and enter the four nsone ones. **Save**. Up to 48
hours to settle; the domain registration and its renewal stay at
Squarespace. After that, records only ever go in Netlify.

---

## B. Google Cloud: the read-only robot ("service account") (15 minutes)

**What it is for:** the dashboard reads your Google Analytics and Search
Console numbers through it. **The project you made (Lavish Leaf Dashboard)
needs nothing special**: only the two switches in B2.

**About "read-only":** there is no read-only switch on a service account
itself. It is read-only because of what it is given: **no roles in Google
Cloud**, **Viewer** in Analytics (B6) and **Restricted** in Search Console
(A3). Viewer and Restricted can only look.

**B1.** console.cloud.google.com -> the project menu at the top left (beside
"Google Cloud") -> choose **Lavish Leaf Dashboard**. Every step below must be
done with this project showing.

**B2. Switch on the two APIs.** Menu (three lines, top left) -> **APIs &
Services** -> **Library** -> search `Google Analytics Data API` -> click it ->
**Enable**. Back to **Library** -> search `Google Search Console API` -> click
it -> **Enable**.

**B3. Check the service account has no Cloud roles.** Menu -> **IAM & Admin**
-> **IAM**. Find the row with your service account's email (it ends in
`.iam.gserviceaccount.com`). If it has a role such as Owner, Editor or
Viewer, click the **pencil** on that row -> the **bin** beside each role ->
**Save**. If the account is not listed on this page at all, that is
correct: it has no roles.

**B4. Make its key.** Menu -> **IAM & Admin** -> **Service accounts** -> click
the service account's email -> the **Keys** tab -> **Add key** -> **Create
new key** -> **JSON** -> **Create**. A small `.json` file downloads. Keep it
private, never email it, never put it in the repository.

*If Google says "Service account key creation is disabled":* that is a
security default on newer Google Workspace accounts (lavishleaf.org uses
Google Workspace). To allow it for this one project:
1. Project menu -> pick your organisation **lavishleaf.org** (not the
   project) -> Menu -> **IAM & Admin** -> **IAM** -> **Grant access** -> New
   principals: your own email -> Role: **Organization Policy Administrator**
   -> **Save**.
2. Project menu -> back to **Lavish Leaf Dashboard** -> Menu -> **IAM &
   Admin** -> **Organization policies** -> search `service account key
   creation`. Open **Disable service account key creation** -> **Manage
   policy** -> **Override parent's policy** -> **Add a rule** -> Enforcement
   **Off** -> **Done** -> **Set policy**. If a second one appears called
   "Block service account API key bindings" or a "managed" version of the
   same, do the same to it.
3. Try B4 again.

**B5. Find the four values.** Open the downloaded `.json` file in Notepad.

| Netlify key | Where the value comes from | Secret? |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the text after `"client_email": `, without the quotes; ends `.iam.gserviceaccount.com` | no |
| `GOOGLE_PRIVATE_KEY` | the text after `"private_key": `, without the outer quotes: from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----\n`. Copy it exactly as it looks, `\n` and all | **yes** |
| `GA4_PROPERTY_ID` | analytics.google.com -> **Admin** (the gear, bottom left) -> under **Property settings**, **Property** -> **Property details** -> **PROPERTY ID** at the top right. Numbers only, like `501234567`. **Not** the `G-8SKVQ74TF6` code | no |
| `GSC_SITE_URL` | type exactly `sc-domain:lavishleaf.org` | no |

Add all four in Netlify (see "How to add a Netlify variable" above).

**B6. Give the robot Viewer access in Analytics.** analytics.google.com ->
**Admin** -> under **Property settings**, **Property** -> **Property access
management** -> the blue **+** at the top right -> **Add users** -> email: the
service account email -> untick **Notify new users by email** -> Role
**Viewer** -> **Add**.

**B7.** Search Console access: step A3.

**B8.** Netlify -> **Deploys** -> **Trigger deploy** -> **Deploy site**. Then
open the dashboard and press **Refresh**: "How people found us" and "What
people searched on Google" fill in. (Search Console keeps about three days of
delay, so its numbers start a few days back.)

---

## C. Google Analytics: three custom dimensions (5 minutes)

**What it is for:** the website already sends which product was clicked,
what was typed into the store search, and which social button was clicked.
Analytics throws those details away unless it is told to keep them. Each one
is a "custom dimension".

**Where it is:** analytics.google.com -> **Admin** (the gear at the bottom of
the left-hand strip) -> in the **Property settings** column find **Data
display** -> **Custom definitions**. (If you see no "Data display" heading,
look for **Custom definitions** directly in the Property column; Google moves
it between layouts. You need the Editor or Administrator role on the
property, which the owner has.)

Then, three times: the **Custom dimensions** tab -> **Create custom
dimension** -> fill in -> **Save**:

| Dimension name | Scope | Description | Event parameter |
|---|---|---|---|
| `product` | Event | Which product was clicked | `product` |
| `search_term` | Event | What was searched in the store | `search_term` |
| `network` | Event | Which social network was clicked | `network` |

The Event parameter box may offer a list; if the name is not in it yet, type
it. They only collect from the day they are made, so make them now even
though the store is quiet.

---

## D. Clarity numbers (2 minutes)

clarity.microsoft.com -> the **Lavish Leaf** project -> **Settings** (gear)
-> **Data Export** -> **Generate new API token** -> name it `dashboard` ->
copy the token -> Netlify key `CLARITY_API_TOKEN` (**secret**).

---

## E. Netlify's own token: form counts and past newsletter sign-ups (2 minutes)

app.netlify.com -> your picture (top right) -> **User settings** ->
**Applications** -> **Personal access tokens** -> **New access token** ->
description `dashboard`, expiration: the longest offered -> **Generate
token** -> copy it (it is shown once) -> Netlify key `NETLIFY_API_TOKEN`
(**secret**). After the next deploy, the dashboard's **Import past sign-ups**
button works.

---

## F. Email: Amazon SES (about 45 minutes, plus up to a day for Amazon's review)

**Chosen 2026-10-07 instead of Brevo** (the owner: Brevo's 300 a day was too
few). Amazon SES "a la carte" is $0.10 per 1,000 emails. New AWS accounts get
$100 of credit at sign-up and up to $100 more for trying other AWS services;
SES's own 3,000-free-emails offer closed to new accounts in July 2026. Your
subscriber list is ours (Netlify Blobs), so there is no contact limit
anywhere. The website code is ready: it sends through SES as soon as the keys
below are in Netlify.

**F1. The AWS account.** aws.amazon.com -> **Create an AWS account** -> your
email, account name **Lavish Leaf Inc** -> verify the email -> choose **Paid
plan** (the Free plan closes the account after 6 months; the credits apply on
the Paid plan too) -> card, phone check, **Basic support (free)**. Sign in to
the console as the root user (the email you signed up with).

**F2. Pick one region and keep it.** Top right of the console, the region
menu -> **US East (N. Virginia) us-east-1**. SES settings are per region; the
website uses us-east-1 unless you set `SES_REGION`.

**F3. Verify the domain.** Search the console for **Amazon Simple Email
Service** -> left menu **Identities** -> **Create identity** -> **Domain** ->
`lavishleaf.org` -> leave "Use a custom MAIL FROM domain" off -> **Advanced
DKIM settings**: **Easy DKIM**, **RSA_2048_BIT**, **Publish DNS records to
Route53** OFF -> **Create identity**. SES shows **three CNAME records**. Add
each in Netlify (Domains -> lavishleaf.org -> **Add new record**): Record
type **CNAME**, Name: the part before `.lavishleaf.org` (it looks like
`abc123..._domainkey`), Value: the `...dkim.amazonses.com` text. Wait 10
minutes to a few hours; the identity's **DKIM configuration** turns
**Successful** and its status **Verified**. Your DMARC record already exists;
leave it.

**F4. A sending key for the website** (a separate login with one
permission, never your main one). Console search **IAM** -> **Users** ->
**Create user** -> name `lavishleaf-website-mail`, do NOT give console
access -> **Next** -> **Attach policies directly** -> **Create policy**
(opens a tab) -> **JSON** -> replace everything with:

    { "Version": "2012-10-17",
      "Statement": [ { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*" } ] }

-> **Next** -> name `lavishleaf-send-email` -> **Create policy**. Back in the
first tab press the refresh arrow, tick **lavishleaf-send-email** -> **Next**
-> **Create user**. Open the user -> **Security credentials** -> **Create
access key** -> **Application running outside AWS** -> **Next** -> **Create
access key**. Copy the **Access key** and the **Secret access key** now (the
secret is shown once; **Download .csv file** keeps a copy).

**F5. Netlify variables** (then Trigger deploy):

| Key | Value | Secret? |
|---|---|---|
| `SES_ACCESS_KEY_ID` | the Access key from F4 (starts `AKIA`) | no |
| `SES_SECRET_ACCESS_KEY` | the Secret access key from F4 | **yes** |
| `SES_REGION` | `us-east-1` | no |
| `MAIL_FROM` | `support@lavishleaf.org` | no |
| `OWNER_EMAIL` | where "new order" alerts go | no |
| `MAIL_POSTAL_ADDRESS` | the PO box (marketing email is refused without it) | no |
| `NEWSLETTER_SECRET` | 40 or more random letters and numbers; never change it later | **yes** |
| `MAIL_DAILY_LIMIT` | leave out until F7; then the daily quota SES shows | no |

If `BREVO_API_KEY` was ever added, delete it.

**F6. Test while still in the "sandbox".** A new SES account can only send to
addresses it has verified, 200 a day. SES -> **Identities** -> **Create
identity** -> **Email address** -> your own address -> open the email Amazon
sends and click the link. Then the dashboard -> **Send me the welcome
email**: it should arrive.

**F7. Ask Amazon for production access** (to email anyone). SES -> **Account
dashboard** -> the box "Your Amazon SES account is in the sandbox" -> **View
Get set up page** -> **Request production access**. Mail type
**Transactional**; Website URL `https://lavishleaf.org`; additional contacts:
your email; language English; tick the acknowledgement; if it asks how you
send, use: *"Lavish Leaf is an Oklahoma company (organic farm, compost and
recycling pick-up, rec sports leagues, an online store). We send order
confirmations and receipts, replies to our contact form, a welcome email to
people who sign up for our newsletter on lavishleaf.org, and a monthly
newsletter to those subscribers only. Every marketing email has a one-click
unsubscribe link and our postal address; unsubscribes take effect at once and
we never buy or rent lists. We expect under 1,000 emails a month to start."*
-> **Submit request**. Amazon answers within about 24 hours. When approved,
the Account dashboard shows your daily quota (often 50,000): put that number
in `MAIL_DAILY_LIMIT` and deploy.

**F8.** Dashboard -> **Import past sign-ups** (moves the old newsletter form
sign-ups onto the list).

## G. The store: Tier 0, what costs nothing to start

The Store page now shows only Tier 0. The dashboard's **Store products**
section lists every tier and, once you load your Bangalla file there, your
cost, margin and stock beside each Bangalla product.

1. **Load the Bangalla file in the dashboard.** Dashboard -> **Store
   products** (button at the top) -> **Load the Bangalla file** -> choose
   `Bangalla Product Data csv.csv` (the CSV, not the Excel). It stays private.
2. ~~EIN~~ **Done** (the owner has it).
3. **The resale certificate**: the SST form, filled in field by field in
   **G1** below. One per supplier; Arbico needs it with the application.
4. **Bangalla** (bangalla.com, sign in):
   * Confirm the account is the **free** wholesale level (Gold is paid and
     not needed).
   * ~~Dropship Master~~ **Done**: the product data file is the Dropship
     Master (the owner, 2026-10-06).
   * ~~Returns and shipping~~ **Answered** (the owner, 2026-10-07): shipping
     is FedEx/USPS rates by weight, location and speed; there is no returns
     policy, each return is asked for and approved or not. So a dropshipped
     item can be returned only if Bangalla approves it.
   * Fill a cart with one bar of soap (0.5 lb), then a 3 pack (about 1 lb),
     then a box of sponges (about 2 lb), with a **far-away address** (any
     Seattle ZIP, e.g. 98101) and read the shipping charge at checkout
     **without paying**. Send Claude the three numbers: the store's bands
     ($11.95 / $17.95 / $27.95) were set from USPS's prices and must be
     checked against Bangalla's.
   * Still to ask Bangalla by email: whether "Third Party Restriction" brands
     (A La Maison, Desert Essence) may be sold on your own website, and
     whether you may use their product photos.
5. **Arbico distributor application**, field by field in **G2** below.
6. **Fertilizer licence** (you said 2026-10-07 it is needed): field by field
   in **G3** below. $50 a location, expires 31 December every year.
7. **Pick the Tier 0 products** you want, in the dashboard. Sort by margin,
   and decide your selling price: at Bangalla's list price your margin is
   about 30%, before PayPal's fee. Tell Claude the products and prices.

---


### G1. The resale certificate for Arbico (and any other supplier)

Use the **Streamlined Sales and Use Tax Agreement Certificate of Exemption**
(the SST form). Oklahoma is a Streamlined Sales Tax member state, and the
form itself says resale purchases **including drop shipments** are reason G.
Fill in one per supplier; it is given to the supplier, never sent to any tax
office. Keep a copy.

* **Top of the form:** leave "single purchase" UNticked, so it covers every
  purchase (a blanket certificate).
* **Section 1, Purchaser:** Lavish Leaf Inc, your business mailing address
  (the one on your Oklahoma sales tax permit), city, state OK, ZIP.
* **Section 2, Seller:** **ARBICO Organics, P.O. Box 8910, Tucson, AZ
  85738** (the address on their application).
* **Section 3, Type of business:** **10, Retail trade.**
* **Section 4, Reason for exemption:** **G, Resale.**
* **Section 5, Identification:** state **OK**, ID number: your **Oklahoma
  sales tax permit number** (STS-...), reason letter **G**. If the form has a
  separate FEIN line, add your EIN there too.
* **Section 6:** sign, print your name, title **President** (or Owner), and
  date.

Arbico asks for it with the distributor application: attach it to the same
email.

---

### G2. The Arbico distributor application

From arbico-organics.com/category/distributor-program-information ->
**Distributor Application (PDF)**. Fill it in, then email it with its
attachments to **distributors@arbico.com**.

* **Business name:** Lavish Leaf Inc. **Contact:** Kevin Wright, President.
  **Email:** kwright@lavishleaf.org. **Website:** lavishleaf.org.
* **How you sell:** online retail store on your own website (Arbico does not
  allow its products on Amazon, Walmart or other marketplaces: you do not
  sell there).
* **Are you tax exempt (a 501(c)(3))?** **No.** Lavish Leaf Inc is a
  for-profit corporation. Any 501(c)(3) document field: **N/A**.
* **State:** OK. **Tax ID / resale number:** your **Oklahoma sales tax
  permit number**. Add a line: "Purchases are for resale; SST Certificate of
  Exemption attached."
* **Attachments:**
  1. **Resale license form:** the SST certificate from G1.
  2. **W-9:** irs.gov/forms-pubs/about-form-w-9 -> Lavish Leaf Inc, tick
     **C corporation** (S corporation only if you filed IRS Form 2553), your
     **EIN**, sign and date.
  3. **Business license:** your Oklahoma sales tax permit (a PDF or photo
     from OkTAP).
* **Payment:** a credit card (charged when each order ships).
* **Billing address:** your business mailing address. **Shipping address:**
  the same (orders are dropshipped to customers blind, with no Arbico
  paperwork in the box).
* **Three business references:** Bangalla (your wholesale account), your
  bank, and one more business you buy from on an account (the league's field
  or equipment supplier, for example).
* **In the email, ask:** your distributor discount; which products cannot
  ship to Oklahoma; and what they charge to ship a dropshipped order.

### G3. The Oklahoma fertilizer licence

Form: https://ag.ok.gov/wp-content/uploads/2025/06/Fertilizer-License-Application.pdf
(Consumer Protection Services, Form 41436A). Questions: Joshua Maples,
405-522-4057, joshua.maples@ag.ok.gov.

* **Products:** tick **BAGGED FERTILIZER**. If any Arbico line is a liquid,
  tick **LIQUID FERTILIZER** too.
* **Categories:** none of the six fits a shop that only resells registered
  products (Registrant is the maker; Broker, Custom Applicator and Custom
  Blend do not apply). Leave them blank and write beside them: "Retail sale
  of registered packaged fertilizer, online, shipped directly from the
  supplier." If ODAFF wants a box ticked, they will say which.
* **Business name:** Lavish Leaf Inc. **Phone:** your business number.
* **Location address and county:** where the business is (the farm),
  county **Pittsburg**.
* **Mailing address:** your PO box (or the farm until you have one).
* **Email:** kwright@lavishleaf.org. **Contact:** Kevin Wright.
* **Sign and date.** A check for **$50.00** payable to **Oklahoma Department
  of Agriculture, Food and Forestry**, mailed with the form to **PO Box
  528804, Oklahoma City, OK 73152-8804**.
* **Timing:** every licence ends **31 December**. Applying now buys a
  licence for only the rest of 2026; ask Joshua Maples whether to apply now
  or for 2027 in December. A renewal after 31 January costs a $50 penalty.

Related licences for later (docs/STORE-PLAN.md): nursery dealer **$38 a
location** before selling plants or seedlings; **$100 a product** to register
the farm's own bagged compost.

---

## H. Payments: PayPal (deferred by you; when you are ready)

Steps 1 to 6 of docs/STORE-STEPS.md, unchanged. In short: developer.paypal.com
-> Sandbox -> **Apps & Credentials** -> **Create App** (Merchant) -> copy the
Client ID and Secret -> Netlify keys `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`
(**secret**), `PAYPAL_ENV` = `sandbox` -> deploy -> tell Claude, who runs a
test order end to end. Then the same with a **Live** app and
`PAYPAL_ENV` = `live`.

---

## I. Everything else on the list

| | Step | Notes |
|---|---|---|
| 1 | ~~Sales tax rates~~ **Built 2026-10-07**: 6% (OK 4.5% + Pittsburg County 1.5%) on registrations, services and goods shipped to Oklahoma; none on goods shipped out of state | **Ask your CPA two things** (docs/STORE-PLAN.md, Sales tax): (a) the Tax Commission says an in-state delivery is taxed at the BUYER's local rate, not ours; (b) whether shipping charges are taxable. If (a) is yes, Claude switches to rates by address. When you make the PayPal subscription plans, leave their tax at 0%: the site adds the 6% itself |
| 2 | ~~Founder card~~ **Done 2026-10-07** | Photo, name and story on the Company page; change the wording any time |
| 3 | **Home page logos** for Rec Sports, Gaming and Lawn & Garden | Send the images |
| 4 | ~~Confirm prices~~ **Done 2026-10-06**: compost and recycling both $20 a month | |
| 5 | **A photo for Recycling Pick-Up** | Landscape, 800 px wide or more |
| 6 | **First YouTube video** | Then Claude swaps the Social page's Subscribe card for the feed |
| 7 | **Pirate Ship** account (pirateship.com, free) | Labels for any order you post yourself |
| 8 | **Clarity masking**: Settings -> Masking -> **Strict** | Only if you want page text hidden in recordings too |
| 9 | **careers@ test** (sent 2026-10-07 from kevowright5@gmail.com, subject "Test: careers@ delivery check 2026-10-07") | Look in kwright@lavishleaf.org. It did not bounce. If it is not there: admin.google.com -> if careers@ is a **Group** (Directory -> Groups): Access settings, "Who can post" = **Anyone on the web**, and you a member with delivery "Each email"; if it is an **alias** (Directory -> Users -> you -> Alternate email addresses): check it is listed there |
| 10 | **Read docs/STORE-PLAN.md** and pick the Phase 0 lanes | Claude builds whichever you choose (printables page, route pre-orders, merch, Green Swaps page) |

When a step is done, tell Claude which one; the dashboard section it
switches on gets checked against your real account.
