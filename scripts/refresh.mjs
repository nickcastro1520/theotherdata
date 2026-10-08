// Pulls fresh data for every ticker and writes static JSON into public/data/.
// Run by GitHub Actions on a schedule (see .github/workflows/refresh.yml) and locally with `npm run refresh`.
//   --only AAPL,NVDA   refresh a subset (other tickers keep their previous files)
//   --skip-news        skip GDELT (slow: one request every ~6 s)
import { readFile, writeFile, mkdir, readdir, appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TICKERS, IDEAS } from "../lib/catalog.js";
import * as src from "../lib/sources.js";
import { analyze, analyzeSnapshot, summarize, trimSeries, fmtDate } from "../lib/analyze.js";
import { aiEnabled, aiSummary } from "../lib/explain.js";
import { newLiveLines } from "../lib/track.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "data");
const HIST = join(ROOT, "data", "history.json");
const args = process.argv.slice(2);
const only = (() => { const i = args.indexOf("--only"); return i >= 0 ? new Set(args[i + 1].split(",").map((s) => s.trim().toUpperCase())) : null; })();
const skipNews = args.includes("--skip-news");
const startedAt = new Date().toISOString();
const today = startedAt.slice(0, 10);

const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
await mkdir(join(OUT, "tickers"), { recursive: true });
await mkdir(dirname(HIST), { recursive: true });
const history = await readJson(HIST, {});

// Shared fetch cache so a series used by several tickers (gas prices, TSA) is fetched once.
const cache = new Map();
function fetchOnce(source, params) {
  const key = source + JSON.stringify(params);
  if (!cache.has(key)) cache.set(key, src[source](params));
  return cache.get(key);
}

const sourceHealth = {};
const mark = (name, ok, err) => {
  const h = (sourceHealth[name] ||= { ok: 0, failed: 0, errors: [] });
  if (ok) h.ok++; else { h.failed++; if (err && h.errors.length < 3 && !h.errors.includes(err)) h.errors.push(err); }
};

function staleCopy(prev, err) {
  if (!prev || !(prev.status === "ok" || prev.status === "stale" || prev.status === "tracking")) return null;
  return { ...prev, status: "stale", staleSince: prev.staleSince || prev.fetchedAt, lastError: err };
}

async function runSignal(t, sig, prevSig) {
  const base = { id: sig.id, name: sig.name, metric: sig.metric, what: sig.what, why: sig.why, unit: sig.unit, polarity: sig.polarity, threshold: sig.threshold, compare: sig.compare, scout: Boolean(sig.scout), source: { name: sig.sourceName } };
  try {
    if (sig.source === "greenhouse" || sig.source === "lever") {
      // Job boards only show today's count, so we keep our own dated snapshots in data/history.json.
      const r = await fetchOnce(sig.source, sig.params);
      const key = sig.source === "lever" ? `lever:${sig.params.company}` : `greenhouse:${sig.params.board}`;
      const h = (history[key] ||= []);
      const existing = h.find((p) => p.t === today);
      if (existing) existing.v = r.snapshot; else h.push({ t: today, v: r.snapshot });
      history[key] = h.slice(-400);
      mark(sig.sourceName, true);
      return { ...base, source: { name: sig.sourceName, url: r.url }, fetchedAt: startedAt, ...analyzeSnapshot(sig, history[key], t.name) };
    }
    const params = sig.source === "secInventory" ? { ticker: t.ticker, ...(sig.params?.concept ? { concept: sig.params.concept } : {}) } : sig.params;
    const r = await fetchOnce(sig.source, params);
    const a = analyze(sig, r.series, t.name);
    mark(sig.sourceName, true);
    return { ...base, source: { name: sig.sourceName, url: r.url, note: r.note }, fetchedAt: startedAt, ...a };
  } catch (e) {
    const msg = String(e.message || e).slice(0, 200);
    mark(sig.sourceName, false, msg);
    return staleCopy(prevSig, msg) || { ...base, status: "error", error: msg, fetchedAt: startedAt, now: `We couldn't fetch this data on the latest refresh (${msg}). Rather than guess, we're leaving it blank until the source responds.` };
  }
}

// GDELT's free API is often overloaded (HTTP 429). After 3 straight failures we stop calling it for
// this run (the circuit breaker) and fall back to the last good headlines plus Hacker News stories.
let gdeltFailStreak = 0;
const GDELT_MAX_FAILS = 3;
const GDELT_BUDGET_MS = 7 * 60 * 1000; // stop calling GDELT after 7 minutes so a run always finishes
let gdeltChain = Promise.resolve();
// Serialize GDELT calls so the breaker check happens right before each request.
function gdeltTurn(fn) { const p = gdeltChain.then(fn); gdeltChain = p.catch(() => {}); return p; }
async function runNews(t, prev) {
  const out = { fetchedAt: startedAt, query: t.news, source: { name: "GDELT Project (global news index)", url: "https://www.gdeltproject.org/" } };
  try {
    out.hn = await src.hnStories({ query: t.hn || t.name, must: t.hnMust || `\\b${(t.hnMust || t.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` });
    out.hnFetchedAt = startedAt;
    mark("Hacker News stories", true);
  } catch (e) {
    mark("Hacker News stories", false, e.message);
    out.hn = prev?.news?.hn || [];
    out.hnFetchedAt = prev?.news?.hnFetchedAt || null;
  }
  if (src.finnhubEnabled()) {
    try {
      const articles = await src.finnhubNews({ ticker: t.ticker });
      mark("Finnhub company news", true);
      if (articles.length) return { ...out, articles, status: "ok", source: { name: "Finnhub company news", url: "https://finnhub.io/" } };
    } catch (e) {
      mark("Finnhub company news", false, e.message);
    }
  }
  if (skipNews) return { ...(prev?.news || { status: "skipped", articles: [] }), hn: out.hn, hnFetchedAt: out.hnFetchedAt };
  return gdeltTurn(() => gdeltNews(t, prev, out));
}
async function gdeltNews(t, prev, out) {
  if (gdeltFailStreak >= GDELT_MAX_FAILS || Date.now() - Date.parse(startedAt) > GDELT_BUDGET_MS) {
    mark("GDELT news", false, "skipped: GDELT kept rate limiting (HTTP 429) on this run");
    return fallbackNews(out, prev, "GDELT was rate-limiting requests on this refresh");
  }
  try {
    out.articles = await src.gdeltArticles({ query: t.news, max: 8 });
    out.status = "ok";
    gdeltFailStreak = 0;
    mark("GDELT news", true);
    return out;
  } catch (e) {
    if (/429/.test(e.message)) gdeltFailStreak++;
    mark("GDELT news", false, e.message);
    return fallbackNews(out, prev, e.message);
  }
}
function fallbackNews(out, prev, err) {
  const p = prev?.news;
  if (p?.articles?.length) return { ...out, articles: p.articles, status: "stale", staleSince: p.staleSince || p.fetchedAt, lastError: err };
  return { ...out, status: "error", error: err, articles: [] };
}

// Price data (optional keys). Prices are fetched once per day; the quote every run.
async function runMarket(t, prev) {
  const pm = prev?.market || {};
  if (!src.finnhubEnabled() && !src.tiingoEnabled()) return { status: "off", note: "No market-data key configured (FINNHUB_API_KEY / TIINGO_API_KEY)." };
  const out = { status: "ok", fetchedAt: startedAt };
  if (src.tiingoEnabled()) {
    if (pm.history?.length && pm.historyDay === today) { out.history = pm.history; out.historyDay = pm.historyDay; out.historySource = pm.historySource; }
    else {
      try { out.history = await src.tiingoPrices({ ticker: t.ticker }); out.historyDay = today; out.historySource = { name: "Tiingo (end-of-day, adjusted)", url: "https://www.tiingo.com/" }; mark("Tiingo prices", true); }
      catch (e) { mark("Tiingo prices", false, e.message); if (pm.history?.length) { out.history = pm.history; out.historyDay = pm.historyDay; out.historySource = pm.historySource; out.historyStale = true; } }
    }
  }
  if (src.finnhubEnabled()) {
    try { out.quote = await src.finnhubQuote({ ticker: t.ticker }); out.quoteSource = { name: "Finnhub", url: "https://finnhub.io/" }; mark("Finnhub quotes", true); }
    catch (e) { mark("Finnhub quotes", false, e.message); }
  }
  if (!out.quote && out.history?.length > 1) {
    const h = out.history, a = h[h.length - 1], b = h[h.length - 2];
    out.quote = { price: a.v, change: a.v - b.v, changePct: ((a.v - b.v) / b.v) * 100, at: a.t + "T21:00:00Z", eod: true };
    out.quoteSource = out.historySource;
  }
  if (out.history?.length > 1) { const first = out.history[0].v, last = out.history[out.history.length - 1].v; out.yearPct = ((last - first) / first) * 100; }
  if (!out.quote && !out.history) return { status: "error", error: "Market data providers didn't respond", fetchedAt: startedAt };
  return out;
}

async function runSec(t, prev) {
  try {
    const r = await src.secFilings({ ticker: t.ticker });
    mark("SEC EDGAR filings", true);
    return { status: "ok", fetchedAt: startedAt, ...r };
  } catch (e) {
    mark("SEC EDGAR filings", false, e.message);
    if (prev?.sec?.status === "ok" || prev?.sec?.status === "stale") return { ...prev.sec, status: "stale", lastError: e.message };
    return { status: "error", error: e.message, fetchedAt: startedAt };
  }
}

const targets = TICKERS.filter((t) => !only || only.has(t.ticker));
console.log(`Refreshing ${targets.length} tickers${skipNews ? " (news skipped)" : ""}${aiEnabled() ? " with AI summaries" : ""}...`);

const results = await Promise.all(targets.map(async (t) => {
  const prev = await readJson(join(OUT, "tickers", `${t.ticker}.json`), null);
  const prevSig = (id) => prev?.signals?.find((s) => s.id === id);
  const [signals, news, sec, market] = await Promise.all([
    Promise.all(t.signals.map((s) => runSignal(t, s, prevSig(s.id)))),
    runNews(t, prev),
    runSec(t, prev),
    runMarket(t, prev),
  ]);
  const summary = summarize(t.name, t.ticker, signals);
  // The AI summary is told the computed lean and must agree with it; otherwise we keep the template text.
  const ai = await aiSummary(t.name, t.ticker, signals, summary);
  if (summary.impact) summary.impact = ai?.text ? { ...summary.impact, text: ai.text, source: "ai" } : { ...summary.impact, source: "template" };
  const doc = { ticker: t.ticker, name: t.name, sector: t.sector, updatedAt: startedAt, summary, ai, signals, news, sec, market };
  await writeFile(join(OUT, "tickers", `${t.ticker}.json`), JSON.stringify(doc));
  const okCount = signals.filter((s) => s.status === "ok").length;
  console.log(`  ${t.ticker.padEnd(5)} ${okCount}/${signals.length} signals ok · news ${news.status} (${news.articles?.length || 0}) · hn ${news.hn?.length || 0} · sec ${sec.status} · market ${market.status}${ai ? " · ai summary" : ""}`);
  return doc;
}));

// Rebuild the index from every ticker file (so --only runs keep the others).
const all = [];
for (const t of TICKERS) {
  const d = results.find((r) => r.ticker === t.ticker) || (await readJson(join(OUT, "tickers", `${t.ticker}.json`), null));
  if (!d) continue;
  all.push({
    ticker: d.ticker, name: d.name, sector: d.sector, updatedAt: d.updatedAt, summary: d.summary,
    price: d.market?.quote ? { price: d.market.quote.price, changePct: d.market.quote.changePct } : null,
    signals: d.signals.map((s) => ({ id: s.id, name: s.name, source: s.source?.name || null, sourceUrl: s.source?.url || null, asOf: s.asOf || null, reading: s.reading || null, pct: s.pct ?? null, status: s.status, display: s.display || null, basis: s.basis || null, series: (s.series || []).slice(-40).map((p) => p.v) })),
    headline: (() => { const a = d.news?.articles?.[0] || d.news?.hn?.[0]; return a ? { title: a.title, domain: a.domain, url: a.url } : null; })(),
  });
}
const prevIndex = await readJson(join(OUT, "index.json"), {});
const index = {
  generatedAt: startedAt,
  schedule: "Every 4 hours (GitHub Actions)",
  aiSummaries: aiEnabled(),
  providers: { finnhub: src.finnhubEnabled(), tiingo: src.tiingoEnabled(), gemini: aiEnabled() },
  tickers: all,
  ideas: IDEAS,
  sources: { ...(only ? prevIndex.sources : {}), ...sourceHealth },
};
await writeFile(join(OUT, "index.json"), JSON.stringify(index));
await writeFile(HIST, JSON.stringify(history, null, 1));
if (skipNews) index.sources["GDELT news"] = { ok: 0, failed: 0, errors: ["not called on this run (manual run with --skip-news); headlines kept from the last run"] };
await writeFile(join(OUT, "index.json"), JSON.stringify(index));
// Track record: append one lean + price snapshot per curated stock per UTC day. Append-only: earlier
// lines are never rewritten. Scored later against real prices by scripts/track-record.mjs.
if (!only) {
  const LIVE = join(ROOT, "data", "track", "live.jsonl");
  await mkdir(dirname(LIVE), { recursive: true });
  const lines = newLiveLines(await readFile(LIVE, "utf8").catch(() => ""), results, startedAt);
  if (lines.length) { await appendFile(LIVE, lines.join("\n") + "\n"); console.log(`Track record: logged ${lines.length} live lean snapshots for ${today}`); }
}
const failed = Object.entries(sourceHealth).filter(([, h]) => h.failed);
console.log(`Done at ${new Date().toISOString()} (started ${startedAt}). Sources with failures: ${failed.length ? failed.map(([n, h]) => `${n} (${h.failed}: ${h.errors[0]})`).join("; ") : "none"}`);
