// Renders the Oct 20 2026 per-stock rules and the two EDGAR event studies on /track.
(async () => {
  const el = document.getElementById("v2-body"); if (!el) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const p = (x) => (x == null ? "–" : `${x}%`), ci = (c) => (c ? `${c[0]}–${c[1]}%` : "–");
  try {
    const [s, e] = await Promise.all(["/data/single-stock-study.json", "/data/event-study.json"].map((u) => fetch(u).then((r) => r.json())));
    const ev = e.tests.map((t) => ["21d", "63d"].map((h) => { const r = t.results[h]; return `<tr><td>${esc(t.name)} <span class="n">(${h === "21d" ? "1 month" : "3 months"}, expects ${t.direction})</span></td><td>${r.years.join("–")}</td><td>${r.raw.n.toLocaleString()} / ${r.independent.n.toLocaleString()}</td><td>${r.independent.meanExcess > 0 ? "+" : ""}${r.independent.meanExcess}%</td><td>${p(r.independent.hitVsSpy)} (${ci(r.independent.ci)})</td><td>${p(r.baseline)}</td><td>${p(r.independent.flippedHit)}</td><td>${t.statusByHorizon ? (t.statusByHorizon[h].startsWith("Passed") ? `<strong>${esc(t.statusByHorizon[h])}</strong>` : esc(t.statusByHorizon[h])) : r.passes ? "<strong>Passed</strong>" : "Tried"}</td></tr>`; }).join("")).join("");
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
    const I = d.insiderBuys, U = d.survivorshipUnknownAtZero, UD = U.unknownDetail;
    const UK = { note: `Before: notices from companies with no price history and no delisting or deregistration filing (Form 25 or 15) within 400 days were left out entirely: ${UD["21"].independentWindows + UD["21"].insideAnEarlierWindowSameCompany + UD["21"].windowNotFinished} notices from ${UD.companies.toLocaleString()} companies, ${UD.noCurrentTicker.toLocaleString()} of them with no current ticker at all (mostly never exchange-listed). Now each is added as a 0% return. At 3 months, ${UD["63"].independentWindows.toLocaleString()} count as separate events and ${UD["63"].insideAnEarlierWindowSameCompany.toLocaleString()} fall inside an earlier notice's window from the same company (at 1 month: ${UD["21"].independentWindows.toLocaleString()} and ${UD["21"].insideAnEarlierWindowSameCompany}). A 0% return is not neutral: it counts as "lagged" whenever SPY rose, so this version flatters the signal and is shown only as a bound.` };
    const uk = [21, 63].map((h) => tr(`Unknowns 0%, failed 0%, ${h === 21 ? "1 mo" : "3 mo"}, vs SPY`, U.runs[`0|${h}|SPY`])).join("");
    const C = d.control, cr = (k, lab) => { const o = C[k]; if (!o) return ""; const v = o.vsControl; return `<tr><td>${lab}</td><td>${o.events.toLocaleString()}</td><td>${sg(v.meanExcess)}% (${v.meanCI[0]} to ${v.meanCI[1]}%)</td><td>${v.hitDown}% (${ci(v.ci)})</td><td>${o.placeboHitDown}%</td><td>${sg(o.vsEW.meanExcess)}%</td><td>${sg(o.calendar.control.meanMonthly)}%/mo, t ${o.calendar.control.nwT}, ${o.calendar.control.months} mo</td><td>${sg(o.calendar.ew.meanMonthly)}%/mo, t ${o.calendar.ew.nwT}</td></tr>`; };
    const ctl = [["Late-filing notices|21", "Late filings, 1 mo"], ["Late-filing notices|63", "Late filings, 3 mo"], ["8-K 4.01 auditor change|21", "Auditor changes, 1 mo"], ["8-K 4.01 auditor change|63", "Auditor changes, 3 mo"], ["8-K 4.01 auditor change|63|2012-2020", "Auditor changes, 3 mo, 2012–2020"], ["8-K 4.01 auditor change|63|2021-2026", "Auditor changes, 3 mo, 2021–2026"]].map(([k, l]) => cr(k, l)).join("");
    const ins = [21, 63].map((h) => tr(`Insider buys, ${h === 21 ? "1 mo" : "3 mo"}, vs SPY`, I.runs[`cap|${h}|SPY`])).join("");
    const ns = Object.entries(d.newSignals).map(([n, o]) => `<tr><td>${esc(n)} <span class="n">(${o.rule.horizonDays === 21 ? "1 mo" : "3 mo"}, expects ${o.rule.direction})</span></td><td>${o.test.SPY.raw.toLocaleString()} / ${o.test.SPY.indep.toLocaleString()}</td><td>${sg(o.test.SPY.mean)}%</td><td>${p(o.test.SPY.hit)} (${ci(o.test.SPY.ci)})</td><td>${p(o.test.SPY.base)}</td><td>${p(o.test.SPY.flip)}</td><td>${o.testCalendar.SPY ? `${sg(o.testCalendar.SPY.meanMonthly)}%/mo, t ${o.testCalendar.SPY.nwT}` : "–"}</td><td>${esc(o.status)}</td></tr>`).join("");
    el.innerHTML = `<h3 class="tr-h3">Late-filing notices</h3>
      <p><strong>${esc(L.status)}</strong></p>
      <ul class="caveats">${(L.caveats || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>3 months vs size-matched stocks</th><th>Events</th><th>Avg (95% range)</th><th>Lagged control</th><th>Placebo</th><th>Month-by-month</th></tr></thead><tbody>${Object.entries(L.split3m || {}).map(([k, v]) => `<tr><td>${k.replace("-", "–")}</td><td>${v.events.toLocaleString()}</td><td>${sg(v.meanVsControl)}% (${v.meanCI[0]} to ${v.meanCI[1]}%)</td><td>${v.laggedControl}% (${ci(v.ci)})</td><td>${v.placebo}%</td><td>${sg(v.calendar.meanMonthly)}%/mo, t ${v.calendar.nwT}, ${v.calendar.months} mo</td></tr>`).join("")}</tbody></table></div>
      <div class="tblwrap"><table class="tbl">${head}<tbody>${lf}${sv}</tbody></table></div>
      <p class="n">Calendar-time portfolio (each month, equal-weight every stock with a notice in the prior 3 months): ${cal(L.calendar)}. Of ${L.survivorship.noPrice.toLocaleString()} notices with no price history, ${L.survivorship.counts.failed.toLocaleString()} were classified as failed, ${L.survivorship.counts.acquired.toLocaleString()} as acquired and ${L.survivorship.counts.unknown.toLocaleString()} as unknown (Form 25, Form 15 and 8-K Item 2.01).</p>
      <h3 class="tr-h3">Late filings and auditor changes vs a matched control group</h3>
      <p class="n">Each filing is compared with the average of stocks in the same market-cap tenth (decile) in the same month that did not file one, over the same days, and with an equal-weight average of the whole universe (about 3,000 sized stocks a month). "Placebo" is how often a stock with no filing ends up below its own decile average. Single stocks lag the average more often than not, so this placebo rate is the fair bar, not 50%.</p>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Test</th><th>Events</th><th>Avg vs matched control (95% range)</th><th>Lagged control (95% range)</th><th>Placebo</th><th>Avg vs whole universe</th><th>Month-by-month vs control</th><th>Month-by-month vs universe</th></tr></thead><tbody>${ctl}</tbody></table></div>
      <p class="n">Filings from companies we could not size (no 10-K/10-Q share count, or no price) are left out: about 4,200 late-filing notices and 850 auditor changes.</p>
      <h3 class="tr-h3">Late filings with unclassified delisted companies counted at 0%</h3>
      <p class="n">${esc(UK.note)}</p>
      <div class="tblwrap"><table class="tbl">${head}<tbody>${uk}</tbody></table></div>
      <p class="n">Month-by-month vs SPY with failed firms at 0%, −30% and −100%: ${["0", "-0.3", "-1.0"].map((x) => { const c = U.runs[x + "|calendar"].SPY; return `${sg(c.meanMonthly)}%/mo (t ${c.nwT})`; }).join(", ")}.</p>
      <p class="n">${esc(d.eventCountNote)}</p>
      <h3 class="tr-h3">Insider buying, point-in-time top 500: fails (corrected)</h3>
      <div class="tblwrap"><table class="tbl">${head}<tbody>${ins}</tbody></table></div>
      <p class="n">${esc(I.fix)} ${esc(I.universe)} Entry is the close of the first trading day after the Form 4 filing date, never the trade date; in every event the trade came first (median 2 days earlier). Month-by-month: ${cal(I.calendar)}.</p>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Hand-checked event</th><th>Trade</th><th>Filed</th><th>Entry (adj. close)</th><th>Exit 63 days later</th><th>Stock</th><th>SPY</th><th>Difference</th></tr></thead><tbody>${I.walkthrough.map((w) => `<tr><td><a href="${esc(w.link)}" rel="nofollow">${esc(w.ticker)} Form 4</a></td><td>${w.trade}</td><td>${w.filed}</td><td>${w.entry} $${w.entryPx}</td><td>${w.exit} $${w.exitPx}</td><td>${sg(w.stock)}%</td><td>${sg(w.spy)}%</td><td>${sg(w.excess)}%</td></tr>`).join("")}</tbody></table></div>
      <h3 class="tr-h3">New EDGAR signals: rule picked on 2012–2020, checked once on 2021–2026</h3>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Signal</th><th>Test events (all / indep.)</th><th>Avg vs SPY</th><th>Right (95% range)</th><th>Baseline</th><th>Flipped</th><th>Calendar-time vs SPY</th><th>Result</th></tr></thead><tbody>${ns}</tbody></table></div>
      <ul class="caveats">${d.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
  } catch { el.innerHTML = '<p class="n">Could not load the results.</p>'; }
})();
// Live late-filing test (since Oct 2026): scored events vs frozen size-matched controls.
(async () => {
  const el = document.getElementById("live-body"); if (!el) return;
  const sg = (x) => (x > 0 ? "+" : "") + x;
  try {
    const s = await (await fetch("/data/live-late-filings-summary.json", { cache: "no-store" })).json();
    const t = s.months >= 24 && s.monthlyT != null ? `t ${s.monthlyT} over ${s.months} months` : `Too early to judge (${s.months} of 24 months needed)`;
    el.innerHTML = `<div class="tblwrap"><table class="tbl"><tbody>
      <tr><th>Notices logged</th><td>${s.logged.toLocaleString()} (${s.scorable.toLocaleString()} could be size-matched)</td></tr>
      <tr><th>Scored after 3 months</th><td>${s.scored.toLocaleString()}${s.pending ? ` (${s.pending.toLocaleString()} still waiting)` : ""}</td></tr>
      <tr><th>Average gap vs matched stocks</th><td>${s.scored ? `${sg(s.avgGap)}%${s.avgGapCI ? ` (95% range ${s.avgGapCI[0]} to ${s.avgGapCI[1]}%)` : ""}` : "–"}</td></tr>
      <tr><th>Lagged their matched stocks</th><td>${s.scored ? `${s.lagged}%${s.laggedCI ? ` (${s.laggedCI[0]}–${s.laggedCI[1]}%)` : ""} vs placebo ${s.placebo}%` : "–"}</td></tr>
      <tr><th>Month-by-month t-stat</th><td>${t}</td></tr></tbody></table></div>
      <p class="n">Backtest for comparison (2012–2026): about −4% vs matched stocks, lagged 60.8% vs placebo 55.7%. Updated ${new Date(s.updatedAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}.</p>`;
  } catch { el.innerHTML = '<p class="n">Live results are not available yet.</p>'; }
})();
