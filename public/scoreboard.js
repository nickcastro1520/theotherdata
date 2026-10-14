// /scoreboard: every curated signal scored on its own (public/data/scoreboard.json, from scripts/track-record.mjs).
(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let b;
  try { const r = await fetch("/data/scoreboard.json", { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); b = await r.json(); }
  catch { $("#sb-summary").innerHTML = `<p class="warnbox">The scoreboard file isn't available right now. Please try again later.</p>`; return; }
  const LBL = { up: "Holding up", unproven: "Not proven yet", down: "Worse than a coin flip", none: "No backtest calls" };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = (t) => { if (!t) return ""; const [y, m, d] = t.split("-").map(Number); return `${MON[m - 1]} ${d}, ${y}`; };
  const month = (t) => { if (!t) return ""; const [y, m] = t.split("-").map(Number); return `${MON[m - 1]} ${y}`; };
  const lab = (k) => `<span class="sbl ${esc(k === "unproven" ? "" : k)}">${esc(LBL[k])}</span>`;
  const cell = (x) => (!x.calls ? `<span class="n">no calls</span>` : `<span class="pc">${x.pct.toFixed(1).replace(/\.0$/, "")}%</span> <span class="n">${x.hits} of ${x.calls}</span><span class="ci">95% range ${x.ci[0]}–${x.ci[1]}%</span>${lab(x.label)}`);
  const S = b.signals, c = b.counts, n = b.totals.withCalls;
  const box = (title, k) => `<div class="sb-count"><h2>${esc(title)}</h2><ul>
    <li><span>${lab("unproven")}</span><b>${c[k].unproven}</b></li><li><span>${lab("up")}</span><b>${c[k].up}</b></li><li><span>${lab("down")}</span><b>${c[k].down}</b></li></ul></div>`;
  $("#sb-summary").innerHTML = `<p class="sub">${n} of ${b.totals.signals} signals made at least one call in the backtest (${esc(month(b.backtest.from))} – ${esc(month(b.backtest.to))}, ${esc(b.windowLabel)} window). The other ${b.totals.signals - n} come from sources without dated history, so they're tracked live only.</p>
    <div class="sb-counts">${box("Up/down right", "dir")}${box("Beat the market (S&P 500)", "mkt")}${box("Beat its sector", "sec")}</div>`;
  const cautious = (x) => (x.calls ? x.ci[0] : -1);
  const top = S.filter((r) => r.mkt.calls).sort((a, z) => cautious(z.mkt) - cautious(a.mkt)).slice(0, 5);
  $("#sb-top").innerHTML = top.map((r) => `<li><a href="#s-${esc(r.tk)}-${esc(r.id)}"><strong>${esc(r.name)}</strong></a> (${esc(r.tk)}): beat the market ${r.mkt.hits} of ${r.mkt.calls} (${r.mkt.pct}%), range ${r.mkt.ci[0]}–${r.mkt.ci[1]}% ${lab(r.mkt.label)}</li>`).join("");
  const row = (r) => `<tr id="s-${esc(r.tk)}-${esc(r.id)}"><td><a href="/#/${esc(r.tk)}">${esc(r.tk)}</a>${r.sector ? `<span class="ci">vs ${esc(r.sector)}</span>` : ""}</td>
    <td>${esc(r.name)}${r.version ? `<span class="ci">v${esc(r.version.v)} since ${esc(day(r.version.since))}</span>` : ""}${r.live?.calls ? `<span class="ci">Live: ${r.live.hits} of ${r.live.calls} up/down right</span>` : ""}</td>
    <td>${r.dir.calls || (r.backtestable ? "0" : `<span class="n" title="${esc(r.skipWhy || "")}">live only</span>`)}</td><td>${cell(r.dir)}</td><td>${cell(r.mkt)}</td><td>${cell(r.sec)}</td></tr>`;
  const sorts = { stock: () => 0, mkt: (a, z) => cautious(z.mkt) - cautious(a.mkt), dir: (a, z) => cautious(z.dir) - cautious(a.dir), calls: (a, z) => z.dir.calls - a.dir.calls };
  const draw = () => { $("#sb-table tbody").innerHTML = S.slice().sort(sorts[$("#sb-sort").value] || sorts.stock).map(row).join(""); };
  $("#sb-sort").addEventListener("change", draw);
  draw();
  $("#sb-method").innerHTML = `<li>One call = one monthly checkpoint where the signal read tailwind or headwind. Up/down right: the stock moved that way over the next month (entry at the next day's close). Beat the market / its sector: the stock did better than SPY / its sector SPDR ETF over the same days (worse, for a headwind).</li>
    <li>Sector funds follow each company's official (GICS) sector: XLK tech, XLY consumer discretionary, XLP consumer staples, XLV health care, XLE energy, XLF financials, XLI industrials, XLC communication services.</li>
    <li>${b.backtest.pointInTime ? "Federal Reserve data uses the numbers exactly as published at the time (ALFRED vintages), not today's revised numbers." : "Government data uses conservative publication delays."} Other sources use only data public by each checkpoint. <a href="/track#m-h">Full backtest method →</a></li>
    <li>Rules are frozen: each signal shows its version and start date. Changing a signal's logic or thresholds starts a new version, and live results only count from that version's start date.</li>
    <li>These signals were chosen in 2026 knowing how the companies turned out, which flatters past results. Even a "Holding up" signal can stop working. Education only, not financial advice.</li>`;
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();
