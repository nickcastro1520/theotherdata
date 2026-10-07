// Plain-English wording for the track record, shared by the home page, stock pages, /track, and tests.
// Only ever describes numbers that are in /data/track-record.json.
(function (root) {
  "use strict";
  const pct = (h, n) => (n ? Math.round((1000 * h) / n) / 10 : null);
  const fmtPct = (h, n) => (n ? `${pct(h, n).toFixed(1).replace(/\.0$/, "")}%` : "n/a");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = (t) => { if (!t) return ""; const [y, m, d] = t.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
  const month = (t) => { if (!t) return ""; const [y, m] = t.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };

  // Verdict on the "vs S&P 500" hit rate. Needs a decent sample before saying anything stronger than "too early".
  function verdict(s) {
    if (!s || !s.vsMktCalls) return { key: "none", text: "No scored calls yet." };
    const n = s.vsMktCalls, r = pct(s.vsMktHits, n);
    if (n < 30) return { key: "early", text: `Too few calls (${n}) to say anything yet.` };
    // Rough 95% band for a fair coin at this sample size.
    const band = Math.max(3, Math.round(196 * Math.sqrt(0.25 / n)));
    if (r >= 50 + band) return { key: "edge", text: `Better than a coin flip on this sample (${r}% of ${n} calls), though past results don't predict future ones.` };
    if (r <= 50 - band) return { key: "worse", text: `Worse than a coin flip on this sample (${r}% of ${n} calls).` };
    return { key: "coin", text: `About a coin flip (${r}% of ${n} calls). On this sample the leans don't show a reliable edge over the market.` };
  }

  // One line for a stock page.
  function stockLine(doc, tk) {
    const t = doc && doc.tickers && doc.tickers[tk];
    if (!t) return null;
    const w = doc.primary || "1m";
    const bt = t.backtest && t.backtest.summary && t.backtest.summary[w];
    const live = doc.live || {};
    const lv = t.live && t.live.summary && t.live.summary[w];
    const parts = [];
    if (bt && bt.calls) {
      parts.push(`In the backtest (${month(doc.backtest.from)}–${month(doc.backtest.to)}, ${t.backtest.signalsUsed} of ${t.signals} signals), ${tk}'s tailwind/headwind leans got the 1-month direction right ${bt.hits} of ${bt.calls} times (${fmtPct(bt.hits, bt.calls)}) and beat or lagged the S&P 500 the way they leaned ${bt.vsMktHits} of ${bt.vsMktCalls} times (${fmtPct(bt.vsMktHits, bt.vsMktCalls)}).`);
    } else if (t.backtest) {
      parts.push(`No backtested calls for ${tk} yet.`);
    }
    if (lv && lv.calls) parts.push(`Live so far: ${lv.hits} of ${lv.calls} right on direction.`);
    else if (live.startedOn) parts.push(`Live tracking started ${day(live.startedOn)}.`);
    return parts.join(" ");
  }

  const api = { pct, fmtPct, verdict, stockLine, day, month };
  root.TODTrack = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
