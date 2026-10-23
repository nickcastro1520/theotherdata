# AGENTS.md

Read this first. It is the hand-off note for any AI working on this repo.

## 1. What this is
theotherdata.com shows "hidden signals": offbeat public data (complaints, filings, pageviews, shipping, weather) behind well-known stocks, explained in plain English. It is an education-only showpiece Nick uses with recruiters. It is not a trading tool. Plain HTML/JS on Vercel; a push to `main` deploys.

## 2. Current status (Oct 22, 2026)
- **Live:** home, stock pages, scoreboard, /track (track record), /late-filers (filings and links only), /how walkthrough, share cards, weekly digest signup (double opt-in, Vercel Blob).
- **Test badges live** on every signal: "Tested: no predictive power found", "Not tested yet", or "Passed" (late filings at 3 months only, shown on /track).
- **Running:** data refresh every ~4h, daily late-filers feed, live late-filing test (`live-deciles.yml`, append-only hash-chained log), daily signup monitor, IndexNow.
- **Newsletter:** 0 subscribers. Auto-deletion of unconfirmed signups is paused. Apology confirm script is ready but has 0 recipients and has never been run.
- **In progress:** live late-filing test is collecting; first scored results due Oct 23.
- **Weekly signal hunt (Thursdays):** first run Oct 22. Tested Mississippi River level at St. Louis (USGS 07010000) -> ADM: fails. Logged on /track ("Tougher tests" single-stock table, from `public/data/weekly-hunt.json`). Scripts live in `scripts/hunt/`.
- **Open PRs:** none (`gh pr list`, Oct 22).

## 3. Decisions (newest first)
- **Oct 22: Weekly hunt #1, Mississippi River -> ADM: failed.** Rule fixed before scoring: 28-day St. Louis stage at or below the 25th percentile of earlier years means headwind, at or above the 75th means tailwind. 1993-03 to 2026-04: 230 calls, 80 independent events, right 41.2% (Wilson 95% 31.1–52.2%) vs a 56.2% always-down baseline. Flipped 58.8% (47.8–68.9%) also fails. Logged on /track. Script: `scripts/hunt/2026-10-22-mississippi-adm.py`. Why: one idea a week, and fails are shown publicly.
- **Oct 22: X can't support a fair hunt test.** Full-archive post search works back to at least 2008, but post counts only cover the last 7 days. Searches return at most 25 posts per call, with 1,000 reads a day, and deleted posts are gone (not point-in-time). So X-volume ideas can't get 20+ independent events of honest history. Why: tested on Oct 22.
- **Oct 21: Pause on new signals lifted (Nick).** New signals are welcome but only go live after passing the test. The Thursday hunt tests one idea a week, logs fails publicly, and asks Nick before adding a passed one.
- **Oct 20: Signup safety.** Paused deletion of unconfirmed signups and the cron's backlog confirm send. Added a daily signup monitor Action (bot inbox +tag; opens a GitHub issue for nickcastro1520 on failure). Test addresses never count or get a digest. Why: we needed proof confirm emails work. The finding was that there had been no real signups, not a bug.
- **Oct 20: One signup form on home.** Why: two forms was cluttered.
- **Oct 20: Test-status badges with a Holm correction** (264 tests, none survive). Replaced "lean up/down" wording with what the data did. Why: we shouldn't imply direction the data can't back.
- **Oct 20: Live late-filing test.** Append-only hash-chained log, size-matched controls, noon New York backup run, next-trading-day adjusted-close entry (same as backtest). Why: an honest out-of-sample check that can't be edited after the fact.
- **Oct 20: Late filings passed at 3 months** vs size-matched stocks (about −4% over 3 months, 2012–2026; both halves t < −2). 1 month: not proven. Why: it survived stress tests (return treatments, benchmarks, calendar-time, survivorship, matched deciles).
- **Oct 20: /late-filers stays filings and links only.** No stats, badges or returns. Why: it's a list of filings, not a signal claim.
- **Oct 20: Study rules v2.** Per-stock baseline is the better of always-up/down over the same months, events are independent, full history is used, and a signal needs a +1 point edge. Why: the old baseline flattered weak signals.
- **Oct 14: Rule 3 minimum size.** A featured signal needs a baseline of at least 20 and a change of at least 2×√baseline. Share images describe the data, not a lean. Why: small numbers make noisy "moves".
- **Oct 14: Method upgrades.** Scoreboard with Wilson ranges, sector-ETF benchmark, point-in-time ALFRED data, frozen signal versions. Why: no hindsight.

## 4. Next steps
- **Oct 22:** article page /alt-data-signals-work published 2026-10-22 with Nick's OK. Links from /track and home footer, plus sitemap and llms.txt.
- **Thursdays: weekly signal hunt.** Test one new idea a week (study rules v2). Log fails on /track via `public/data/weekly-hunt.json`. If one passes, commit only the script and ask Nick before adding it to the site. Skip ideas already tried (see /track and `scripts/hunt/`).
- **Local tests:** run `npm ci` first. Without node_modules, 6 test files fail on a missing `xlsx` (this is not a code bug). With it, 112/112 pass (Oct 22).
- **Oct 23:** first live late-filing results. Report them as they come, with no spin.
- **Weekly SEO report:** any changes are proposals only, until Nick approves them himself.
- **GA review:** look at traffic and signup funnel numbers; report, don't change.

## 5. Rules
- Read AGENTS.md at the start of every session. Update it at the end with what changed and what's next, then commit.
- Grok is the main builder. Claude is used for reviews and big decisions, and reads AGENTS.md to catch up.
- Only one AI edits a repo at a time. If Claude has an open pull request on your repo, don't edit until it's merged.
- Commit to GitHub before publishing. Never put keys in code or chat.
- Never claim a test ran unless you show its results.

**Nick's site rules**
- Education only. No buy/sell advice.
- Never fabricate data.
- Never show subscriber emails (counts and dates only).
- No Grok Bot mentions on the site.

- 2026-10-23: After any site change (new/edited pages, URLs, titles, content), message SEO & AEO Desk (priority true) with what changed and the URLs.
