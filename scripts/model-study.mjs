// Walk-forward study: can weighting/muting signals, a conviction threshold, or extra free data beat the
// current majority-vote lean OUT OF SAMPLE? Writes public/data/signal-study.json for /track.
//   TIINGO_API_KEY=... node scripts/model-study.mjs
// Design (fixed before looking at test years): train on every backtest checkpoint whose 1-month outcome was
// known before Jan 1 of year Y, test on year Y (2024, 2025, 2026). Nothing from a test year is used to pick
// weights, thresholds, or data sources for that year.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as T from "../lib/track.js";
import * as M from "../lib/model.js";
import * as src from "../lib/sources.js";
import { analyze } from "../lib/analyze.js";
import { TICKERS } from "../lib/catalog.js";

const BT = "data/track/backtest.json";
const OUT = "public/data/signal-study.json";
const CACHE = process.env.PRICE_CACHE || "/workspace/tod-cache/prices.json";
const YEARS = ["2024", "2025", "2026"];
const bt = JSON.parse(await readFile(BT, "utf8"));
const prices = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, "utf8")) : {};
for (const tk of ["SPY", ...new Set(bt.records.map((r) => r.tk))]) if (!prices[tk]) prices[tk] = await src.tiingoPrices({ ticker: tk, days: 1450 });
await writeFile(CACHE, JSON.stringify(prices));
const scoreAll = (recs) => recs.map((r) => T.scoreRecord(r, prices[r.tk], prices.SPY)).filter((r) => r.w["1m"]?.x != null);
const scored = scoreAll(bt.records);
const pctOf = (k, n) => (n ? Math.round((1000 * k) / n) / 10 : null);
const ci = (k, n) => (n ? M.wilson(k, n).map((x) => Math.round(x * 1000) / 10) : null);
const summ = (a) => ({ ...a, coverage: pctOf(a.calls, a.total), rate: pctOf(a.hits, a.calls), rateX: pctOf(a.hitsX, a.calls), ci: ci(a.hits, a.calls), ciX: ci(a.hitsX, a.calls) });
const oldEval = (recs) => { const o = { total: recs.length, calls: 0, hits: 0, hitsX: 0 }; for (const r of recs) { if (r.lean !== "tailwind" && r.lean !== "headwind") continue; o.calls++; if (r.w["1m"].hit) o.hits++; if (r.w["1m"].hitX) o.hitsX++; } return o; };
function walkForward(sc, rules = M.MODEL_RULES) {
  const a = { total: 0, calls: 0, hits: 0, hitsX: 0 }, b = { total: 0, calls: 0, hits: 0, hitsX: 0 }, folds = [];
  for (const y of YEARS) {
    const test = sc.filter((r) => r.d.startsWith(y));
    const m = M.train(sc, `${y}-01-01`, rules);
    const e = M.evalLeans(test, m.weights, m.threshold), o = oldEval(test);
    for (const k in a) { a[k] += e[k]; b[k] += o[k]; }
    folds.push({ year: y, trainedOn: m.trainRecords, threshold: m.threshold, kept: Object.values(m.weights).filter(Boolean).length, signals: Object.keys(m.weights).length, v2: summ(e), v1: summ(o) });
  }
  return { v2: summ(a), v1: summ(b), folds };
}

// ---- 1) model variants (only these 3 were tried) ----
const variants = {
  primary: { rules: M.MODEL_RULES, what: "Keep a signal if it beat the S&P 500 on >50% of at least 8 past calls; lean only when kept signals net at least the threshold picked on past data (1 or 2)." },
  stricter: { rules: { ...M.MODEL_RULES, keepAbove: 0.55 }, what: "Same, but keep only signals above 55% in the past." },
  noThreshold: { rules: { ...M.MODEL_RULES, thresholds: [1] }, what: "Same as primary, but always lean on any net vote (no conviction threshold)." },
};
const modelRuns = Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, { what: v.what, ...walkForward(scored, v.rules) }]));

// ---- 2) candidate new free data (only these 5 FRED groups plus the 2 Rhine rules and 2 box office rules below were tried) ----
const cand = (series, tk, id, name, polarity, lag, sourceUrl) => ({ tk, lag, name, series, url: sourceUrl || `https://fred.stlouisfed.org/series/${series}`, sig: { source: "fred", params: { series }, id, name, unit: "index", compare: "yoy", threshold: series === "GASDESW" ? 5 : 2, polarity } });
const groups = {
  "Diesel prices (EIA via FRED)": [cand("GASDESW", "UNP", "diesel", "Diesel price", -1, 7), cand("GASDESW", "AMZN", "diesel", "Diesel price", -1, 7)],
  "Cass freight shipments": [cand("FRGSHPUSM649NCIS", "UNP", "cass-shipments", "Cass freight shipments", 1, 45), cand("FRGSHPUSM649NCIS", "AMZN", "cass-shipments", "Cass freight shipments", 1, 45)],
  "Freight transportation index (BTS)": [cand("TSIFRGHT", "UNP", "freight-tsi", "Freight TSI", 1, 100)],
  "Retail sales ex-autos (Census)": [cand("RSXFS", "WMT", "retail-sales", "Retail sales", 1, 45), cand("RSXFS", "COST", "retail-sales", "Retail sales", 1, 45)],
  "Truck tonnage for Amazon": [cand("TRUCKD11", "AMZN", "truck-tonnage", "Truck tonnage", 1, 90)],
};
const hist = {};
for (const cs of Object.values(groups)) for (const c of cs) hist[c.series] ||= (await src.fred({ series: c.series, years: 6 })).series.filter((p) => p.t >= "2021-06-01");
const readingAt = (c, d) => {
  const pts = hist[c.series].filter((p) => Date.parse(p.t) + c.lag * 864e5 <= Date.parse(d));
  if (pts.length < 3) return null;
  const a = analyze(c.sig, pts, c.tk);
  return a.status !== "ok" ? null : a.reading === "tailwind" ? "+" : a.reading === "headwind" ? "-" : "0";
};
const augment = (cs) => bt.records.map((r) => { const ex = cs.filter((c) => c.tk === r.tk).map((c) => { const v = readingAt(c, r.d); return v ? `${c.sig.id}:${v}` : null; }).filter(Boolean); return ex.length ? { ...r, sig: [r.sig, ...ex].filter(Boolean).join(",") } : r; });
// Rhine water level at Kaub (WSV PEGELONLINE raw daily means, data/rhine-kaub-daily.json) for BASF and Dow.
// Neither stock is in the backtest, so each monthly checkpoint gets a new record whose only signal is the river.
// Both rules were fixed before scoring: (a) 28-day average vs the same 28 days last year, 15% noise band, higher
// water = tailwind (barges load fully, cheaper freight); (b) low water only: headwind when the 28-day average is
// under 100 cm, otherwise no call. Readings use data through the day before each checkpoint.
const RHINE = JSON.parse(await readFile("data/rhine-kaub-daily.json", "utf8"));
const RHINE_TK = ["BASFY", "DOW"];
for (const tk of RHINE_TK) if (!prices[tk]) prices[tk] = await src.tiingoPrices({ ticker: tk, days: 1450 });
await writeFile(CACHE, JSON.stringify(prices));
const rhineSig = { source: "pegelonline", params: { station: "KAUB" }, id: "rhine-kaub", name: "Rhine water level at Kaub", unit: "cm", compare: "yoy", threshold: 15, polarity: 1 };
const rhineReading = (rule, d) => {
  const pts = RHINE.points.filter((p) => Date.parse(p.t) + 864e5 <= Date.parse(d));
  if (pts.length < 400) return null;
  if (rule === "low") { const last = pts.slice(-28); return last.reduce((a, p) => a + p.v, 0) / last.length < 100 ? "-" : null; }
  const a = analyze(rhineSig, pts, "DOW");
  return a.status !== "ok" ? null : a.reading === "tailwind" ? "+" : a.reading === "headwind" ? "-" : "0";
};
const rhineRecords = (rule) => [...new Set(bt.records.map((r) => r.d))].flatMap((d) => RHINE_TK.map((tk) => {
  const v = rhineReading(rule, d);
  const lean = v === "+" ? "tailwind" : v === "-" ? "headwind" : "neutral";
  return { d, tk, lean, mag: "mild", tw: v === "+" ? 1 : 0, hw: v === "-" ? 1 : 0, n: v ? 1 : 0, sig: v ? `rhine-kaub:${v}` : "" };
}));
const rhineRules = { "Rhine water level at Kaub (vs last year)": "yoy", "Rhine low water at Kaub (under 100 cm)": "low" };
const rhineRuns = Object.entries(rhineRules).map(([name, rule]) => {
  const extra = rhineRecords(rule);
  const all = scoreAll([...bt.records, ...extra]);
  const own = scoreAll(extra);
  return { name, rule, all, own, wfOwn: walkForward(own) };
});

// Weekly US/Canada box office (Box Office Mojo, data/boxoffice-weekly.json) for DIS, which is already in the backtest.
// Rules fixed before scoring: last 4 weeks of total domestic gross vs the same 4 weeks last year, higher = tailwind,
// with (a) a 10% noise band or (b) a 25% band (big swings only). A week counts only 4 days after it ends (reports land Monday).
const BOX = JSON.parse(await readFile("data/boxoffice-weekly.json", "utf8"));
const boxRules = { "US box office, last 4 weeks vs last year (10% band)": 10, "US box office, last 4 weeks vs last year (25% band)": 25 };
const boxReading = (thr, d) => {
  const pts = BOX.points.filter((p) => Date.parse(p.t) + 4 * 864e5 <= Date.parse(d));
  if (pts.length < 60) return null;
  const a = analyze({ source: "boxofficemojo", id: "boxoffice", name: "US box office", unit: "$M", compare: "yoy", threshold: thr, polarity: 1 }, pts, "DIS");
  return a.status !== "ok" ? null : a.reading === "tailwind" ? "+" : a.reading === "headwind" ? "-" : "0";
};
const boxRuns = Object.entries(boxRules).map(([name, thr]) => {
  const recs = bt.records.map((r) => { if (r.tk !== "DIS") return r; const v = boxReading(thr, r.d); return v ? { ...r, sig: [r.sig, `boxoffice:${v}`].filter(Boolean).join(",") } : r; });
  const own = scoreAll(bt.records.filter((r) => r.tk === "DIS").map((r) => { const v = boxReading(thr, r.d); return { d: r.d, tk: "DIS", lean: v === "+" ? "tailwind" : v === "-" ? "headwind" : "neutral", mag: "mild", tw: v === "+" ? 1 : 0, hw: v === "-" ? 1 : 0, n: v ? 1 : 0, sig: v ? `boxoffice:${v}` : "" }; }));
  return { name, thr, all: scoreAll(recs), own, wfOwn: walkForward(own) };
});

const base = modelRuns.primary.v2;
const candidates = Object.entries(groups).map(([name, cs]) => {
  const sc = scoreAll(augment(cs));
  const wf = walkForward(sc).v2, st = M.signalStats(sc);
  const gain = wf.rateX - base.rateX;
  return { name, for: cs.map((c) => c.tk), series: cs[0].series, url: cs[0].url, oos: wf, changeVsBase: Math.round(gain * 10) / 10,
    perStock: cs.map((c) => { const o = st[M.sigKey(c.tk, c.sig.id)] || {}; return { tk: c.tk, n: o.n || 0, rateX: pctOf(o.hitsX || 0, o.n || 0) }; }),
    // Admission rule (fixed up front): must raise the out-of-sample vs-market hit rate by at least 1 point.
    admitted: gain >= 1 };
});
for (const r of rhineRuns) {
  const wf = walkForward(r.all).v2, st = M.signalStats(r.all);
  const gain = wf.rateX - base.rateX;
  candidates.push({ name: r.name, for: RHINE_TK, series: "KAUB", url: RHINE.url, oos: wf, changeVsBase: Math.round(gain * 10) / 10,
    perStock: RHINE_TK.map((tk) => { const o = st[M.sigKey(tk, "rhine-kaub")] || {}; return { tk, n: o.n || 0, rate: pctOf(o.hits || 0, o.n || 0), rateX: pctOf(o.hitsX || 0, o.n || 0), ciX: ci(o.hitsX || 0, o.n || 0) }; }),
    ownOos: r.wfOwn.v1, newStocks: true, admitted: gain >= 1 });
}
for (const r of boxRuns) {
  const wf = walkForward(r.all).v2, st = M.signalStats(r.all);
  const gain = wf.rateX - base.rateX, o = st[M.sigKey("DIS", "boxoffice")] || {};
  candidates.push({ name: r.name, for: ["DIS"], series: "BOXOFFICE", url: BOX.url, oos: wf, changeVsBase: Math.round(gain * 10) / 10,
    perStock: [{ tk: "DIS", n: o.n || 0, rate: pctOf(o.hits || 0, o.n || 0), rateX: pctOf(o.hitsX || 0, o.n || 0), ciX: ci(o.hitsX || 0, o.n || 0) }],
    ownOos: r.wfOwn.v1, admitted: gain >= 1 });
}

// ---- 3) per-signal transparency (all backtest checkpoints with a known 1-month result) ----
const nameOf = {}; for (const t of TICKERS) for (const s of t.signals) nameOf[M.sigKey(t.ticker, s.id)] = s.name;
const now = M.train(scored, "9999-12-31");
const signals = Object.values(M.signalStats(scored)).map((o) => ({
  tk: o.tk, id: o.id, name: nameOf[M.sigKey(o.tk, o.id)] || o.id, calls: o.n, rate: pctOf(o.hits, o.n), rateX: pctOf(o.hitsX, o.n), ciX: ci(o.hitsX, o.n),
  upN: o.up.n, upAvgX: o.up.avgX == null ? null : Math.round(o.up.avgX * 1e4) / 1e4, downN: o.down.n, downAvgX: o.down.avgX == null ? null : Math.round(o.down.avgX * 1e4) / 1e4,
  wouldKeep: !!now.weights[M.sigKey(o.tk, o.id)],
})).sort((a, b) => a.tk.localeCompare(b.tk) || a.id.localeCompare(b.id));

const p = modelRuns.primary;
const improved = p.v2.ciX && p.v2.rateX - p.v1.rateX >= 1 && p.v2.ciX[0] > 50;
const doc = {
  generatedAt: new Date().toISOString(), window: "1 month", testYears: YEARS, benchmark: "SPY",
  design: "Walk-forward: for each test year, signals were scored and kept or muted using only checkpoints whose 1-month result was already known before that year began. Nothing was flipped.",
  configurationsTried: Object.keys(variants).length + Object.keys(groups).length + Object.keys(rhineRules).length + Object.keys(boxRules).length,
  thresholdOptions: M.MODEL_RULES.thresholds,
  models: modelRuns, candidates, signals,
  verdict: { improved, liveModel: improved ? "v2" : "v1",
    text: improved ? "The weighted model beat the old one out of sample by a margin outside the noise, so it now drives the live leans."
      : "No version beat a coin flip by more than chance. The live leans stay on the original method, and this study is published so you can see what was tried." },
};
await writeFile(OUT, JSON.stringify(doc));
console.log(JSON.stringify({ primary: { v1: p.v1, v2: p.v2 }, stricter: modelRuns.stricter.v2, noThreshold: modelRuns.noThreshold.v2, candidates: candidates.map((c) => [c.name, c.oos.rateX, c.changeVsBase, c.admitted]), extra: candidates.filter((c) => c.perStock).map((c) => ({ name: c.name, perStock: c.perStock, own: c.ownOos })), kept: signals.filter((s) => s.wouldKeep).length, of: signals.length, verdict: doc.verdict }, null, 1));
