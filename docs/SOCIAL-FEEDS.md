# The Social page's own Instagram and Facebook feeds

Written 2026-10-01. The owner: Behold's free tier shows only six Instagram
posts, and Facebook's Page plugin draws every post in one long column; he
wants many more posts, each its own card, full width.

## How it works

* `netlify/functions/social-feed.mjs` returns our latest **24 Instagram** and
  **24 Facebook** posts as cards, read from Meta's APIs and cached in Netlify
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
passwords to anyone, Claude included. Instagram alone is enough to get past
Behold's six posts; Facebook (Part D) is optional and can wait.

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

### Part C. Create the app and get the Instagram token (10 minutes)

1. Click **My Apps** (top right), then the green **Create App** button.
2. **App details:** App name `Lavish Leaf Website`; App contact email: yours.
   Click **Next**.
3. **Use cases:** in the list on the left click **Content management**, then
   tick **Manage messaging & content on Instagram**. If you will do Part D,
   ALSO tick **Manage everything on your Page**. Click **Next**.
4. **Business:** choose **I don't want to connect a business portfolio yet**.
   Click **Next**.
5. **Requirements**, then **Overview**: click **Next**, then **Go to
   dashboard** (Meta may ask for your Facebook password once).
6. In the dashboard's left menu click **Use cases**. Beside **Manage messaging
   & content on Instagram** click **Customize**.
7. Click **API setup with Instagram login** (NOT "with Facebook login").
8. Find section **2. Generate access tokens** and click **Add account**. An
   Instagram window opens: log in as **lavish_leaf_inc** and click **Allow**.
9. Back on that screen, beside lavish_leaf_inc, click **Generate token**. Tick
   "I understand" in the pop-up. A long token appears **once**: click the
   **copy** icon. (If you lose it, just press Generate token again.)
10. Paste it straight into Netlify (Part E) as `IG_ACCESS_TOKEN`.

Leave the app in **Development** mode: it only reads our own account, so no
App Review is needed. The website renews this token by itself every week
(it would otherwise expire after 60 days).

### If "Add account" cannot find lavish_leaf_inc

Meta's search only finds an Instagram account that is **professional
(Business or Creator) AND public**. A personal or private account simply does
not appear. In this order:

1. Do Part A on the phone and read the screen: if it offers **Switch to
   professional account**, the account is still personal. Switch it to
   Business, then make sure **Private account** is off.
2. Wait a few minutes, then try **Add account** again.
3. Still nothing? Invite it as a tester instead, which takes the exact
   username: in the app dashboard's left menu **App roles**, **Roles**, then
   **Add People** (or **Add Instagram Testers**), choose **Instagram Tester**,
   type `lavish_leaf_inc`, send. Then on a computer go to **instagram.com**,
   logged in as lavish_leaf_inc: **Settings**, **Website permissions** (or
   **Apps and websites**), **Tester invites**, and **Accept**. Back in the
   dashboard, **Add account** now opens an Instagram log-in window: log in as
   lavish_leaf_inc and **Allow**.
4. If the Instagram window logs in as a different account, log out of
   instagram.com in that browser first, or use a private window.

### Part D (optional). The Facebook Page token (10 minutes)

1. Open **https://developers.facebook.com/tools/explorer/** (Graph API
   Explorer).
2. On the right: **Meta App** = `Lavish Leaf Website`. **User or Page** =
   **User Token**.
3. Under **Permissions**, use **Add a Permission** to add
   `pages_show_list` and `pages_read_engagement`. Click **Generate Access
   Token** and approve; when asked which Pages, tick **Lavish Leaf**.
4. Copy the token from the **Access Token** box at the top.
5. Open **https://developers.facebook.com/tools/debug/accesstoken/**, paste
   it, click **Debug**, then at the bottom click **Extend Access Token** and
   copy the NEW token it shows.
6. Back in the Explorer, paste that new token into the **Access Token** box.
   In the query box type `me/accounts?fields=name,id,access_token` and click
   **Submit**.
7. In the answer, find `"name": "Lavish Leaf"`. Beside it:
   * `"id"` (only digits) is **FB_PAGE_ID**
   * `"access_token"` (long) is **FB_PAGE_TOKEN**
8. Optional check: paste FB_PAGE_TOKEN into the Access Token Debugger; it
   should say **Expires: Never**.

### Part E. Put the keys into Netlify (3 minutes)

1. **https://app.netlify.com**, open the lavishleaf.org site.
2. **Site configuration** (left menu), then **Environment variables**.
3. **Add a variable**, **Add a single variable**:
   * Key `IG_ACCESS_TOKEN`, value: the Instagram token. Tick **Contains
     secret values**. Click **Create variable**.
   * If you did Part D: the same for `FB_PAGE_ID` and `FB_PAGE_TOKEN`.
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
