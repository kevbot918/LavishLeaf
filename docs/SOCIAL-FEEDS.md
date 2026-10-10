# The Social page's own Instagram and Facebook feeds

Written 2026-10-01. The owner: Behold's free tier shows only six Instagram
posts, and Facebook's Page plugin draws every post in one long column; he
wants many more posts, each its own card, full width.

## How it works

* `netlify/functions/social-feed.mjs` returns our latest **21 Instagram** and
  **21 Facebook** posts as cards, read from Meta's APIs and cached in Netlify
  Blobs (store `social`) for 30 minutes.
* `netlify/functions/social-refresh.mjs` runs **once a day** on Netlify's
  scheduler: it refreshes the Instagram token (it would expire after 60 days)
  and re-reads the feed.
* `social-feed.js` on `social.html` draws the cards. A network with no keys
  yet keeps its old widget (Behold for Instagram, the Page plugin for
  Facebook), so the page never goes blank.
* Logic and tests: `netlify/lib/social.mjs`, `tools/test/social.test.mjs`.

It is free: Meta charges nothing for reading your own posts, and Netlify's
free tier covers the function calls and the small cache.

## What the owner sets up, screen by screen

Nobody else can do these steps: every one needs your own Facebook and
Instagram log-ins (and Meta texts a code to your phone). Never send those
passwords to anyone, Claude included. One Facebook Page key (Part D) now
covers BOTH Instagram and Facebook.

### Part A. Is the Instagram account a Business or Creator account? (2 minutes, on your phone)

1. Open the Instagram app and go to the **lavish_leaf_inc** profile (tap your
   picture, bottom right).
2. Tap the **three lines** (top right). This opens **Settings and activity**.
3. Scroll to the heading **For professionals** and tap **Account type and
   tools**.
4. Read the screen:
   * If you see **Switch to professional account**: it is a PERSONAL account.
     Tap it, pick a category (for example "Agriculture" or "Community
     Organization"... any is fine), choose **Business**, and finish. Your
     posts and followers stay exactly as they are.
   * If you see **Switch account type** (offering Personal or Creator, or
     Personal or Business): it is ALREADY professional. Nothing to do.
   A quick second check: a professional profile shows a **Professional
   dashboard** bar under the bio.
5. The account must be **public** (Settings and activity, Account privacy:
   Private account OFF).

### Part B. Become a Meta developer (5 minutes, once, on a computer)

"Create App" does not appear until you have registered, which is why the site
looked like nothing but documentation.

1. In the same browser, log in to **facebook.com** as yourself (the person who
   manages the Lavish Leaf page).
2. Go to **https://developers.facebook.com/async/registration** (this is the
   registration page directly; the same thing is the **Get Started** button
   at the top right of developers.facebook.com).
3. Follow the screens: accept the Platform Terms, **verify your phone number**
   (Meta texts a code) and your email, and when asked what you do, choose
   **Developer** (or anything; it does not matter).
4. When it finishes, the top right of developers.facebook.com shows **My
   Apps**. That is how you know it worked.

### Part C. Create the app (5 minutes)

1. developers.facebook.com, **My Apps** (top right), green **Create App**.
2. App name `Lavish Leaf Website`, your email, **Next**.
3. Use cases: click **Content management** on the left, tick **Manage
   everything on your Page**, and also tick **Manage messaging & content on
   Instagram**. **Next**.
4. **I don't want to connect a business portfolio yet**, **Next**, **Next**,
   **Go to dashboard**.
(If you already made the app on 2026-10-01, use that one. In its left menu,
**Use cases**, check both use cases are listed; if one is missing, **Add use
cases** and tick it.)

### Part D. Link Instagram to the Facebook Page, and get ONE key for both (10 minutes)

This is the route to use (2026-10-02). Meta's "Add account" and "Instagram
Tester" forms refused lavish_leaf_inc with "Form can't be saved"; this route
never uses them, and its key does not expire.

**D1. Link the Instagram account to the Lavish Leaf Facebook Page** (skip if
already linked):
1. On facebook.com, open the **Lavish Leaf** Page and switch into it (the
   **Switch now** / **Switch profile** button if Facebook asks).
2. **Settings** (left menu, or under your Page picture: Settings & privacy,
   Settings), then **Linked accounts** in the left list.
3. **Instagram**, then **Connect account**, log in as **lavish_leaf_inc**,
   and confirm.

**D1b. Add the permissions to the app first.** The Explorer's "Add a
Permission" list only offers permissions the app has been given inside its use
cases (2026-10-02: pages_read_engagement and instagram_basic were missing):
1. In the app dashboard's left menu, **Use cases**.
2. Beside **Manage everything on your Page**, **Customize**. In the
   **Permissions** list, click **Add** beside `pages_read_engagement`,
   `pages_read_user_content` and `pages_show_list` (and
   `business_management` if listed). **`pages_read_user_content` is the
   one the dashboard's error names** (2026-10-10: "(#10) This endpoint
   requires the 'pages_read_user_content' permission"): without it Facebook
   refuses to list the Page's posts with their likes and comments.
3. Back to **Use cases**. Beside **Manage messaging & content on
   Instagram**, **Customize**, then choose **API setup with Facebook login**
   (the OTHER one, not "with Instagram login"). In its permissions list click
   **Add** beside `instagram_basic`.
4. Each added permission shows "Ready for testing". That is enough: no App
   Review is needed for our own Page and account.
5. Reload the Graph API Explorer; the permissions are now in the list.

**D2. Get the Page key:**
1. Open **https://developers.facebook.com/tools/explorer/**.
2. Right side: **Meta App** = `Lavish Leaf Website`; **User or Page** =
   **User Token**.
3. **Permissions**: with **Add a Permission**, add all five:
   `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`,
   `instagram_basic`, `business_management`. (Remove any others the box
   starts with; they are not needed.)
4. Click **Generate Access Token**. In Facebook's window choose **Opt in to
   all current and future Pages** (or tick **Lavish Leaf**), and also tick
   **lavish_leaf_inc** when it lists Instagram accounts. Save.
5. Copy the token in the **Access Token** box at the top.
6. Open **https://developers.facebook.com/tools/debug/accesstoken/**, paste
   it, **Debug**, then **Extend Access Token** at the bottom; copy the NEW
   token.
7. Back in the Explorer, paste the new token in the **Access Token** box,
   type `me/accounts?fields=name,id,access_token` in the query box,
   **Submit**. Beside `"name": "Lavish Leaf"`:
   * `"id"` (digits) is **FB_PAGE_ID**
   * `"access_token"` is **FB_PAGE_TOKEN** (it does not expire)
8. Check Instagram is reachable: paste FB_PAGE_TOKEN into the **Access
   Token** box, type `FB_PAGE_ID?fields=instagram_business_account` (with the
   real digits), **Submit**. An answer containing
   `"instagram_business_account": { "id": "1784..." }` means the website can
   read your Instagram. If that part is missing, D1 is not done yet.

### Instagram not showing (2026-10-10)

The dashboard says "Facebook did not return an Instagram account for this
Page" when Facebook answers the Page question without an Instagram account.
There are two causes, and one check tells them apart.

**The check (2 minutes).** Graph API Explorer -> paste the FB_PAGE_TOKEN value
from Netlify in the **Access Token** box -> in the query box type
`FB_PAGE_ID?fields=instagram_business_account,connected_instagram_account`
(the real Page digits in place of FB_PAGE_ID) -> **Submit**.
* An answer with `"instagram_business_account": { "id": "1784..." }`: the
  link is fine; Refresh the dashboard (it keeps a copy for 15 minutes).
* An answer with only `"id"`: go through 1 to 3 below, in order.

**1. Instagram must be a professional account.** Instagram app -> your
profile -> the three lines (top right) -> **Settings and activity** ->
**Account type and tools**. If it offers **Switch to professional account**,
do it and choose **Business**. (If it offers "Switch to personal account",
it is already professional: leave it.)

**2. Link it to the Lavish Leaf Page.** business.facebook.com (Meta Business
Suite) -> the gear (**Settings**) bottom left -> **Business assets** (or
**Accounts -> Instagram accounts**) -> **Add** / **Connect Instagram
account** -> log in as **lavish_leaf_inc** -> make sure the **Lavish Leaf**
Page is ticked for it. Another way to the same link: on facebook.com switch
into the Page -> **Settings** -> **Linked accounts** -> **Instagram** ->
**Connect account**.

**3. Give the key an Instagram permission, then make a new key.**
* App dashboard (developers.facebook.com -> My Apps -> Lavish Leaf Website)
  -> **Use cases** -> beside **Manage messaging & content on Instagram** ->
  **Customize**. It must say **API setup with Facebook login**. In its
  permissions list click **Add** beside `instagram_basic`. If that use case
  is not in the list at all, **Add use cases** (top) and add it first.
* In the Graph API Explorer, `instagram_basic` appears in **Add a
  Permission** only after that. Type part of it and **click it in the drop-down
  list** (Enter does not select it). `instagram_manage_comments` is not
  needed; it does no harm.
* Then D2 steps 4 to 7 again (Generate Access Token: tick the Page AND
  lavish_leaf_inc in Facebook's window; Extend; me/accounts; copy the Page
  access_token), and replace FB_PAGE_TOKEN in Netlify with the new value, then
  **Deploys -> Trigger deploy**.

Run the check again: once it shows the Instagram id, the dashboard and the
Social page both show Instagram.

### The other Instagram route (only if you ever want it)

"API setup with Instagram login" (Use cases, Customize, Generate access
tokens, Add account) gives an `IG_ACCESS_TOKEN` instead. It is the route that
refused the account on 2026-10-02. If it is set, the site uses it and keeps
it refreshed; if not, the site reads Instagram through the Page key above.

### Part E. Put the keys into Netlify (3 minutes)

1. **https://app.netlify.com**, open the lavishleaf.org site.
2. **Site configuration** (left menu), then **Environment variables**.
3. **Add a variable**, **Add a single variable**:
   * Key `FB_PAGE_ID`, value: the digits. Click **Create variable**.
   * Key `FB_PAGE_TOKEN`, value: the Page key. Tick **Contains secret
     values**. Click **Create variable**.
   (Those two are all the site needs for BOTH Instagram and Facebook.)
4. **Deploys** (left menu), **Trigger deploy**, **Deploy site**.
5. Open lavishleaf.org/social.html after a minute: the posts appear as cards.
   If they do not, tell Claude which step you reached; the function's log
   (Netlify, Logs, Functions, social-feed) says what Meta answered.

## Sources

* [Instagram API with Instagram Login: media and token refresh](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
* [Instagram API changes 2026 (Basic Display retired 4 Dec 2024)](https://divipeople.com/instagram-api-2026/)
* [Fetch account media with the Instagram API](https://muhammadkasim.medium.com/fetch-account-media-using-instagram-api-5ab29c219ab3)
* [Meta: Pages API, getting started](https://developers.facebook.com/docs/pages-api/getting-started/)
* [Meta: Page feed endpoint](https://developers.facebook.com/docs/graph-api/reference/page/feed/)
* [Instagram token step by step, 2026](https://theplusaddons.com/blog/get-instagram-access-token/)
* [Register as a Meta developer](https://developers.facebook.com/docs/development/register/)
* [Instagram: Account type and tools](https://help.instagram.com/502981923235522)
* [Switching to a Business or Creator account, 2026](https://sociality.io/blog/instagram-creator-account/)
* [Link Instagram to a Facebook Page, 2026](https://fedica.com/blog/how-to-link-your-instagram-account-to-your-facebook-page/)
* [Find the Instagram business account id from the Page](https://dev.to/superface/instagram-api-find-the-right-account-id-4k3j)
* [Graph API access token for an Instagram business account](https://olegnax.com/documentation/generate-instagram-graph-api-access-token-for-instagram-business-account/)
