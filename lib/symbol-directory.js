// Builds the US-listed symbol directory (common stocks, ADRs, MLP units, ETFs) from free official files:
//   * Nasdaq Trader symbol directory: nasdaqlisted.txt (Nasdaq) + otherlisted.txt (NYSE, NYSE American, NYSE Arca, Cboe, IEX, TXSE...)
//   * SEC EDGAR company_tickers_exchange.json: adds the CIK, and SEC-reporting OTC companies (tagged "OTC")
// Pure parsing lives here so it can be unit-tested; scripts/build-symbols.mjs does the fetching and writing.
import { get } from "./http.js";

export const NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
export const OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
export const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json";

// Not common equity: warrants, rights, SPAC units, preferreds, notes/debt. (ETFs are kept.)
const NON_COMMON = [
  /\bwarrants?\b/i,
  /\brights?\b/i,
  /\bpreferred\b/i,
  /\bpreference shares?\b/i,
  /\bnotes?\b(\s+due|\s*\d{4})/i,
  /\bsenior notes?\b/i,
  /\bdebentures?\b/i,
  /\bsubordinated\b/i,
  /\d+(\.\d+)?%/,
];
const UNITS = /\bunits?\b/i; // SPAC units ("Units, each consisting of...")
const ALLOW_UNITS = /\bcommon units?\b|\blimited partner|\blimited liability company interests|\bunits representing\b/i;

export function isCommonEquity(name, isEtf) {
  if (isEtf) return true;
  const s = String(name || "");
  if (NON_COMMON.some((re) => re.test(s))) return false;
  if (UNITS.test(s) && !ALLOW_UNITS.test(s)) return false;
  return true;
}

// "Brown Forman Inc Class B Common Stock" -> "Brown Forman Inc (Class B)"
// "ATA Creativity Global - American Depositary Shares, each representing..." -> "ATA Creativity Global (ADR)"
export function cleanName(raw, isEtf) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (isEtf) return s;
  const adr = /american deposit[ao]ry|\bADSs?\b|\bADRs?\b/i.test(s);
  const cls = (s.match(/\bClass ([A-Z])\b/) || [])[1];
  s = s.split(/ - /)[0];
  s = s
    .replace(/\b(American Deposit[ao]ry Shares?|ADSs?|ADRs?)\b.*$/i, "")
    .replace(/\b(each representing|representing)\b.*$/i, "")
    .replace(/\bClass [A-Z]\b/g, "")
    .replace(/\b(New )?(Common Stock|Common Shares|Ordinary Shares|Common Units?|Capital Stock|Shares of Beneficial Interest|Subordinate Voting Shares|Voting Shares|Registered Shares|Common Share|Ordinary Share)\b.*$/i, "")
    .replace(/[\s,;-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) s = String(raw).trim();
  if (cls) s += ` (Class ${cls})`;
  else if (adr) s += " (ADR)";
  return s;
}

export const normTicker = (t) => String(t || "").trim().toUpperCase().replace(/[-/ ]/g, ".");
const TICKER_OK = /^[A-Z]{1,6}(\.[A-Z]{1,2})?$/;

function parsePipe(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l && !l.startsWith("File Creation Time"));
  const head = (lines.shift() || "").split("|");
  return lines.map((l) => { const c = l.split("|"); return Object.fromEntries(head.map((h, i) => [h.trim(), (c[i] || "").trim()])); });
}

export function parseNasdaqListed(text) {
  const out = [];
  for (const r of parsePipe(text)) {
    if (!r.Symbol || r["Test Issue"] === "Y") continue;
    const t = normTicker(r.Symbol), etf = r.ETF === "Y";
    if (!TICKER_OK.test(t) || !isCommonEquity(r["Security Name"], etf)) continue;
    out.push({ t, n: cleanName(r["Security Name"], etf), x: "Q", k: etf ? "e" : "s" });
  }
  return out;
}

export function parseOtherListed(text) {
  const out = [];
  for (const r of parsePipe(text)) {
    const sym = r["ACT Symbol"];
    if (!sym || r["Test Issue"] === "Y" || /[$=^#*]/.test(sym)) continue;
    const t = normTicker(sym), etf = r.ETF === "Y";
    if (!TICKER_OK.test(t) || !isCommonEquity(r["Security Name"], etf)) continue;
    out.push({ t, n: cleanName(r["Security Name"], etf), x: r.Exchange || "?", k: etf ? "e" : "s" });
  }
  return out;
}

// SEC names are often ALL CAPS ("NVIDIA CORP"); make them readable without inventing anything.
function titleCase(s) {
  if (/[a-z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s(&./-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

export function mergeDirectory({ nasdaq = [], other = [], sec = null }) {
  const byTicker = new Map();
  for (const r of [...nasdaq, ...other]) if (!byTicker.has(r.t)) byTicker.set(r.t, { ...r, c: 0 });
  let otc = 0;
  if (sec?.fields && Array.isArray(sec.data)) {
    const fi = Object.fromEntries(sec.fields.map((f, i) => [f, i]));
    for (const row of sec.data) {
      const t = normTicker(row[fi.ticker]), cik = Number(row[fi.cik]) || 0, exch = row[fi.exchange];
      if (!t || !cik) continue;
      const hit = byTicker.get(t);
      if (hit) { if (!hit.c) hit.c = cik; continue; }
      if (exch === "OTC" && TICKER_OK.test(t)) {
        const name = titleCase(String(row[fi.name] || t).trim());
        if (!isCommonEquity(name, false)) continue;
        byTicker.set(t, { t, n: name, x: "O", k: "s", c: cik });
        otc++;
      }
    }
  }
  const rows = [...byTicker.values()].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0)).map((r) => [r.t, r.n, r.x, r.c || 0, r.k]);
  const stats = { total: rows.length, listed: rows.length - otc, stocks: rows.filter((r) => r[4] === "s").length, etfs: rows.filter((r) => r[4] === "e").length, withCik: rows.filter((r) => r[3]).length, otc };
  return { rows, stats };
}

export async function fetchDirectory() {
  const [nasdaqTxt, otherTxt] = await Promise.all([
    get(NASDAQ_LISTED_URL, { type: "text", timeout: 30000 }),
    get(OTHER_LISTED_URL, { type: "text", timeout: 30000 }),
  ]);
  let sec = null, secError = null;
  try { sec = await get(SEC_TICKERS_URL, { timeout: 30000 }); } catch (e) { secError = String(e.message || e).slice(0, 120); }
  const nasdaq = parseNasdaqListed(nasdaqTxt), other = parseOtherListed(otherTxt);
  const { rows, stats } = mergeDirectory({ nasdaq, other, sec });
  const fileTime = (String(nasdaqTxt).match(/File Creation Time: (\d{10}:\d{2})/) || [])[1] || null;
  return {
    generatedAt: new Date().toISOString(),
    sources: [
      { name: "Nasdaq Trader symbol directory (nasdaqlisted.txt)", url: NASDAQ_LISTED_URL, fileCreated: fileTime },
      { name: "Nasdaq Trader symbol directory (otherlisted.txt)", url: OTHER_LISTED_URL },
      { name: "SEC EDGAR company_tickers_exchange.json", url: SEC_TICKERS_URL, ...(secError ? { error: secError } : {}) },
    ],
    note: "US-listed common stocks, ADRs, and ETFs (test issues, warrants, rights, units, preferreds, and notes removed), plus SEC-reporting OTC companies tagged x=O.",
    exchanges: { Q: "Nasdaq", N: "NYSE", A: "NYSE American", P: "NYSE Arca", Z: "Cboe BZX", V: "IEX", F: "TXSE", M: "NYSE Texas", O: "OTC" },
    stats,
    fields: ["t", "n", "x", "c", "k"],
    rows,
  };
}
