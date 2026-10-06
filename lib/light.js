// Light signal pack for any US ticker that isn't in the curated deep set.
// Uses Finnhub (profile/quote/news), Tiingo (history), Wikipedia pageviews, Hacker News, and SEC inventory when available.
import * as src from "./sources.js";
import { analyze, summarize } from "./analyze.js";
import { aiSummary } from "./explain.js";

const stripCorp = (name) => String(name || "")
  .replace(/\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|Company|PLC|Class [A-Z]|Ordinary Shares)\b/gi, "")
  .replace(/[,.-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

async function resolveWikiTitle(name, ticker) {
  const tries = [stripCorp(name), name, ticker].filter(Boolean);
  for (const q of tries) {
    try {
      const titles = await src.wikiSearch({ q });
      if (titles?.length) {
        // Prefer a title that shares a word with the company name
        const words = new Set(stripCorp(name).toLowerCase().split(/\s+/).filter((w) => w.length > 2));
        const best = titles.find((t) => t.toLowerCase().split(/[\s(_]/).some((w) => words.has(w))) || titles[0];
        return best;
      }
    } catch {}
  }
  return null;
}

function lightSignalDefs(ticker, name, wikiTitle) {
  const defs = [];
  if (wikiTitle) {
    defs.push({
      id: "wiki",
      name: `Wikipedia curiosity: ${wikiTitle}`,
      metric: `Daily views of the English Wikipedia article for ${wikiTitle}`,
      what: "How many people open this company's Wikipedia page each day. A rough gauge of public curiosity — not sales.",
      why: `Spikes can follow news, product launches, or controversies involving ${name}. We show it as context because curiosity cuts both ways.`,
      unit: "views",
      polarity: 0,
      threshold: 12,
      compare: "recent",
      source: "wiki",
      sourceName: "Wikipedia pageviews (Wikimedia)",
      params: { article: wikiTitle.replace(/ /g, "_") },
      up: "more people are looking the company up",
      down: "fewer people are looking the company up",
    });
  }
  defs.push({
    id: "hn",
    name: "Hacker News chatter",
    metric: `Hacker News stories per week mentioning “${ticker}” or “${stripCorp(name).split(" ")[0] || ticker}”`,
    what: "How often the ticker or company shows up in stories on Hacker News, the news board many software engineers read.",
    why: `Developer and tech-press chatter is a soft read on attention around ${name}. More stories can mean excitement or trouble — we treat a clear move as a mild signal either way.`,
    unit: "stories",
    polarity: 1,
    threshold: 25,
    compare: "recent",
    source: "hn",
    sourceName: "Hacker News (Algolia search API)",
    params: { query: ticker },
    up: "tech chatter about the company is picking up",
    down: "tech chatter about the company has quieted",
  });
  defs.push({
    id: "inventory",
    name: "Reported inventory (SEC)",
    metric: `${name}'s reported inventory, from quarterly SEC filings`,
    what: "The inventory line from the company's latest 10-Q/10-K (or 20-F) XBRL filing on SEC EDGAR.",
    why: `Rising inventory can mean stocking up for demand — or products waiting for buyers. For ${name} we read a sharp rise as a possible headwind and a drop as a possible tailwind.`,
    unit: "usdB",
    polarity: -1,
    threshold: 10,
    compare: "yoy",
    source: "secInventory",
    sourceName: "SEC EDGAR (company XBRL)",
    params: { ticker },
    up: "the company is holding more inventory than a year ago",
    down: "the company is holding less inventory than a year ago",
  });
  return defs;
}

async function runOne(sig, company) {
  const base = { id: sig.id, name: sig.name, metric: sig.metric, what: sig.what, why: sig.why, unit: sig.unit, polarity: sig.polarity, threshold: sig.threshold, compare: sig.compare, source: { name: sig.sourceName } };
  try {
    const params = sig.source === "secInventory" ? { ticker: sig.params.ticker } : sig.params;
    const r = await src[sig.source](params);
    const a = analyze(sig, r.series, company);
    return { ...base, source: { name: sig.sourceName, url: r.url, note: r.note }, fetchedAt: new Date().toISOString(), ...a };
  } catch (e) {
    return { ...base, status: "error", error: String(e.message || e).slice(0, 200), fetchedAt: new Date().toISOString(), now: `We couldn't fetch this data (${String(e.message || e).slice(0, 120)}). Rather than guess, we're leaving it blank.` };
  }
}

async function runMarket(ticker) {
  const out = { status: "ok", fetchedAt: new Date().toISOString() };
  if (src.tiingoEnabled()) {
    try {
      out.history = await src.tiingoPrices({ ticker });
      out.historySource = { name: "Tiingo (end-of-day, adjusted)", url: "https://www.tiingo.com/" };
      if (out.history.length > 1) {
        const first = out.history[0].v, last = out.history.at(-1).v;
        out.yearPct = ((last - first) / first) * 100;
      }
    } catch (e) { out.historyError = String(e.message || e).slice(0, 120); }
  }
  if (src.finnhubEnabled()) {
    try {
      out.quote = await src.finnhubQuote({ ticker });
      out.quoteSource = { name: "Finnhub", url: "https://finnhub.io/" };
    } catch (e) { out.quoteError = String(e.message || e).slice(0, 120); }
  }
  if (!out.quote && out.history?.length > 1) {
    const h = out.history, a = h.at(-1), b = h.at(-2);
    out.quote = { price: a.v, change: a.v - b.v, changePct: ((a.v - b.v) / b.v) * 100, at: a.t + "T21:00:00Z", eod: true };
    out.quoteSource = out.historySource;
  }
  if (!out.quote && !out.history) return { status: "error", error: "No price data", fetchedAt: out.fetchedAt };
  return out;
}

/** Resolve a query to a US common-stock symbol + build a light pack. */
export async function buildLightPack(query) {
  if (!src.finnhubEnabled()) {
    const err = new Error("Live lookup needs FINNHUB_API_KEY on the server.");
    err.code = "no_provider";
    throw err;
  }
  const q = String(query || "").trim();
  if (!q || q.length > 64) {
    const err = new Error("Enter a ticker or company name.");
    err.code = "bad_query";
    throw err;
  }

  let ticker = q.toUpperCase().replace(/[^A-Z.]/g, "");
  let profile = null;
  // Exact ticker attempt first when it looks like one
  if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker)) {
    try { profile = await src.finnhubProfile({ ticker }); } catch {}
  }
  if (!profile) {
    const hits = await src.finnhubSearch({ q, max: 8 });
    if (!hits.length) {
      const err = new Error(`No US common stock matched “${q}”. Try a ticker like GOOGL or META.`);
      err.code = "not_found";
      throw err;
    }
    // Prefer exact symbol match, else first hit
    const exact = hits.find((h) => h.symbol.toUpperCase() === q.toUpperCase()) || hits[0];
    ticker = exact.symbol.toUpperCase();
    try { profile = await src.finnhubProfile({ ticker }); }
    catch {
      profile = { ticker, name: exact.name, exchange: "", industry: "", weburl: "" };
    }
  }

  const name = profile.name || ticker;
  const wikiTitle = await resolveWikiTitle(name, ticker);
  const defs = lightSignalDefs(ticker, name, wikiTitle);

  const [signals, market, newsArticles, hnStories, sec] = await Promise.all([
    Promise.all(defs.map((d) => runOne(d, name))),
    runMarket(ticker),
    src.finnhubNews({ ticker }).catch(() => []),
    src.hnStories({ query: ticker, must: `\\b${ticker}\\b` }).catch(() => []),
    src.secFilings({ ticker }).catch((e) => ({ status: "error", error: String(e.message || e).slice(0, 120) })),
  ]);

  const summary = summarize(name, ticker, signals);
  let ai = null;
  try { ai = await aiSummary(name, ticker, signals); } catch {}
  if (ai?.text) summary.impact = { ...summary.impact, text: ai.text, source: "ai" };

  const news = {
    status: newsArticles.length ? "ok" : "empty",
    fetchedAt: new Date().toISOString(),
    source: { name: "Finnhub company news", url: "https://finnhub.io/" },
    articles: newsArticles,
    hn: hnStories,
  };

  return {
    ticker,
    name,
    sector: profile.industry || "US stock",
    exchange: profile.exchange || "",
    pack: "light",
    packNote: "Light signal pack: price, news, and a few generic public signals that work for most US stocks. Curated tickers on the home page have richer, company-specific signals.",
    updatedAt: new Date().toISOString(),
    summary,
    ai,
    signals,
    news,
    sec: sec?.status ? sec : { status: "ok", fetchedAt: new Date().toISOString(), ...sec },
    market,
    profile: { weburl: profile.weburl || "", country: profile.country || "" },
  };
}

export async function searchSymbols(q) {
  if (!src.finnhubEnabled()) return [];
  return src.finnhubSearch({ q, max: 8 });
}
