# Changelog

Site changes for theotherdata.com. Newest first. A proposal on a branch is not live until Nick approves it and it is merged to `main`.

## 2026-11-23 (proposal, branch `seo/2026-11-23-titles-meta` — not published)

Requested by SEO & AEO Desk in the Nov 23 report. Canonical and Open Graph titles/descriptions were updated to match each new title and description.

### /s/PLTR/dev-chatter
- Title set to "Palantir (PLTR) Developer Chatter Tracker: Tech News Mentions, 4-Week Trend | The Other Data".
- Meta description now starts with the current reading, built at page-build time from this week's Hacker News story count (`latest`) and the 4-week average (`current`), for example: "Tech news mentions of Palantir this week: N, vs a 4-week average of M." If those numbers are missing, the reading is omitted rather than invented.
- Test-status badge wording is unchanged: "Tested: no predictive power found".
- Note: the title is 75 characters before the site suffix (93 with it). Google often truncates around 60 characters; this wording was requested as-is.

### /s/HD/lumber
- Title set to "Lumber Prices Chart vs Home Depot (HD) Stock | The Other Data".
- Meta description and the "Not tested yet" badge are unchanged.

### /s/META/instagram-curiosity and /s/META/threads-curiosity
- Each page now has its own opening paragraph and its own latest reading, taken from the data snapshot (Wikipedia pageviews, 28-day average, and the comparison vs the 28 days before).
- The "What this number is" copy was rewritten so each page explains what it measures and how it differs from the other curiosity signal and from /s/META/online-sales (Census e-commerce, not app attention).
- The Oct 26 / Nov 9 permalink uniqueness work (unique H1, why, JSON-LD, title kept after the live view loads) stays in place. The older `seo/meta-dupe-fix` branch is already on `main` and did not include these openings.
