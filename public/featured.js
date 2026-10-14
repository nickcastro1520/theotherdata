// Home-page "featured real example": picks which live signal the hero card shows.
// Shared by the browser (window.TODFeatured) and the tests. Never invents numbers: it only
// ranks signals that already exist in /data/index.json, and the card renders their real values.
(function (root) {
  "use strict";

  // The flagship story leads whenever its live reading is directional (tailwind/headwind).
  // Box production → Amazon is the easiest "aha" for a first-time visitor.
  const FLAGSHIP = [["AMZN", "paperboard"]];

  // How "offbeat" (surprising, intuitive, not just a macro number) each kind of signal is.
  // Matched against the signal id; first match wins. Unlisted signals get 1.
  const OFFBEAT = [
    [/cardboard|paperboard/, 4],
    [/-reports$/, 3],          // FDA side-effect reports
    [/complaints$/, 3],        // NHTSA owner complaints
    [/^tsa-/, 3],              // airport checkpoint counts
    [/pytorch|-sdk$/, 3],      // developer package downloads
    [/egg/, 2.5],
    [/curiosity$/, 2.5],       // Wikipedia page views
    [/chatter$/, 2.5],         // Hacker News mentions
    [/hiring$/, 2.5],          // job-board openings
    [/coffee|sugar|aluminum|milk|chicken/, 2], // ingredient & packaging costs
    [/aircraft-orders|load-factor|airfares|card-delinquencies|business-loans/, 2],
    [/inventory$/, 1.5],
    [/beef|lumber|lodging|jet-fuel/, 1.5],
  ];
  const offbeatWeight = (id) => { for (const [re, w] of OFFBEAT) if (re.test(String(id || ""))) return w; return 1; };

  const DIRECTIONAL = new Set(["tailwind", "headwind"]);
  // A live, directional reading with a believable move. Huge jumps (>150%) are usually
  // reporting artifacts (e.g. a backlog of FDA reports), so they don't headline the page.
  function qualifies(s, { maxAbsPct = 150, minAbsPct = 2 } = {}) {
    if (!s || s.status !== "ok" || !DIRECTIONAL.has(s.reading)) return false;
    // Rule 3 (public/signal-size.js): too-small samples never headline the hero, digest or share images.
    if (root.TODSize && !root.TODSize.passes(s)) return false;
    const p = Number(s.pct);
    if (!Number.isFinite(p)) return false;
    const a = Math.abs(p);
    return a >= minAbsPct && a <= maxAbsPct && (s.series || []).length >= 2;
  }

  const score = (s) => offbeatWeight(s.id) * Math.log1p(Math.abs(Number(s.pct))) * (s.strength === "notable" ? 1.3 : 1);

  // Returns up to `limit` picks: flagship first (if live + directional), then the highest-scoring
  // offbeat moves, at most one per ticker and never the same underlying series twice.
  function pick(index, { limit = 4, flagship = FLAGSHIP } = {}) {
    const tickers = (index && index.tickers) || [];
    const all = [];
    for (const t of tickers) for (const s of t.signals || []) if (qualifies(s)) all.push({ ticker: t.ticker, name: t.name, signal: s, score: score(s), reason: "score" });
    const out = [], seenT = new Set(), seenSrc = new Set();
    const take = (c, reason) => {
      if (seenT.has(c.ticker)) return false;
      const src = c.signal.sourceUrl || c.signal.id;
      if (seenSrc.has(src)) return false;
      seenT.add(c.ticker); seenSrc.add(src);
      out.push({ ...c, reason });
      return true;
    };
    for (const [tk, id] of flagship) {
      const c = all.find((x) => x.ticker === tk && x.signal.id === id);
      if (c && take(c, "flagship")) break;
    }
    for (const c of all.slice().sort((a, b) => b.score - a.score)) {
      if (out.length >= limit) break;
      take(c, "score");
    }
    return out;
  }

  // "…In plain English: box prices are up from a year ago. We read that as a notable tailwind for Amazon."
  // → "Box prices are up from a year ago." (null if the refresh didn't write a plain-English clause)
  function plainRead(now) {
    const m = String(now || "").match(/In plain English:\s*(.+?)(?:\s*We read that as\b.*)?$/s);
    if (!m) return null;
    const t = m[1].trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
  }

  // First sentence, without splitting on abbreviations like "U.S." (needs a lowercase/digit before the stop
// and a capital after it).
const firstSentence = (s) => { const t = String(s || "").trim(); const m = t.match(/^(.+?[a-z0-9)\u201d"%][.!?])(?=\s+["\u201cA-Z]|$)/s); return m ? m[1] : t; };


  // The one above-the-fold "hook" example. Rule: the highest-scoring live signal with a real lean
  // (offbeat weight × size of move, believable range). If nothing qualifies, walk a curated fallback
  // order and take the first signal there that is live and directional, then any live one at all.
  const HOOK_FALLBACK = [["AMZN", "paperboard"], ["DAL", "tsa-dal"], ["UAL", "tsa-ual"], ["F", "f150-complaints"], ["TSLA", "modely-complaints"], ["NVDA", "pytorch-installs"], ["SBUX", "coffee"], ["MCD", "eggs"]];
  function hook(index) {
    const top = pick(index, { limit: 1, flagship: [] })[0];
    if (top) return { ...top, reason: "score" };
    const tickers = (index && index.tickers) || [];
    const find = (ok) => { for (const [tk, id] of HOOK_FALLBACK) { const t = tickers.find((x) => x.ticker === tk); const s = t && (t.signals || []).find((x) => x.id === id || String(x.id).startsWith(id)); if (s && ok(s)) return { ticker: t.ticker, name: t.name, signal: s, reason: "fallback" }; } return null; };
    const big = (s) => !root.TODSize || root.TODSize.passes(s);
    const fb = find((s) => s.status === "ok" && DIRECTIONAL.has(s.reading) && big(s)) || find((s) => s.status === "ok" && big(s));
    if (fb) return fb;
    // Last resort: any live signal anywhere that clears the minimum-size rule.
    for (const t of tickers) for (const s of t.signals || []) if (s.status === "ok" && big(s)) return { ticker: t.ticker, name: t.name, signal: s, reason: "fallback" };
    return null;
  }
  // "F-150 owner complaints down 43% → Ford"
  function hookLine(p) {
    const s = p.signal, v = Number(s.pct);
    const ba = root.TODSize && root.TODSize.beforeAfter(s);
    const mv = Number.isFinite(v) ? (Math.abs(v) < 0.5 ? " about flat" : ` ${v > 0 ? "up" : "down"} ${Math.round(Math.abs(v))}%${ba ? ` (${ba.text})` : ""}`) : "";
    return `${s.name}${mv} → ${p.name}`;
  }

  const api = { hook, hookLine, HOOK_FALLBACK, pick, qualifies, score, offbeatWeight, plainRead, firstSentence, FLAGSHIP };
  root.TODFeatured = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
