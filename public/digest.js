// /digest: web preview of the weekly email, rendered from /data/digest.json (rebuilt every refresh).
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https:\/\//i.test(String(u || "")) ? String(u) : "#");
  const local = (u) => String(u || "").replace(/^https:\/\/theotherdata\.com/, "") || "/";
  const chip = (p) => `<span class="badge ${p.reading === "tailwind" ? "tailwind" : "headwind"}">${esc(p.strength ? `${p.strength} ` : "")}${esc(p.reading)}</span>`;
  fetch("/data/digest.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => {
    $("#dg-intro").textContent = `Week of ${d.weekOf}. This is what the weekly email looks like right now, built from the same live data as the site (updated ${new Date(d.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}).`;
    $("#dg").innerHTML = `
      <div class="dg-subj"><span class="k">Subject</span> ${esc(d.subject)}</div>
      <p class="dg-warn">Education only. Not financial advice. These are clues from public data, not predictions.</p>
      <section class="dg-story"><p class="eyebrow-k">The story</p><h2>${esc(d.story.title)}</h2>${d.story.paragraphs.map((t) => `<p>${esc(t)}</p>`).join("")}<p><a class="btn" href="${esc(local(d.story.url))}">See ${esc(d.story.company)}'s signals →</a></p></section>
      <section class="dg-picks"><p class="eyebrow-k">Top ${d.picks.length} moves</p><ol>${d.picks.map((p) => `
        <li><div class="dg-co">${esc(p.company)} (${esc(p.ticker)})</div>
          <div class="dg-sig">${esc(p.signal)} <span class="chg ${p.direction}">${esc(p.change)}</span> <span class="dg-basis">${esc(p.basis)}</span></div>
          <div>${chip(p)}</div>
          ${p.plain ? `<p>${esc(p.plain)}</p>` : ""}${p.why ? `<p class="dg-why">Why it might matter: ${esc(p.why)}</p>` : ""}
          <p class="dg-src">Source: ${p.source.url ? `<a href="${esc(safeUrl(p.source.url))}" rel="noopener" target="_blank">${esc(p.source.name)}</a>` : esc(p.source.name)}${p.dataThrough ? ` · data through ${esc(p.dataThrough)}` : ""} · <a href="${esc(local(p.url))}">See the ${esc(p.ticker)} page →</a></p></li>`).join("")}</ol></section>
      ${d.trackLine ? `<section class="dg-track"><strong>Our honest scorecard.</strong> ${esc(d.trackLine)} <a href="/track">Track record →</a></section>` : ""}
      <p class="fine">${esc(d.disclaimer)}</p>`;
  }).catch(() => { $("#dg").innerHTML = `<p class="note warnline">This week's issue couldn't be loaded. Try again in a minute.</p>`; });
})();
