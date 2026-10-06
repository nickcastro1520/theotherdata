#!/usr/bin/env node
// Attach latest series direction (pct vs recent baseline) to scout.json findings for green/red UI.
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as src from "../lib/sources.js";
import { compare } from "../lib/analyze.js";
import { CANDIDATES } from "../lib/scout-candidates.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(ROOT, "public", "data", "scout.json");
const doc = JSON.parse(await readFile(path, "utf8"));
const byId = new Map(CANDIDATES.map((c) => [c.id, c]));

const fetchSeries = async (c) => {
  if (c.source === "fred") return (await src.fred(c.params)).series;
  if (c.source === "wiki") return (await src.wiki(c.params)).series;
  if (c.source === "pypi") return (await src.pypi(c.params)).series;
  if (c.source === "eiaWeeklyXls") return (await src.eiaWeeklyXls(c.params)).series;
  throw new Error(c.source);
};

const modeFor = (freq) => (freq === "monthly" ? "yoy" : "recent");
const cache = new Map();
async function directionFor(candidateId, freq) {
  if (cache.has(candidateId)) return cache.get(candidateId);
  const c = byId.get(candidateId);
  if (!c) { cache.set(candidateId, null); return null; }
  try {
    const series = await fetchSeries(c);
    const cmp = compare(series, modeFor(freq || c.freq));
    if (!cmp || !(cmp.baseline > 0)) { cache.set(candidateId, null); return null; }
    const pct = ((cmp.current - cmp.baseline) / cmp.baseline) * 100;
    const out = {
      pct: Math.round(pct * 10) / 10,
      direction: pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat",
      display: cmp.current,
      baseline: cmp.baseline,
      basis: cmp.basis,
      currentLabel: cmp.currentLabel,
      asOf: series.at(-1)?.t || null,
    };
    cache.set(candidateId, out);
    console.log(`  ${candidateId}: ${out.direction} ${out.pct}%`);
    return out;
  } catch (e) {
    console.warn(`  ${candidateId}: ${e.message}`);
    cache.set(candidateId, null);
    return null;
  }
}

// Plain-English helpers stored on each row for the UI
const WIRED_WHY = {
  VIXCLS: "Nvidia is a high-flying growth stock. When market fear rises, those names often get hit first — a risk-mood clue, not chip demand.",
  PERMIT: "New homes need materials that often travel by rail. More permits can mean more freight for Union Pacific later; fewer can mean less.",
  UNRATE: "Airbnb stays are a want, not a need. Higher unemployment usually squeezes travel budgets; lower unemployment can support bookings.",
  BAMLH0A0HYM2: "Many car buyers use loans. Wider junk spreads mean tighter credit — that can lean against Ford; tighter spreads can lean with it.",
};

function plainEnglish(r, dir) {
  const leanHist = r.spearman >= 0.25 ? "up together" : r.spearman <= -0.25 ? "opposite ways" : "loosely";
  const mag = r.absSpearman >= 0.55 ? "strong" : r.absSpearman >= 0.4 ? "moderate" : "mild";
  const dirWord = dir?.direction === "up" ? "up" : dir?.direction === "down" ? "down" : "about flat";
  const pctTxt = dir?.pct == null ? "" : ` (${dir.pct > 0 ? "+" : ""}${dir.pct}% ${dir.basis || "vs its recent baseline"})`;
  let priceLean = "unclear";
  if (r.polarityHint === 1) priceLean = dir?.direction === "up" ? "up" : dir?.direction === "down" ? "down" : "unclear";
  else if (r.polarityHint === -1) priceLean = dir?.direction === "up" ? "down" : dir?.direction === "down" ? "up" : "unclear";
  else if (r.spearman > 0.25) priceLean = dir?.direction === "up" ? "up" : dir?.direction === "down" ? "down" : "unclear";
  else if (r.spearman < -0.25) priceLean = dir?.direction === "up" ? "down" : dir?.direction === "down" ? "up" : "unclear";

  const srcLabel = r.source === "fred" ? "FRED" : r.source;
  const whatPulled = `We pulled “${r.name}” from a free public feed (${srcLabel}). Right now that number is ${dirWord}${pctTxt}.`;
  const series = r.sourceParams?.series;
  const whyMatters = (series && WIRED_WHY[series]) || r.why;
  const label = r.wiredTo || r.targetLabel;
  const howLean = priceLean === "unclear"
    ? `In our sample these two often move ${leanHist}. Right now the public number is too close to flat for a clear up/down lean on ${label}. Horizon: weeks to a quarter. Educational only — not advice to buy or sell.`
    : `The public number is ${dirWord}, and in our sample it has usually moved ${leanHist} with ${label}. That can lean the stock story ${priceLean} — a ${mag} historical link, over weeks to a quarter. Educational only — not advice to buy or sell.`;
  return { whatPulled, whyMatters, howLean, priceLean, magnitude: mag, horizon: "weeks to a quarter" };
}

const rows = [...(doc.shortlist || []), ...(doc.top || [])];
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.candidateId + "|" + r.target)) continue;
  seen.add(r.candidateId + "|" + r.target);
}
// Enrich unique candidateIds first
const ids = [...new Set(rows.map((r) => r.candidateId))];
console.log(`Enriching ${ids.length} scout series…`);
for (const id of ids) {
  const sample = rows.find((r) => r.candidateId === id);
  await directionFor(id, sample?.freq);
}

for (const r of [...(doc.shortlist || []), ...(doc.top || [])]) {
  const dir = cache.get(r.candidateId) || null;
  r.live = dir;
  Object.assign(r, { plain: plainEnglish(r, dir) });
}
// Also prefer wired live readings from ticker JSON when available
const wired = doc.wired || [];
for (const w of wired) {
  try {
    const d = JSON.parse(await readFile(join(ROOT, "public", "data", "tickers", `${w.ticker}.json`), "utf8"));
    const sig = (d.signals || []).find((s) => s.id === w.id);
    if (!sig || sig.pct == null) continue;
    const live = {
      pct: Math.round(sig.pct * 10) / 10,
      direction: sig.pct > 0.05 ? "up" : sig.pct < -0.05 ? "down" : "flat",
      display: sig.display,
      basis: sig.basis,
      currentLabel: sig.currentLabel,
      asOf: sig.asOf,
      fromTicker: w.ticker,
      reading: sig.reading,
      strength: sig.strength,
    };
    for (const r of [...(doc.shortlist || []), ...(doc.top || [])]) {
      if (r.sourceParams?.series === w.signal || r.wiredTo === w.ticker) {
        // Only override rows for this series
        if (r.sourceParams?.series === w.signal || (r.candidateId && w.id.includes(r.candidateId))) {
          r.live = live;
          r.plain = plainEnglish(r, live);
          r.wiredTo = w.ticker;
        }
      }
    }
    // Force exact series match
    for (const r of [...(doc.shortlist || []), ...(doc.top || [])]) {
      if (r.sourceParams?.series === w.signal) {
        r.live = live;
        r.wiredTo = w.ticker;
        r.plain = plainEnglish({ ...r, polarityHint: r.polarityHint }, live);
      }
    }
  } catch {}
}

doc.enrichedAt = new Date().toISOString();
await writeFile(path, JSON.stringify(doc, null, 2));
console.log("Wrote", path);
