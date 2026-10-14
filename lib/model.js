// Signal-weighted lean model ("v2"), learned walk-forward from the backtest.
// Pure functions: no network. A signal is KEPT only if, on past data alone, its call beat the S&P 500
// more often than not over enough tries; otherwise it is MUTED. Nothing is ever flipped.
// The lean is issued only when kept signals' net vote clears a threshold; otherwise "quiet".
export const MODEL_VERSION = "v2";
export const MODEL_RULES = {
  minCalls: 8,          // a signal needs at least this many past scored calls before it can be kept
  keepAbove: 0.5,       // ...and a vs-market hit rate above this on those past calls
  thresholds: [1, 2],   // net vote of kept signals needed to issue a lean (picked on past data only)
  minCoverage: 0.25,    // a threshold must keep at least this share of past checkpoints to be picked
  window: "1m",
};
export const sigKey = (tk, id) => `${tk}:${id}`;
export function parseSig(rec) {
  return String(rec.sig || "").split(",").filter(Boolean).map((p) => {
    const i = p.lastIndexOf(":");
    const c = p.slice(i + 1);
    return { id: p.slice(0, i), v: c === "+" ? 1 : c === "-" ? -1 : 0 };
  });
}
// scored: records with r.w[window].x (stock minus SPY). Returns per-signal stats.
export function signalStats(scored, window = MODEL_RULES.window) {
  const st = {};
  for (const r of scored) {
    const x = r.w?.[window]?.x, ar = r.w?.[window]?.r;
    if (x == null) continue;
    for (const s of parseSig(r)) {
      const k = sigKey(r.tk, s.id);
      const o = (st[k] ||= { tk: r.tk, id: s.id, n: 0, hitsX: 0, hits: 0, up: { n: 0, sumX: 0 }, down: { n: 0, sumX: 0 }, quiet: 0 });
      if (!s.v) { o.quiet++; continue; }
      o.n++;
      if (x * s.v > 0) o.hitsX++;
      if (ar * s.v > 0) o.hits++;
      const b = s.v > 0 ? o.up : o.down; b.n++; b.sumX += x;
    }
  }
  for (const o of Object.values(st)) {
    o.hitRateX = o.n ? o.hitsX / o.n : null;
    o.hitRate = o.n ? o.hits / o.n : null;
    o.up.avgX = o.up.n ? o.up.sumX / o.up.n : null;
    o.down.avgX = o.down.n ? o.down.sumX / o.down.n : null;
  }
  return st;
}
export function weightsFrom(stats, rules = MODEL_RULES) {
  const w = {};
  for (const [k, o] of Object.entries(stats)) w[k] = o.n >= rules.minCalls && o.hitRateX > rules.keepAbove ? 1 : 0;
  return w;
}
export function netVote(tk, readings, weights) {
  let s = 0, used = 0;
  for (const r of readings) { const w = weights[sigKey(tk, r.id)] || 0; if (w && r.v) { s += w * r.v; used++; } }
  return { s, used };
}
export function leanFromVote(s, threshold) {
  return s >= threshold ? "tailwind" : s <= -threshold ? "headwind" : "quiet";
}
export function evalLeans(scored, weights, threshold, window = MODEL_RULES.window) {
  let calls = 0, hits = 0, hitsX = 0, nX = 0, total = 0;
  for (const r of scored) {
    const c = r.w?.[window]; if (!c || c.x == null) continue;
    total++;
    const lean = leanFromVote(netVote(r.tk, parseSig(r), weights).s, threshold);
    if (lean === "quiet") continue;
    const sg = lean === "tailwind" ? 1 : -1;
    calls++; if (c.r * sg > 0) hits++; nX++; if (c.x * sg > 0) hitsX++;
  }
  return { total, calls, hits, hitsX, coverage: total ? calls / total : 0 };
}
export function pickThreshold(trainScored, weights, rules = MODEL_RULES) {
  let best = { t: rules.thresholds[0], rate: -1 };
  for (const t of rules.thresholds) {
    const e = evalLeans(trainScored, weights, t, rules.window);
    if (e.coverage < rules.minCoverage || !e.calls) continue;
    const rate = e.hitsX / e.calls;
    if (rate > best.rate) best = { t, rate };
  }
  return best.t;
}
// Train on records whose outcome was fully known before `cutoff` (exit date < cutoff).
export function train(scored, cutoff, rules = MODEL_RULES) {
  const past = scored.filter((r) => r.w?.[rules.window]?.to && r.w[rules.window].to < cutoff);
  const stats = signalStats(past, rules.window);
  const weights = weightsFrom(stats, rules);
  return { cutoff, stats, weights, threshold: pickThreshold(past, weights, rules), trainRecords: past.length };
}
// Wilson 95% interval for k hits in n tries.
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
