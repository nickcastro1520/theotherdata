// Renders the Oct 20 2026 per-stock rules and the two EDGAR event studies on /track.
(async () => {
  const el = document.getElementById("v2-body"); if (!el) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const p = (x) => (x == null ? "–" : `${x}%`), ci = (c) => (c ? `${c[0]}–${c[1]}%` : "–");
  try {
    const [s, e] = await Promise.all(["/data/single-stock-study.json", "/data/event-study.json"].map((u) => fetch(u).then((r) => r.json())));
    const ev = e.tests.map((t) => ["21d", "63d"].map((h) => { const r = t.results[h]; return `<tr><td>${esc(t.name)} <span class="n">(${h === "21d" ? "1 month" : "3 months"}, expects ${t.direction})</span></td><td>${r.years.join("–")}</td><td>${r.raw.n.toLocaleString()} / ${r.independent.n.toLocaleString()}</td><td>${r.independent.meanExcess > 0 ? "+" : ""}${r.independent.meanExcess}%</td><td>${p(r.independent.hitVsSpy)} (${ci(r.independent.ci)})</td><td>${p(r.baseline)}</td><td>${p(r.independent.flippedHit)}</td><td>${t.status === "review" ? "Under review, not yet a pass" : r.passes ? "<strong>Passed</strong>" : "Tried"}</td></tr>`; }).join("")).join("");
    const ss = s.signals.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.from?.slice(0, 7))} to ${esc(r.to?.slice(0, 7))}</td><td>${r.rawCalls} / ${r.events}</td><td>${p(r.eventHitVsSpy)} (${ci(r.eventCI)})</td><td>${p(r.eventBaseline)}</td><td>${p(r.eventFlipped)}</td><td>${r.pass ? "<strong>Passed</strong>" : "Tried"}</td></tr>`).join("");
    el.innerHTML = `<h3 class="tr-h3">Filing events across many stocks</h3>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Test</th><th>Years</th><th>Events (all / independent)</th><th>Avg vs S&amp;P 500</th><th>Right vs S&amp;P 500 (95% range)</th><th>Baseline</th><th>Flipped</th><th>Result</th></tr></thead><tbody>${ev}</tbody></table></div>
      <p class="n">${esc(e.tests.map((t) => t.bias).join(" "))}</p>
      <h3 class="tr-h3">Single-stock data signals, full history</h3>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Signal</th><th>Months</th><th>Calls / independent events</th><th>Right vs S&amp;P 500 (95% range)</th><th>Baseline</th><th>Flipped</th><th>Result</th></tr></thead><tbody>${ss}</tbody></table></div>`;
  } catch { el.innerHTML = '<p class="n">Could not load the results.</p>'; }
})();
