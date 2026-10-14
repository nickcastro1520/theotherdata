// Shareable cards + crawler-readable permalinks, generated at build time (scripts/build.mjs).
//   dist/cards/AMZN.png, AMZN-vertical.png                  stock card (1200x630 Open Graph, 1080x1920 Stories/TikTok)
//   dist/cards/AMZN/cardboard.png, cardboard-vertical.png   one card per signal
//   dist/s/AMZN.html            -> https://theotherdata.com/s/AMZN            (og:image = stock card)
//   dist/s/AMZN/cardboard.html  -> https://theotherdata.com/s/AMZN/cardboard  (og:image = signal card)
// Built from the committed public/data snapshot, so every 4-hour data refresh redeploys fresh cards.
// Standalone: node scripts/cards.mjs [outDir] [--only AMZN,SBUX] [--pages-only]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import "../public/signal-size.js";
import "../public/card-model.js";
import { stockSeo, stockJsonLd, signalListHtml, withLastmod } from "../lib/seo.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const C = globalThis.TODCard;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Every card to draw and every permalink page to write, from the data snapshot.
export async function plan(dataDir = join(ROOT, "public", "data"), only = null) {
  const index = JSON.parse(await readFile(join(dataDir, "index.json"), "utf8"));
  const items = [];
  for (const row of index.tickers) {
    if (only && !only.has(row.ticker)) continue;
    let doc;
    try { doc = JSON.parse(await readFile(join(dataDir, "tickers", `${row.ticker}.json`), "utf8")); } catch { continue; }
    const seo = stockSeo(doc);
    const links = (doc.signals || []).filter((s) => C.live(s) || s.status === "tracking").map((s) => ({ name: s.name, url: C.signalUrl(doc.ticker, s.id) }));
    const sc = C.stockCard(doc);
    items.push({ model: { ...sc, title: seo.title, description: seo.description, h1: seo.h1, jsonld: stockJsonLd(doc, sc.url), sigList: signalListHtml(links), lastmod: doc.updatedAt, narrative: doc.ai?.text || doc.summary?.impact?.text || doc.summary?.text || "" }, page: `s/${doc.ticker}.html` });
    for (const s of doc.signals || []) {
      if (!(C.live(s) || s.status === "tracking")) continue;
      let model = { ...C.signalCard(doc, s), lastmod: s.asOf || doc.updatedAt, narrative: doc.ai?.text || doc.summary?.impact?.text || doc.summary?.text || "" };
      // Rule 3 (public/signal-size.js): a too-small sample never gets its own share image.
      // Its permalink unfurls with the stock card instead, which only features signals that pass.
      if (!model.featured) model = { ...model, img: C.stockCard(doc).img, imgVertical: null, noImage: true, alt: `${model.headline}. Education only, not advice.` };
      items.push({ model, page: `s/${doc.ticker}/${model.id}.html` });
    }
  }
  return items;
}

// The permalink page: the normal home page (same app, same scripts) with this stock's title, description
// and og/twitter tags, plus <meta name="tod-ticker"> so app.js opens the stock without needing a #hash.
export function permalinkHtml(baseHtml, m) {
  const img = `${C.SITE}${m.img}`;
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(m.url)}">`,
    `<meta property="og:title" content="${esc(m.title.replace(/ \| The Other Data$/, ""))}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    `<meta property="og:site_name" content="The Other Data">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(m.alt || `${m.headline}. Education only, not advice.`)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(m.title.replace(/ \| The Other Data$/, ""))}">`,
    `<meta name="twitter:description" content="${esc(m.description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    `<meta name="tod-ticker" content="${esc(m.ticker)}">`,
    m.kind === "signal" ? `<meta name="tod-signal" content="${esc(m.id)}">` : "",
  ].filter(Boolean).join("\n");
  let html = baseHtml
    .replace(/<title>[\s\S]*?<\/title>\n?/, "")
    .replace(/<meta name="description"[^>]*>\n?/, "")
    .replace(/<link rel="canonical"[^>]*>\n?/, "")
    .replace(/<meta (?:property|name)="(?:og|twitter):[^"]*"[^>]*>\n?/g, "");
  if (m.jsonld) html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => m.jsonld);
  // Static first paint for the stock view (same layout as app.js renders), so the page shows instantly.
  const shell = `<div class="wrap" data-tod-shell>
      <div class="dtop"><a class="back" href="/">← All stocks</a></div>
      <div class="dhead"><div><div class="tk">${esc(m.ticker)}</div><h1>${esc(m.h1 || m.company)}</h1><div class="meta">Loading live signals…</div></div></div>
      <p class="shell-lede">${esc(m.narrative || m.description)}</p>${m.sigList || ""}
    </div>`;
  return html
    .replace(/<meta name="viewport"[^>]*>/, (v) => `${v}\n${tags}`)
    .replace("<body>", '<body class="permalink">')
    .replace(/(<link rel="preload" href="\/data\/index.json"[^>]*>)/, `$1\n<link rel="preload" href="/data/tickers/${esc(m.ticker)}.json" as="fetch" crossorigin="anonymous">`)
    .replace('<section class="detail" id="detail" hidden></section>', `<section class="detail" id="detail">${shell}</section>`);
}

export function sitemapWithPermalinks(sitemap, items) {
  const urls = items.map((i) => { const d = String(i.model.lastmod || "").slice(0, 10); return `  <url><loc>${esc(i.model.url)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(d) ? `<lastmod>${d}</lastmod>` : ""}</url>`; }).join("\n");
  return sitemap.replace("</urlset>", `${urls}\n</urlset>`);
}

async function renderAll(out, jobs) {
  const n = Math.max(1, Math.min(jobs.length, (availableParallelism?.() || 2)));
  const chunks = Array.from({ length: n }, (_, i) => jobs.filter((_, j) => j % n === i));
  const results = await Promise.all(chunks.map((chunk) => new Promise((resolve) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { out, jobs: chunk } });
    w.on("message", resolve);
    w.on("error", (e) => resolve({ ok: 0, failed: chunk.length, errors: [String(e.message || e)] }));
  })));
  return results.reduce((a, r) => ({ ok: a.ok + r.ok, failed: a.failed + r.failed, errors: [...a.errors, ...r.errors].slice(0, 5), failedFiles: [...a.failedFiles, ...(r.failedFiles || chunks.flat().map((j) => j.file))] }), { ok: 0, failed: 0, errors: [], failedFiles: [] });
}

export async function buildShareAssets(out, { only = null, pagesOnly = false, log = console.log } = {}) {
  const t0 = Date.now();
  const items = await plan(join(ROOT, "public", "data"), only);
  let r = { ok: 0, failed: 0, errors: [], failedFiles: [] };
  if (!pagesOnly) {
    const jobs = items.filter((it) => !it.model.noImage).flatMap((it) => [{ model: it.model, size: "wide", file: it.model.img }, { model: it.model, size: "vertical", file: it.model.imgVertical }]);
    r = await renderAll(out, jobs);
  }
  const failed = new Set(r.failedFiles);
  const base = await readFile(join(out, "index.html"), "utf8");
  for (const it of items) {
    const p = join(out, it.page);
    await mkdir(dirname(p), { recursive: true });
    // If this card didn't render, unfurl with the generic site image instead of a broken link.
    const model = failed.has(it.model.img) ? { ...it.model, img: "/og.png" } : it.model;
    await writeFile(p, permalinkHtml(base, model));
  }
  try { await writeFile(join(out, "sitemap.xml"), sitemapWithPermalinks(await readFile(join(out, "sitemap.xml"), "utf8"), items)); } catch {}
  log(`share cards: ${items.length} permalink pages, ${r.ok} PNG cards${r.failed ? `, ${r.failed} FAILED (${r.errors[0]})` : ""} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { pages: items.length, ...r };
}

if (!isMainThread && workerData?.jobs) {
  const { renderCard } = await import("../lib/card-render.js");
  const res = { ok: 0, failed: 0, errors: [], failedFiles: [] };
  for (const j of workerData.jobs) {
    try {
      const p = join(workerData.out, j.file);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, await renderCard(j.model, j.size));
      res.ok++;
    } catch (e) { res.failed++; res.failedFiles.push(j.file); if (res.errors.length < 3) res.errors.push(`${j.file}: ${String(e.message || e).slice(0, 160)}`); }
  }
  parentPort.postMessage(res);
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--only");
  const only = i >= 0 ? new Set(args[i + 1].split(",").map((s) => s.trim().toUpperCase())) : null;
  const out = args.find((a, k) => !a.startsWith("--") && args[k - 1] !== "--only") || join(ROOT, "dist");
  await buildShareAssets(out, { only, pagesOnly: args.includes("--pages-only") });
}
