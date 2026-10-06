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

**Optional, later:** to stop the double DNS for good, Squarespace ->
Domains -> lavishleaf.org -> **DNS** -> **Nameservers** -> **Use custom
nameservers** and keep only `dns1.p01.nsone.net`, `dns2.p01.nsone.net`,
`dns3.p01.nsone.net`, `dns4.p01.nsone.net` (Netlify's). Checked 2026-10-06:
Netlify already holds every record Squarespace does (the website, the Google
email MX records, SPF, DMARC, the verification code), so nothing would break.
After that, records only ever go in Netlify.

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

## F. Email: Brevo (30 minutes, needs the PO box)

**What it is for:** the welcome email, contact-form replies, newsletters,
order confirmations, your "new order" alert. Until it is set, sign-ups are
saved and nobody is emailed.

1. **A mailing address for the email footer** (the law requires one in
   marketing email; it never goes on the website): a USPS PO box
   (usps.com -> PO Boxes) or a UPS Store mailbox.
2. **brevo.com** -> Sign up free (the business is Lavish Leaf Inc).
3. Brevo -> your name (top right) -> **Senders, domains & dedicated IPs** ->
   **Domains** -> **Add a domain** -> `lavishleaf.org` -> choose to add the
   records yourself. Brevo shows 3 or 4 records (a `brevo-code` TXT, two DKIM
   records, and DMARC). Add each **in both Netlify and Squarespace**, exactly
   as in A2 (type, name/host, value as Brevo shows them). **DMARC already
   exists** (`v=DMARC1; p=none`): do not add a second one; if Brevo asks for a
   different value, edit the existing `_dmarc` record in both places
   instead. Back in Brevo -> **Authenticate this email domain**.
4. Brevo -> **SMTP & API** -> **API keys** -> **Generate a new API key** ->
   name `website` -> copy it.
5. Netlify keys:

| Key | Value | Secret? |
|---|---|---|
| `BREVO_API_KEY` | the key from 4 | **yes** |
| `MAIL_FROM` | `support@lavishleaf.org` | no |
| `MAIL_POSTAL_ADDRESS` | the PO box, e.g. `PO Box 123, Stigler, OK 74462` | no |
| `OWNER_EMAIL` | where "new order" alerts should go | no |
| `NEWSLETTER_SECRET` | 40 or more random letters and numbers (make it with a password generator). **Never change it later**: it signs the unsubscribe links | **yes** |

6. Trigger a deploy -> dashboard -> **Send me the welcome email** (check it
   arrives and is not in spam) -> **Import past sign-ups**.

*While you are in the DNS records:* your SPF record reads
`v=spf1 include:squarespace-mail.com ~all`, but your email is Google
Workspace. Edit it (in both places) to
`v=spf1 include:_spf.google.com include:squarespace-mail.com ~all`, so mail
you send from Gmail as support@ is less likely to land in spam. Keep it to
one SPF record.

---

## G. The store: Tier 0, what costs nothing to start

The Store page now shows only Tier 0. The dashboard's **Store products**
section lists every tier and, once you load your Bangalla file there, your
cost, margin and stock beside each Bangalla product.

1. **Load the Bangalla file in the dashboard.** Dashboard -> **Store
   products** (button at the top) -> **Load the Bangalla file** -> choose
   `Bangalla Product Data csv.csv` (the CSV, not the Excel). It stays private.
2. **EIN**: irs.gov -> search "Apply for an EIN online" -> **Apply Online
   Now** -> entity type **Corporation** -> follow the questions (about 10
   minutes) -> save the confirmation letter (CP 575) as a PDF. Free.
3. **Oklahoma resale certificate**: Oklahoma's resale form is filled in by
   you and given to each supplier, using your sales tax permit number. Find
   the current form on oklahoma.gov/tax (search "resale certificate" or
   "sales tax exemption") or ask through OkTAP; fill it in once per supplier.
4. **Bangalla** (bangalla.com, sign in):
   * Confirm the account is the **free** wholesale level (Gold is paid and
     not needed).
   * Account -> **Data Downloads** -> download the **Dropship Master**. Tell
     Claude, and attach it: any Tier 0 row not on it comes off.
   * Fill a cart with one bar of soap (0.5 lb), then a 3 pack (about 1 lb),
     then a box of sponges (about 2 lb), with an Oklahoma delivery address,
     and read the shipping charge at checkout **without paying**. Send Claude
     the three numbers.
   * Email Bangalla asking: their returns policy; whether "Third Party
     Restriction" brands (A La Maison, Desert Essence) may be sold on your
     own website; whether you may use their product photos.
5. **Arbico**: arbico-organics.com/category/distributor-program-information
   -> download the **Distributor Application (PDF)** -> fill it in -> email it
   to distributors@arbico.com, asking in the same email: your discount,
   which products cannot ship to Oklahoma, and what they charge to ship a
   dropshipped order.
6. **ODAFF** (Oklahoma Department of Agriculture: ag.ok.gov -> **Plant
   Industry**, the telephone number on that page): ask "Does a web store that dropships already-registered
   bagged organic fertilizer to Oklahoma customers need the $50 fertilizer
   license?" Note the answer and the name of who said it.
7. **Pick the Tier 0 products** you want, in the dashboard. Sort by margin,
   and decide your selling price: at Bangalla's list price your margin is
   about 30%, before PayPal's fee. Tell Claude the products and prices.

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
| 1 | **CPA about Oklahoma sales tax** on league fees, compost and recycling pick-up, and shipped goods | The most expensive thing to get wrong; a ten-minute question |
| 2 | **Founder card** on the Company page | Send Claude your name, a square photo (600 px or more) and a few sentences |
| 3 | **Home page logos** for Rec Sports, Gaming and Lawn & Garden | Send the images |
| 4 | **Confirm prices**: recycling $15 a month (a proposal), compost $20 | One line to Claude |
| 5 | **A photo for Recycling Pick-Up** | Landscape, 800 px wide or more |
| 6 | **First YouTube video** | Then Claude swaps the Social page's Subscribe card for the feed |
| 7 | **Pirate Ship** account (pirateship.com, free) | Labels for any order you post yourself |
| 8 | **Clarity masking**: Settings -> Masking -> **Strict** | Only if you want page text hidden in recordings too |

When a step is done, tell Claude which one; the dashboard section it
switches on gets checked against your real account.
