// Symbol directory search, shared by the browser (window.TODSymbolSearch) and the server (/api/search, /api/lookup).
// Index format: public/data/symbols.json -> { fields: ["t","n","x","c","k"], rows: [[ticker, name, exchangeCode, cik, kind]] }
// Ranking: exact ticker > alias > name prefix > ticker prefix > word prefix > contains > fuzzy (typo-tolerant).
(function (root) {
  "use strict";
  const EXCHANGES = { Q: "Nasdaq", N: "NYSE", A: "NYSE American", P: "NYSE Arca", Z: "Cboe BZX", V: "IEX", F: "TXSE", M: "NYSE Texas", O: "OTC" };

  // Lowercase, strip accents, drop apostrophes, turn other punctuation into spaces.
  function normalize(s) {
    return String(s == null ? "" : s)
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’`]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  const compact = (s) => s.replace(/ /g, "");
  // Words that carry no identity ("roblox corp" should still match "Roblox Corporation").
  const STOP = new Set(["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "the", "holdings", "holding", "group", "sa", "nv", "ag", "llc", "lp"]);

  function prepare(doc) {
    const rows = (doc && doc.rows) || [];
    return rows.map((r) => {
      const [t, n, x, c, k] = r;
      const nn = normalize(n);
      const words = nn.split(" ").filter(Boolean);
      const core = words.filter((w) => !STOP.has(w)).join(" ") || nn;
      return { t, n, x, c: c || 0, k: k || "s", tl: t.toLowerCase(), nn, nc: compact(nn), core, cc: compact(core), words };
    });
  }

  // Bounded Levenshtein: returns max+1 as soon as it is clear the distance exceeds max.
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /**
   * search(prepared, query, { limit, curated: Set<ticker>, aliases: {name: ticker} })
   * -> [{ symbol, name, exchange, exchangeCode, cik, kind: "stock"|"etf", curated, tier, match }]
   */
  function search(items, query, opts) {
    opts = opts || {};
    const limit = opts.limit || 8;
    const curated = opts.curated || new Set();
    const aliases = opts.aliases || {};
    const raw = String(query || "").trim();
    if (!raw || !items || !items.length) return [];
    const q = normalize(raw);
    if (!q) return [];
    const qc = compact(q);
    const qt = raw.toUpperCase().replace(/[-/ ]/g, ".").replace(/[^A-Z0-9.]/g, "");
    const qtl = qt.toLowerCase();
    const tickerish = /^[A-Za-z0-9.\-/]{1,7}$/.test(raw);
    const alias = (aliases[raw.toLowerCase()] || aliases[q] || "").toUpperCase();
    const qWords = q.split(" ").filter((w) => w && !STOP.has(w));

    const hits = [];
    for (const it of items) {
      let tier = 99, match = "";
      if (tickerish && it.tl === qtl) { tier = 0; match = "ticker"; }
      else if (alias && it.t === alias) { tier = 1; match = "alias"; }
      else if (it.nn.startsWith(q) || it.nc.startsWith(qc) || (it.core && it.cc.startsWith(qc))) { tier = 2; match = "name"; }
      else if (tickerish && qtl.length >= 2 && it.tl.startsWith(qtl)) { tier = 3; match = "ticker-prefix"; }
      else if (qWords.length && qWords.every((w) => it.words.some((x) => x.startsWith(w)))) { tier = 4; match = "word"; }
      else if (qc.length >= 3 && it.nc.includes(qc)) { tier = 5; match = "contains"; }
      if (tier < 99) hits.push({ it, tier, match });
    }

    // Typo tolerance only when exact-ish matching found little.
    if (hits.length < limit && qc.length >= 4) {
      const max = qc.length >= 8 ? 2 : 1;
      const seen = new Set(hits.map((h) => h.it.t));
      for (const it of items) {
        if (seen.has(it.t)) continue;
        let d = lev(qc, it.cc.slice(0, qc.length), max);
        if (d > max) for (const w of it.words) { if (w.length >= 3 && Math.abs(w.length - qc.length) <= max) { d = Math.min(d, lev(qc, w, max)); if (d <= max) break; } }
        if (d <= max) hits.push({ it, tier: 6 + d / 10, match: "fuzzy" });
      }
    }

    hits.sort((a, b) =>
      a.tier - b.tier ||
      (curated.has(b.it.t) ? 1 : 0) - (curated.has(a.it.t) ? 1 : 0) ||
      (a.it.x === "O" ? 1 : 0) - (b.it.x === "O" ? 1 : 0) ||
      (a.it.k === "e" ? 1 : 0) - (b.it.k === "e" ? 1 : 0) ||
      a.it.n.length - b.it.n.length ||
      a.it.t.length - b.it.t.length ||
      (a.it.t < b.it.t ? -1 : a.it.t > b.it.t ? 1 : 0));

    return hits.slice(0, limit).map(({ it, tier, match }) => ({
      symbol: it.t, name: it.n, exchange: EXCHANGES[it.x] || it.x || "", exchangeCode: it.x, cik: it.c || null,
      kind: it.k === "e" ? "etf" : "stock", curated: curated.has(it.t), tier: Math.floor(tier), match,
    }));
  }

  const api = { normalize, prepare, search, lev, EXCHANGES };
  root.TODSymbolSearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
