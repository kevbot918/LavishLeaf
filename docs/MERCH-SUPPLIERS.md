# Lavish Leaf own-brand merch: supplier options (researched 2026-10-14)

Our store is custom (static pages, Netlify Functions, PayPal Orders v2), so a
supplier must take orders by API or by a manual order form, not only through
a Shopify app.

## Dropship (print on demand)

| Supplier | Fees | Organic tee / dad hat / tote base | US shipping, time | Custom-store fit | Notes |
|---|---|---|---|---|---|
| **Printful** (recommended) | Free; Growth $24.99/mo optional | $14.25 (Stanley/Stella organic) / $14.98 (Otto dad hat) / about $15.56 organic tote (unverified) | Tee $4.95, hat/tote $4.69; 2 to 5 business days | Orders API with a private token, no synced store needed | Free unbranded packing slip with our logo; neck label $0.99; free reprint for misprints within 30 days with a photo |
| **Printify** (backup) | Free; Premium $24.99 to $39/mo (about 20% off) | about $14 organic tee / about $15.60 dad hat / about $15.86 tote (EUR snapshots) | Varies by print partner | Personal-token API, manual orders on every plan | Cheaper at volume on Premium; quality varies by partner |
| Gelato | Free; Gelato+ $19.99 to $29.99/mo | not published to us (403) | local production in 32 countries | API on free plan | Branded inserts need Gelato+ |
| Spreadconnect (ex SPOD) | Free | not published | 48 h production | API | |
| Gooten | No monthly fee | not published | under 3 days production | API or manual upload | First orders held for approval |
| Apliiq | VIP about $29.99/mo | not found | | Shopify/Woo only | Woven labels, 100 for $100 |
| Teelaunch | No fees | about $11 to $19 apparel | about $9 first item | API mentioned, no docs | |
| Contrado | per order | not published | UK made | API | Reports of bulky-shipping surcharges |
| Teemill | per order | about GBP 12 to 15 tee | UK, 10 to 15 days to US | npm client, no public docs | Strongest eco story, slow to US |
| Fourthwall | | | | **No**: forces its own hosted checkout | |

## League jerseys and staff shirts

* **Custom Ink sublimated jerseys**: about $50 to $75 a player at 12 pieces,
  $40 to $60 at 50+, no setup fees, free standard shipping; names and numbers
  extra; order 4+ weeks ahead (rush adds 15 to 30%).
* **Printful bulk** (25+ pieces, up to 55% off) for matching staff tees.

## Suggested starter lineup (Printful; retail leaves 30%+ after PayPal)

| Product | Our cost | Retail | Margin | Comparable small brand |
|---|---|---|---|---|
| Organic tee + neck label | $15.24 | $30 | 44% | Keep Nature Wild tee $34 |
| Embroidered dad hat | $14.98 | $26 | 37% | Keep Nature Wild dad hat $28 |
| Embroidered cuffed beanie | $13.05 | $24 | 40% | Keep Nature Wild beanie $28 |
| Organic tote | about $15.56 | $25 | 32% | Bootstrap Farmer tote $18 (tote is weak) |
| Enamel camp mug | about $11.95 | $22 | 40% | KNW mug $20 |
| Kiss-cut sticker sheet | $5.15 | $9 | 34% | add-on only ($4.49 to ship alone) |

Confirm every base cost in a Printful dashboard and order samples before
pricing. Wiring: a "printful" shipFrom in shipping.mjs (charge Printful's
own rate) and a dashboard "Send to Printful" button like the CJ one, using
the Orders API (POST /orders with confirm=false so the owner approves).

Sources: printful.com/pricing, /shipping, developers.printful.com/docs,
printify.com/pricing, developers.printify.com, support.gelato.com,
spreadshop.com/spreadconnect, gooten.com, customink.com/blog/how-much-do-custom-jerseys-cost,
keepnaturewild.com/products.json (all read 2026-10-14).
