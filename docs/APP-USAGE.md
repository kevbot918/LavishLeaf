# App usage counts and download taps

Built 2026-10-02, **not deployed**. It goes out with the app release that
sends it (2.8), together with the privacy policy change in the same commit.

## What it is

The owner, to the app session, 2026-10-02: *"basic analytics, but without any
personal data being used"*. So the app (2.8 and later) sends one anonymous
message a day to `https://lavishleaf.org/.netlify/functions/app-usage`: its
version, android or ios, store or alpha, and the minutes listened on each
earlier day it was opened. No identifier of any kind. A switch in the app's
Settings turns it off.

The website keeps **one small record of sums per day** in the Netlify Blobs
store `app-usage`, and nothing else: not the message, not the IP address.
The code is `netlify/lib/usage.mjs` (the rules, with the reasons) and
`netlify/functions/app-usage.mjs`; the tests are
`tools/test/app-usage.test.mjs` (`npm test`).

The download buttons on the Symphonymph page send the same function one
count per tap, by file name only. That is "how many downloads from our
website": taps on our buttons, not finished installs and not store installs.

## The one step that is the owner's: the stats key

The numbers are behind a key so that only you can read them.

1. Netlify > the site > **Site configuration > Environment variables > Add a
   variable**. Key `APP_STATS_KEY`. Value: any long phrase only you know
   (four or five random words is fine). Tick "Contains secret values".
2. Trigger a deploy (a function only sees a new variable after one). This is
   the release deploy; nothing needs to go out before it.
3. Your page is then
   `https://lavishleaf.org/.netlify/functions/app-usage?key=YOUR-PHRASE`
   (put `%20` or `+` where the phrase has spaces). Bookmark it. Add
   `&format=json` for the raw numbers.

Until the key is set the page answers 404, as it does for a wrong key.
Counting does not wait for the key: phones are counted from the first day.

## How to read the numbers

* **Active devices on a day** is a true count of phones that opened the app
  that day with the switch on.
* **A week or a month is those days added up**, not a count of people. A
  phone used on five days counts five times, because nothing lets us
  recognise it from one day to the next. That is what "no identifier" costs,
  and it is deliberate.
* **A day keeps rising for up to a week**, since a phone reports a day the
  next time it is opened.
* Phones with the switch off, and app versions before 2.8, are not counted.
* Anybody can post a made-up count, exactly because there is no identifier to
  check. A per-address brake (in memory only) and strict checks keep that to
  a trickle; a sudden implausible jump is the sign of it.

## The contract with the app (lib/core/usage_counts.dart in the app repo)

`POST` JSON under 2 KB:

```json
{ "app": "symphonymph", "version": "2.8.0 (261003239)",
  "platform": "android", "build": "store",
  "days": [ { "day": "2026-10-01", "minutes": 42 } ] }
```

| Reply | When |
|---|---|
| 204 | The body is well formed. **Also when a day is too old or in the future: that day is dropped, not refused**, because the app resends on any non-2xx and a refused stale day would be retried for ever. |
| 400 | Malformed: wrong `app`, platform not android/ios, build not store/alpha, version not 1 to 40 plain characters, 0 or more than 7 days, a day that is not a real date or appears twice, minutes not a whole number 0 to 1440, body over 2 KB. |
| 429 | More than 12 posts from one address in ten minutes. |
| 503 | The store could not be reached before anything was written. |

A day counts if it is within the last 14 days (UTC) and not after today.
