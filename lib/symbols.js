// Server-side access to the symbol directory (public/data/symbols.json) using the same ranking as the browser.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "../public/symbol-search.js";
import { TICKERS } from "./catalog.js";
import { TICKER_ALIASES } from "./sources.js";

const S = globalThis.TODSymbolSearch;
export const CURATED = new Set(TICKERS.map((t) => t.ticker));

let cache = null;
function load() {
  if (cache) return cache;
  // Bundled into the functions via vercel.json "includeFiles"; try the module-relative path first, then cwd.
  const paths = [new URL("../public/data/symbols.json", import.meta.url), join(process.cwd(), "public/data/symbols.json")];
  let doc = null, lastErr = null;
  for (const p of paths) {
    try { doc = JSON.parse(readFileSync(p, "utf8")); break; } catch (e) { lastErr = e; }
  }
  if (!doc) throw new Error(`Symbol directory unavailable (${String(lastErr?.code || lastErr?.message || "missing").slice(0, 60)})`);
  const items = S.prepare(doc);
  cache = { doc, items, byTicker: new Map(items.map((it) => [it.t, it])) };
  return cache;
}

export function directoryInfo() {
  const { doc } = load();
  return { generatedAt: doc.generatedAt, count: doc.rows.length, stats: doc.stats };
}

/** Exact ticker lookup: { symbol, name, exchange, cik, kind, curated } or null. */
export function findTicker(ticker) {
  let c;
  try { c = load(); } catch { return null; }
  const t = String(ticker || "").trim().toUpperCase().replace(/[-/ ]/g, ".");
  const it = c.byTicker.get(t);
  if (!it) return null;
  return { symbol: it.t, name: it.n, exchange: S.EXCHANGES[it.x] || it.x, exchangeCode: it.x, cik: it.c || null, kind: it.k === "e" ? "etf" : "stock", curated: CURATED.has(it.t) };
}

export function searchDirectory(q, limit = 8) {
  const { items } = load();
  return S.search(items, q, { limit, curated: CURATED, aliases: TICKER_ALIASES });
}
