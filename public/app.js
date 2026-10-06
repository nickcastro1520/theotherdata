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
  const COLORS = { up: "#34d399", down: "#f87171", flat: "#94a3b8", tailwind: "#34d399", headwind: "#f87171", error: "#fbbf24" };
  const dirOf = (pct) => (pct == null || !Number.isFinite(pct) ? "flat" : pct > 0 ? "up" : pct < 0 ? "down" : "flat");
  const IMPACT = { tailwind: ["tailwind", "Lean tailwind"], headwind: ["headwind", "Lean headwind"], mixed: ["", "Mixed"], quiet: ["", "Quiet"] };

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
      <p class="spot-sub"><span class="chg ${esc(dirOf(s.pct))}" title="Green = up vs baseline, red = down">${esc(pctTxt(s.pct))}</span> ${esc(s.basis || "")} · <span class="badge ${esc(s.reading)}">${esc(READ[s.reading])} for ${esc(t.name)}</span></p>
      ${spark(s.series, dirOf(s.pct), { w: 320, h: 90 })}
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
        <ul>${t.signals.map((s) => { const r = readingOf(s); const dir = dirOf(s.pct); return `<li><i class="dot ${r}" title="${esc(READ[r] || r)}"></i><span class="nm2">${esc(s.name)}</span><span class="pc ${dir}" title="Green = up vs baseline, red = down">${s.status === "error" ? "n/a" : esc(pctTxt(s.pct))}</span><span class="mini">${spark(s.series || [], dir, { w: 56, h: 18 })}</span></li>`; }).join("")}</ul>
        ${t.headline ? `<p class="hl">📰 ${esc(t.headline.title)}</p>` : ""}
      </a>`;
    }).join("");
    $("#cards").innerHTML = html;
    if (f && !$("#cards .tcard:not(.dimmed)")) $("#cards").insertAdjacentHTML("beforeend", `<p class="empty">No curated stock matches “${esc(filter)}”. Press <b>Show signals</b> to look up any US ticker (price, news, and a light signal pack).</p>`);
  }

  function renderIdeas() {
    $("#ideas-list").innerHTML = (INDEX.ideas || []).map((i) => {
      const tag = i.status === "live" ? "Live proxy" : i.status === "partial" ? "Partial · live proxy" : "Idea · not live";
      const tagCls = i.status === "live" ? "live" : i.status === "partial" ? "partial" : "";
      const live = i.liveOn ? ` <a href="#/${esc(i.liveOn)}">See ${esc(i.liveOn)} →</a>` : "";
      return `<div class="idea"><span class="tag ${tagCls}">${esc(tag)}</span><h3>${esc(i.title)}</h3><p>${esc(i.body)}${live}</p></div>`;
    }).join("");
  }

  async function renderScout() {
    const el = $("#scout-list");
    if (!el) return;
    let doc;
    try { doc = await (await fetch("/data/scout.json", { cache: "no-cache" })).json(); }
    catch { el.innerHTML = `<p class="note">Scout report not available yet.</p>`; return; }
    const wiredBySeries = { VIXCLS: "NVDA", PERMIT: "UNP", UNRATE: "ABNB", BAMLH0A0HYM2: "F" };
    const wiredById = { vix: "NVDA", "hy-spread": "F", "housing-permits": "UNP", unrate: "ABNB" };
    const linkFor = (r) => r.wiredTo || wiredById[r.candidateId] || wiredBySeries[r.sourceParams?.series] || null;
    // Dedupe by candidateId: prefer wired rows, then strongest |ρ|
    const raw = (doc.shortlist || doc.top || []).slice();
    const best = new Map();
    for (const r of raw) {
      const key = r.candidateId || r.name;
      const score = (linkFor(r) ? 1000 : 0) + (r.absSpearman || 0);
      const prev = best.get(key);
      if (!prev || score > (linkFor(prev) ? 1000 : 0) + (prev.absSpearman || 0)) best.set(key, r);
    }
    const rows = [...best.values()].sort((a, b) => {
      const aw = linkFor(a) ? 0 : 1, bw = linkFor(b) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return (b.absSpearman || 0) - (a.absSpearman || 0);
    }).slice(0, 8);
    if (!rows.length) { el.innerHTML = `<p class="note">No scout pairings yet.</p>`; return; }
    el.innerHTML = rows.map((r) => {
      const linkTk = linkFor(r);
      const live = Boolean(linkTk);
      const dir = r.live?.direction || "flat";
      const pct = r.live?.pct;
      const plain = r.plain || {};
      const priceLean = plain.priceLean || "unclear";
      const mag = plain.magnitude || (r.absSpearman >= 0.55 ? "strong" : r.absSpearman >= 0.4 ? "moderate" : "mild");
      const leanCls = priceLean === "up" ? "up" : priceLean === "down" ? "down" : "flat";
      const leanLabel = priceLean === "up" ? "Lean up" : priceLean === "down" ? "Lean down" : "No clear lean";
      const tag = live && linkTk ? `Live on ${linkTk}` : r.spuriousRisk === "high" ? "Spurious risk high" : "Scout hit";
      const href = linkTk ? `#/${linkTk}` : (r.targetKind === "ticker" ? `#/${r.target}` : "#stocks");
      const targetShow = linkTk || r.targetLabel;
      return `<a class="scout-card" href="${href}">
        <div class="scout-top">
          <span class="tag ${live ? "live" : ""}">${esc(tag)}</span>
          <span class="chg ${esc(dir)}" title="Green = the public number is up vs its baseline; red = down">${pct == null ? "n/a" : esc(pctTxt(pct))} ${esc(dir === "up" ? "up" : dir === "down" ? "down" : "flat")}</span>
        </div>
        <h3>${esc(r.name)} → ${esc(targetShow)}</h3>
        <p class="scout-q"><strong>What we pulled:</strong> ${esc(plain.whatPulled || r.name)}</p>
        <p class="scout-q"><strong>Why it matters:</strong> ${esc(plain.whyMatters || r.why)}</p>
        <p class="scout-q"><strong>How it can lean the price:</strong> <span class="chg ${esc(leanCls)}">${esc(leanLabel)}</span> · ${esc(mag)} · ${esc(plain.horizon || "weeks to a quarter")}</p>
        <p class="scout-how">${esc(plain.howLean || "")}</p>
        <p class="fine">Not financial advice. Correlation ≠ causation. Window ${esc(r.window?.from || "")} → ${esc(r.window?.to || "")}.</p>
      </a>`;
    }).join("");
    const meta = $("#scout-meta");
    if (meta) meta.textContent = `Last scout run ${when(doc.generatedAt)}${doc.enrichedAt ? ` · readings refreshed ${when(doc.enrichedAt)}` : ""} · ${doc.allCount || rows.length} pairings scored`;
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
    const dir = dirOf(s.pct);
    const nums = s.status === "error" ? "" : `<div class="nums"><div><div class="big">${esc(s.display || "")}</div><div class="lab">${esc(s.currentLabel || "")}</div>${s.pct != null ? `<span class="chg ${esc(dir)}" title="Green = up vs baseline, red = down">${esc(pctTxt(s.pct))} ${esc(s.basis || "")}</span>` : ""}</div><div>${spark(vals, dir, { h: 84 })}<div class="range">${esc(range)}</div></div></div>`;
    let scoutBox = "";
    if (s.scout) {
      // Prefer current reading; if still in the noise band, hint from polarity × series direction
      let leanDir = r === "tailwind" ? "up" : r === "headwind" ? "down" : "flat";
      let mag = s.strength || "mild";
      if (leanDir === "flat" && s.pct != null && Math.abs(s.pct) > 0.05 && s.polarity) {
        const seriesUp = s.pct > 0;
        const favors = (s.polarity > 0 && seriesUp) || (s.polarity < 0 && !seriesUp);
        leanDir = favors ? "up" : "down";
        mag = "mild";
      }
      const leanTxt = leanDir === "up"
        ? `This reading looks like a ${mag} lean <strong>up</strong> for ${d.ticker}'s story over weeks to a quarter.`
        : leanDir === "down"
        ? `This reading looks like a ${mag} lean <strong>down</strong> for ${d.ticker}'s story over weeks to a quarter.`
        : `Right now this number is close to its usual range, so there is no clear up/down lean for ${d.ticker}.`;
      scoutBox = `<div class="scout-lean ${leanDir}">
        <p class="k">Scout find · easy read</p>
        <p><strong>What we pulled:</strong> ${esc(s.what)}</p>
        <p><strong>Why it matters for ${esc(d.ticker)}:</strong> ${esc(s.why)}</p>
        <p><strong>How it can lean the price:</strong> ${leanTxt} <span class="chg ${leanDir}">${leanDir === "up" ? "Lean up" : leanDir === "down" ? "Lean down" : "No clear lean"}</span> Educational only — not advice to buy or sell.</p>
      </div>`;
    }
    return `<article class="sig ${esc(r)}${stale ? " stale" : ""}" id="sig-${esc(s.id)}">
      <div class="top"><div><h3>${esc(s.name)}${s.scout ? ` <span class="scout-pill">Scout</span>` : ""}</h3><p class="metric">${esc(s.metric)}</p></div>${badge}</div>
      ${nums}
      ${stale ? `<div class="warnbox">The latest refresh couldn't reach this source (${esc(s.lastError || "error")}). Showing the last good data, fetched ${esc(when(s.staleSince || s.fetchedAt))}.</div>` : ""}
      ${scoutBox}
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
    } else if (n.status === "error") body = `<p class="note warnline">The news index didn't respond on the latest refresh (GDELT's free API rate-limits heavily). We'll try again on the next run rather than show anything made up.</p>`;
    else body = `<p class="note">No recent English-language headlines found.</p>`;
    const hn = n.hn?.length ? `<h4 class="subh">Discussed on Hacker News (last 2 weeks)</h4><ul class="news">${n.hn.slice(0, 4).map((a) => item(a, ` · ${a.points} points · <a class="disc" href="${esc(safeUrl(a.discuss))}" rel="noopener" target="_blank">discussion</a>`)).join("")}</ul>` : "";
    const srcName = n.source?.name || "GDELT global news index";
    return `<section class="panel"><h3>Latest news</h3><p class="ps">Headlines from ${esc(srcName)}${n.fetchedAt ? ` · checked ${esc(when(n.fetchedAt))}` : ""}</p>${body}${hn}</section>`;
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

  function pricePanel(d) {
    const m = d.market || {};
    const gf = `<a href="${esc(quoteUrl(d.ticker))}" rel="noopener" target="_blank">Google Finance ↗</a>`;
    if (m.status !== "ok" || !m.quote) {
      return `<section class="panel price"><h3>Stock price</h3><p class="note">${m.status === "error" ? "Our price provider didn't respond on the latest refresh, so we're not showing a number." : "A licensed price feed isn't connected yet, so we don't show prices here rather than scrape them."} See the live price on ${gf}.</p></section>`;
    }
    const q = m.quote, r = dirOf(q.changePct);
    const hist = m.history?.length > 1 ? `${spark(m.history.map((p) => p.v), dirOf(m.yearPct), { w: 300, h: 70 })}<div class="range">${esc(dateOnly(m.history[0].t))} – ${esc(dateOnly(m.history[m.history.length - 1].t))} · ${esc(pctTxt(m.yearPct))} over the period</div>` : "";
    const srcs = [m.quoteSource, m.historySource].filter((x, i, a) => x && a.findIndex((y) => y?.name === x.name) === i).map((x) => `<a href="${esc(safeUrl(x.url))}" rel="noopener" target="_blank">${esc(x.name)}</a>`).join(" · ");
    return `<section class="panel price"><h3>Stock price</h3><div class="pbig">$${esc(q.price.toFixed(2))} <span class="chg ${r}">${esc(pctTxt(q.changePct))} ${q.eod ? "last session" : "today"}</span></div>${hist}<p class="note">${q.eod ? "End-of-day price" : "Quote"} as of ${esc(when(q.at || m.fetchedAt))}. Source: ${srcs}. Shown for context; the signals above don't predict it.</p></section>`;
  }


  const ALIASES = { roblox: "RBLX", rblx: "RBLX", meta: "META", facebook: "META", alphabet: "GOOGL", google: "GOOGL", googl: "GOOGL", nvidia: "NVDA", microsoft: "MSFT", apple: "AAPL", amazon: "AMZN", tesla: "TSLA", netflix: "NFLX", disney: "DIS" };
  function impactPanel(d) {
    const imp = d.summary?.impact || {};
    const leanKey = imp.lean || (d.summary?.lean === "leaning positive" ? "tailwind" : d.summary?.lean === "leaning negative" ? "headwind" : d.summary?.lean === "quiet" ? "quiet" : "mixed");
    const [cls, lab] = IMPACT[leanKey] || ["", "Mixed"];
    const label = imp.label || lab;
    const mag = imp.magnitude || "unclear";
    const magLabel = { mild: "Mild lean", moderate: "Moderate lean", strong: "Strong lean", unclear: "Magnitude unclear" }[mag] || mag;
    const narrative = (d.ai?.text && (imp.source === "ai" || !imp.what) ? d.ai.text : null) || imp.text || d.summary?.text || "";
    const what = imp.what || "See the signal cards below for the public series behind this page.";
    const because = imp.because || `Combined lean: ${label}.`;
    const horizon = imp.horizon || "weeks to a quarter";
    const horizonNote = imp.horizonNote || "Educational range only — not a reliable clock.";
    const conf = imp.confidence || "low";
    const m = d.market || {};
    const q = m.quote;
    let priceHtml = `<p class="note">Price feed not connected on this view. <a href="${esc(quoteUrl(d.ticker))}" rel="noopener" target="_blank">Google Finance ↗</a></p>`;
    if (q && q.price != null) {
      const dir = dirOf(q.changePct);
      const hist = m.history?.length > 1 ? spark(m.history.map((p) => p.v), dirOf(m.yearPct), { w: 260, h: 56 }) : "";
      priceHtml = `<div class="pbig">$${esc(Number(q.price).toFixed(2))} <span class="chg ${dir}">${esc(pctTxt(q.changePct))} ${q.eod ? "last session" : "today"}</span></div>${hist}<p class="note">${q.eod ? "End-of-day" : "Quote"} · ${(m.quoteSource || m.historySource)?.name || "market data"}</p>`;
    }
    return `<section class="impact" aria-label="Impact call">
      <div>
        <p class="k">Impact call · educational only</p>
        <div class="impact-steps">
          <div class="istep"><span class="n">1</span><div><h4>What the alt-data is</h4><p>${esc(what)}</p></div></div>
          <div class="istep"><span class="n">2</span><div><h4>Because of that, the lean</h4><div class="call"><span class="badge ${esc(cls)}">${esc(label)}</span><span class="meta">${esc(d.summary?.tailwinds ?? 0)} tailwind · ${esc(d.summary?.headwinds ?? 0)} headwind · confidence ${esc(conf)}</span></div><p>${esc(because)}</p></div></div>
          <div class="istep"><span class="n">3</span><div><h4>Rough magnitude band</h4><p><strong>${esc(magLabel)}</strong> — ${esc(imp.magnitudeWhy || "Based on how many mild vs notable signal moves line up. Not a dollar price target.")}</p></div></div>
          <div class="istep"><span class="n">4</span><div><h4>Typical time horizon</h4><p><strong>${esc(horizon)}</strong>. ${esc(horizonNote)}</p></div></div>
        </div>
        <p class="body muted">${esc(narrative)}</p>
        <p class="fineprint">Not financial advice. Not a forecast. Nothing here tells you to buy or sell.</p>
      </div>
      <div class="pricebox"><p class="pk">Current stock price</p>${priceHtml}</div>
    </section>`;
  }

  function renderDetail(d) {
    const det = $("#detail");
    document.title = `${d.ticker}: ${d.name} hidden signals | The Other Data`;
    det.hidden = false;
    for (const id of ["home", "stocks", "how", "ideas", "scout"]) { const el = $(`#${id}`); if (el) el.hidden = true; }
    const pack = d.pack === "light" ? `<div class="pack-banner">${esc(d.packNote || "Light signal pack for this ticker. Curated names on the home page have richer custom signals.")}</div>` : "";
    det.innerHTML = `<div class="wrap">
      <a class="back" href="#">← All stocks</a>
      ${pack}
      <div class="dhead"><div><div class="tk">${esc(d.ticker)}</div><h1>${esc(d.name)}</h1><div class="meta">${esc(d.sector)}${d.exchange ? ` · ${esc(d.exchange)}` : ""} · updated ${esc(when(d.updatedAt))} (${esc(ago(d.updatedAt))}) · <a href="${esc(quoteUrl(d.ticker))}" rel="noopener" target="_blank">See the stock price ↗</a></div></div>${meter(d.summary)}</div>
      ${impactPanel(d)}
      <div class="dgrid"><div class="sigs">${(d.signals || []).map((s) => sigCard(s, d)).join("") || `<p class="note">No signal cards available for this ticker yet.</p>`}</div>
      <aside class="side">${pricePanel(d)}${newsPanel(d)}${secPanel(d)}<section class="panel"><h3>Not financial advice</h3><p class="note">These signals are educational. They can be wrong, late, or already priced in. Nothing here tells you to buy or sell anything.</p></section></aside></div>
    </div>`;
    window.scrollTo(0, 0);
  }

  async function showTicker(tk) {
    const det = $("#detail");
    const curated = INDEX.tickers.find((x) => x.ticker === tk);
    det.hidden = false;
    for (const id of ["home", "stocks", "how", "ideas", "scout"]) { const el = $(`#${id}`); if (el) el.hidden = true; }
    det.innerHTML = `<div class="wrap loading-panel">Loading ${esc(tk)}…</div>`;
    if (curated) {
      try {
        const d = await (await fetch(`/data/tickers/${encodeURIComponent(tk)}.json`, { cache: "no-cache" })).json();
        // Ensure impact exists for older cached JSON
        if (!d.summary?.impact && d.summary) {
          const lean = d.summary.lean === "leaning positive" ? "tailwind" : d.summary.lean === "leaning negative" ? "headwind" : d.summary.lean === "quiet" ? "quiet" : "mixed";
          d.summary.impact = { lean, label: IMPACT[lean][1], text: d.ai?.text || d.summary.text, source: d.ai?.text ? "ai" : "template" };
        } else if (d.ai?.text && d.summary?.impact) {
          d.summary.impact = { ...d.summary.impact, text: d.ai.text, source: "ai" };
        }
        return renderDetail(d);
      } catch {
        det.innerHTML = `<div class="wrap"><p class="warnbox">Couldn't load data for ${esc(tk)}. Please refresh.</p><p><a class="back" href="#">← All stocks</a></p></div>`;
        return;
      }
    }
    // Open search: any other US ticker via /api/lookup
    try {
      const res = await fetch(`/api/lookup?q=${encodeURIComponent(tk)}`, { cache: "default" });
      const d = await res.json();
      if (!res.ok) {
        det.innerHTML = `<div class="wrap"><p class="warnbox">${esc(d.message || `No data for ${tk}.`)}</p><p class="note">Try a curated ticker from the home page, or another US common stock symbol.</p><p><a class="back" href="#">← All stocks</a></p></div>`;
        return;
      }
      return renderDetail(d);
    } catch {
      det.innerHTML = `<div class="wrap"><p class="warnbox">Lookup failed for ${esc(tk)}. Please try again in a moment.</p><p><a class="back" href="#">← All stocks</a></p></div>`;
    }
  }

  function showHome() {
    document.title = "The Other Data: hidden market signals, explained in plain English";
    $("#detail").hidden = true;
    for (const id of ["home", "stocks", "how", "ideas", "scout"]) { const el = $(`#${id}`); if (el) el.hidden = false; }
  }

  function route() {
    const m = location.hash.match(/^#\/([A-Za-z]{1,5}(?:\.[A-Za-z])?)$/);
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
    renderStatus(); renderChips(); renderSpotlight(); renderCards(); renderIdeas(); renderScout();
    const q = $("#q");
    // Suggestions dropdown
    let sug = document.getElementById("suggest");
    if (!sug) {
      const wrap = document.createElement("div");
      wrap.className = "suggest";
      q.parentNode.insertBefore(wrap, q);
      wrap.appendChild(q);
      sug = document.createElement("div");
      sug.id = "suggest";
      sug.className = "suggest-list";
      sug.setAttribute("role", "listbox");
      wrap.appendChild(sug);
    }
    let sugTimer = null, sugItems = [], sugIdx = -1;
    const closeSug = () => { sug.classList.remove("open"); sug.innerHTML = ""; sugItems = []; sugIdx = -1; };
    const openTicker = (sym) => { closeSug(); location.hash = `#/${String(sym).toUpperCase()}`; };
    const renderSug = (items) => {
      sugItems = items || [];
      sugIdx = -1;
      if (!sugItems.length) { closeSug(); return; }
      sug.innerHTML = sugItems.map((it, i) => `<button type="button" role="option" data-i="${i}"><span class="sym">${esc(it.symbol)}</span><span class="nm">${esc(it.name)}</span></button>`).join("");
      sug.classList.add("open");
      sug.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => openTicker(sugItems[+b.dataset.i].symbol)));
    };
    q.addEventListener("input", () => {
      renderCards(q.value);
      const v = q.value.trim();
      clearTimeout(sugTimer);
      if (v.length < 1) { closeSug(); return; }
      const alias = ALIASES[v.toLowerCase()];
      const local = INDEX.tickers.filter((t) => t.ticker.toLowerCase().startsWith(v.toLowerCase()) || t.name.toLowerCase().includes(v.toLowerCase())).slice(0, 6)
        .map((t) => ({ symbol: t.ticker, name: t.name }));
      if (alias && !local.some((x) => x.symbol === alias)) local.unshift({ symbol: alias, name: `${alias} (matched “${v}”)` });
      if (local.length) renderSug(local);
      sugTimer = setTimeout(async () => {
        try {
          const r = await fetch(`/api/search?q=${encodeURIComponent(v)}`);
          const j = await r.json();
          const remote = (j.results || []).map((x) => ({ symbol: x.symbol, name: x.name }));
          const seen = new Set(local.map((x) => x.symbol));
          renderSug([...local, ...remote.filter((x) => !seen.has(x.symbol))].slice(0, 8));
        } catch { /* keep local */ }
      }, 220);
    });
    q.addEventListener("keydown", (e) => {
      if (!sug.classList.contains("open") || !sugItems.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); sugIdx = Math.min(sugIdx + 1, sugItems.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sugIdx = Math.max(sugIdx - 1, 0); }
      else if (e.key === "Escape") { closeSug(); return; }
      else return;
      [...sug.querySelectorAll("button")].forEach((b, i) => b.classList.toggle("active", i === sugIdx));
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".suggest")) closeSug(); });
    $("#picker").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = q.value.trim();
      if (!v) { document.getElementById("stocks").scrollIntoView(); return; }
      if (sugIdx >= 0 && sugItems[sugIdx]) { openTicker(sugItems[sugIdx].symbol); return; }
      const alias = ALIASES[v.toLowerCase()];
      if (alias) { openTicker(alias); return; }
      const exact = INDEX.tickers.find((t) => t.ticker.toLowerCase() === v.toLowerCase() || t.name.toLowerCase() === v.toLowerCase());
      if (exact) { openTicker(exact.ticker); return; }
      const first = INDEX.tickers.find((t) => [t.ticker, t.name, t.sector, ...t.signals.map((s) => s.name)].join(" ").toLowerCase().includes(v.toLowerCase()));
      const sym = v.toUpperCase().replace(/[^A-Z.]/g, "");
      const looksLikeTicker = /^[A-Z]{1,5}(\.[A-Z])?$/.test(sym) && sym === v.toUpperCase();
      if (first && !looksLikeTicker) { openTicker(first.ticker); return; }
      if (looksLikeTicker) { openTicker(sym); return; }
      // Company name (or odd query) → resolve via API, then set hash to the real ticker
      (async () => {
        detPrepare();
        try {
          const res = await fetch(`/api/lookup?q=${encodeURIComponent(v)}`);
          const d = await res.json();
          if (!res.ok) {
            $("#detail").innerHTML = `<div class="wrap"><p class="warnbox">${esc(d.message || "No match.")}</p><p><a class="back" href="#">← All stocks</a></p></div>`;
            return;
          }
          history.replaceState(null, "", `#/${d.ticker}`);
          renderDetail(d);
        } catch {
          $("#detail").innerHTML = `<div class="wrap"><p class="warnbox">Lookup failed. Please try again.</p><p><a class="back" href="#">← All stocks</a></p></div>`;
        }
      })();
    });
    function detPrepare() {
      const det = $("#detail");
      det.hidden = false;
      for (const id of ["home", "stocks", "how", "ideas", "scout"]) { const el = $(`#${id}`); if (el) el.hidden = true; }
      det.innerHTML = `<div class="wrap loading-panel">Looking that up…</div>`;
    }
    window.addEventListener("hashchange", route);
    route();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
