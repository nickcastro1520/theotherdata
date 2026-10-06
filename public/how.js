(async () => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : "#"; } catch { return "#"; } };
  let idx;
  try { idx = await (await fetch("/data/index.json", { cache: "no-cache" })).json(); } catch { document.getElementById("health-meta").textContent = "Couldn't load source health."; return; }
  const when = new Date(idx.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  document.getElementById("health-meta").textContent = `Latest refresh: ${when}. Schedule: ${idx.schedule}. AI summaries: ${idx.aiSummaries ? "on" : "off (template explanations)"}.`;
  document.querySelector("#health tbody").innerHTML = Object.entries(idx.sources || {}).sort().map(([name, h]) =>
    `<tr><td>${esc(name)}</td><td class="${h.failed ? "bad" : "ok"}">${h.failed ? `${h.ok} ok, ${h.failed} failed` : `${h.ok} ok`}</td><td>${esc((h.errors || []).join("; "))}</td></tr>`).join("");
  const R = { tailwind: "Tailwind", headwind: "Headwind", neutral: "Neutral", context: "Context", tracking: "Tracking" };
  document.querySelector("#all tbody").innerHTML = idx.tickers.flatMap((t) => t.signals.map((s) =>
    `<tr><td><a href="/#/${esc(t.ticker)}">${esc(t.ticker)}</a></td><td>${esc(s.name)}</td><td>${s.sourceUrl ? `<a href="${esc(safeUrl(s.sourceUrl))}" rel="noopener" target="_blank">${esc(s.source)}</a>` : esc(s.source || "")}</td><td>${esc(s.asOf || "n/a")}</td><td>${s.status === "error" ? "Data unavailable" : esc(R[s.reading] || s.reading || "")}${s.status === "stale" ? " (stale)" : ""}</td></tr>`)).join("");
})();
