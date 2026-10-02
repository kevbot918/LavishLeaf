# Email: the newsletter, the welcome, orders, cart reminders

Built 2026-10-02. The owner: *"300 emails per day may not be enough soon ...
I do want an automatic welcome newsletter ... analyze and research some more
to make decisions."*

## The decisions, and why

**1. We keep the list ourselves; a service only delivers.** Subscribers live
in Netlify Blobs (store `newsletter`), not inside Brevo or MailerLite. So no
plan caps how many people can join, and the sending service can be swapped
without moving anybody. Netlify itself cannot send email, so some sending
service is always needed.

**2. Brevo delivers, for now.** Free: 300 emails a day, API included, and the
same account sends order emails. 300 a day is about 9,000 a month; the
newsletter sender (below) spreads a big list over several days by itself, so
nothing breaks when the list passes 300. A newsletter to 900 people simply
takes three days.

**When that is too slow** (a list of a few thousand), two choices, both a small
change in `netlify/lib/mail.mjs` (`send()`, chosen by `MAIL_PROVIDER`):
* **Amazon SES**: $0.10 per 1,000 emails, no daily cap worth mentioning once
  out of its sandbox. 10,000 subscribers monthly = about $1 a month. The
  cheapest by far; needs an AWS account and a short approval request.
* **Brevo Starter**: about $9 a month for 5,000 emails a month, no daily limit.
Resend's free plan (100 a day) is smaller than Brevo's, so it is not a step up.

**3. Single opt-in (no "click to confirm").** US law (CAN-SPAM) does not
require a confirmation step; it requires an honest From line and subject, a
physical postal address in every marketing email, and a working unsubscribe
honoured within 10 business days. GDPR does not require double opt-in
either. So: people who tick "Sign up for news and updates" are on the list at
once and get the welcome email within a minute.
What keeps that safe: a signed one-click unsubscribe in every marketing
email, plus the `List-Unsubscribe` headers Gmail and Yahoo now demand; the
newsletter form's own checkbox as the consent; a duplicate sign-up never gets
a second welcome.

**4. Nothing goes to the whole list without the owner's click.** The monthly
newsletter is a draft file; the dashboard sends a test to you first, then
"Send to everyone".

## What happens automatically

| When | What | Template | Code |
|---|---|---|---|
| Someone joins the newsletter (any page) | Added to the list; the welcome email | `emails/welcome.html` | `submission-created.mjs` |
| Someone sends the contact form | "We have your message" reply | `emails/contact-reply.html` | `submission-created.mjs` |
| An order is paid | Order confirmation to the customer (PayPal also sends its receipt), and a "new order" alert to you | `emails/order-confirmation.html` | `netlify/lib/orders.mjs` |
| Every hour | The next batch of a newsletter you started | your issue file | `newsletter-drip.mjs` |
| Every day | One reminder to a signed-in customer whose cart sat 1 to 7 days, at most once per cart and never twice in 14 days; only once the store really sells | `emails/cart-reminder.html` | `cart-reminders.mjs` |
| Someone clicks Unsubscribe | Off the list at once | | `unsubscribe.mjs` |

Order emails always go first: 40 emails a day are held back from newsletters
for them.

## The monthly newsletter, each month

1. Copy `emails/newsletter-2026-10.html` to `emails/newsletter-YYYY-MM.html`.
2. Change the parts marked `EDIT EACH MONTH` (the month line, headline, the
   opening note, each section's few sentences, the dates, the tip) and the
   `<title>`, which is the subject line. Or ask this session to write the
   month's issue from what is new; same file, same layout.
3. Push. Preview at lavishleaf.org/emails/newsletter-YYYY-MM.html.
4. Dashboard -> Newsletter -> the file name -> **Send me a test**. Read it on
   your phone.
5. **Send to everyone.** The dashboard shows how many have gone.

Blanks the templates may use: `{{first_name}}` ("friend" when unknown),
`{{unsubscribe_url}}`, `{{postal_address}}`, `{{view_online_url}}`. Keep the
unsubscribe link and the postal address in the footer.

## Setting it up (owner, about 30 minutes)

1. **A mailing address for the email footer.** A USPS PO box
   (usps.com -> PO Boxes, rented by the month) or a private mailbox at a UPS
   Store. Not on the website: only in emails, as CAN-SPAM requires.
2. **Brevo account** (brevo.com, free). Then **Senders, domains & dedicated
   IPs -> Domains -> Add a domain** -> `lavishleaf.org` -> Brevo lists DNS
   records (a Brevo code TXT, DKIM, and DMARC). Add each in Netlify -> Domains
   -> lavishleaf.org -> DNS records. If there is no DMARC record yet, add TXT
   `_dmarc` = `v=DMARC1; p=none; rua=mailto:support@lavishleaf.org`. Verify in
   Brevo. Without this, Gmail rejects the mail.
3. **Brevo -> SMTP & API -> API keys -> Generate a new API key.**
4. **Netlify -> Site configuration -> Environment variables** (secret where it
   says so):

| Variable | Value |
|---|---|
| `BREVO_API_KEY` | the key (secret) |
| `MAIL_FROM` | `support@lavishleaf.org` (or a `hello@`; must be on the verified domain) |
| `MAIL_POSTAL_ADDRESS` | e.g. `PO Box 123, Eufaula, OK 74432` |
| `OWNER_EMAIL` | where "new order" alerts go |
| `NEWSLETTER_SECRET` | any long random text (secret): signs unsubscribe links. Never change it once newsletters have gone out, or old links stop working |
| `MAIL_DAILY_LIMIT` | optional; 300 by default |

5. Trigger a deploy, then on the dashboard: **Send me the welcome email**, and
   **Import past sign-ups** (needs `NETLIFY_API_TOKEN`, docs/DASHBOARD.md).

Until `BREVO_API_KEY` is set, sign-ups are still saved to the list; nobody is
emailed. Until `MAIL_POSTAL_ADDRESS` is set, no marketing email (welcome,
newsletter, cart reminder) is sent; order emails still are.

## Sources (read 2026-10-02)

* CAN-SPAM: [FTC compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business); PO boxes count: [bentonow.com](https://bentonow.com/posts/can-i-use-a-po-box-can-spam)
* Double opt-in not legally required: [emailtooltester.com](https://www.emailtooltester.com/en/blog/is-double-opt-in-required/)
* Gmail/Yahoo one-click unsubscribe and DMARC: [powerdmarc.com](https://powerdmarc.com/bulk-email-sender-requirements/)
* Brevo free plan: [emailtooltester.com](https://www.emailtooltester.com/en/reviews/brevo/pricing/)
* Amazon SES pricing: [sendops.dev](https://sendops.dev/amazon-ses-pricing/); Resend free plan: [resend.com](https://resend.com/docs/knowledge-base/what-is-resend-pricing)
* Netlify form-triggered functions: [docs.netlify.com](https://docs.netlify.com/build/functions/trigger-on-events/)
