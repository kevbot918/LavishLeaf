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

## What the owner sets up (once, about 30 minutes)

Everything is done at developers.facebook.com while logged in as the person
who manages the Lavish Leaf Facebook Page and Instagram account.

**Before you start:** the Instagram account must be a **Business** or
**Creator** account (Instagram app: Settings, Account type and tools). That is
free and changes nothing your followers see.

1. **Create an app.** developers.facebook.com, My Apps, Create App. Use case:
   "Other", then type "Business". Name it "Lavish Leaf Website". The app can
   stay in Development mode: it only ever reads our own accounts, which the
   app's own admin (you) can always read.
2. **Instagram.** In the app, add the product **Instagram** and choose
   "API setup with Instagram login". Under "Generate access tokens", add the
   lavish_leaf_inc account and press **Generate token**. Copy the token.
   (It is already the 60-day long-lived kind.)
3. **Facebook.** Open the **Graph API Explorer** (Tools menu). Pick your app,
   then "Get Page Access Token", tick the Lavish Leaf page, and grant
   `pages_read_engagement` and `pages_show_list`. Then open the **Access Token
   Debugger**, paste that token and press **Extend Access Token**. Use the
   extended *user* token in the Explorer once more to call
   `me/accounts`: the `access_token` shown beside Lavish Leaf is a Page token
   that does not expire, and `id` is the page id.
4. **Into Netlify** (Site configuration, Environment variables), three values:
   * `IG_ACCESS_TOKEN`: the token from step 2
   * `FB_PAGE_ID`: the page id from step 3 (digits only)
   * `FB_PAGE_TOKEN`: the Page token from step 3
   Mark each one **secret**. Never paste them into this repository or a chat
   that is saved.
5. **Deploy** (any push, or Deploys, Trigger deploy) and open the Social page.
   Within a minute the cards replace the widgets.

If a token is ever revoked (password change, removed app), the page quietly
falls back to the widgets; generate a new one and replace the variable.

## Sources

* [Instagram API with Instagram Login: media and token refresh](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
* [Instagram API changes 2026 (Basic Display retired 4 Dec 2024)](https://divipeople.com/instagram-api-2026/)
* [Fetch account media with the Instagram API](https://muhammadkasim.medium.com/fetch-account-media-using-instagram-api-5ab29c219ab3)
* [Meta: Pages API, getting started](https://developers.facebook.com/docs/pages-api/getting-started/)
* [Meta: Page feed endpoint](https://developers.facebook.com/docs/graph-api/reference/page/feed/)
