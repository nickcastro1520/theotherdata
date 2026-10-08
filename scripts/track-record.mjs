// Track record: rebuild the (clearly labeled) backtest, then score backtest + live leans against
// real Tiingo end-of-day prices, writing public/data/track-record.json for the site.
//   node scripts/track-record.mjs              score (needs TIINGO_API_KEY); builds the backtest if missing
//   node scripts/track-record.mjs --backtest   rebuild data/track/backtest.json from source histories
//   node scripts/track-record.mjs --daily      skip if already scored today (used by the 4-hourly workflow)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TICKERS } from "../lib/catalog.js";
import * as src from "../lib/sources.js";
import { frequency } from "../lib/analyze.js";
import * as T from "../lib/track.js";
import * as L from "../lib/track-sources.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data", "track");
const BT = join(DIR, "backtest.json");
const LIVE = join(DIR, "live.jsonl");
const OUT = join(ROOT, "public", "data", "track-record.json");
const args = process.argv.slice(2);
const today = new Date().toISOString().slice(0, 10);
const BACKTEST_FROM = "2023-01-01";
const HISTORY_FROM = "2021-06-01"; // a year+ of lookback before the first checkpoint
const PRICE_FROM = "2022-12-01";
const BENCH = "SPY";

const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
const readText = async (p) => { try { return await readFile(p, "utf8"); } catch { return ""; } };
await mkdir(DIR, { recursive: true });

if (args.includes("--daily")) {
  const prev = await readJson(OUT, null);
  if (prev?.scoredDay === today) { console.log(`track record already scored today (${today}); skipping`); process.exit(0); }
}

// ---------- backtest leans ----------
async function buildBacktest() {
  const cache = new Map();
  const once = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
  const fetchHistory = (t, sig) => {
    const p = sig.params || {};
    switch (sig.source) {
      case "fred": return once(`fred:${p.series}`, () => L.fredLong(p.series));
      case "wiki": return once(`wiki:${p.article}`, () => L.wikiLong(p.article, HISTORY_FROM));
      case "hn": return once(`hn:${p.query}`, () => L.hnWeekly(p.query, HISTORY_FROM));
      case "tsa": return once("tsa", () => L.tsaYears(Number(HISTORY_FROM.slice(0, 4))));
      case "eiaWeeklyXls": return once(`eia:${p.series}`, () => L.eiaLong(p.series));
      case "secInventory": return once(`sec:${t.ticker}:${p.concept || ""}`, () => L.secInventoryFiled(t.ticker, p.concept));
      default: return null;
    }
  };
  const coverage = {};
  const histories = {};
  for (const t of TICKERS) {
    const cov = (coverage[t.ticker] = { used: [], skipped: [] });
    histories[t.ticker] = {};
    await Promise.all(t.signals.map(async (sig) => {
      if (!T.backtestable(sig)) { cov.skipped.push({ id: sig.id, name: sig.name, why: T.SKIP_REASONS[sig.source] || "No dated public history for this source." }); return; }
      try {
        const r = await fetchHistory(t, sig);
        const series = r.series.filter((p) => p.t >= HISTORY_FROM);
        histories[t.ticker][sig.id] = { series, freq: frequency(series) };
        cov.used.push({ id: sig.id, name: sig.name, from: series[0]?.t, lagDays: sig.source === "secInventory" ? "SEC filing date" : T.lagDays(sig, frequency(series)) });
      } catch (e) {
        cov.skipped.push({ id: sig.id, name: sig.name, why: `Couldn't fetch history on the backtest run (${String(e.message).slice(0, 120)}).` });
      }
    }));
    const order = (a, b) => t.signals.findIndex((s) => s.id === a.id) - t.signals.findIndex((s) => s.id === b.id);
    cov.used.sort(order); cov.skipped.sort(order);
    console.log(`  ${t.ticker.padEnd(5)} backtest signals ${cov.used.length}/${t.signals.length}${cov.skipped.length ? ` (skipped: ${cov.skipped.map((s) => s.id).join(", ")})` : ""}`);
  }
  const checkpoints = T.monthlyCheckpoints(BACKTEST_FROM, today);
  const records = [];
  for (const d of checkpoints) for (const t of TICKERS) { const r = T.leanAsOf(t, histories[t.ticker], d); if (r) records.push(r); }
  const doc = {
    generatedAt: new Date().toISOString(),
    label: "backtest",
    note: "Reconstructed leans, not live calls. Each checkpoint uses only data points that would have been public by that date (conservative publication lags; SEC numbers by first filing date). Values are today's vintage, so later revisions to government data are included.",
    from: checkpoints[0], to: checkpoints[checkpoints.length - 1], cadence: "monthly (1st of each month)",
    minWikiBaseline: T.MIN_WIKI_BASELINE,
    coverage, records,
  };
  await writeFile(BT, JSON.stringify(doc, null, 0).replace(/\},\{"d"/g, '},\n{"d"'));
  console.log(`backtest: ${records.length} lean records across ${checkpoints.length} checkpoints`);
  return doc;
}

let backtest = await readJson(BT, null);
if (!backtest || args.includes("--backtest")) backtest = await buildBacktest();

// ---------- prices ----------
if (!src.tiingoEnabled()) { console.log("TIINGO_API_KEY not set: keeping the previous track-record.json"); process.exit(0); }
const days = Math.ceil((Date.now() - Date.parse(PRICE_FROM + "T00:00:00Z")) / 864e5) + 2;
const prices = {};
for (const tk of [BENCH, ...TICKERS.map((t) => t.ticker)]) {
  try { prices[tk] = await src.tiingoPrices({ ticker: tk, days }); }
  catch (e) { console.warn(`  prices ${tk}: ${e.message}`); }
}
if (!prices[BENCH]) console.warn("No SPY prices: vs-market columns will be empty");
const lastPriceDay = prices[BENCH]?.at(-1)?.t || Object.values(prices).map((p) => p.at(-1)?.t).sort().at(-1);

// ---------- score ----------
const liveAll = T.parseLines(await readText(LIVE));
const liveSample = T.weeklySample(liveAll);
const score = (recs) => recs.map((r) => T.scoreRecord(r, prices[r.tk], prices[BENCH]));
const btScored = score(backtest.records);
const liveScored = score(liveSample);
const compact = (r) => {
  const o = { d: r.d, lean: r.lean, mag: r.mag, tw: r.tw, hw: r.hw };
  if (r.px != null) o.px = r.px;
  if (r.sig) o.sig = r.sig;
  o.w = {};
  for (const [k, c] of Object.entries(r.w)) { o.w[k] = { r: c.r }; if (c.x != null) o.w[k].x = c.x; if (c.hit != null) o.w[k].hit = c.hit; if (c.hitX != null) o.w[k].hitX = c.hitX; }
  return o;
};
const tickers = {};
for (const t of TICKERS) {
  const bt = btScored.filter((r) => r.tk === t.ticker);
  const lv = liveScored.filter((r) => r.tk === t.ticker);
  const lvAll = liveAll.filter((r) => r.tk === t.ticker);
  tickers[t.ticker] = {
    name: t.name,
    signals: t.signals.length,
    backtest: { signalsUsed: backtest.coverage[t.ticker]?.used.length || 0, records: bt.length, summary: T.aggregate(bt), history: bt.map(compact) },
    live: { snapshots: lvAll.length, sampled: lv.length, startedOn: lvAll[0]?.d || null, latest: lvAll.at(-1) ? { d: lvAll.at(-1).d, lean: lvAll.at(-1).lean, mag: lvAll.at(-1).mag, px: lvAll.at(-1).px } : null, summary: T.aggregate(lv), history: lv.map(compact) },
  };
}
const startedOn = liveAll.map((r) => r.d).sort()[0] || null;
const out = {
  generatedAt: new Date().toISOString(),
  scoredDay: today,
  pricesThrough: lastPriceDay,
  priceSource: { name: "Tiingo end-of-day prices (split- and dividend-adjusted)", url: "https://www.tiingo.com/" },
  benchmark: { ticker: BENCH, name: "S&P 500 (SPY ETF)" },
  windows: T.WINDOWS, primary: T.PRIMARY_WINDOW,
  rules: {
    entry: "Close on the first trading day after the lean date (no same-day peeking).",
    exit: "Close on the first trading day at least N calendar days after entry.",
    hit: "Tailwind = right if the stock rose; headwind = right if it fell. 'Vs market' compares the stock's move with SPY over the same days.",
    noCall: "Mixed and quiet leans aren't calls, so they aren't scored.",
    liveSampling: "Live leans are logged daily; we score the first snapshot of each week per stock so one call isn't counted seven times.",
  },
  live: {
    startedOn, snapshots: liveAll.length, sampled: liveSample.length, lastSnapshot: liveAll.at(-1)?.at || null,
    firstResultsAfter: startedOn ? T.addDays(startedOn, 15) : null,
    summary: T.aggregate(liveScored),
  },
  backtest: {
    from: backtest.from, to: backtest.to, cadence: backtest.cadence, generatedAt: backtest.generatedAt, note: backtest.note,
    minWikiBaseline: backtest.minWikiBaseline,
    records: btScored.length, coverage: backtest.coverage, summary: T.aggregate(btScored),
  },
  tickers,
};
await writeFile(OUT, JSON.stringify(out));
const s = out.backtest.summary[T.PRIMARY_WINDOW];
console.log(`scored: backtest ${btScored.length} records (1m: ${s.hits}/${s.calls} direction, ${s.vsMktHits}/${s.vsMktCalls} vs SPY), live ${liveAll.length} snapshots (${liveSample.length} sampled), prices through ${lastPriceDay}`);
