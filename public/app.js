// The Other Data: front end. Reads static JSON written by the scheduled refresh job.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#"; } catch { return "#"; } };
  const READ = { tailwind: "Tailwind", headwind: "Headwind", neutral: "Neutral", context: "Context", tracking: "Tracking", unknown: "No reading", error: "Data unavailable", stale: "Stale" };
  const LEAN = { "leaning positive": ["pos", "Leaning +"], "leaning negative": ["neg", "Leaning −"], mixed: ["", "Mixed"], quiet: ["", "Quiet"] };
  let INDEX = null;
  const NASDAQ = new Set(["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "COIN", "ABNB"]);
  const quoteUrl = (tk) => `https://www.google.com/finance/quote/${encodeURIComponent(tk)}:${NASDAQ.has(tk) ? "NASDAQ" : "NYSE"}`;

  const when = (iso) => {
    if (!iso) return "unknown";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  };
  const ago = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!Number.isFinite(m)) return "";
    if (m < 60) return `${Math.max(m, 1)} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} hr ago`;
    return `${Math.round(h / 24)} days ago`;
  };
  const dateOnly = (t, freq) => new Date(t + "T12:00:00Z").toLocaleDateString(undefined, freq === "monthly" ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const pctTxt = (p) => (p == null ? "" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0)}%`);
  const readingOf = (s) => (s.status === "error" ? "error" : s.reading || (s.status === "tracking" ? "tracking" : "unknown"));
  const COLORS = { tailwind: "#34d399", headwind: "#f87171", error: "#fbbf24" };

  function spark(values, reading, { w = 300, h = 84, axis = false, labels = null, id = "" } = {}) {
    const v = values.filter((x) => Number.isFinite(x));
    if (v.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
    const min = Math.min(...v), max = Math.max(...v), pad = axis ? 14 : 2, span = max - min || 1;
    const pts = v.map((y, i) => [(i / (v.length - 1)) * w, pad + (1 - (y - min) / span) * (h - pad * 2)]);
    const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
    const col = COLORS[reading] || "#94a3b8";
    const gid = `g${id}${Math.random().toString(36).slice(2, 7)}`;
    const last = pts[pts.length - 1];
    let ax = "";
    if (axis && labels) ax = `<text class="ax" x="2" y="10">${esc(labels.max)}</text><text class="ax" x="2" y="${h - 2}">${esc(labels.min)}</text>`;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Trend chart">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <polygon points="0,${h} ${line} ${w},${h}" fill="url(#${gid})"/>
      <polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${col}"/>${ax}</svg>`;
  }

  // ---------- home ----------
  function renderChips() {
    $("#chips").innerHTML = INDEX.tickers.map((t) => `<a class="chip" href="#/${esc(t.ticker)}"><i class="dot ${t.summary.tailwinds > t.summary.headwinds ? "tailwind" : t.summary.headwinds > t.summary.tailwinds ? "headwind" : "neutral"}"></i>${esc(t.ticker)}</a>`).join("");
  }

  function renderStatus() {
    const total = INDEX.tickers.reduce((a, t) => a + t.signals.length, 0);
    const live = INDEX.tickers.reduce((a, t) => a + t.signals.filter((s) => s.status === "ok").length, 0);
    const srcCount = Object.keys(INDEX.sources || {}).length;
    $("#status-line").innerHTML = `<span class="live">Live data</span> Updated ${esc(when(INDEX.generatedAt))} (${esc(ago(INDEX.generatedAt))}) · refreshes every 4 hours · ${live}/${total} signals fresh from ${srcCount} public sources`;
  }

  function renderSpotlight() {
    let best = null;
    for (const t of INDEX.tickers) for (const s of t.signals) {
      if (s.status !== "ok" || !(s.reading === "tailwind" || s.reading === "headwind") || s.pct == null) continue;
      if (Math.abs(s.pct) > 200) continue;
      if (!best || Math.abs(s.pct) > Math.abs(best.s.pct)) best = { t, s };
    }
    const el = $("#spotlight");
    if (!best) { el.innerHTML = `<p class="spot-k">Signal spotlight</p><p class="spot-sub">Nothing is moving enough to spotlight right now.</p>`; return; }
    const { t, s } = best;
    el.classList.add("spot");
    el.innerHTML = `<p class="spot-k">Biggest move right now</p>
      <div class="spot-t"><h3>${esc(s.name)}</h3><span class="tk">${esc(t.ticker)}</span></div>
      <div class="spot-big">${esc(s.display || "")}</div>
      <p class="spot-sub"><span class="chg ${esc(s.reading)}">${esc(pctTxt(s.pct))}</span> ${esc(s.basis || "")} · <span class="badge ${esc(s.reading)}">${esc(READ[s.reading])} for ${esc(t.name)}</span></p>
      ${spark(s.series, s.reading, { w: 320, h: 90 })}
      <p class="txt">One of ${INDEX.tickers.reduce((a, x) => a + x.signals.length, 0)} offbeat signals we track. Every card explains what the data is and why it might matter.</p>
      <a class="btn" href="#/${esc(t.ticker)}">See all ${esc(t.ticker)} signals →</a>`;
  }

  function renderCards(filter = "") {
    const f = filter.trim().toLowerCase();
    const html = INDEX.tickers.map((t) => {
      const hay = [t.ticker, t.name, t.sector, ...t.signals.map((s) => s.name)].join(" ").toLowerCase();
      const hide = f && !hay.includes(f);
      const [cls, txt] = LEAN[t.summary.lean] || ["", t.summary.lean];
      return `<a class="tcard${hide ? " dimmed" : ""}" href="#/${esc(t.ticker)}" data-t="${esc(t.ticker)}">
        <div class="row1"><div><div class="tk">${esc(t.ticker)}</div><div class="nm">${esc(t.name)} · ${esc(t.sector)}</div></div><span class="lean ${cls}">${esc(txt)}</span></div>
        <ul>${t.signals.map((s) => { const r = readingOf(s); return `<li><i class="dot ${r}"></i><span class="nm2">${esc(s.name)}</span><span class="pc ${r}">${s.status === "error" ? "n/a" : esc(pctTxt(s.pct))}</span><span class="mini">${spark(s.series || [], r, { w: 56, h: 18 })}</span></li>`; }).join("")}</ul>
        ${t.headline ? `<p class="hl">📰 ${esc(t.headline.title)}</p>` : ""}
      </a>`;
    }).join("");
    $("#cards").innerHTML = html;
    if (f && !$("#cards .tcard:not(.dimmed)")) $("#cards").insertAdjacentHTML("beforeend", `<p class="empty">No stock or signal matches “${esc(filter)}”. Try a ticker like AAPL, or a signal like “gas”.</p>`);
  }

  function renderIdeas() {
    $("#ideas-list").innerHTML = (INDEX.ideas || []).map((i) => `<div class="idea"><span class="tag">Idea · not live</span><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></div>`).join("");
  }

  // ---------- detail ----------
  function meter(sum) {
    const total = sum.tailwinds + sum.headwinds + sum.neutral + (sum.context || 0) || 1;
    const w1 = (sum.tailwinds / total) * 100, w2 = (sum.headwinds / total) * 100;
    return `<div class="meter"><div class="lbl"><span>Signal balance</span><span>${esc((LEAN[sum.lean] || ["", sum.lean])[1])}</span></div>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="12" fill="#1f2a44"/><rect width="${w1}" height="12" fill="#34d399"/><rect x="${100 - w2}" width="${w2}" height="12" fill="#f87171"/></svg>
      <div class="counts"><span><b>${sum.tailwinds}</b> tailwind</span><span><b>${sum.headwinds}</b> headwind</span><span><b>${sum.neutral + (sum.context || 0)}</b> neutral/context</span></div></div>`;
  }

  function sigCard(s, d) {
    const r = readingOf(s);
    const stale = s.status === "stale";
    const vals = (s.series || []).map((p) => p.v);
    const range = s.series?.length > 1 ? `${dateOnly(s.series[0].t, s.freq)} – ${dateOnly(s.series[s.series.length - 1].t, s.freq)}` : "";
    const badge = s.status === "error" ? `<span class="badge error">Data unavailable</span>` : `<span class="badge ${esc(r)}">${esc(s.strength ? `${s.strength} ` : "")}${esc(READ[r] || r)}</span>`;
    const nums = s.status === "error" ? "" : `<div class="nums"><div><div class="big">${esc(s.display || "")}</div><div class="lab">${esc(s.currentLabel || "")}</div>${s.pct != null ? `<span class="chg ${esc(r)}">${esc(pctTxt(s.pct))} ${esc(s.basis || "")}</span>` : ""}</div><div>${spark(vals, r, { h: 84 })}<div class="range">${esc(range)}</div></div></div>`;
    return `<article class="sig ${esc(r)}${stale ? " stale" : ""}" id="sig-${esc(s.id)}">
      <div class="top"><div><h3>${esc(s.name)}</h3><p class="metric">${esc(s.metric)}</p></div>${badge}</div>
      ${nums}
      ${stale ? `<div class="warnbox">The latest refresh couldn't reach this source (${esc(s.lastError || "error")}). Showing the last good data, fetched ${esc(when(s.staleSince || s.fetchedAt))}.</div>` : ""}
      <div class="explain">
        <div><h4>What it is</h4><p>${esc(s.what)}</p></div>
        <div><h4>Why it might matter for ${esc(d.ticker)}</h4><p>${esc(s.why)}</p></div>
        <div class="now"><h4>What it's showing now</h4><p>${esc(s.now)}</p></div>
      </div>
      <p class="srcline">Source: ${s.source?.url ? `<a href="${esc(safeUrl(s.source.url))}" rel="noopener" target="_blank">${esc(s.source.name)}</a>` : esc(s.source?.name || "")}${s.asOf ? ` · data through ${esc(dateOnly(s.asOf, s.freq))}` : ""} · fetched ${esc(when(s.fetchedAt))}${s.source?.note ? ` · ${esc(s.source.note)}` : ""}</p>
    </article>`;
  }

  function newsPanel(d) {
    const n = d.news || {};
    const item = (a, extra = "") => `<li><a href="${esc(safeUrl(a.url))}" rel="noopener nofollow" target="_blank">${esc(a.title)}</a><div class="src">${esc(a.domain || "")}${a.seen ? ` · ${esc(ago(a.seen))}` : ""}${extra}</div></li>`;
    let body = "";
    if (n.articles?.length) {
      body = (n.status === "stale" ? `<p class="note warnline">The news index didn't respond on the latest refresh, so these headlines are from ${esc(when(n.staleSince))}.</p>` : "") +
        `<ul class="news">${n.articles.slice(0, 6).map((a) => item(a)).join("")}</ul>`;
    } else if (n.status === "error") body = `<p class="note warnline">The GDELT news index didn't respond on the latest refresh (it rate-limits heavily). We'll try again on the next run rather than show anything made up.</p>`;
    else body = `<p class="note">No recent English-language headlines found.</p>`;
    const hn = n.hn?.length ? `<h4 class="subh">Discussed on Hacker News (last 2 weeks)</h4><ul class="news">${n.hn.slice(0, 4).map((a) => item(a, ` · ${a.points} points · <a class="disc" href="${esc(safeUrl(a.discuss))}" rel="noopener" target="_blank">discussion</a>`)).join("")}</ul>` : "";
    return `<section class="panel"><h3>Latest news</h3><p class="ps">Headlines from the GDELT global news index${n.fetchedAt ? ` · checked ${esc(when(n.fetchedAt))}` : ""}</p>${body}${hn}</section>`;
  }

  const ITEMS = { "1.01": "Material agreement", "1.02": "Agreement ended", "2.01": "Acquisition or sale completed", "2.02": "Earnings results", "2.03": "New debt", "2.05": "Restructuring costs", "2.06": "Impairment", "3.01": "Listing notice", "4.01": "Auditor change", "5.02": "Executive or board change", "5.03": "Bylaws change", "5.07": "Shareholder vote results", "7.01": "Investor disclosure (Reg FD)", "8.01": "Other events", "9.01": "Financial exhibits" };
  const filingLabel = (f) => {
    if (f.form === "8-K" || f.form === "6-K") {
      const items = String(f.items || "").split(",").map((x) => x.trim()).filter((x) => x && x !== "9.01");
      const lab = items.map((x) => ITEMS[x]).filter(Boolean);
      return lab.length ? lab.join(", ") : f.form === "8-K" ? "Current report" : "Foreign issuer report";
    }
    return { "10-Q": "Quarterly report", "10-K": "Annual report", "20-F": "Annual report (foreign issuer)", "DEF 14A": "Proxy statement" }[f.form] || f.desc || f.form;
  };

  function secPanel(d) {
    const s = d.sec || {};
    if (s.status === "error") return `<section class="panel"><h3>SEC filings</h3><p class="note">Couldn't reach SEC EDGAR on the latest refresh (${esc(s.error)}).</p></section>`;
    const f4 = d.ticker === "NVO" ? `<p class="note">Novo Nordisk is a foreign private issuer, so its insiders don't file U.S. Form 4s.</p>` :
      `<div class="stat"><span>Insider filings (Form 4), last 90 days</span><b>${s.form4Last90 ?? "n/a"}</b></div><div class="stat"><span>Prior 90 days</span><b>${s.form4Prior90 ?? "n/a"}</b></div><p class="note">Form 4s report insider buys, sells, and stock grants. A burst is worth a look, but most are routine pay-related filings.</p>`;
    const list = (s.notable || []).map((f) => `<li><span class="f">${esc(f.form)}</span><a href="${esc(safeUrl(f.url))}" rel="noopener" target="_blank">${esc(filingLabel(f))}</a> <span class="d">${esc(dateOnly(f.date))}</span></li>`).join("");
    return `<section class="panel"><h3>SEC filings</h3><p class="ps">From SEC EDGAR · fetched ${esc(when(s.fetchedAt))}</p>${f4}${list ? `<ul class="filings">${list}</ul>` : ""}</section>`;
  }

  async function showTicker(tk) {
    const det = $("#detail");
    const t = INDEX.tickers.find((x) => x.ticker === tk);
    if (!t) { location.hash = ""; return; }
    document.title = `${t.ticker}: ${t.name} hidden signals | The Other Data`;
    det.hidden = false;
    for (const id of ["home", "stocks", "how", "ideas"]) $(`#${id}`).hidden = true;
    det.innerHTML = `<div class="wrap"><p class="ps">Loading ${esc(t.ticker)}…</p></div>`;
    let d;
    try { d = await (await fetch(`/data/tickers/${encodeURIComponent(tk)}.json`, { cache: "no-cache" })).json(); }
    catch { det.innerHTML = `<div class="wrap"><p class="warnbox">Couldn't load data for ${esc(tk)}. Please refresh.</p></div>`; return; }
    const sum = d.ai?.text ? { k: "AI summary, written only from the numbers below", text: d.ai.text } : { k: "Summary, written from the numbers below", text: d.summary.text };
    det.innerHTML = `<div class="wrap">
      <a class="back" href="#">← All stocks</a>
      <div class="dhead"><div><div class="tk">${esc(d.ticker)}</div><h1>${esc(d.name)}</h1><div class="meta">${esc(d.sector)} · updated ${esc(when(d.updatedAt))} (${esc(ago(d.updatedAt))}) · <a href="${esc(quoteUrl(d.ticker))}" rel="noopener" target="_blank">See the stock price ↗</a></div></div>${meter(d.summary)}</div>
      <div class="summary"><p class="k">${esc(sum.k)}</p><p>${esc(sum.text)}</p></div>
      <div class="dgrid"><div class="sigs">${d.signals.map((s) => sigCard(s, d)).join("")}</div>
      <aside class="side">${newsPanel(d)}${secPanel(d)}<section class="panel"><h3>Not financial advice</h3><p class="note">These signals are educational. They can be wrong, late, or already priced in. Nothing here tells you to buy or sell anything.</p></section></aside></div>
    </div>`;
    window.scrollTo(0, 0);
  }

  function showHome() {
    document.title = "The Other Data: hidden market signals, explained in plain English";
    $("#detail").hidden = true;
    for (const id of ["home", "stocks", "how", "ideas"]) $(`#${id}`).hidden = false;
  }

  function route() {
    const m = location.hash.match(/^#\/([A-Za-z.]{1,6})$/);
    if (m) showTicker(m[1].toUpperCase());
    else {
      const wasDetail = !$("#detail").hidden; showHome();
      const el = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView(); else if (wasDetail) window.scrollTo(0, 0);
    }
  }

  async function init() {
    try { INDEX = await (await fetch("/data/index.json", { cache: "no-cache" })).json(); }
    catch { $("#status-line").textContent = "Couldn't load the latest data. Please refresh the page."; return; }
    renderStatus(); renderChips(); renderSpotlight(); renderCards(); renderIdeas();
    const q = $("#q");
    q.addEventListener("input", () => renderCards(q.value));
    $("#picker").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = q.value.trim().toLowerCase();
      if (!v) { document.getElementById("stocks").scrollIntoView(); return; }
      const exact = INDEX.tickers.find((t) => t.ticker.toLowerCase() === v || t.name.toLowerCase() === v);
      const first = exact || INDEX.tickers.find((t) => [t.ticker, t.name, t.sector, ...t.signals.map((s) => s.name)].join(" ").toLowerCase().includes(v));
      if (first) location.hash = `#/${first.ticker}`;
      else { renderCards(q.value); document.getElementById("stocks").scrollIntoView(); }
    });
    window.addEventListener("hashchange", route);
    route();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
