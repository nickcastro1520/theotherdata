// Fills the /late-filers table from public/data/late-filers.json.
(async () => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const meta = document.getElementById("lf-meta"), tb = document.querySelector("#lf-table tbody");
  try {
    const d = await (await fetch("/data/late-filers.json")).json();
    meta.textContent = `${d.count} notices from listed companies in the last ${d.windowDays} days · updated ${new Date(d.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`;
    tb.innerHTML = d.items.map((r) => `<tr><td>${r.exchange && r.exchange !== "OTC" ? `<a href="/s/${encodeURIComponent(r.ticker)}">${esc(r.ticker)}</a>` : esc(r.ticker)}</td><td>${esc(r.company)}${r.exchange ? ` <span class="n">(${esc(r.exchange)})</span>` : ""}</td><td>${esc(r.form)}</td><td>${esc(r.filed)}</td><td><a href="${esc(r.link)}" rel="noopener" target="_blank">Filing ↗</a></td></tr>`).join("") || '<tr><td colspan="5">No notices in this window.</td></tr>';
  } catch { meta.textContent = "Could not load the list right now."; }
})();
