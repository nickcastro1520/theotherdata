// /how-to-read: fills the guide's examples with live numbers from the same data files the site uses.
(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#"; } catch { return "#"; } };
  const pctTxt = (p) => (p == null ? "" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0)}%`);
  const dirOf = (p) => (p == null || !Number.isFinite(p) ? "flat" : p > 0 ? "up" : p < 0 ? "down" : "flat");
  const READ = { tailwind: "Tailwind", headwind: "Headwind", neutral: "Neutral", context: "Context" };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateTxt = (t, freq) => { const [y, m, d] = String(t).split("-").map(Number); return freq === "monthly" ? `${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${d}, ${y}`; };
  const get = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [amzn, idx, track] = await Promise.all([get("/data/tickers/AMZN.json"), get("/data/index.json"), get("/data/track-record.json")]);
  const fail = (sel) => { const el = $(sel); if (el) el.innerHTML = `<p class="n">Live example unavailable right now. Open <a href="/#/AMZN">Amazon's page</a> to see the real thing.</p>`; };

  // 2. A signal card (prefer cardboard; fall back to the first live signal)
  const sig = amzn && (amzn.signals.find((s) => s.id === "cardboard" && s.status === "ok") || amzn.signals.find((s) => s.status === "ok"));
  if (sig) {
    const dir = dirOf(sig.pct);
    $("#g-card").innerHTML = `<article class="g-sig ${esc(sig.reading)}">
      <div class="g-row"><span class="g-m">1</span><div><h3>${esc(sig.name)}</h3><p class="n">${esc(sig.metric)}</p></div><span class="g-m">4</span><span class="badge ${esc(sig.reading)}">${esc(sig.strength ? sig.strength + " " : "")}${esc(READ[sig.reading] || sig.reading)}</span></div>
      <div class="g-row"><span class="g-m">2</span><span class="g-big">${esc(sig.display)}</span><span class="n">${esc(sig.currentLabel || "")}</span></div>
      <div class="g-row"><span class="g-m">3</span><span class="chg ${dir}">${esc(pctTxt(sig.pct))} ${esc(sig.basis || "")}</span></div>
      <div class="g-row"><span class="g-m">5</span><p class="srcline">Source: <a href="${esc(safeUrl(sig.source?.url))}" rel="noopener" target="_blank">${esc(sig.source?.name)}</a>${sig.asOf ? ` · data through ${esc(dateTxt(sig.asOf, sig.freq))}` : ""}</p></div>
    </article>`;
  } else fail("#g-card");

  // 3. Green/red × tailwind/headwind, with live examples where they exist
  if (idx) {
    const all = idx.tickers.flatMap((t) => t.signals.filter((s) => s.status === "ok" && s.pct != null && (s.reading === "tailwind" || s.reading === "headwind")).map((s) => ({ t, s })));
    const pick = (up, rd) => all.filter((x) => (x.s.pct > 0) === up && x.s.reading === rd).sort((a, b) => Math.abs(b.s.pct) - Math.abs(a.s.pct) || 0).find((x) => Math.abs(x.s.pct) < 150);
    const cell = (up, rd, head, note) => {
      const x = pick(up, rd);
      return `<div class="g-cell${(up && rd === "headwind") || (!up && rd === "tailwind") ? " flip" : ""}"><p class="g-cell-h"><span class="chg ${up ? "up" : "down"}">${up ? "▲ up (green)" : "▼ down (red)"}</span> + <span class="badge ${rd}">${READ[rd]}</span></p><p class="g-cell-t">${head}</p>${x ? `<p class="g-ex">Live: <a href="/#/${esc(x.t.ticker)}">${esc(x.t.ticker)}</a> · ${esc(x.s.name)} <span class="chg ${dirOf(x.s.pct)}">${esc(pctTxt(x.s.pct))}</span></p>` : `<p class="g-ex n">No live example right now.</p>`}<p class="n">${note}</p></div>`;
    };
    $("#g-grid").innerHTML = cell(true, "tailwind", "Number up, good for the company", "The usual case, like more online shopping for Amazon.")
      + cell(true, "headwind", "Number up, but bad for the company", "A flip, like a pile-up of unsold inventory or pricier fuel for an airline.")
      + cell(false, "tailwind", "Number down, but good for the company", "A flip, like fewer owner complaints or cheaper ingredients.")
      + cell(false, "headwind", "Number down, bad for the company", "The usual case, like fewer people curious about a product.");
  } else fail("#g-grid");

  // 4. Amazon's lean right now
  if (amzn?.summary) {
    const imp = amzn.summary.impact || {};
    const cls = imp.lean === "tailwind" ? "tailwind" : imp.lean === "headwind" ? "headwind" : "";
    $("#g-lean").innerHTML = `<div class="g-lean"><p class="n">Live from Amazon's page</p><p><span class="badge ${cls}">${esc(imp.label || imp.lean)}</span> <span class="n">${amzn.summary.tailwinds} tailwind · ${amzn.summary.headwinds} headwind · ${amzn.summary.neutral} neutral</span></p><p>Strength: <strong>${esc(imp.magnitude || "unclear")}</strong> · Time frame: <strong>${esc(imp.horizon || "weeks to a quarter")}</strong></p></div>`;
  } else fail("#g-lean");

  // 7. Track record, honestly
  const TT = window.TODTrack;
  const p = track?.backtest?.summary?.[track.primary];
  if (p && TT) {
    const v = TT.verdict(p);
    $("#g-track").innerHTML = `<div class="g-lean"><p class="n">Live from the track record</p><p>We log every lean and later check what the stock did. In the backtest (${esc(TT.month(track.backtest.from))}–${esc(TT.month(track.backtest.to))}), leans matched the stock's move vs the S&amp;P 500 over the next month <strong>${TT.fmtPct(p.vsMktHits, p.vsMktCalls)}</strong> of the time across ${p.vsMktCalls} calls.</p><p><strong>${esc(v.text)}</strong></p>${track.live?.startedOn ? `<p class="n">Live tracking started ${esc(TT.day(track.live.startedOn))}.</p>` : ""}</div>`;
  } else fail("#g-track");
})();
