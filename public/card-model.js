// Shareable signal cards: one data model used by the build (to draw the PNG cards and write the
// per-stock permalink pages with og:image tags) and by the browser (the Share menu on stock pages).
// Everything comes from the numbers already on the page; nothing here predicts a price.
(function (root) {
  "use strict";
  const SITE = "https://theotherdata.com";
  const WINDOW = "weeks to a quarter";
  const LEAN = {
    tailwind: { word: "Lean up", sub: "net tailwind", tone: "up" },
    headwind: { word: "Lean down", sub: "net headwind", tone: "down" },
    mixed: { word: "Mixed", sub: "no clear lean", tone: "flat" },
    quiet: { word: "Quiet", sub: "nothing moving much", tone: "flat" },
  };
  const SIG_LEAN = {
    tailwind: { word: "Lean up", sub: "tailwind", tone: "up" },
    headwind: { word: "Lean down", sub: "headwind", tone: "down" },
    neutral: { word: "No clear lean", sub: "inside its normal range", tone: "flat" },
    context: { word: "Context", sub: "background, no lean", tone: "flat" },
    tracking: { word: "No lean yet", sub: "just started tracking", tone: "flat" },
  };
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

  // The headline signal for a stock: agrees with the overall lean when there is one, notable before mild, then biggest move.
  function topSignal(doc) {
    const lean = doc.summary?.impact?.lean;
    const sigs = (doc.signals || []).filter(live);
    const rank = (s) => (s.strength === "notable" ? 2 : s.strength === "mild" ? 1 : 0) * 1000 + Math.min(Math.abs(s.pct || 0), 999);
    const pick = (arr) => arr.slice().sort((a, b) => rank(b) - rank(a))[0];
    if (lean === "tailwind" || lean === "headwind") { const s = pick(sigs.filter((x) => x.reading === lean)); if (s) return s; }
    return pick(sigs.filter(directional)) || pick(sigs) || null;
  }

  const stockUrl = (ticker) => `${SITE}/s/${encodeURIComponent(ticker)}`;
  const signalUrl = (ticker, id) => `${SITE}/s/${encodeURIComponent(ticker)}/${slug(id)}`;
  const stockImg = (ticker, vertical) => `/cards/${ticker}${vertical ? "-vertical" : ""}.png`;
  const signalImg = (ticker, id, vertical) => `/cards/${ticker}/${slug(id)}${vertical ? "-vertical" : ""}.png`;

  function stockCard(doc) {
    const imp = doc.summary?.impact || {};
    const leanKey = LEAN[imp.lean] ? imp.lean : "mixed";
    const top = topSignal(doc);
    const others = (doc.signals || []).filter((s) => live(s) && s !== top).slice(0, 3);
    const tw = doc.summary?.tailwinds ?? 0, hw = doc.summary?.headwinds ?? 0;
    return {
      kind: "stock",
      ticker: doc.ticker, company: doc.name,
      headline: top ? `${top.name} → ${doc.name}` : `Offbeat public data → ${doc.name}`,
      line: top ? plainLine(top) : "",
      topAsOf: top ? fmtDay(top.asOf, top.freq) : "",
      lean: { key: leanKey, ...LEAN[leanKey] },
      leanDetail: leanKey === "quiet" ? "Nothing outside its normal range" : `${tw} favorable · ${hw} unfavorable`,
      strength: imp.magnitude && imp.magnitude !== "unclear" ? cap(imp.magnitude) : "Unclear",
      window: cap(imp.horizon || WINDOW),
      dataDate: fmtDay(doc.updatedAt),
      rows: others.map((s) => ({ name: s.name, tone: (SIG_LEAN[s.reading] || SIG_LEAN.neutral).tone, word: (SIG_LEAN[s.reading] || SIG_LEAN.neutral).word })),
      url: stockUrl(doc.ticker), img: stockImg(doc.ticker), imgVertical: stockImg(doc.ticker, true),
      title: `${doc.ticker}: ${top ? `${top.name} → ${doc.name}` : `${doc.name} hidden signals`} | The Other Data`,
      description: (() => { const n = (doc.signals || []).filter(live).length; return `${LEAN[leanKey].word} (${LEAN[leanKey].sub}) from ${n} offbeat public signal${n === 1 ? "" : "s"} for ${doc.name}${top ? `, led by “${top.name}”` : ""}. Explained in plain English. Education only, not advice.`; })(),
      shareText: top ? `What “${top.name}” can hint about ${doc.name} ($${doc.ticker}), explained in plain English:` : `The offbeat public data behind ${doc.name} ($${doc.ticker}), explained in plain English:`,
    };
  }

  function signalCard(doc, s) {
    const key = s.status === "tracking" ? "tracking" : SIG_LEAN[s.reading] ? s.reading : "neutral";
    return {
      kind: "signal", id: slug(s.id),
      ticker: doc.ticker, company: doc.name,
      headline: `${s.name} → ${doc.name}`,
      line: plainLine(s),
      big: s.display ? String(s.display) : "",
      bigLabel: s.currentLabel || "",
      change: s.pct != null ? `${pctTxt(s.pct)} ${s.basis || ""}`.trim() : "",
      lean: { key, ...SIG_LEAN[key] },
      leanDetail: s.strength && (key === "tailwind" || key === "headwind") ? `${cap(s.strength)} reading` : SIG_LEAN[key].sub,
      strength: s.strength && (key === "tailwind" || key === "headwind") ? cap(s.strength) : "—",
      window: (key === "tailwind" || key === "headwind") ? cap(WINDOW) : "—",
      dataDate: s.asOf ? `Data through ${fmtDay(s.asOf, s.freq)}` : (s.fetchedAt ? `Fetched ${fmtDay(s.fetchedAt)}` : ""),
      source: s.source?.name || "",
      url: signalUrl(doc.ticker, s.id), img: signalImg(doc.ticker, s.id), imgVertical: signalImg(doc.ticker, s.id, true),
      title: `${s.name} → ${doc.name} (${doc.ticker}) | The Other Data`,
      description: `${plainLine(s)} ${SIG_LEAN[key].word} for ${doc.name}. Free public data explained in plain English. Education only, not advice.`.replace(/\s+/g, " ").trim(),
      shareText: `What “${s.name}” can hint about ${doc.name} ($${doc.ticker}), explained in plain English:`,
    };
  }

  const shareLinks = (url, text) => ({
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  });

  const api = { SITE, LEAN, SIG_LEAN, slug, plainLine, topSignal, stockCard, signalCard, shareLinks, stockUrl, signalUrl, live };
  root.TODCard = api;
})(typeof window !== "undefined" ? window : globalThis);
