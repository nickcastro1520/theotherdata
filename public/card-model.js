// Shareable signal cards: one data model used by the build (to draw the PNG cards and write the
// per-stock permalink pages with og:image tags) and by the browser (the Share menu on stock pages).
// Everything comes from the numbers already on the page; nothing here predicts a price.
(function (root) {
  "use strict";
  const SITE = "https://theotherdata.com";
  const WINDOW = "weeks to a quarter";
  const live = (s) => s && (s.status === "ok" || s.status === "stale");
  const directional = (s) => live(s) && (s.reading === "tailwind" || s.reading === "headwind");
  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const pctTxt = (p) => (p == null || !isFinite(p) ? "" : `${p > 0 ? "+" : p < 0 ? "-" : ""}${Math.abs(p).toFixed(Math.abs(p) >= 10 ? 0 : 1)}%`);
  const slug = (id) => String(id || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  function fmtDay(t, freq) {
    if (!t) return "";
    const d = new Date(/T/.test(t) ? t : t + "T12:00:00Z");
    if (isNaN(d)) return "";
    const opts = freq === "monthly" || freq === "quarterly"
      ? { month: "short", year: "numeric", timeZone: "UTC" }
      : { month: "short", day: "numeric", year: "numeric", timeZone: /T/.test(t) ? "America/Chicago" : "UTC" };
    return d.toLocaleDateString("en-US", opts);
  }

  // One plain-English sentence about what the data is doing right now.
  function plainLine(s) {
    if (!s) return "";
    const m = String(s.now || "").match(/In plain English:\s*(.+?)(?:\s+We read that\b.*)?$/);
    if (m && directional(s)) return cap(m[1].replace(/\s+$/, "")).replace(/([^.!?])$/, "$1.");
    if (s.status === "tracking") return "We just started saving daily snapshots of this number; a trend appears after a few weeks.";
    if (s.pct != null && isFinite(s.pct)) {
      const dir = Math.abs(s.pct) < 0.5 ? "About flat" : s.pct > 0 ? `Up ${Math.abs(s.pct).toFixed(1)}%` : `Down ${Math.abs(s.pct).toFixed(1)}%`;
      return `${dir} ${s.basis || ""}`.trim() + (s.reading === "neutral" ? ", inside its normal range." : ".");
    }
    return "";
  }

  const Z = () => root.TODSize;
  const ST = () => root.TODStatus;
  const statusOf = (tk, id) => { const x = ST() && (id ? ST().forSignal(tk, id) : ST().doc?.stock); return x ? x.label : ""; };
  const big = (s) => !Z() || Z().passes(s);
  const daysWord = (s) => (Z() ? Z().windowWords(s) : "");
  const windowName = (s) => { const w = daysWord(s); return !w ? "Snapshots" : w === "a quarter" ? "Quarter vs quarter" : `${w.replace(/^(\d+) (\w+?)s$/, "$1-$2")} windows`; };

  // The headline signal for a stock: only signals that clear the minimum-size rule (signal-size.js),
  // notable before mild, then biggest move. Share images describe what the data did, never a lean.
  function topSignal(doc) {
    const sigs = (doc.signals || []).filter((s) => live(s) && big(s));
    const rank = (s) => (directional(s) ? 2000 : 0) + (s.strength === "notable" ? 2 : s.strength === "mild" ? 1 : 0) * 1000 + Math.min(Math.abs(s.pct || 0), 999);
    return sigs.slice().sort((a, b) => rank(b) - rank(a))[0] || null;
  }

  // The "what the data did" box on a card: "+46%" and "52 → 76 stories in 4 weeks".
  function dataBox(s) {
    if (!s || s.pct == null || !isFinite(s.pct)) return null;
    const ba = Z() && Z().beforeAfter(s);
    return { pct: pctTxt(s.pct), raw: ba ? ba.long : "", basis: s.basis || "" };
  }

  const stockUrl = (ticker) => `${SITE}/s/${encodeURIComponent(ticker)}`;
  const signalUrl = (ticker, id) => `${SITE}/s/${encodeURIComponent(ticker)}/${slug(id)}`;
  const stockImg = (ticker, vertical) => `/cards/${ticker}${vertical ? "-vertical" : ""}.png`;
  const signalImg = (ticker, id, vertical) => `/cards/${ticker}/${slug(id)}${vertical ? "-vertical" : ""}.png`;

  function stockCard(doc) {
    const top = topSignal(doc);
    const others = (doc.signals || []).filter((s) => live(s) && big(s) && s !== top).slice(0, 3);
    const n = (doc.signals || []).filter(live).length;
    return {
      kind: "stock",
      ticker: doc.ticker, company: doc.name, status: top ? statusOf(doc.ticker, top.id) : "",
      headline: top ? `${top.name} → ${doc.name}` : `Offbeat public data → ${doc.name}`,
      line: top && Z() ? Z().describe(top) : "",
      topAsOf: top ? fmtDay(top.asOf, top.freq) : "",
      box: dataBox(top),
      facts: [["SIGNALS TRACKED", String(n)], ["COMPARED", top ? windowName(top) : "—"], ["UPDATED", fmtDay(doc.updatedAt)]],
      dataDate: fmtDay(doc.updatedAt),
      rows: others.map((s) => ({ name: s.name, change: Z() ? Z().changeText(s) : pctTxt(s.pct) })),
      url: stockUrl(doc.ticker), img: stockImg(doc.ticker), imgVertical: stockImg(doc.ticker, true),
      title: `${doc.name} (${doc.ticker}) Hidden Signals${top ? `: ${top.name}` : ""} | The Other Data`,
      description: `${top && Z() ? `${Z().describe(top)} ` : ""}${n} offbeat public signal${n === 1 ? "" : "s"} for ${doc.name}, explained in plain English. Education only, not advice.`,
      alt: `${top ? `${top.name} → ${doc.name}. ${Z() ? Z().describe(top) : ""}` : `Offbeat public data → ${doc.name}.`} Education only, not advice.`.replace(/\s+/g, " ").trim(),
      shareText: top ? `What “${top.name}” can hint about ${doc.name} ($${doc.ticker}), explained in plain English:` : `The offbeat public data behind ${doc.name} ($${doc.ticker}), explained in plain English. Free weekly email: theotherdata.com/subscribe`,
    };
  }

  function signalCard(doc, s) {
    const line = Z() ? Z().describe(s) : plainLine(s);
    return {
      kind: "signal", id: slug(s.id), status: statusOf(doc.ticker, s.id),
      ticker: doc.ticker, company: doc.name,
      headline: `${s.name} → ${doc.name}`,
      line: line || plainLine(s),
      big: s.display ? String(s.display) : "",
      bigLabel: s.currentLabel || "",
      change: s.pct != null ? `${Z() ? Z().changeText(s) : pctTxt(s.pct)} ${s.basis || ""}`.trim() : "",
      box: dataBox(s),
      facts: [["CURRENT", s.display ? String(s.display) : "—"], ["WINDOW", s.currentLabel ? cap(s.currentLabel) : "—"], ["DATA DATE", s.asOf ? `through ${fmtDay(s.asOf, s.freq)}` : (s.fetchedAt ? `fetched ${fmtDay(s.fetchedAt)}` : "—")]],
      featured: big(s),
      dataDate: s.asOf ? `Data through ${fmtDay(s.asOf, s.freq)}` : (s.fetchedAt ? `Fetched ${fmtDay(s.fetchedAt)}` : ""),
      source: s.source?.name || "",
      // Small samples (rule 3) get no image card of their own.
      url: signalUrl(doc.ticker, s.id), img: big(s) ? signalImg(doc.ticker, s.id) : null, imgVertical: big(s) ? signalImg(doc.ticker, s.id, true) : null,
      title: `${s.name} → ${doc.name} (${doc.ticker}) | The Other Data`,
      description: `${line || plainLine(s)} Free public data explained in plain English. Education only, not advice.`.replace(/\s+/g, " ").trim(),
      alt: `${s.name} → ${doc.name}. ${line || ""} Education only, not advice.`.replace(/\s+/g, " ").trim(),
      shareText: `What “${s.name}” can hint about ${doc.name} ($${doc.ticker}), explained in plain English. Free weekly email: theotherdata.com/subscribe`,
    };
  }

  const shareLinks = (url, text) => ({
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  });

  const api = { SITE, slug, plainLine, topSignal, stockCard, signalCard, shareLinks, stockUrl, signalUrl, live };
  root.TODCard = api;
})(typeof window !== "undefined" ? window : globalThis);
