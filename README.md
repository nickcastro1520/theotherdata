# The Other Data

**Live:** [theotherdata.com](https://theotherdata.com) (preview: [theotherdata.vercel.app](https://theotherdata.vercel.app)) · Built by [Nick Castro](https://nickcastrobuilds.com)

> Wall Street pays millions for "alternative data". This project pulls the free, public versions (airport security lines, cardboard box prices, FDA reports, what people look up on Wikipedia, developer chatter) and explains in plain English what they might mean for 17 well-known stocks.

![The Other Data home page](public/og.png)

**Not financial advice. For education only.**

## What it does

- **47 live signals across 17 stocks.** Examples: TSA checkpoint counts and jet fuel prices for Delta, PyTorch downloads and Hacker News chatter for Nvidia, NHTSA owner complaints for Tesla and Ford, openFDA adverse-event reports as an adoption proxy for Eli Lilly and Novo Nordisk, corrugated box prices and AWS toolkit installs for Amazon, egg and beef prices for McDonald's.
- **A 10-second home page.** The hero shows one real example straight from the latest refresh: what the data is, its green/red change, which way it leans, and why it matters. `public/featured.js` picks it: Amazon cardboard box prices lead whenever that reading is live and directional, then the card rotates through the strongest offbeat moves (one per stock, no repeated series, outliers over 150% skipped). It never hardcodes a number.
- **A track record that can be checked.** Every scheduled refresh appends each curated stock's overall lean (tailwind / headwind / mixed / quiet, with strength) and its price to an append-only log (`data/track/live.jsonl`, one line per stock per day). `scripts/track-record.mjs` scores those leans against Tiingo adjusted closes over 2 weeks, 1 month, and 1 quarter, on their own and vs the S&P 500 (SPY), and the [/track](https://theotherdata.com/track) page shows hit rates with sample sizes. A separate, clearly labeled **backtest** (`data/track/backtest.json`) rebuilds monthly leans since Jan 2023 using only signals with dated public history, conservative publication delays, and SEC numbers by first filing date. Signals that can't be backtested honestly (PyPI's 180-day window, FDA reports, NHTSA complaints, job-board snapshots) are left out and listed with the reason. The current backtest result is about a coin flip, and the page says so.
- **Built for beginners.** Every stock page has a "How to read this page" button that opens a 12-step guided tour (`public/tour.js`, no libraries, about 16 KB unminified). It spotlights the real elements on the page: a signal card, the green/red change tag vs the tailwind/headwind reading (including signals that flip, like inventory or complaints), the lean, its strength and "weeks to a quarter" window, the AI summary, the source and "data through" date, and the track record with its coin-flip result. Steps use the live numbers on the page. It works with the keyboard (Esc, arrow keys, focus trap) and becomes a bottom sheet on phones. First-time visitors get a small, dismissible invite instead of a pop-up, and the choice is remembered in `localStorage`. [/how-to-read](https://theotherdata.com/how-to-read) is the same material as a static page, filled with live examples from Amazon's data and the backtest. Any link to `/?tour=1#/AMZN` starts the tour.
- **Every signal card answers three questions:** what the data is, why it might matter for this company, and what it's showing now. The last one is written from the actual numbers.
- **Each signal gets a reading.** It's compared with its own recent past (28 days vs the prior 28, or year over year for seasonal data), then classed as a tailwind, headwind, neutral (inside a per-signal noise band), or context (the effect cuts both ways).
- **Context panels** on each stock page: latest news, SEC filings with plain-English 8-K labels, insider (Form 4) filing counts, and an optional price chart.
- **Search any US-listed stock or ETF.** A directory of ~14,000 symbols (Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe, IEX, TXSE, plus SEC-reporting OTC companies) powers instant, typo-tolerant suggestions by ticker or partial name ("rocket lab", "lemonade", "soundhound"). The 17 curated names open their deep-signal pages; everything else opens a light pack (price, chart, news, Wikipedia curiosity, HN chatter, SEC filings) built on demand by `/api/lookup`, with an explicit "Limited data" notice when our free sources have little.
- **Refreshes itself.** A scheduled GitHub Actions job pulls every source every 4 hours and commits the data, and each commit redeploys on Vercel. Every card shows when its data was fetched and what period it covers.

## Engineering choices worth a look

| Problem | Approach |
| --- | --- |
| Never show made-up numbers | Each signal is `ok`, `stale` (last good data, with a warning and its fetch time), `tracking` (history still building), or `error` (shown as "Data unavailable"). A test checks that error cards carry no numbers. |
| Be a polite scraper | Official APIs and public downloads only, robots.txt checked for each source. Requests are spaced per host (GDELT 7 s, FRED 1.2 s, SEC 0.2 s), retry with backoff, and have hard timeouts that also cover the response body. |
| A flaky upstream (GDELT returns 429 a lot) | GDELT calls are serialized behind a circuit breaker (3 straight failures or a 7-minute budget, then skip), with fallbacks to the last good headlines and to Hacker News stories filtered to titles that name the company. |
| Sources that only show "today" (job boards) | The refresh job saves a snapshot each run in `data/history.json` and builds the trend itself. |
| AI that stays honest | Optional Gemini summary per stock. The model may only restate computed facts. Output is length-checked and rejected if it sounds like investment advice ("buy", "price target", "will rise"…), then falls back to the template. |
| Keys never leak | Provider keys go in request headers, not URLs. Error messages carry only the host. Keys live in GitHub Actions secrets. |
| Find obscure tickers | `public/data/symbols.json` is built from the Nasdaq Trader symbol directory (`nasdaqlisted.txt`, `otherlisted.txt`) and SEC `company_tickers_exchange.json` (for CIKs and SEC-reporting OTC names), dropping test issues, warrants, rights, SPAC units, preferreds and notes. The same ranking code (`public/symbol-search.js`) runs in the browser and in `/api/search`: exact ticker → alias → name prefix → ticker prefix → word prefix → contains → fuzzy. Refreshed weekly by the scheduled workflow, with a guard that refuses to replace the file with a much smaller one. |
| Fast and cheap | Static site (vanilla JS, no framework, no web fonts, strict CSP). Data is precomputed JSON, so there are no runtime servers or databases. |

## Data sources

FRED (St. Louis Fed: Census, BLS, BTS, EIA and Freddie Mac series) · SEC EDGAR (XBRL inventory, filings) · openFDA · NHTSA complaints API · TSA checkpoint numbers · Wikimedia pageviews · PyPI downloads (pypistats) · Hacker News (Algolia) · Greenhouse public job boards · GDELT news. Optional, keyed: Finnhub (company news, quotes), Tiingo (end-of-day prices), Gemini (summaries).

## Project layout

```
lib/catalog.js      tickers → signals (metric, polarity, noise band, plain-English copy)
lib/sources.js      one adapter per source; keyed providers switch on via env vars
lib/http.js         polite fetch (User-Agent, per-host spacing, retries, timeouts)
lib/analyze.js      comparisons, readings, template explanations, summaries
lib/explain.js      optional Gemini summary with validation and fallback
scripts/refresh.mjs pulls everything, writes public/data/*.json
scripts/build-symbols.mjs  US symbol directory → public/data/symbols.json (weekly)
lib/symbol-directory.js    parses Nasdaq Trader + SEC ticker files
lib/symbols.js             server-side directory search (shared ranking: public/symbol-search.js)
public/             the static site (index, stock pages via #/TICKER, /how, /track, /how-to-read; tour.js = guided tour)
.github/workflows/refresh.yml   every 4 hours: refresh → test → commit → Vercel deploy
test/               node:test (analysis, data integrity, provider parsing and key safety)
```

## Run it locally

```bash
node scripts/refresh.mjs                         # all tickers (~5–8 min; GDELT is slow)
node scripts/refresh.mjs --only AAPL,NVDA --skip-news
node scripts/build-symbols.mjs                   # refresh the US symbol directory (~2 s)
node dev-server.mjs                              # http://localhost:3000
node --test test/*.test.js
```

Node 20+, no `npm install` needed.

## Optional keys (GitHub repo → Settings → Secrets and variables → Actions)

| Secret | Turns on | Free signup |
| --- | --- | --- |
| `GEMINI_API_KEY` | AI summary per stock | https://aistudio.google.com/apikey |
| `FINNHUB_API_KEY` | Company news + current quote | https://finnhub.io/register |
| `TIINGO_API_KEY` | End-of-day price chart (1 year) | https://www.tiingo.com/account/api/token |

Without them the site still works. It uses GDELT and Hacker News for news, template explanations, and links out for prices.

## Deploy

Vercel, linked to this repo (framework: Other, build `node scripts/build.mjs`, output `dist`). Domains: `theotherdata.com`, with `www` redirecting to the apex. Optional Vercel env vars: `GA_MEASUREMENT_ID` and `GOOGLE_SITE_VERIFICATION`, applied at build time.

## License and disclaimer

Code © Nick Castro. Data belongs to its publishers; see each card's source link. Nothing here is a recommendation to buy, sell, or hold any security.
