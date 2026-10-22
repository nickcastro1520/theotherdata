# AGENTS.md

Read this first. It is the hand-off note for any AI working on this repo.

## 1. What this is
theotherdata.com shows "hidden signals": offbeat public data (complaints, filings, pageviews, shipping, weather) behind well-known stocks, explained in plain English. It is an education-only showpiece Nick uses with recruiters. It is not a trading tool. Plain HTML/JS on Vercel; a push to `main` deploys.

## 2. Current status (Oct 21, 2026)
- **Live:** home, stock pages, scoreboard, /track (track record), /late-filers (filings and links only), /how walkthrough, share cards, weekly digest signup (double opt-in, Vercel Blob).
- **Test badges live** on every signal: "Tested: no predictive power found", "Not tested yet", or "Passed" (late filings at 3 months only, shown on /track).
- **Running:** data refresh every ~4h, daily late-filers feed, live late-filing test (`live-deciles.yml`, append-only hash-chained log), daily signup monitor, IndexNow.
- **Newsletter:** 0 subscribers. Auto-deletion of unconfirmed signups is paused. Apology confirm script is ready but has 0 recipients and has never been run.
- **In progress:** live late-filing test is collecting; first scored results due Oct 23.
- **Open PRs:** none (`gh pr list`, Oct 21).

## 3. Decisions (newest first)
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
- **Paused:** no new signals or features while Nick focuses on his job search and an HN post.
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
