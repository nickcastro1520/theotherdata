// Track record: log each curated stock's overall lean, then check what the stock actually did.
// Pure functions only (no network) so the rules are testable. Used by scripts/refresh.mjs (live log)
// and scripts/track-record.mjs (backtest + scoring).
import { analyze, summarize } from "./analyze.js";

const DAY = 864e5;
const ts = (t) => Date.parse(String(t).slice(0, 10) + "T00:00:00Z");
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (t, n) => iso(ts(t) + n * DAY);

export const WINDOWS = [
  { key: "2w", days: 14, label: "2 weeks" },
  { key: "1m", days: 30, label: "1 month" },
  { key: "1q", days: 91, label: "1 quarter" },
];
export const PRIMARY_WINDOW = "1m";

// ---------- which signals can be backtested, and why not ----------
// A signal is backtestable only if its source keeps dated history we can cut off at a past date
// using values that would have been public by then.
export const SKIP_REASONS = {
  pypi: "PyPI download stats only keep about 180 days of history, not enough for a multi-year backtest.",
  openfda: "FDA adverse-event data arrives late and is re-released quarterly, so we can't reconstruct what was public on a past date.",
  nhtsa: "Complaint counts for a fixed set of model years grow with the fleet, and complaints are posted with an unknown delay, so past readings would be biased.",
  greenhouse: "Job boards only show today's count; our own snapshots started recently, so there's no past history.",
  lever: "Job boards only show today's count; our own snapshots started recently, so there's no past history.",
  npm: "npm's public download counts only go back about 18 months, not enough for a backtest that starts in 2023.",
};
export const BACKTESTABLE = new Set(["fred", "wiki", "hn", "tsa", "eiaWeeklyXls", "secInventory"]);
export const backtestable = (sig) => BACKTESTABLE.has(sig.source);
export const MIN_WIKI_BASELINE = 100; // views/day

// ---------- publication lag: a data point dated t isn't treated as known until t + lag days ----------
// Deliberately conservative (rounded up from typical release schedules) so the backtest can't peek.
const FRED_LAG = {
  // daily
  VIXCLS: 1, CBBTCUSD: 1, BAMLH0A0HYM2: 2, DJFUELUSGULF: 8, DCOILWTICO: 8, DTWEXBGS: 8,
  // weekly
  GASREGW: 2, ICSA: 6, MORTGAGE30US: 1, TOTCI: 10,
  // monthly (t is the 1st of the month the value covers)
  MRTSSM443USS: 80, RAILFRTCARLOADSD11: 90, TRUCKD11: 90, UMCSENT: 35, UNRATE: 40, TOTALSA: 40,
  MRTSSM448USS: 80, MRTSSM452USS: 80, MRTSSM722USS: 80, LOADFACTOR: 105, ANAPNO: 65,
  // quarterly (t is the first day of the quarter; the Fed publishes ~2 months after it ends)
  DRCCLACBS: 150,
};
const FREQ_LAG = { daily: 3, weekly: 7, monthly: 50, quarterly: 60 };
export function lagDays(sig, freq) {
  if (sig.source === "fred" && FRED_LAG[sig.params?.series] != null) return FRED_LAG[sig.params.series];
  if (sig.source === "wiki" || sig.source === "tsa") return 1;
  if (sig.source === "hn") return 0; // weekly buckets are dated by their end; only closed buckets count
  if (sig.source === "eiaWeeklyXls") return 6;
  return FREQ_LAG[freq] ?? 50;
}

// Points known on date `asOf`. SEC points carry their own first-filed date.
export function knownAsOf(sig, series, asOf, freq) {
  const cut = ts(asOf);
  if (sig.source === "secInventory") return series.filter((p) => p.filed && ts(p.filed) <= cut);
  const lag = lagDays(sig, freq);
  return series.filter((p) => ts(p.t) + lag * DAY <= cut);
}

// Rebuild a ticker's overall lean on a past date from the backtestable signals' full histories.
// histories: { [signalId]: { series:[{t,v,filed?}], freq } }
export function leanAsOf(ticker, histories, asOf) {
  const signals = [];
  for (const sig of ticker.signals) {
    const h = histories[sig.id];
    if (!h || !backtestable(sig)) continue;
    const pts = knownAsOf(sig, h.series, asOf, h.freq);
    if (pts.length < 3) continue;
    // Stale guard: if the newest known point is very old, the live site would have shown it as stale data.
    const maxAge = { daily: 21, weekly: 35, monthly: 130, quarterly: 200 }[h.freq] ?? 130;
    if (ts(asOf) - ts(pts[pts.length - 1].t) > (maxAge + lagDays(sig, h.freq)) * DAY) continue;
    const a = analyze(sig, pts.map(({ t, v }) => ({ t, v })), ticker.name);
    if (a.status !== "ok") continue;
    // A brand-new or redirect Wikipedia page (e.g. "Microsoft Copilot" in early 2023) jumps from a handful of
    // views to thousands; that's the page being created, not public interest, so very low baselines don't count.
    if (sig.source === "wiki" && !(a.baseline >= MIN_WIKI_BASELINE)) continue;
    signals.push({ id: sig.id, name: sig.name, status: "ok", reading: a.reading, strength: a.strength, pct: a.pct, basis: a.basis });
  }
  if (!signals.length) return null;
  const s = summarize(ticker.name, ticker.ticker, signals);
  return {
    d: asOf, tk: ticker.ticker, lean: s.impact.lean, mag: s.impact.magnitude, tw: s.tailwinds, hw: s.headwinds, n: signals.length,
    sig: signals.map((x) => `${x.id}:${x.reading === "tailwind" ? "+" : x.reading === "headwind" ? "-" : "0"}`).join(","),
  };
}

// ---------- live snapshots (append-only log) ----------
export function liveSnapshot(doc, at) {
  const imp = doc.summary?.impact || {};
  const q = doc.market?.quote;
  return {
    d: String(at).slice(0, 10), at, tk: doc.ticker, lean: imp.lean || "mixed", mag: imp.magnitude || "unclear",
    tw: doc.summary?.tailwinds ?? 0, hw: doc.summary?.headwinds ?? 0,
    n: (doc.signals || []).filter((s) => s.status === "ok" || s.status === "stale").length,
    px: q && Number.isFinite(Number(q.price)) ? Math.round(Number(q.price) * 100) / 100 : null,
    pxAt: q ? q.at || null : null,
    pxSrc: q ? (doc.market?.quoteSource?.name || null) : null,
  };
}
// Returns the lines to append: one per ticker per UTC day, never rewriting earlier lines.
export function newLiveLines(existingText, docs, at) {
  const day = String(at).slice(0, 10);
  const have = new Set();
  for (const line of String(existingText || "").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); have.add(`${r.d}|${r.tk}`); } catch { /* keep going */ }
  }
  return docs.filter((d) => d && !have.has(`${day}|${d.ticker}`)).map((d) => JSON.stringify(liveSnapshot(d, at)));
}
export const parseLines = (text) => String(text || "").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// ---------- scoring ----------
// prices: sorted [{t, v}] adjusted closes. Entry = close of the first trading day strictly AFTER the
// lean date (no same-day peeking); exit = first trading day on/after entry + window days.
function firstOnOrAfter(prices, t) {
  let lo = 0, hi = prices.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (prices[m].t < t) lo = m + 1; else hi = m; }
  return prices[lo] || null;
}
export function windowReturn(prices, leanDate, days) {
  const entry = firstOnOrAfter(prices, addDays(leanDate, 1));
  if (!entry) return null;
  const exit = firstOnOrAfter(prices, addDays(entry.t, days));
  if (!exit) return null;
  return { from: entry.t, to: exit.t, r: (exit.v - entry.v) / entry.v };
}

const CALL = new Set(["tailwind", "headwind"]);
export function scoreRecord(rec, prices, spy) {
  const out = { ...rec, w: {} };
  for (const w of WINDOWS) {
    const s = prices ? windowReturn(prices, rec.d, w.days) : null;
    if (!s) continue;
    const m = spy ? windowReturn(spy, rec.d, w.days) : null;
    const x = m && m.from === s.from && m.to === s.to ? s.r - m.r : null;
    const cell = { r: round4(s.r), from: s.from, to: s.to };
    if (x != null) cell.x = round4(x);
    if (CALL.has(rec.lean)) {
      const sign = rec.lean === "tailwind" ? 1 : -1;
      cell.hit = s.r * sign > 0;
      if (x != null) cell.hitX = x * sign > 0;
    }
    out.w[w.key] = cell;
  }
  return out;
}
const round4 = (x) => Math.round(x * 1e4) / 1e4;

export function aggregate(scored) {
  const out = {};
  for (const w of WINDOWS) {
    const calls = scored.filter((r) => CALL.has(r.lean) && r.w[w.key]);
    const vsMkt = calls.filter((r) => r.w[w.key].hitX != null);
    const tw = calls.filter((r) => r.lean === "tailwind"), hw = calls.filter((r) => r.lean === "headwind");
    const avg = (a, f) => (a.length ? round4(a.reduce((s, r) => s + f(r), 0) / a.length) : null);
    const withX = (a) => a.filter((r) => r.w[w.key].x != null);
    out[w.key] = {
      calls: calls.length,
      hits: calls.filter((r) => r.w[w.key].hit).length,
      vsMktCalls: vsMkt.length,
      vsMktHits: vsMkt.filter((r) => r.w[w.key].hitX).length,
      // "Always guess up" baseline on the same records: how often did these stocks simply rise?
      upShare: calls.length ? round4(calls.filter((r) => r.w[w.key].r > 0).length / calls.length) : null,
      tailwind: { n: tw.length, hits: tw.filter((r) => r.w[w.key].hit).length, avgX: avg(withX(tw), (r) => r.w[w.key].x), avgR: avg(tw, (r) => r.w[w.key].r) },
      headwind: { n: hw.length, hits: hw.filter((r) => r.w[w.key].hit).length, avgX: avg(withX(hw), (r) => r.w[w.key].x), avgR: avg(hw, (r) => r.w[w.key].r) },
      noCall: scored.filter((r) => !CALL.has(r.lean) && r.w[w.key]).length,
    };
  }
  return out;
}

// Live snapshots are daily; to avoid counting the same call 7 times a week, score the first snapshot
// of each ISO week per ticker.
export function weeklySample(records) {
  const seen = new Set();
  const out = [];
  for (const r of records.slice().sort((a, b) => (a.d === b.d ? a.tk.localeCompare(b.tk) : a.d.localeCompare(b.d)))) {
    const d = new Date(ts(r.d));
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    const wk = iso(ts(r.d) - dow * DAY);
    const k = `${wk}|${r.tk}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function monthlyCheckpoints(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  for (;;) {
    const d = `${y}-${String(m).padStart(2, "0")}-01`;
    if (d > to) break;
    if (d >= from) out.push(d);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
