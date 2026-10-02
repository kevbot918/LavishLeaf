# Every account to open, in one list

Written 2026-10-02 for the owner: *"Give me a list of all of the accounts I
need to create for suppliers, analytics, automated newsletters/orders."*
Tick them off here. The detailed steps are in the doc named in each row.

## 1. Papers first (everything below asks for them)

| | What | Cost | Steps |
|---|---|---|---|
| [ ] | **EIN** for Lavish Leaf Inc | Free | irs.gov, "Apply for an EIN online"; SUPPLIER-ACCOUNTS.md |
| [ ] | **Oklahoma resale certificate** (from the sales tax permit) | Free | OkTAP; SUPPLIER-ACCOUNTS.md |
| [ ] | **PO box** (for the email footer, and supplier mail) | Monthly rent | usps.com -> PO Boxes, or a UPS Store mailbox; EMAIL.md |

## 2. Website, sign-in and analytics

| | Account | Status | Cost | Steps |
|---|---|---|---|---|
| [ ] | **Netlify Identity** (switch on) and your own sign-in with the `admin` role | To do | Free | DASHBOARD.md step 1 |
| [x] | **Google Analytics** | Done, on every page | Free | |
| [x] | **Microsoft Clarity** | Done (project yrei9vub09) | Free | |
| [ ] | Clarity **API token** | To do | Free | DASHBOARD.md step 3 |
| [ ] | **Google Search Console** (verify lavishleaf.org) | To do | Free | DASHBOARD.md step 2A |
| [ ] | **Google Cloud** project + service account (lets the dashboard read Analytics and Search Console) | To do | Free | DASHBOARD.md step 2B to 2E |
| [ ] | **Looker Studio** (sign in with the same Google account) | Optional | Free | DASHBOARD.md step 5 |
| [x] | **Meta Business Suite** | You have it | Free | |
| [ ] | **Netlify personal access token** (form counts, import past sign-ups) | To do | Free | DASHBOARD.md step 4 |

## 3. Email (welcome, newsletter, order emails, cart reminders)

| | Account | Status | Cost | Steps |
|---|---|---|---|---|
| [ ] | **Brevo**: account, verify the lavishleaf.org domain, API key | To do | Free (300 a day) | EMAIL.md "Setting it up" |
| [ ] | Later, when the list is in the thousands: **Amazon SES** | Not yet | About $0.10 per 1,000 emails | EMAIL.md |

## 4. Payments and orders

| | Account | Status | Cost | Steps |
|---|---|---|---|---|
| [ ] | **PayPal Business** + a developer app (sandbox, then live keys) | Deferred by you on 09-27 | PayPal's fee per sale | STORE-STEPS.md |

Once PayPal is live, the order confirmation, your "new order" alert and the
cart reminder all switch on by themselves (EMAIL.md).

## 5. Shipping

| | Account | Status | Cost | Use |
|---|---|---|---|---|
| [ ] | **Pirate Ship** | To do | Free, pay per label | Print labels by hand, cheapest USPS and UPS rates. Use from the first posted order |
| [ ] | **Shippo** | To do | Free for 30 labels a month, then about 5 cents a label | Labels bought automatically for each order and emailed to you; built when the first posted product is listed (no product ships yet) |
| [ ] | **USPS.com business account** | To do | Free | Free Priority Mail boxes, delivered |

## 6. Suppliers (the order from SUPPLIER-ACCOUNTS.md)

| | Supplier | When | Cost to open |
|---|---|---|---|
| [ ] | **Faire** (retailer) | Week 1 | Free; 50% off the first order up to $100 |
| [ ] | **Arbico Organics** distributor programme | Week 1 | Free; dropships under our name |
| [ ] | **GrowOrganic** wholesale | Week 1 | Free |
| [ ] | **Hummert International** (Espoma) | Week 1 | Free |
| [ ] | **Bangalla** | Week 1 | Free |
| [ ] | **WebstaurantStore** | Week 2 | Free (Plus membership optional) |
| [ ] | **Frontier Co-op** | Week 2 | $10, refundable |
| [ ] | **Matr Boomie**, **eeBoo** | Week 2 | Free |
| [ ] | **Vermont Soap** | Week 2 | Free; $75 minimum order |
| [ ] | Rustic Strength, Fillaree, Blueland, Meliora, Who Gives A Crap, High Mowing Seeds | Any time | Free applications |
| [ ] | Seven Springs, BWI Companies | Later (with a room or a truck) | |

## What to send this session as each one opens

* Google: nothing (the keys go into Netlify, never into chat or this repository).
* Brevo: tell me when the domain is verified; I will send the first test.
* Each supplier: screenshots of the wholesale prices you can now see.
