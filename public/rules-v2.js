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
// Phase 2 checks (Oct 20 2026): late-filing review, insider buys in a point-in-time top-500, and new EDGAR signals.
(async () => {
  const el = document.getElementById("p2-body"); if (!el) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const p = (x) => (x == null ? "–" : `${x}%`), ci = (c) => (c ? `${c[0]}–${c[1]}%` : "–"), sg = (x) => (x > 0 ? "+" : "") + x;
  const tr = (label, r) => `<tr><td>${label}</td><td>${r.raw.toLocaleString()} / ${r.indep.toLocaleString()}</td><td>${sg(r.mean)}%</td><td>${p(r.hit)} (${ci(r.ci)})</td><td>${p(r.base)}</td><td>${p(r.flip)}</td></tr>`;
  const head = '<thead><tr><th>Test</th><th>Events (all / indep.)</th><th>Avg vs benchmark</th><th>Right (95% range)</th><th>Baseline</th><th>Flipped</th></tr></thead>';
  const cal = (c) => ["SPY", "IWM", "IWC"].map((b) => c[b] ? `${b} ${sg(c[b].meanMonthly)}%/mo (t ${c[b].nwT})` : "").join(" · ") + ` over ${c.months} months`;
  try {
    const d = await (await fetch("/data/phase2.json")).json(), L = d.lateFilings;
    const lf = ["none", "oldfilter", "cap"].flatMap((m) => [21, 63].map((h) => tr(`${{ none: "No filter", oldfilter: "Old filter (≥$1, ≤500%)", cap: "Capped ±100%" }[m]}, ${h === 21 ? "1 mo" : "3 mo"}, vs SPY`, L.threeWays[`${m}|${h}|SPY`]))).join("");
    const sv = ["0", "-0.3", "-1"].map((x) => tr(`Failed firms at ${x === "0" ? "0" : x === "-0.3" ? "−30" : "−100"}%, 3 mo, vs SPY`, L.survivorship.runs[`${x === "-1" ? "-1.0" : x}|63|SPY`])).join("");
    const I = d.insiderBuys;
    const ins = [21, 63].map((h) => tr(`Insider buys, ${h === 21 ? "1 mo" : "3 mo"}, vs SPY`, I.runs[`cap|${h}|SPY`])).join("");
    const ns = Object.entries(d.newSignals).map(([n, o]) => `<tr><td>${esc(n)} <span class="n">(${o.rule.horizonDays === 21 ? "1 mo" : "3 mo"}, expects ${o.rule.direction})</span></td><td>${o.test.SPY.raw.toLocaleString()} / ${o.test.SPY.indep.toLocaleString()}</td><td>${sg(o.test.SPY.mean)}%</td><td>${p(o.test.SPY.hit)} (${ci(o.test.SPY.ci)})</td><td>${p(o.test.SPY.base)}</td><td>${p(o.test.SPY.flip)}</td><td>${o.testCalendar.SPY ? `${sg(o.testCalendar.SPY.meanMonthly)}%/mo, t ${o.testCalendar.SPY.nwT}` : "–"}</td><td>${o.confirmed ? "Confirmed (with caution)" : "Not confirmed"}</td></tr>`).join("");
    el.innerHTML = `<h3 class="tr-h3">Late-filing notices: ${esc(L.status)}</h3>
      <div class="tblwrap"><table class="tbl">${head}<tbody>${lf}${sv}</tbody></table></div>
      <p class="n">Calendar-time portfolio (each month, equal-weight every stock with a notice in the prior 3 months): ${cal(L.calendar)}. Of ${L.survivorship.noPrice.toLocaleString()} notices with no price history, ${L.survivorship.counts.failed.toLocaleString()} were classified as failed, ${L.survivorship.counts.acquired.toLocaleString()} as acquired and ${L.survivorship.counts.unknown.toLocaleString()} as unknown (Form 25, Form 15 and 8-K Item 2.01).</p>
      <h3 class="tr-h3">Insider buying, point-in-time top 500: fails</h3>
      <div class="tblwrap"><table class="tbl">${head}<tbody>${ins}</tbody></table></div>
      <p class="n">${esc(I.universe)} Calendar-time: ${cal(I.calendar)}.</p>
      <h3 class="tr-h3">New EDGAR signals: rule picked on 2012–2020, checked once on 2021–2026</h3>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Signal</th><th>Test events (all / indep.)</th><th>Avg vs SPY</th><th>Right (95% range)</th><th>Baseline</th><th>Flipped</th><th>Calendar-time vs SPY</th><th>Result</th></tr></thead><tbody>${ns}</tbody></table></div>
      <ul class="caveats">${d.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
  } catch { el.innerHTML = '<p class="n">Could not load the results.</p>'; }
})();
