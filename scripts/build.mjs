// Build: copy public/ to dist/ and inject optional settings into the HTML pages.
//   GA_MEASUREMENT_ID         -> loads Google Analytics 4 (via /ga.js). Empty = no analytics at all.
//   GOOGLE_SITE_VERIFICATION  -> <meta name="google-site-verification"> for Search Console.
// Env vars win; otherwise site.config.json is used. Both are empty by default.
import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import "../public/subscribe-form.js";
import { buildShareAssets } from "./cards.mjs";
import "../public/featured.js";
import "../public/card-model.js";

const escH = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The above-the-fold "hook": one striking live example, rendered into the HTML at build time
// (data refreshes redeploy every 4 hours), so it shows instantly with no layout shift.
export function hookFor(index, docs = {}) {
  const F = globalThis.TODFeatured, C = globalThis.TODCard;
  const p = F.hook(index);
  if (!p) return null;
  const doc = docs[p.ticker];
  const s = (doc?.signals || []).find((x) => x.id === p.signal.id) || p.signal;
  const lean = s.reading === "tailwind" ? { tone: "up", word: `Leans up for ${p.name}` } : s.reading === "headwind" ? { tone: "down", word: `Leans down for ${p.name}` } : { tone: "flat", word: `No clear lean for ${p.name}` };
  const card = doc ? C.signalCard(doc, s) : null;
  return { ...p, signal: s, line: F.hookLine({ ...p, signal: s }), lean, num: s.display || "", basis: s.basis || "", read: F.plainRead(s.now) || "", url: C.signalUrl(p.ticker, s.id), card };
}

export function hookHtml(h) {
  if (!h) return "";
  return `<a class="hook" href="${escH(h.url.replace("https://theotherdata.com", ""))}" data-ticker="${escH(h.ticker)}">
          <span class="hook-k"><span class="pulse" aria-hidden="true"></span> Today's hidden signal · live data</span>
          <span class="hook-line">${escH(h.line)}</span>
          <span class="hook-row"><span class="hook-lean ${h.lean.tone}">${h.lean.tone === "up" ? "▲" : h.lean.tone === "down" ? "▼" : "–"} ${escH(h.lean.word)}</span>${h.num ? `<span class="hook-num">${escH(h.num)}${h.basis ? ` <small>· ${escH(h.basis.replace(/^vs /, "vs "))}</small>` : ""}</span>` : ""}</span>
          <span class="hook-why">See why →</span>
        </a>`;
}


const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function loadSettings(env = process.env) {
  let file = {};
  try { file = JSON.parse(await readFile(join(ROOT, "site.config.json"), "utf8")); } catch {}
  const ga = String(env.GA_MEASUREMENT_ID ?? file.gaMeasurementId ?? "").trim();
  const gsc = String(env.GOOGLE_SITE_VERIFICATION ?? file.googleSiteVerification ?? "").trim();
  return {
    ga: /^G-[A-Z0-9]{4,15}$/.test(ga) ? ga : "",
    gsc: /^[A-Za-z0-9_-]{10,100}$/.test(gsc) ? gsc : "",
    gaInvalid: Boolean(ga && !/^G-[A-Z0-9]{4,15}$/.test(ga)),
    gscInvalid: Boolean(gsc && !/^[A-Za-z0-9_-]{10,100}$/.test(gsc)),
  };
}

export function transformHtml(html, { ga, gsc }) {
  return html
    .replace(/<!--SUBSCRIBE:(full|compact)-->/g, (_, v) => globalThis.TODSubscribeForm.html(v))
    .replace("<!--GA-->", ga ? `<script src="/ga.js" data-ga="${ga}" defer></script>` : "")
    .replace("<!--GSC-->", gsc ? `<meta name="google-site-verification" content="${gsc}">` : "");
}

async function build() {
  const s = await loadSettings();
  if (s.gaInvalid) console.warn("GA_MEASUREMENT_ID ignored: expected something like G-ABC123XYZ");
  if (s.gscInvalid) console.warn("GOOGLE_SITE_VERIFICATION ignored: paste only the content value of the meta tag");
  const out = join(ROOT, "dist");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(join(ROOT, "public"), out, { recursive: true });
  for (const f of await readdir(out)) {
    if (!f.endsWith(".html")) continue;
    const p = join(out, f);
    await writeFile(p, transformHtml(await readFile(p, "utf8"), s));
  }
  // Cache-bust local JS/CSS with a content hash so they can be cached for a week (vercel.json) yet update instantly.
  const ver = {};
  for (const f of await readdir(out)) if (/\.(js|css)$/.test(f)) ver[f] = createHash("sha1").update(await readFile(join(out, f))).digest("hex").slice(0, 10);
  const bust = (html) => html.replace(/(src|href)="\/([\w.-]+\.(?:js|css))"/g, (m, a, f) => (ver[f] ? `${a}="/${f}?v=${ver[f]}"` : m));
  for (const f of await readdir(out)) if (f.endsWith(".html")) { const p = join(out, f); await writeFile(p, bust(await readFile(p, "utf8"))); }
  // Track record split (also written by the refresh workflow; regenerated here so it always matches the full file).
  try { const { writeTrackSplit } = await import("../lib/track-split.js"); await writeTrackSplit(JSON.parse(await readFile(join(out, "data", "track-record.json"), "utf8")), join(out, "data")); }
  catch (e) { console.warn(`track split skipped: ${e.message}`); }
  // Real numbers for /how-i-built-this, read from the data snapshot and the test suite at build time.
  try {
    const index = JSON.parse(await readFile(join(out, "data", "index.json"), "utf8"));
    const tr = JSON.parse(await readFile(join(out, "data", "track-record.json"), "utf8"));
    const sigs = index.tickers.flatMap((t) => t.signals || []);
    const srcs = new Set(sigs.map((x) => x.source).filter(Boolean));
    const bt = tr.backtest?.summary?.["1m"] || {};
    let tests = 0;
    for (const f of await readdir(join(ROOT, "test"))) if (f.endsWith(".test.js")) tests += ((await readFile(join(ROOT, "test", f), "utf8")).match(/^test\(/gm) || []).length;
    const stats = { stocks: index.tickers.length, signals: sigs.length, sources: srcs.size + 2, calls: (bt.calls || 0).toLocaleString("en-US"), hit: bt.calls ? `${Math.round((bt.hits / bt.calls) * 100)}%` : "n/a", tests };
    const bp = join(out, "how-i-built-this.html");
    await writeFile(bp, (await readFile(bp, "utf8")).replace(/<!--STAT:(\w+)-->/g, (_, k) => String(stats[k] ?? "")));
  } catch (e) { console.warn(`built-page stats skipped: ${e.message}`); }
  // Real numbers for /signal-walkthrough (AMZN paperboard), straight from the data snapshot.
  try {
    const { walkthroughStats, fillWalkthrough } = await import("../lib/signal-walkthrough.js");
    const rd = async (...p) => JSON.parse(await readFile(join(out, "data", ...p), "utf8"));
    const stats = walkthroughStats({ tickerDoc: await rd("tickers", "AMZN.json"), track: await rd("track", "AMZN.json"), study: await rd("signal-study.json"), summary: await rd("track-summary.json") });
    const wp = join(out, "signal-walkthrough.html");
    await writeFile(wp, fillWalkthrough(await readFile(wp, "utf8"), stats));
  } catch (e) { console.warn(`signal walkthrough stats skipped: ${e.message}`); }
  // Home hook + a home share image that shows the same example. Failures fall back to /og.png and no hook.
  try {
    const index = JSON.parse(await readFile(join(out, "data", "index.json"), "utf8"));
    const tk = globalThis.TODFeatured.hook(index)?.ticker;
    const docs = tk ? { [tk]: JSON.parse(await readFile(join(out, "data", "tickers", `${tk}.json`), "utf8")) } : {};
    const h = hookFor(index, docs);
    const ip = join(out, "index.html");
    let html = (await readFile(ip, "utf8")).replace("<!--HOOK-->", hookHtml(h));
    if (h?.card) {
      try {
        const { renderCard } = await import("../lib/card-render.js");
        await mkdir(join(out, "cards"), { recursive: true });
        await writeFile(join(out, "cards", "home.png"), await renderCard({ ...h.card, headline: h.line }, "wide"));
        const img = "https://theotherdata.com/cards/home.png";
        html = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*"/g, `$1${img}"`)
          .replace(/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${escH(`${h.line}: ${h.lean.word}. The Other Data, education only.`)}">`);
      } catch (e) { console.warn(`home card skipped: ${e.message}`); }
    }
    await writeFile(ip, html);
    if (h) console.log(`hook: ${h.line} (${h.reason})`);
  } catch (e) { console.warn(`hook skipped: ${e.message}`); }
  // Shareable cards + /s/TICKER permalink pages. A card failure never blocks the deploy (pages fall back to /og.png).
  try { await buildShareAssets(out); } catch (e) { console.warn(`share cards skipped: ${e.message}`); }
  console.log(`built dist/ (analytics: ${s.ga ? s.ga : "off"}, search console meta: ${s.gsc ? "on" : "off"})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await build();
