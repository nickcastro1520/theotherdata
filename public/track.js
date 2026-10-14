// /track page: renders public/data/track-record.json (written by scripts/track-record.mjs).
(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TT = window.TODTrack;
  let doc;
  try { const r = await fetch("/data/track-summary.json", { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); doc = await r.json(); }
  catch { $("#tr-status").innerHTML = `<p class="warnbox">The track record file isn't available right now. Please try again later.</p>`; return; }
  const W = doc.windows, P = doc.primary;
  const wl = (k) => (W.find((w) => w.key === k) || {}).label || k;
  const signed = (x) => (x == null ? "n/a" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(1)}%`);
  const ratio = (h, n) => (n ? `<b>${TT.fmtPct(h, n)}</b> <span class="n">${h} of ${n}</span>` : `<span class="n">no calls yet</span>`);
  const bt = doc.backtest, live = doc.live;
  const sigTip = (sig) => (sig || "").split(",").filter(Boolean).map((x) => { const [id, r] = x.split(":"); return `${id}: ${r === "+" ? "tailwind" : r === "-" ? "headwind" : "neutral"}`; }).join(" · ");
  const LEAN = { tailwind: ["tailwind", "Tailwind"], headwind: ["headwind", "Headwind"], mixed: ["", "Mixed"], quiet: ["", "Quiet"] };

  // ---- status: live vs backtest ----
  const lvS = live.summary?.[W[0].key] || {};
  const liveBody = lvS.calls
    ? `<p>${live.sampled} weekly snapshots scored so far. 2 weeks: up/down right ${ratio(lvS.hits, lvS.calls)} · beat the market ${ratio(lvS.vsMktHits, lvS.vsMktCalls)}.</p>`
    : `<p>No live results yet. The first 2-week results land after <b>${esc(TT.day(live.firstResultsAfter))}</b>, then 1-month and 1-quarter results follow.</p>`;
  $("#tr-status").innerHTML = `
    <div class="tr-card live-card"><span class="pill live">Live</span>
      <h2>${live.startedOn ? `Live tracking started ${esc(TT.day(live.startedOn))}` : "Live tracking starts with the next refresh"}</h2>
      <p>${live.snapshots} lean snapshots logged so far (one per stock per day), each with the stock's price at the time. The log is append-only, so past calls can't be edited.</p>
      ${liveBody}</div>
    <div class="tr-card bt-card"><span class="pill bt">Backtest · reconstructed</span>
      <h2>${esc(TT.month(bt.from))} – ${esc(TT.month(bt.to))}: ${bt.records} leans</h2>
      <p>What the signals <em>would have</em> said on the 1st of each month, rebuilt only from data that was public by then. Kept separate from live results.</p>
      <p class="n">Prices: ${esc(doc.priceSource.name)}, through ${esc(TT.day(doc.pricesThrough))}. Benchmark: ${esc(doc.benchmark.name)}.</p></div>`;

  // ---- backtest summary ----
  const p = bt.summary[P];
  $("#bt-sub").textContent = `${bt.records} monthly leans across ${Object.keys(doc.tickers || {}).length || "our"} stocks. ${p.calls} were tailwind or headwind calls that have a scored 1-month result; ${p.noCall} were mixed or quiet (no call).`;
  const v = TT.verdict(p);
  $("#bt-verdict").className = `tr-verdict ${v.key}`;
  $("#bt-verdict").innerHTML = `<p class="k">The honest read · 1 month</p><p>${esc(v.text)}</p>`;
  $("#bt-tiles").innerHTML = `
    <div class="tr-tile"><p class="k">Up/down right</p><p class="big">${TT.fmtPct(p.hits, p.calls)}</p><p class="n">${p.hits} of ${p.calls} calls · 1 month</p></div>
    <div class="tr-tile"><p class="k">Beat the market</p><p class="big">${TT.fmtPct(p.vsMktHits, p.vsMktCalls)}</p><p class="n">${p.vsMktHits} of ${p.vsMktCalls} · a coin flip is 50%</p></div>
    <div class="tr-tile"><p class="k">Beat its sector</p><p class="big">${TT.fmtPct(p.vsSecHits, p.vsSecCalls)}</p><p class="n">${p.vsSecHits ?? 0} of ${p.vsSecCalls ?? 0} · vs the stock's sector ETF</p></div>
    <div class="tr-tile"><p class="k">"Always guess up" on the same calls</p><p class="big">${p.upShare == null ? "n/a" : `${(p.upShare * 100).toFixed(1)}%`}</p><p class="n">How often these stocks simply rose</p></div>
    <p class="tr-explain"><strong>Up/down right:</strong> did the stock move the way the lean pointed? <strong>${esc(TT.BEAT_EXPLAIN)}</strong> ${esc(TT.SECTOR_EXPLAIN)} <a href="/scoreboard">See every signal on the scoreboard →</a></p>`;
  $("#bt-table tbody").innerHTML = W.map((w) => { const s = bt.summary[w.key]; return `<tr><td>${esc(w.label)}</td><td>${s.calls}</td><td>${ratio(s.hits, s.calls)}</td><td>${ratio(s.vsMktHits, s.vsMktCalls)}</td><td>${ratio(s.vsSecHits || 0, s.vsSecCalls || 0)}</td><td>${s.upShare == null ? "n/a" : `${(s.upShare * 100).toFixed(1)}%`}</td><td>${signed(s.tailwind.avgX)} <span class="n">(${s.tailwind.n})</span></td><td>${signed(s.headwind.avgX)} <span class="n">(${s.headwind.n})</span></td></tr>`; }).join("");

  // ---- per stock ----
  $("#tr-stocks").innerHTML = Object.entries(doc.tickers).map(([tk, t]) => {
    const s = t.backtest.summary[P];
    const lt = t.live.latest;
    return `<article class="tr-stock" id="t-${esc(tk)}">
      <div class="tr-s-head"><div><a class="tk" href="/#/${esc(tk)}">${esc(tk)}</a> <span class="nm">${esc(t.name)}</span></div>
        <span class="n">${t.backtest.signalsUsed} of ${t.signals} signals backtested</span></div>
      <div class="tr-s-nums"><div><p class="k">Up/down right</p><p>${ratio(s.hits, s.calls)}</p></div><div><p class="k">Beat the market</p><p>${ratio(s.vsMktHits, s.vsMktCalls)}</p></div><div><p class="k">Beat its sector${t.sectorEtf ? ` (${esc(t.sectorEtf)})` : ""}</p><p>${ratio(s.vsSecHits || 0, s.vsSecCalls || 0)}</p></div><div><p class="k">Tail / head calls</p><p><b>${s.tailwind.n}</b> <span class="n">/</span> <b>${s.headwind.n}</b></p></div></div>
      <div class="sqs" data-tk="${esc(tk)}" aria-label="Monthly backtest results, oldest to newest"><span class="n">Loading monthly results…</span></div>
      ${lt ? `<p class="tr-live-line"><span class="pill live">Live</span> Latest lean ${esc(TT.day(lt.d))}: <span class="badge ${(LEAN[lt.lean] || [""])[0]}">${esc((LEAN[lt.lean] || ["", lt.lean])[1])}</span>${lt.px != null ? ` at $${esc(lt.px.toFixed(2))}` : ""}</p>` : ""}
      <details><summary>Every checkpoint (hover a lean to see its signals)</summary><div class="tblwrap"><table class="tbl tr-hist"><thead><tr><th>Date</th><th>Lean</th><th>Stock</th><th>Vs S&amp;P</th><th>Up/down right?</th><th>Beat the market?</th><th>Beat its sector?</th></tr></thead><tbody data-tk="${esc(tk)}"><tr><td colspan="7" class="n">Loading…</td></tr></tbody></table></div></details>
    </article>`;
  }).join("");

  // ---- per stock, lazy: monthly squares load as each stock scrolls into view; the full table only when opened ----
  const hist = new Map();
  const loadHist = (tk) => { if (!hist.has(tk)) hist.set(tk, fetch(`/data/track/${encodeURIComponent(tk)}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j) => j?.history || null).catch(() => null)); return hist.get(tk); };
  const sqHtml = (h) => h.map((r) => {
    const c = r.w[P];
    const cls = !LEAN[r.lean] || r.lean === "mixed" || r.lean === "quiet" ? "none" : !c ? "open" : c.hitX == null ? "open" : c.hitX ? "hit" : "miss";
    const tip = `${r.d}: ${LEAN[r.lean]?.[1] || r.lean}${c ? ` · stock ${signed(c.r)}${c.x != null ? `, vs S&P ${signed(c.x)}` : ""}` : cls === "open" ? " · window still open" : ""}`;
    return `<i class="sq ${cls}" title="${esc(tip)}"></i>`;
  }).join("");
  const rowsHtml = (h) => h.slice().reverse().map((r) => {
    const c = r.w[P];
    const [lc, ll] = LEAN[r.lean] || ["", r.lean];
    const call = r.lean === "tailwind" || r.lean === "headwind";
    const yn = (v) => (v == null ? "" : v ? `<span class="ok">✓ yes</span>` : `<span class="bad">✗ no</span>`);
    const cell = (k) => (!c ? `<span class="n">open</span>` : call ? yn(c[k]) : `<span class="n">no call</span>`);
    return `<tr><td>${esc(r.d)}</td><td><span class="badge ${lc}" title="${esc(sigTip(r.sig))}">${esc(ll)}</span></td><td>${c ? signed(c.r) : "n/a"}</td><td>${c && c.x != null ? signed(c.x) : "n/a"}</td><td>${cell("hit")}</td><td>${cell("hitX")}</td><td>${cell("hitS")}</td></tr>`;
  }).join("");
  const fail = `<span class="n">Couldn't load this stock's monthly results. Please refresh.</span>`;
  const fillSq = async (el) => { const h = await loadHist(el.dataset.tk); el.innerHTML = h ? sqHtml(h) : fail; };
  const sqEls = [...document.querySelectorAll(".sqs[data-tk]")];
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); fillSq(e.target); } }, { rootMargin: "600px 0px" });
    sqEls.forEach((el) => io.observe(el));
  } else sqEls.forEach(fillSq);
  $("#tr-stocks").addEventListener("toggle", async (e) => {
    const d = e.target; if (!d.open) return;
    const tb = d.querySelector("tbody[data-tk]"); if (!tb || tb.dataset.done) return;
    tb.dataset.done = "1";
    const h = await loadHist(tb.dataset.tk);
    tb.innerHTML = h ? rowsHtml(h) : `<tr><td colspan="7">${fail}</td></tr>`;
  }, true);

  // ---- live table ----
  $("#live-sub").textContent = live.startedOn
    ? `Logged once a day by the scheduled refresh since ${TT.day(live.startedOn)}. Scored on the first snapshot of each week per stock, using Tiingo closing prices. Latest snapshot ${new Date(live.lastSnapshot).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}.`
    : "Live logging starts with the next scheduled refresh.";
  $("#live-table tbody").innerHTML = Object.entries(doc.tickers).map(([tk, t]) => {
    const lt = t.live.latest; if (!lt) return "";
    const [lc, ll] = LEAN[lt.lean] || ["", lt.lean];
    const s = t.live.summary[W[0].key];
    return `<tr><td><a href="/#/${esc(tk)}">${esc(tk)}</a></td><td><span class="badge ${lc}">${esc(ll)}</span> <span class="n">${esc(lt.mag)}</span></td><td>${lt.px != null ? `$${esc(lt.px.toFixed(2))}` : "n/a"}</td><td>${esc(TT.day(lt.d))} <span class="n">(${t.live.snapshots} so far)</span></td>${s.calls ? `<td>${ratio(s.hits, s.calls)}</td><td>${ratio(s.vsMktHits, s.vsMktCalls)}</td>` : `<td colspan="2"><span class="n">first results after ${esc(TT.day(live.firstResultsAfter))}</span></td>`}</tr>`;
  }).join("");

  // ---- method ----
  $("#rules").innerHTML = Object.values(doc.rules).map((r) => `<li>${esc(r)}</li>`).join("") + `<li>Windows: ${W.map((w) => `${esc(w.label)} (${w.days} days)`).join(", ")}. Headline numbers use ${esc(wl(P))}.</li>`;
  const lagRows = [];
  for (const [tk, c] of Object.entries(bt.coverage)) for (const u of c.used) lagRows.push([tk, u]);
  $("#bt-method").innerHTML = `<li>${esc(bt.note)}</li>
    <li>Every checkpoint runs the <strong>same code</strong> the live site uses to turn a series into a tailwind, headwind, or neutral reading and to combine readings into an overall lean.</li>
    ${bt.pointInTime ? `<li><strong>Numbers as published at the time.</strong> Federal Reserve (FRED) series come from <a href="https://alfred.stlouisfed.org/" rel="noopener" target="_blank">ALFRED</a>, the St. Louis Fed's archive of past releases: each checkpoint sees exactly what had been released by the day before, so real release dates and no later revisions. ${esc(bt.pointInTime.checkpoints)} series-dates use a vintage${bt.pointInTime.fallback ? `; ${esc(bt.pointInTime.fallback)} fall back to a conservative delay` : ""}.</li>` : ""}
    <li>Delays we assume for other sources: Wikipedia and TSA 1 day, Hacker News only closed weeks, EIA weekly 6 days, SEC inventory from the date it was first filed (using the number as first reported).</li>
    <li><strong>Frozen rules.</strong> Every signal has a version (all are v1 now). Changing a signal's logic or thresholds starts a new version with its own track record, and an automated test fails if the logic changes without a new version.</li>
    <li>Wikipedia pages with a baseline under ${esc(bt.minWikiBaseline)} views a day are ignored, so a page being created doesn't look like a surge of interest.</li>
    <li>A signal only counts on dates where it has enough history; for example the junk-bond spread history available for free starts in late 2023.</li>`;
  $("#skipped tbody").innerHTML = Object.entries(bt.coverage).flatMap(([tk, c]) => c.skipped.map((s) => `<tr><td>${esc(tk)}</td><td>${esc(s.name)}</td><td>${esc(s.why)}</td></tr>`)).join("") || `<tr><td colspan="3">None</td></tr>`;
  $("#downloads").innerHTML = `Raw data: <a href="/data/track-record.json">track-record.json</a> (scored results) · <a href="https://github.com/nickcastro1520/theotherdata/blob/main/data/track/live.jsonl" rel="noopener" target="_blank">live log</a> · <a href="https://github.com/nickcastro1520/theotherdata/blob/main/data/track/backtest.json" rel="noopener" target="_blank">backtest leans</a>. Scored ${esc(TT.day(doc.scoredDay))}.`;
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();
