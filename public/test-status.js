// Test-status badges: has this signal been tested, and did it predict anything?
// Data: /data/signal-status.json (built from the backtest in public/data/scoreboard.json by scripts/signal-status.mjs).
//   "Tested: no predictive power found" -> links to the signal's backtest row on /scoreboard
//   "Not tested yet"                    -> no dated history to backtest (row on /scoreboard says why)
//   "Passed"                            -> only results that pass on /track (today: late filings, 3 months)
(function (root) {
  "use strict";
  let DOC = null, loading = null;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const set = (d) => { DOC = d; return d; };
  const load = () => loading || (loading = (typeof fetch === "function" ? fetch("/data/signal-status.json", { cache: "default" }).then((r) => (r.ok ? r.json() : null)).then(set).catch(() => null) : Promise.resolve(null)));
  const forSignal = (tk, id) => (DOC && DOC.signals[`${tk}|${id}`]) || null;
  const CLS = { tested: "ts-tested", untested: "ts-untested", passed: "ts-passed", review: "ts-untested" };
  function pill(x, title) {
    if (!x) return "";
    return `<a class="ts-badge ${CLS[x.status] || ""}" href="${esc(x.link)}" title="${esc(title || x.label)}">${esc(x.label)}</a>`;
  }
  const signalBadge = (tk, id) => {
    const x = forSignal(tk, id);
    if (!x) return "";
    const t = x.status === "tested" ? `Backtested (${x.calls} monthly calls). It did not beat a coin flip by more than chance. See the result.` : x.status === "untested" ? `Not tested yet${x.why ? `: ${x.why}` : ""}` : x.label;
    return pill(x, t);
  };
  const stockBadge = () => (DOC ? pill(DOC.stock, DOC.stock.note) : "");
  root.TODStatus = { load, set, forSignal, signalBadge, stockBadge, get doc() { return DOC; } };
})(typeof window !== "undefined" ? window : globalThis);
