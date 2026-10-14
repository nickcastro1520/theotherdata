// Minimum-size rule for featured signals (hero card, weekly digest, share images), plus the
// "before → after" raw numbers shown next to every % change. Shared by the browser
// (window.TODSize), the build, the digest and the tests. Uses only numbers already in the data.
//
// Rule 3:
//   Count-based signals (stories, posts, reports, views, complaints, …) may be featured only if
//     (a) the baseline window holds at least 20 events, AND
//     (b) the absolute change is at least 2 × √(baseline count)  (≈ two standard deviations
//         of Poisson noise, so a move smaller than that is usually just luck).
//   Continuous data (prices, production indexes, rates) keeps its existing noise band:
//     |% change| must be at least the signal's own threshold.
//   Count signals that fail stay on stock pages, labeled "Small sample" (baseline under 20)
//   or "Small change" (enough events, but the move is under 2 × √baseline).
(function (root) {
  "use strict";
  const MIN_BASELINE = 20;
  // Units that count discrete events. Values are per-period averages, so window totals = average × periods.
  const COUNT_UNITS = { views: "views", downloads: "downloads", stories: "stories", travelers: "travelers", complaints: "complaints", reports: "reports", roles: "open roles", claims: "jobless claims", carloads: "carloads", posts: "posts" };
  const isCount = (s) => Boolean(s && Object.prototype.hasOwnProperty.call(COUNT_UNITS, s.unit));

  // How many periods the current (and the baseline) window averages over. Mirrors lib/analyze.js.
  function windowLen(s) {
    if (!s) return 1;
    if (s.compare === "snapshot") return 1;
    if (s.compare === "yoy7") return 7;
    return { daily: 28, weekly: 4, monthly: 3, quarterly: 1 }[s.freq] || 1;
  }
  function windowWords(s) {
    if (!s) return "";
    if (s.compare === "snapshot") return "";
    if (s.compare === "yoy7") return "7 days";
    return { daily: "28 days", weekly: "4 weeks", monthly: "3 months", quarterly: "a quarter" }[s.freq] || "";
  }

  const num = (v) => (v == null || v === "" ? NaN : Number(v));
  // Rule 3 for one signal. Returns the numbers so pages and reports can show the working.
  function check(s) {
    const cur = num(s && s.current), base = num(s && s.baseline), pct = num(s && s.pct);
    const live = Boolean(s) && (s.status === "ok" || s.status === "stale");
    if (isCount(s)) {
      const n = windowLen(s);
      if (!live || !Number.isFinite(cur) || !Number.isFinite(base)) return { kind: "count", pass: false, reason: "missing counts" };
      const baselineCount = Math.round(base * n), currentCount = Math.round(cur * n);
      const change = currentCount - baselineCount;
      const threshold = 2 * Math.sqrt(Math.max(baselineCount, 0));
      const bigBase = baselineCount >= MIN_BASELINE, bigMove = Math.abs(change) >= threshold;
      return { kind: "count", baselineCount, currentCount, change, threshold, pass: bigBase && bigMove,
        reason: !bigBase ? `baseline under ${MIN_BASELINE}` : !bigMove ? "change under 2×√baseline" : "ok",
        // Stock-page badge for a failing count signal: too few events vs. enough events but too small a move.
        label: !bigBase ? "Small sample" : !bigMove ? "Small change" : null };
    }
    const band = num(s && s.threshold);
    if (!live || !Number.isFinite(pct)) return { kind: "continuous", pass: false, reason: "no live change" };
    // Index entries written before this rule have no threshold; fall back to the reading (neutral = inside the band).
    const pass = Number.isFinite(band) ? Math.abs(pct) >= band : s.reading === "tailwind" || s.reading === "headwind";
    return { kind: "continuous", change: pct, threshold: Number.isFinite(band) ? band : null, pass, reason: pass ? "ok" : "inside noise band" };
  }
  const passes = (s) => check(s).pass;

  // Plain formatting for raw values (mirrors lib/analyze.js fmt, without the "/day" style rates for counts).
  const nf = (d) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const compact = (v) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
  function fmtValue(v, unit) {
    if (v == null || !Number.isFinite(v)) return "";
    switch (unit) {
      case "usdB": return `$${nf(2).format(v)}B`;
      case "usdM": return v >= 1000 ? `$${nf(2).format(v / 1000)}B` : `$${nf(0).format(v)}M`;
      case "usdGal": return `$${v.toFixed(2)}/gal`;
      case "usdDozen": return `$${v.toFixed(2)}/dozen`;
      case "usdLb": return `$${v.toFixed(2)}/lb`;
      case "usdBbl": return `$${v.toFixed(2)}/barrel`;
      case "centsLb": return `${v.toFixed(1)}¢/lb`;
      case "usdTon": return `$${nf(0).format(v)}/ton`;
      case "usdBnT": return `$${(v / 1000).toFixed(2)}T`;
      case "usd": return `$${nf(0).format(v)}`;
      case "kbbl": return `${compact(v * 1000)} bbl`;
      case "pct": return `${v.toFixed(2)}%`;
      case "thousandUnits": return `${nf(2).format(v / 1000)}M`;
      case "millionUnits": return `${nf(1).format(v)}M`;
      default: return Math.abs(v) >= 100000 ? compact(v) : nf(Math.abs(v) < 10 ? 2 : 1).format(v);
    }
  }
  const countTxt = (n) => (Math.abs(n) >= 100000 ? compact(n) : nf(0).format(n));

  // { before, after, unit, text: "17 → 37", long: "17 → 37 stories in 4 weeks" } or null when a value is missing.
  function beforeAfter(s) {
    const cur = num(s && s.current), base = num(s && s.baseline);
    if (!s || !Number.isFinite(cur) || !Number.isFinite(base)) return null;
    if (isCount(s)) {
      const n = windowLen(s), w = windowWords(s);
      const before = countTxt(Math.round(base * n)), after = countTxt(Math.round(cur * n));
      const text = `${before} → ${after}`;
      return { before, after, text, long: `${text} ${COUNT_UNITS[s.unit]}${w ? ` in ${w}` : ""}` };
    }
    const before = fmtValue(base, s.unit), after = fmtValue(cur, s.unit);
    if (!before || !after) return null;
    const text = `${before} → ${after}`;
    return { before, after, text, long: text };
  }

  const pctTxt = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0)}%`;
  // "+118% (17 → 37)". Omits the raw part when a value is missing; "" when there is no %.
  function changeText(s) {
    const p = num(s && s.pct);
    if (!Number.isFinite(p)) return "";
    const ba = beforeAfter(s);
    return ba ? `${pctTxt(p)} (${ba.text})` : pctTxt(p);
  }

  // What the data did, with no up/down call for the stock:
  // "Developer chatter doubled: 17 → 37 stories in 4 weeks, vs the 4 weeks before."
  function describe(s) {
    const p = num(s && s.pct);
    if (!s || !Number.isFinite(p)) return "";
    const r = 1 + p / 100;
    const verb = Math.abs(p) < 0.5 ? "held about flat" : r >= 2.9 && r <= 3.1 ? "tripled" : r > 2.1 && r < 2.9 ? "more than doubled" : r >= 1.9 && r <= 2.1 ? "doubled" : r >= 0.45 && r <= 0.55 ? "halved"
      : `${p > 0 ? "rose" : "fell"} ${Math.round(Math.abs(p)) || Math.abs(p).toFixed(1)}%`;
    const ba = beforeAfter(s);
    const basis = s.basis ? `, ${s.basis}` : "";
    return `${s.name} ${verb}${ba ? `: ${ba.long}` : ""}${basis}.`;
  }

  const api = { MIN_BASELINE, COUNT_UNITS, isCount, windowLen, windowWords, check, passes, beforeAfter, changeText, describe, fmtValue, pctTxt };
  root.TODSize = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
