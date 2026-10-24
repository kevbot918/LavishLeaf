# The Books feed: PayPal into the "Lavish Leaf Inc: Books" sheet

Built 2026-10-21 for the accounting session (owner: "plan how lavishleaf.org
orders and PayPal feed into the Lavish Leaf Inc Books automatically").
**Deployed 2026-10-23** after the owner did the three steps below. It writes nothing until
PayPal is live.

## Owner steps (you do these; nothing here does them for you)

1. **Turn on the Google Sheets API** for the dashboard's existing service
   account: Google Cloud console, the same project as the dashboard
   (docs/DASHBOARD.md), APIs & Services, Library, "Google Sheets API",
   Enable.
2. **Share the Books sheet with the service account as Editor.** Open
   "Lavish Leaf Inc: Books", Share, paste the service account's email (it is
   the value of `GOOGLE_SERVICE_ACCOUNT_EMAIL` in Netlify, ending in
   `.iam.gserviceaccount.com`), choose Editor, untick "Notify people", Share.
3. **Add `BOOKS_SHEET_ID` in Netlify** (Site configuration, Environment
   variables): the long id in the sheet's address, between `/d/` and `/edit`.
   It is never written into this repository.

Afterwards: the service account's key file (JSON) is in your Google Drive
business folder. Once the key is in Netlify you no longer need that copy
there; consider moving it somewhere offline, since anyone who can open it can
act as the service account.

## What it writes

Every row goes to the tab **Transactions**, account **PayPal Business**,
description **"Order <PayPal order id>"** (or "Donation ...", "Pick-up
subscription ...", "Refund on order ...", "Pick-up refund ..."). No customer
name, email, phone or address ever goes in the sheet. Dates are the calendar
day in Chicago.

| Event | Rows |
| --- | --- |
| Paid store order or one-time pick-up (capture.mjs) | Product Sales In (items after the first-order discount), Service & Registration Sales In (pick-ups and registrations), Shipping Collected In, Sales Tax Collected In, Payment Processing Fees Out (PayPal's fee from the capture). A mixed cart gets both sales rows. |
| Monthly pick-up payment (webhook PAYMENT.SALE.COMPLETED) | Service & Registration Sales In, Sales Tax Collected In (6% share), fee Out |
| Donation (donate.mjs) | Donations Received In, fee Out |
| Refund of an order or pick-up (webhook) | Out on the sales categories for the refund less its tax share (split between products and services as the order was), Out on Sales Tax Collected for the tax share, and an In on Payment Processing Fees if PayPal returned part of its fee |
| Donation refund | Donations Received Out, fee returned In |
| Dispute opened, or a chargeback (PAYMENT.CAPTURE.REVERSED) | Out on the order's sales category, Notes "dispute <id>" or "reversal <id>" |

"Services" are the products that are never shipped: the compost and
recycling pick-ups and the league registrations. The apparel on the same
"Lavish Leaf Products & Services" shelf is shipped, so it is Product Sales.

Not written here (the accounting session takes them from the bank CSV and
PayPal's reports): bank deposits, PayPal-to-bank transfers, supplier
purchases, and everything else.

## How it stays right

* **Only when live.** Nothing is written unless `PAYPAL_ENV` is `live`;
  sandbox orders are only logged.
* **Never twice.** Every row carries a Source ID in column L
  (`pp:<capture or refund id>:<part>`); the column is read first and a
  Source ID already there is skipped. A dispute and the chargeback that may
  follow it share one Source ID (`pp:<capture id>:clawback`), so the money
  leaves the books once.
* **Never after row 5000.** Columns J and K are ARRAYFORMULAs down to row
  5000, so an append would land below them. The next row is the one after
  the last date in column A, and only A to I and L are written; J and K are
  never touched.
* **Never breaks a payment.** A Sheets failure (or a live site without
  `BOOKS_SHEET_ID` yet) is caught; the rows wait in the Blobs store
  `books-queue`, and the scheduled function `books-retry` writes them once a
  day.
* **A self-check.** If an order's parts do not add up to what PayPal
  captured, the first row's Notes say "check: parts X vs paid Y".

Things to know:

* A refund's tax share is taken in proportion to the order's tax. When the
  order cannot be found, it is worked out at 6% and the Notes say so.
  Refunded shipping is counted in the sales row, as asked.
* A dispute that ends in our favor puts the money back; nothing here writes
  that return (PayPal's event for it is not subscribed). The accountant adds
  it from PayPal's report, matched by the "dispute" note.
* A pending capture (an eCheck) writes nothing until it completes; the site
  does not yet listen for that completion, so those are rare manual rows.
* Two orders captured in the same second could race for the same row; at
  this volume that is very unlikely, and the Source IDs show any gap.

## Files

* `netlify/lib/books.mjs`: the rows for each event, the sheet writer, the
  queue.
* `netlify/functions/books-admin.mjs`: the dashboard's Books section (status,
  "Test the connection", which reads the sheet and writes nothing).
* `netlify/functions/books-retry.mjs`: the daily retry (modern scheduled
  function).
* Wired into `capture.mjs`, `donate.mjs` and `paypal-webhook.mjs`.
* `tools/test/books.test.mjs`: 14 tests with a fake Sheets API (mixed-cart
  split, discount, Chicago dates, dedupe, J/K never written, row placement,
  sandbox skip, queue on failure and retry, refunds, disputes).
* `tools/books-backfill.mjs`: one-time replay of paid orders, one-time
  pick-ups and donations already filed in Blobs. Dry run by default
  (`node tools/books-backfill.mjs`), `--write` to write. It needs
  `npm install` and, in `.env`: `NETLIFY_API_TOKEN`, `NETLIFY_SITE_ID`, the
  live `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET`, and for `--write` the three
  Google values. Monthly pick-up payments and refunds are not replayed.

The Google access uses the dashboard's service account with the extra scope
`https://www.googleapis.com/auth/spreadsheets`, requested only by books.mjs;
the dashboard's own calls stay read-only.

## Earlier payments (backfill), from the dashboard

Payments taken before the feed went live are copied from the dashboard, on
the server with Netlify's own keys (nothing goes in `.env`): **Books (Google
Sheet) -> Preview earlier payments** lists the counts and amounts per
category and writes nothing. The accounting session checks those numbers
first; then **Write these rows to the Books** writes them, skipping any
Source ID already in the sheet (so a payment the live feed already wrote is
never doubled). It reads the first 60 paid records per run.
`tools/books-backfill.mjs` does the same from a computer, if ever needed.
