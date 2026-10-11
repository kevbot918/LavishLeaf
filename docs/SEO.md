# Being found on Google, Bing and maps (2026-10-11)

## What the site now does by itself

- `sitemap.xml` lists every public page. `robots.txt` lets every search engine in, except to the dashboard, and points them at the sitemap.
- Each page has a title and description written for what people type into Google:
  - "compost pick-up Stigler"
  - "adult soccer league McAlester"
  - "natural soap online"
- Each page has one canonical address, so Google does not split it across `/store` and `/store.html`.
- Structured data (JSON-LD), which Google reads to build rich results:
  - Home: the organization, with Facebook, Instagram and YouTube.
  - Farms: the compost and recycling pick-ups as services, with their area and price.
  - Rec Sports: the soccer league.
  - Store: every product with photo, price and stock.
- Every product has its own link (`store.html?p=<id>`) that opens it, so Google and shoppers can land on a product.
- `google-shopping.xml` is a product feed for Google Merchant Center (free listings in the Shopping tab and Google Images).
  - It holds every shipped product.
  - Services and registrations are left out; Merchant Center refuses them.
- A proper 1200 x 630 link-preview picture (`og-card.jpg`) on every page, for Facebook, texts and other shares.

After any change to products.json, run in this order:
1. `node tools/render-store.mjs`
2. `node tools/seo.mjs`

The second rewrites the sitemap, the feed and the store's structured data.

## The owner's steps, in order of how much traffic they bring

### 1. Google Business Profile (15 minutes; the biggest local win)

This is what shows in Google Maps and the map box at the top of "compost pick-up near me".

1. Go to business.google.com and sign in with the Lavish Leaf Google account. Choose **Add your business**.
2. Name: `Lavish Leaf`. Category: `Waste management service`. Add `Recycling center` and `Sports club` as extra categories.
3. When asked for a location customers visit, choose **No**. You are a service-area business, so your street address stays hidden, which keeps rule 3 of the site.
4. Service areas: Stigler, McAlester, Checotah, Eufaula, Haskell County, Pittsburg County, McIntosh County.
5. Website: `https://lavishleaf.org`.
   - Leave the phone number empty if you want no phone shown.
   - Google may ask for one to verify; it is not shown if you untick it afterwards.
6. Verify. Usually it's a video of you showing the trailer, the bucket and a sign or paperwork with the name.
7. After verifying:
   - add the photos from `marketing/social/` and your own;
   - add Products for Compost Pick-Up ($15/month) and the soccer registrations;
   - post the 50% offer as an Offer post.

### 2. Submit the sitemap (2 minutes)

1. Search Console is already verified (the google-site-verification record is in the Squarespace DNS).
2. Open search.google.com/search-console, choose lavishleaf.org, then **Sitemaps**.
3. Enter `sitemap.xml` and press **Submit**.
4. Then use **URL inspection** on `https://lavishleaf.org/store.html` and press **Request indexing**.
5. Do the same for the home, farms and rec-sports pages.

### 3. Bing and the other engines (5 minutes)

1. bing.com/webmasters: sign in, choose **Import from Google Search Console**, and pick lavishleaf.org. That also feeds DuckDuckGo, Yahoo and ChatGPT search.
2. Submit `https://lavishleaf.org/sitemap.xml` there too.
3. Bing Places (bingplaces.com) can import the Google Business Profile once it is verified.

### 4. Google Merchant Center (20 minutes; products in Google Shopping, free)

1. merchants.google.com: create the account with the Lavish Leaf Google account. Business info: name, website `https://lavishleaf.org`, and "online store".
2. Claim the website. It will offer the Search Console link; accept it.
3. **Shipping and returns:**
   - Shipping: add a US service. The rates are $2.99 flat (free over $9.99) for most items, and by weight for the rest; a simple "$8.95 flat" estimate is allowed. Delivery time is 7 to 21 days.
   - Returns: 30 days, buyer pays postage (matches refunds.html).
4. **Products, Add products, Add from a file:**
   - Choose **Scheduled fetch** and enter `https://lavishleaf.org/google-shopping.xml`, daily.
   - Country: United States. Language: English.
5. Turn on **free listings** (Growth, Manage programs).

Products usually appear within 3 to 5 days. Merchant Center lists any problems under Products, Diagnostics.

### 5. Apple Maps and Nextdoor (10 minutes)

- businessconnect.apple.com: add Lavish Leaf as a service-area business, the same as Google. iPhone Maps and Siri read it.
- Nextdoor (business.nextdoor.com): a free business page; post the 50% offer to the neighbourhoods around Stigler and McAlester.

### 6. Links that tell Google you are real

Each of these is a link back to lavishleaf.org that Google counts:
- Put `https://lavishleaf.org` in the bio or website field of the Facebook Page, Instagram, YouTube and Google Business Profile.
- Ask the Stigler, McAlester and Checotah chambers of commerce, the city recycling pages and the Eufaula ballpark to list you.
- Free directories: Yelp for Business, Better Business Bureau (free listing), Oklahoma Recycling Association member list.

### 7. Keep it fresh

- Post a Google Business Profile update when anything changes (an offer, a new season).
- Ask happy customers for a Google review. Reviews move local rankings more than anything else on this list.
