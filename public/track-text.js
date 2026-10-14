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
      parts.push(`In the backtest (${month(doc.backtest.from)}–${month(doc.backtest.to)}, ${t.backtest.signalsUsed} of ${t.signals} signals), ${tk}'s tailwind/headwind leans were up/down right over 1 month ${bt.hits} of ${bt.calls} times (${fmtPct(bt.hits, bt.calls)}). Beat the market (did the stock do better than the S&P 500 over the same time, or worse for a headwind): ${bt.vsMktHits} of ${bt.vsMktCalls} times (${fmtPct(bt.vsMktHits, bt.vsMktCalls)}).${bt.vsSecCalls ? ` Beat its sector (${t.sectorEtf || "sector ETF"}): ${bt.vsSecHits} of ${bt.vsSecCalls} times (${fmtPct(bt.vsSecHits, bt.vsSecCalls)}).` : ""}`);
    } else if (t.backtest) {
      parts.push(`No backtested calls for ${tk} yet.`);
    }
    if (lv && lv.calls) parts.push(`Live so far: up/down right ${lv.hits} of ${lv.calls}${lv.vsMktCalls ? `, beat the market ${lv.vsMktHits} of ${lv.vsMktCalls}` : ""}.`);
    else if (live.startedOn) parts.push(`Live tracking started ${day(live.startedOn)}.`);
    return parts.join(" ");
  }

  // "Beat the market": the tougher, fairer test. A tailwind counts if the stock did better than the
  // S&P 500 over the same days; a headwind counts if it did worse. Uses vsMktHits / vsMktCalls.
  const BEAT_LABEL = "Beat the market";
  const BEAT_EXPLAIN = "Beat the market: did this stock do better than the S&P 500 over the same time? (For a headwind lean, the test is whether it did worse.) This is the tougher, fairer test, because in a rising market almost every stock goes up.";
  const UPDOWN_LABEL = "Up/down right";
  const SECTOR_EXPLAIN = "Beat its sector: the same test against the company's sector fund (for example XLK for tech stocks), so a chip maker is judged against other tech stocks, not the whole market.";
  // Both scores side by side, in plain English. Returns null when there are no calls.
  function bothScores(s) {
    if (!s || !s.calls) return null;
    return { upDown: { hits: s.hits, calls: s.calls, pct: pct(s.hits, s.calls), text: fmtPct(s.hits, s.calls) },
      beat: s.vsMktCalls ? { hits: s.vsMktHits, calls: s.vsMktCalls, pct: pct(s.vsMktHits, s.vsMktCalls), text: fmtPct(s.vsMktHits, s.vsMktCalls) } : null };
  }
  const api = { pct, fmtPct, verdict, stockLine, day, month, bothScores, BEAT_LABEL, BEAT_EXPLAIN, UPDOWN_LABEL, SECTOR_EXPLAIN };
  root.TODTrack = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
