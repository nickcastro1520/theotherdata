#!/usr/bin/env node
// Correlation scout: scan free public series vs curated ticker prices (Tiingo) for hidden-signal candidates.
// Usage:
//   node scripts/correlation-scout.mjs
//   node scripts/correlation-scout.mjs --fast   (fewer candidates / tickers)
// Writes public/data/scout.json and reports/correlation-scout.md. Never prints API keys.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TICKERS } from "../lib/catalog.js";
import * as src from "../lib/sources.js";
import { CANDIDATES, SECTOR_PROXIES } from "../lib/scout-candidates.js";
import { resampleLast, pctReturns, bestLead, pickFreq } from "../lib/correlate.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_JSON = join(ROOT, "public", "data", "scout.json");
const OUT_MD = join(ROOT, "reports", "correlation-scout.md");
const fast = process.argv.includes("--fast");
const startedAt = new Date().toISOString();

const fetchSeries = async (c) => {
  if (c.source === "fred") return src.fred(c.params);
  if (c.source === "wiki") return src.wiki(c.params);
  if (c.source === "pypi") return src.pypi(c.params);
  if (c.source === "eiaWeeklyXls") return src.eiaWeeklyXls(c.params);
  throw new Error(`Unknown source ${c.source}`);
};

const curated = TICKERS.map((t) => t.ticker);
const wantTickers = new Set();
for (const c of CANDIDATES) for (const t of c.tickers) if (curated.includes(t)) wantTickers.add(t);
if (fast) {
  // Keep a representative subset when iterating locally
  for (const t of [...wantTickers]) if (!["NVDA", "XOM", "AMZN", "DAL", "HD", "TSLA", "F"].includes(t)) wantTickers.delete(t);
}

console.log(`Correlation scout starting (${wantTickers.size} tickers, ${CANDIDATES.length} candidates)${fast ? " [fast]" : ""}…`);

// Prices: prefer Tiingo; fall back to cached public/data history
const prices = {};
for (const tk of wantTickers) {
  try {
    if (src.tiingoEnabled()) {
      prices[tk] = await src.tiingoPrices({ ticker: tk, days: 900 });
      console.log(`  price ${tk}: Tiingo ${prices[tk].length} pts`);
    } else {
      throw new Error("no tiingo");
    }
  } catch {
    try {
      const d = JSON.parse(await readFile(join(ROOT, "public", "data", "tickers", `${tk}.json`), "utf8"));
      prices[tk] = d.market?.history || [];
      console.log(`  price ${tk}: cache ${prices[tk].length} pts`);
    } catch {
      console.warn(`  price ${tk}: unavailable`);
    }
  }
}

// Optional sector proxies
const sectors = {};
if (src.tiingoEnabled() && !fast) {
  for (const s of SECTOR_PROXIES) {
    try {
      sectors[s.ticker] = { label: s.label, history: await src.tiingoPrices({ ticker: s.ticker, days: 900 }) };
      console.log(`  sector ${s.ticker}: ${sectors[s.ticker].history.length} pts`);
    } catch (e) {
      console.warn(`  sector ${s.ticker}: ${e.message}`);
    }
  }
}

const results = [];
const failures = [];

for (const c of CANDIDATES) {
  let series;
  try {
    const r = await fetchSeries(c);
    series = r.series;
    if (!series?.length) throw new Error("empty series");
    console.log(`  series ${c.id}: ${series.length} pts`);
  } catch (e) {
    failures.push({ id: c.id, error: String(e.message || e).slice(0, 160) });
    console.warn(`  series ${c.id}: FAIL ${e.message}`);
    continue;
  }

  const targets = [
    ...c.tickers.filter((t) => prices[t]?.length > 40).map((t) => ({ key: t, label: t, history: prices[t], kind: "ticker" })),
  ];
  // Also test vs a matching sector when available
  if (sectors.XLK && ["NVDA", "AAPL", "MSFT", "AMZN"].some((t) => c.tickers.includes(t))) {
    targets.push({ key: "XLK", label: sectors.XLK.label, history: sectors.XLK.history, kind: "sector" });
  }
  if (sectors.XLE && c.tickers.includes("XOM")) {
    targets.push({ key: "XLE", label: sectors.XLE.label, history: sectors.XLE.history, kind: "sector" });
  }
  if (sectors.XLY && ["TSLA", "HD", "MCD", "AMZN", "DIS"].some((t) => c.tickers.includes(t))) {
    targets.push({ key: "XLY", label: sectors.XLY.label, history: sectors.XLY.history, kind: "sector" });
  }

  for (const tgt of targets) {
    const freq = pickFreq(c.freq, tgt.history.length);
    const sig = resampleLast(series, freq);
    const px = resampleLast(tgt.history, freq);
    const sigRet = pctReturns(sig);
    const pxRet = pctReturns(px);
    const hit = bestLead(sigRet, pxRet, c.freq === "monthly" ? 2 : 3);
    if (!hit) continue;
    const abs = Math.abs(hit.spearman);
    const agrees = c.polarityHint === 0 || c.polarityHint == null
      ? null
      : (Math.sign(hit.spearman) === Math.sign(c.polarityHint));
    const spuriousRisk = abs >= 0.55 && (c.polarityHint === 0 || agrees === false)
      ? "high"
      : abs >= 0.45 && hit.n < 24
      ? "elevated"
      : abs >= 0.35
      ? "moderate"
      : "low";
    results.push({
      candidateId: c.id,
      name: c.name,
      source: c.source,
      sourceParams: c.params,
      unit: c.unit,
      why: c.why,
      target: tgt.key,
      targetLabel: tgt.label,
      targetKind: tgt.kind,
      freq,
      spearman: Math.round(hit.spearman * 1000) / 1000,
      pearson: hit.pearson != null ? Math.round(hit.pearson * 1000) / 1000 : null,
      absSpearman: Math.round(abs * 1000) / 1000,
      leadPeriods: hit.lead,
      n: hit.n,
      window: { from: hit.from, to: hit.to },
      pValue: hit.p != null ? Math.round(hit.p * 10000) / 10000 : null,
      polarityHint: c.polarityHint,
      agreesWithHint: agrees,
      spuriousRisk,
      wireable: ["fred", "wiki", "pypi", "eiaWeeklyXls"].includes(c.source),
    });
  }
}

results.sort((a, b) => b.absSpearman - a.absSpearman || (a.pValue ?? 1) - (b.pValue ?? 1));

// Rank a shortlist: prefer economically agreed, wireable, |ρ|>=0.25, n>=18
const shortlist = results.filter((r) => r.wireable && r.n >= 18 && r.absSpearman >= 0.25)
  .filter((r) => r.agreesWithHint !== false || r.spuriousRisk === "low" || r.spuriousRisk === "moderate")
  .slice(0, 20);

const topReport = results.slice(0, 15);

const doc = {
  generatedAt: startedAt,
  method: "Spearman rank correlation on period returns (weekly or monthly). Lead 0–2/3 periods tested (signal leading price). Prices from Tiingo when keyed; public series from FRED/EIA/Wikipedia/PyPI. Educational scan — correlation ≠ causation; multiple-testing risk is real.",
  providers: { tiingo: src.tiingoEnabled(), fred: true },
  failures,
  top: topReport,
  shortlist,
  allCount: results.length,
};

await mkdir(join(ROOT, "public", "data"), { recursive: true });
await mkdir(join(ROOT, "reports"), { recursive: true });
await writeFile(OUT_JSON, JSON.stringify(doc, null, 2));

const lines = [];
lines.push(`# Correlation scout report`);
lines.push(``);
lines.push(`Generated: ${startedAt}`);
lines.push(``);
lines.push(doc.method);
lines.push(``);
lines.push(`Scanned ${results.length} pairings. Failures: ${failures.length}.`);
lines.push(``);
lines.push(`## Top pairings by |Spearman ρ|`);
lines.push(``);
lines.push(`| Signal | Target | ρ (Spearman) | Lead | n | Window | Spurious risk | Wireable |`);
lines.push(`|---|---|---:|---:|---:|---|---|---|`);
for (const r of topReport) {
  lines.push(`| ${r.name} | ${r.targetLabel} | ${r.spearman} | ${r.leadPeriods} | ${r.n} | ${r.window.from} → ${r.window.to} | ${r.spuriousRisk} | ${r.wireable ? "yes" : "no"} |`);
}
lines.push(``);
lines.push(`## Shortlist for product (plausible + wireable)`);
lines.push(``);
for (const r of shortlist.slice(0, 12)) {
  lines.push(`### ${r.name} → ${r.targetLabel}`);
  lines.push(`- Spearman ρ=${r.spearman} (Pearson ${r.pearson}), lead=${r.leadPeriods} ${r.freq} periods, n=${r.n}, p≈${r.pValue}`);
  lines.push(`- Why it might make sense: ${r.why}`);
  lines.push(`- Polarity hint ${r.polarityHint}: agrees=${r.agreesWithHint}; spurious risk=${r.spuriousRisk}`);
  lines.push(`- Source: ${r.source} ${JSON.stringify(r.sourceParams)}`);
  lines.push(``);
}
if (failures.length) {
  lines.push(`## Fetch failures`);
  for (const f of failures) lines.push(`- ${f.id}: ${f.error}`);
}
await writeFile(OUT_MD, lines.join("\n"));
console.log(`Wrote ${OUT_JSON} and ${OUT_MD}`);
console.log(`Top 5:`);
for (const r of topReport.slice(0, 5)) console.log(`  ${r.spearman}\t${r.name} → ${r.target} (lead ${r.leadPeriods}, n=${r.n}, risk=${r.spuriousRisk})`);
