// /track "Can we beat a coin flip?" section: renders public/data/signal-study.json (scripts/model-study.mjs).
(async () => {
  const el = document.getElementById("study-body"); if (!el) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let d;
  try { const r = await fetch("/data/signal-study.json", { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); d = await r.json(); }
  catch { el.innerHTML = `<p class="warnbox">The study results aren't available right now. Please try again later.</p>`; return; }
  const p = (x) => (x == null ? "n/a" : `${x.toFixed(1)}%`);
  const rng = (c) => (c ? `${c[0].toFixed(0)}–${c[1].toFixed(0)}%` : "n/a");
  const sg = (x) => (x == null ? "n/a" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(1)}%`);
  const m = d.models.primary, v1 = m.v1, v2 = m.v2;
  const row = (label, a) => `<tr><td>${label}</td><td>${a.calls} of ${a.total} <span class="n">(${p(a.coverage)})</span></td><td><b>${p(a.rate)}</b> <span class="n">${rng(a.ci)}</span></td><td><b>${p(a.rateX)}</b> <span class="n">${rng(a.ciX)}</span></td></tr>`;
  const kept = d.signals.filter((s) => s.wouldKeep).length;
  el.innerHTML = `
    <div class="tr-verdict"><p><strong>Result: ${d.verdict.improved ? "a real improvement" : "no real improvement"}.</strong> ${esc(d.verdict.text)}</p></div>
    <h3 class="tr-h3">Old vs new method, tested on ${esc(d.testYears.join(", "))} (1 month, never seen in training)</h3>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Method</th><th>Calls made (coverage)</th><th>Direction right (95% range)</th><th>Beat or lagged S&amp;P 500, as leaned (95% range)</th></tr></thead><tbody>
      ${row("Original: more tailwinds than headwinds", v1)}
      ${row("Weighted: kept signals only, lean when they agree", v2)}
      ${row("Stricter keep rule (55%)", d.models.stricter.v2)}
    </tbody></table></div>
    <p class="n">The weighted method makes fewer calls (it says "quiet" more), but its hit rate stays inside the range a coin flip would produce. Small edges like 1 or 2 points are normal in markets and can easily be luck at these sample sizes. ${d.configurationsTried} configurations were tried in total (${Object.keys(d.models).length} model rules and ${d.candidates.length} new data sources); the conviction threshold was picked from {${d.thresholdOptions.join(", ")}} using past data only, and past data always chose ${esc(String(m.folds[0].threshold))}.</p>
    <h3 class="tr-h3">New free data we tested</h3>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Source</th><th>For</th><th>Vs S&amp;P out of sample</th><th>Change</th><th>Added?</th></tr></thead><tbody>
      ${d.candidates.map((c) => `<tr><td><a href="${esc(c.url)}" rel="noopener">${esc(c.name)}</a></td><td>${esc(c.for.join(", "))}</td><td>${p(c.oos.rateX)}</td><td>${c.changeVsBase > 0 ? "+" : ""}${c.changeVsBase.toFixed(1)} pts</td><td>${c.admitted ? "Yes" : "No, under the 1-point bar"}</td></tr>`).join("")}
    </tbody></table></div>
    <details><summary>Every signal, scored on its own (${d.signals.length} signals, ${kept} would be kept today)</summary>
    <p class="n">"Avg vs S&amp;P" is the stock's average 1-month move minus SPY after the signal read up or down. Kept means it beat the S&amp;P 500 the way it leaned on more than half of at least 8 calls.</p>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Stock</th><th>Signal</th><th>Calls</th><th>Vs S&amp;P right (95% range)</th><th>Avg vs S&amp;P when up</th><th>Avg vs S&amp;P when down</th><th>Kept?</th></tr></thead><tbody>
      ${d.signals.map((s) => `<tr><td>${esc(s.tk)}</td><td>${esc(s.name)}</td><td>${s.calls}</td><td>${p(s.rateX)} <span class="n">${rng(s.ciX)}</span></td><td>${sg(s.upAvgX)} <span class="n">(${s.upN})</span></td><td>${sg(s.downAvgX)} <span class="n">(${s.downN})</span></td><td>${s.wouldKeep ? "Kept" : "Muted"}</td></tr>`).join("")}
    </tbody></table></div></details>`;
})();
