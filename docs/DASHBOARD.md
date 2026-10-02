# The owner's dashboard, and connecting each source

Built 2026-10-02 at the owner's ask: *"an analytic dashboard that only appears
when I sign in ... connect as much analytics to it that we can ... user
friendly and easily understandable."*

**Where:** lavishleaf.org/dashboard.html (also "Owner dashboard" in the store's
account window, for an account with the `admin` role). Not linked anywhere
public, not indexed, and its numbers come only from
`netlify/functions/dashboard-data.mjs`, which refuses anybody who is not the
owner. The page itself has no Google Analytics tag, so your own visits to it
are not counted.

**What it shows, top to bottom:** up to four plain-English sentences on what
stands out; tiles (visitors, pages viewed, time on site, sign-up clicks,
newsletter, orders, social followers, each compared with the period before);
then How many people came (a daily line; hover for any day), How people found
us, What people looked at and clicked, What people want from the store, What
people searched on Google, Facebook and Instagram (recent posts ranked by
likes, comments and shares), How people use the pages (Clarity), and
Newsletter, messages and orders (with the newsletter sender). 7, 28 or 90
days; numbers are kept for 15 minutes, Refresh fetches new ones.

**Already working with no setup:** the tracking itself. Google Analytics
(`G-8SKVQ74TF6`) is now on all 14 pages and Clarity (`yrei9vub09`) on all but
the shared-playlist page; `analytics.js` sends the click events listed at its
top. The Facebook and Instagram section uses the keys the Social page already
has. Newsletter and orders read our own records.

Each other section says "Not connected yet" until its step below is done.

---

## Step 1. Sign in as the owner (5 minutes)

1. Netlify -> the site -> **Site configuration -> Identity -> Enable Identity**
   (also the store's customer accounts, docs/ACCOUNTS.md).
2. Go to lavishleaf.org/store.html, click the person icon, **Sign up** with your
   email, confirm the email.
3. Netlify -> the site -> **Identity** tab -> click your email -> **Edit
   settings** -> Roles: type `admin` -> Save.
4. Open lavishleaf.org/dashboard.html and sign in.

(Instead of the role, `ADMIN_EMAILS` = your email in Netlify's environment
variables also works.)

## Step 2. Connect Google (Analytics + Search Console), about 20 minutes

One "service account" reads both. It can only read.

**A. Search Console first (it is free and needs proving you own the site):**
1. search.google.com/search-console -> **Add property** -> **Domain** ->
   `lavishleaf.org`.
2. Google shows a TXT record. Add it where the domain's DNS lives (Netlify ->
   **Domains** -> lavishleaf.org -> **DNS records** -> Add record -> TXT, name
   `@`, the value Google gave). Back in Search Console press **Verify** (it can
   take an hour).
3. Sitemaps: optional; Search Console finds the pages from links.

**B. The service account:**
1. console.cloud.google.com -> project picker -> **New project** "Lavish Leaf
   dashboard".
2. **APIs & Services -> Library**: enable **Google Analytics Data API** and
   **Google Search Console API**.
3. **IAM & Admin -> Service accounts -> Create service account**, name
   `dashboard`, no roles needed -> Done.
4. Click it -> **Keys -> Add key -> Create new key -> JSON**. A file downloads.
   Keep it private; never put it in this repository.
5. Copy the service account's email (ends `iam.gserviceaccount.com`).

**C. Give it access:**
1. analytics.google.com -> **Admin** (gear) -> **Property access management**
   -> **+ Add users** -> paste that email -> role **Viewer** -> Add.
2. Same Admin page -> **Property details**: copy the **Property ID** (numbers
   only).
3. Search Console -> **Settings -> Users and permissions -> Add user** -> the
   same email -> **Restricted** -> Add.

**D. Put the keys in Netlify** (Site configuration -> Environment variables ->
Add a variable; tick "Contains secret values" for the key):

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the service account email |
| `GOOGLE_PRIVATE_KEY` | from the JSON file, the whole `"private_key"` value, from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----\n` (the `\n` text is fine) |
| `GA4_PROPERTY_ID` | the property number |
| `GSC_SITE_URL` | `sc-domain:lavishleaf.org` |

Then **Deploys -> Trigger deploy** so the functions see them.

**E. Two custom dimensions (so "Products people clicked" and "Searched in the
store" fill in):** analytics.google.com -> Admin -> **Custom definitions ->
Create custom dimension**, three times, scope **Event**:

| Dimension name | Event parameter |
|---|---|
| product | `product` |
| search_term | `search_term` |
| network | `network` |

They collect from the day they are created.

## Step 3. Clarity numbers (2 minutes)

clarity.microsoft.com -> the Lavish Leaf project -> **Settings -> Data Export ->
Generate new API token** -> copy it -> Netlify variable `CLARITY_API_TOKEN`
(secret). Clarity allows 10 reads a day, so the dashboard keeps its numbers
for 3 hours. Heatmaps and recordings stay in Clarity itself (the buttons on
the dashboard open them).

## Step 4. Form counts and importing past newsletter sign-ups (2 minutes)

Netlify -> your avatar -> **User settings -> Applications -> Personal access
tokens -> New access token** ("dashboard", no expiry or a long one) -> Netlify
variable `NETLIFY_API_TOKEN` (secret). The dashboard then counts every form,
and its **Import past sign-ups** button moves everyone who already joined
through the newsletter form onto the new list.

## Step 5. Looker Studio (optional, 10 minutes)

The dashboard already shows the Google numbers. Looker Studio is Google's own
free report builder for digging further or sharing a report:
lookerstudio.google.com -> **Blank report** -> **Google Analytics** -> pick the
Lavish Leaf property -> Add. Then **Add data -> Search Console** -> the
property -> **Site impression**. Add a time series (Date x Active users), a
table (Session default channel group x Sessions) and a table (Query x Clicks).
Or start from Google's "GA4 Report" template in the Template gallery and
switch its data source to yours.

## Step 6. Meta Business Suite

Nothing to connect: business.facebook.com -> **Insights** shows reach (how
many people saw each post), which Meta does not give the dashboard. The
dashboard ranks your posts by likes, comments and shares.

## Every variable the dashboard and email use

| Variable | For | Required? |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GA4_PROPERTY_ID`, `GSC_SITE_URL` | Google sections | for those sections |
| `CLARITY_API_TOKEN` | Clarity section | optional |
| `NETLIFY_API_TOKEN` | form counts, import | optional |
| `FB_PAGE_ID`, `FB_PAGE_TOKEN` | social section (already set) | already there |
| `ADMIN_EMAILS` | who may open the dashboard, instead of the role | optional |
| Email ones | see docs/EMAIL.md | |

To preview the page with made-up numbers on your own computer:
`python3 -m http.server 8765` in the repository, then
http://localhost:8765/dashboard.html?preview
