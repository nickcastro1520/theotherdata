# The Other Data

**theotherdata.com**: offbeat, indirect public signals behind 17 well-known stocks, explained in plain English. Built by [Nick Castro](https://nickcastrobuilds.com).

Pick a stock and see two to four "hidden" signals (airport security lines for Delta, cardboard box prices for Amazon, FDA adverse-event reports for Eli Lilly, PyTorch downloads for Nvidia…). Each card shows the real number, how it compares with its own recent past, a trend chart, and three plain-English answers: what the data is, why it might matter for this company, and what it's showing now. Each stock page also has the latest news (GDELT) and SEC filings / insider-filing counts (EDGAR).

**Not financial advice. For education only.**

## Stack

Same conventions as [sitesafecheck](https://github.com/nickcastro1520/sitesafecheck) and doesaiknowmybusiness: plain JS, no framework, no dependencies, no web fonts, strict CSP.

- `public/`: static site (HTML/CSS/vanilla JS). Reads `public/data/*.json`.
- `scripts/refresh.mjs`: pulls every source, computes comparisons and readings, writes `public/data/index.json` and `public/data/tickers/<TICKER>.json`.
- `.github/workflows/refresh.yml`: runs the refresh **every 4 hours** (`23 */4 * * *` UTC) plus on demand, and commits the new data. Each commit to `main` triggers a Vercel deploy.
- `scripts/build.mjs`: copies `public/` to `dist/` and injects optional GA4 / Search Console tags (same as sitesafecheck).
- Vercel: static hosting only (no functions needed).

```
lib/catalog.js    tickers → signals (metric, polarity, noise band, plain-English copy)
lib/sources.js    source adapters (FRED, Wikimedia, PyPI, HN, openFDA, NHTSA, TSA, Greenhouse, SEC, GDELT)
lib/http.js       polite fetch: User-Agent, per-host spacing (GDELT 6.5 s, FRED 1.2 s, SEC 0.2 s), retries, timeouts
lib/analyze.js    comparisons, readings, template explanations, summaries
lib/explain.js    optional Gemini summary (off unless GEMINI_API_KEY is set)
data/history.json snapshot history for sources that only expose "today" (job-board counts)
```

## Honesty rules

- Every number comes from a public endpoint. If a fetch fails, the signal shows "Data unavailable", or the last good data with a stale warning and its fetch time. Never a made-up value.
- "Ideas" (recycling volumes, moth counts, parking lots) are labeled **Idea · not live**.
- No stock prices: Yahoo's robots.txt disallows automated access and Stooq wasn't reachable, so each page links out to a price chart instead. A free Alpha Vantage / Tiingo key would unlock an in-page price chart.
- Google News RSS is disallowed by robots.txt, so news comes from GDELT's official API.

## Local

```
node scripts/refresh.mjs            # all tickers (~5 min, GDELT is rate limited)
node scripts/refresh.mjs --only AAPL,NVDA --skip-news
node dev-server.mjs                 # http://localhost:3000
node --test test/*.test.js
```

## Optional environment

| Var | Where | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | GitHub repo secret | Turns on a 2–3 sentence AI summary per stock (validated, falls back to the template). |
| `GEMINI_MODEL` | GitHub repo secret/env | Optional comma list of models. |
| `GA_MEASUREMENT_ID`, `GOOGLE_SITE_VERIFICATION` | Vercel env | Same as sitesafecheck. |
