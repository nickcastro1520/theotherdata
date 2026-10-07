// Light signal pack for any US ticker that isn't in the curated deep set.
// Uses Finnhub (profile/quote/news), Tiingo (history), Wikipedia pageviews, Hacker News, and SEC inventory when available.
import * as src from "./sources.js";
import { analyze, summarize } from "./analyze.js";
import { aiSummary } from "./explain.js";
import { searchDirectory } from "./symbols.js";

const stripCorp = (name) => String(name || "")
  .replace(/\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|Company|PLC|Class [A-Z]|Ordinary Shares)\b/gi, "")
  .replace(/[,.-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Only accept a Wikipedia article that is clearly about the company: the title must be the company's core name,
// optionally followed by corporate words ("Inc.", "(company)"). One-word names need a corporate word, so
// "Lemonade" (the drink) or "Apple" (the fruit) never stand in for a company. No match -> no Wikipedia signal.
const wnorm = (s) => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const CORP_WORDS = new Set(["inc", "incorporated", "corp", "corporation", "company", "co", "ltd", "limited", "plc", "holdings", "holding", "group", "sa", "nv", "ag", "llc", "lp", "se", "the"]);
export function wikiTitleMatches(title, name) {
  const core = wnorm(stripCorp(String(name || "").replace(/\((Class [A-Z]|ADR)\)/gi, "")));
  if (!core) return false;
  const nt = wnorm(title);
  if (!nt.startsWith(core)) return false;
  const rest = nt.slice(core.length).trim().split(" ").filter(Boolean);
  if (rest.some((w) => !CORP_WORDS.has(w))) return false;
  if (core.split(" ").length < 2 && !rest.length) return false;
  return true;
}

// A redirect target is kept only if it still names the company ("Rocket Lab Corporation" -> "Rocket Lab" is fine;
// "Lemonade Inc." -> "Lemonade Tycoon", a video game, is rejected).
export function wikiCanonicalOk(canon, name) {
  if (wikiTitleMatches(canon, name)) return true;
  const core = wnorm(stripCorp(String(name || "").replace(/\((Class [A-Z]|ADR)\)/gi, "")));
  const nc = wnorm(canon);
  return nc.split(" ").length >= 2 && (core + " ").startsWith(nc + " ");
}

async function resolveWikiTitle(name) {
  const full = String(name || "").replace(/\s*\((Class [A-Z]|ADR)\)/gi, "").trim();
  const tries = [...new Set([full, stripCorp(full)].filter(Boolean))];
  const checked = new Set();
  for (const q of tries) {
    let titles = [];
    try { titles = await src.wikiSearch({ q }); } catch { continue; }
    for (const t of titles || []) {
      if (checked.has(t) || !wikiTitleMatches(t, full)) continue;
      checked.add(t);
      let canon = null;
      try { canon = await src.wikiCanonical({ title: t }); } catch { continue; }
      if (canon && wikiCanonicalOk(canon, full)) return canon;
    }
  }
  return null;
}

function lightSignalDefs(ticker, name, wikiTitle, { etf = false, cik = null } = {}) {
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
  if (etf) return defs; // funds don't report inventory
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
    params: { ticker, cik },
    up: "the company is holding more inventory than a year ago",
    down: "the company is holding less inventory than a year ago",
  });
  return defs;
}

async function runOne(sig, company) {
  const base = { id: sig.id, name: sig.name, metric: sig.metric, what: sig.what, why: sig.why, unit: sig.unit, polarity: sig.polarity, threshold: sig.threshold, compare: sig.compare, source: { name: sig.sourceName } };
  try {
    const params = sig.source === "secInventory" ? { ticker: sig.params.ticker, cik: sig.params.cik } : sig.params;
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

// Best directory match for a query (ticker or company name). Fuzzy hits only count when nothing better exists.
function directoryMatch(q, aliased) {
  try {
    const hits = searchDirectory(aliased || q, 3);
    const top = hits[0];
    if (top && top.tier <= 4) return top;
    return top || null;
  } catch { return null; }
}

/** Resolve a query to a US-listed symbol (via the symbol directory, then Finnhub) + build a light pack. */
export async function buildLightPack(query) {
  const q = String(query || "").trim();
  if (!q || q.length > 64) {
    const err = new Error("Enter a ticker or company name.");
    err.code = "bad_query";
    throw err;
  }

  const aliased = src.aliasTicker(q);
  const entry = directoryMatch(q, aliased);
  let ticker = (aliased || q.toUpperCase().replace(/[-/]/g, ".").replace(/[^A-Z.]/g, "")).toUpperCase();
  let profile = null;

  if (entry && (entry.tier <= 4 || !src.finnhubEnabled())) {
    ticker = entry.symbol;
    if (src.finnhubEnabled()) { try { profile = await src.finnhubProfile({ ticker }); } catch {} }
    profile = {
      ticker,
      name: profile?.name || entry.name,
      exchange: entry.exchange || profile?.exchange || "",
      industry: profile?.industry || (entry.kind === "etf" ? "ETF" : ""),
      weburl: profile?.weburl || "",
      country: profile?.country || "",
    };
  } else {
    if (!src.finnhubEnabled()) {
      const err = new Error(`No US-listed stock or ETF matched “${q}”. Try a ticker like RBLX, RKLB, or LMND.`);
      err.code = "not_found";
      throw err;
    }
    // Alias or ticker-shaped query → profile first
    if (aliased || /^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker)) {
      try { profile = await src.finnhubProfile({ ticker: aliased || ticker }); ticker = (aliased || ticker); } catch {}
    }
    if (!profile) {
      const hits = await src.finnhubSearch({ q, max: 8 });
      if (!hits.length) {
        if (entry) {
          ticker = entry.symbol;
          profile = { ticker, name: entry.name, exchange: entry.exchange, industry: entry.kind === "etf" ? "ETF" : "", weburl: "" };
        } else {
          const err = new Error(`No US-listed stock or ETF matched “${q}”. Try a ticker like RBLX, RKLB, or LMND.`);
          err.code = "not_found";
          throw err;
        }
      } else {
        const exact = hits.find((h) => h.symbol.toUpperCase() === q.toUpperCase() || (aliased && h.symbol.toUpperCase() === aliased)) || hits[0];
        ticker = exact.symbol.toUpperCase();
        try { profile = await src.finnhubProfile({ ticker }); }
        catch {
          profile = { ticker, name: exact.name, exchange: "", industry: "", weburl: "" };
        }
      }
    }
  }
  const dir = entry && entry.symbol === ticker ? entry : null;
  const etf = dir?.kind === "etf";
  const cik = dir?.cik || null;

  const name = profile.name || ticker;
  const wikiTitle = await resolveWikiTitle(name);
  const defs = lightSignalDefs(ticker, name, wikiTitle, { etf, cik });

  const [signals, market, newsArticles, hnStories, sec] = await Promise.all([
    Promise.all(defs.map((d) => runOne(d, name))),
    runMarket(ticker),
    src.finnhubNews({ ticker }).catch(() => []),
    src.hnStories({ query: ticker, must: `\\b${ticker}\\b` }).catch(() => []),
    (dir && !cik) ? Promise.resolve(noSec(etf)) : src.secFilings({ ticker, cik }).catch((e) => (/no CIK/i.test(String(e.message)) ? noSec(etf) : { status: "error", error: String(e.message || e).slice(0, 120) })),
  ]);

  const summary = summarize(name, ticker, signals);
  // Skip Gemini on light packs by default so /api/lookup stays under Vercel time limits.
  let ai = null;
  if (process.env.LIGHT_PACK_AI === "1") {
    try { ai = await aiSummary(name, ticker, signals); } catch {}
    if (ai?.text) summary.impact = { ...summary.impact, text: ai.text, source: "ai" };
  }

  const news = {
    status: newsArticles.length ? "ok" : "empty",
    fetchedAt: new Date().toISOString(),
    source: { name: "Finnhub company news", url: "https://finnhub.io/" },
    articles: newsArticles,
    hn: hnStories,
  };

  // Be upfront when our free sources have little to say about this ticker.
  const usable = signals.filter((x) => ["ok", "tracking", "insufficient"].includes(x.status)).length;
  const hasPrice = market.status === "ok" && Boolean(market.quote);
  const hasNews = newsArticles.length > 0 || hnStories.length > 0;
  const hasSec = Boolean(sec && !sec.status);
  const missing = [!hasPrice && "price data", !usable && "signal data", !hasNews && "recent news", !hasSec && "SEC filings"].filter(Boolean);
  const limited = !hasPrice || (!usable && !hasNews);
  const dataLevel = limited ? "limited" : "ok";
  const dataNote = limited
    ? `Limited data for this stock. Our free sources returned no ${missing.join(", ").replace(/, ([^,]*)$/, " or $1")} for ${ticker}. We only show what we could verify; nothing here is estimated.`
    : missing.length ? `Some data is unavailable for ${ticker}: no ${missing.join(", ").replace(/, ([^,]*)$/, " or $1")} from our free sources.` : "";

  return {
    ticker,
    name,
    sector: profile.industry || (etf ? "ETF" : "US stock"),
    exchange: profile.exchange || "",
    exchangeCode: dir?.exchangeCode || "",
    kind: etf ? "etf" : "stock",
    cik,
    dataLevel,
    dataNote,
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

function noSec(etf) {
  return { status: "none", fetchedAt: new Date().toISOString(), message: etf ? "Funds like this ETF don't file company reports (10-K, 10-Q, Form 4) on SEC EDGAR, so there's no filings panel." : "We couldn't find an SEC EDGAR company record linked to this ticker (common for some foreign listings and recent IPOs)." };
}

export async function searchSymbols(q) {
  if (!src.finnhubEnabled()) return [];
  return src.finnhubSearch({ q, max: 8 });
}
