import test from "node:test";
import assert from "node:assert/strict";
import { scoreboardCounts, scoreboardStripHtml, shortName, stockSeo, stockJsonLd, signalListHtml, hubSignalsHtml, hubLatestLine, hubLinkHtml, statusBadgeHtml, withLastmod, signalSeo, signalOpening, palantirChatterMetaLead, latestReadingLine } from "../lib/seo.js";
import "../public/signal-size.js";
import { readFileSync } from "node:fs";

test("scoreboard counts come from the data", () => {
  const sb = { windowLabel: "1 month", counts: { mkt: { up: 1, unproven: 83, down: 4, none: 0 } } };
  assert.deepEqual(scoreboardCounts(sb), { tested: 88, holding: 1, unproven: 83, worse: 4, window: "1 month" });
  const h = scoreboardStripHtml(sb);
  assert.match(h, /href="\/scoreboard"/); assert.match(h, /<b>88<\/b> signals tested/); assert.match(h, /1 is holding up/);
  assert.equal(scoreboardStripHtml({}), ""); assert.equal(scoreboardCounts({ counts: { mkt: { up: 0, unproven: 0, down: 0 } } }), null);
});

test("real scoreboard.json produces a strip", () => {
  const sb = JSON.parse(readFileSync(new URL("../public/data/scoreboard.json", import.meta.url)));
  assert.ok(scoreboardCounts(sb).tested > 0);
});

test("stock SEO is unique and descriptive", () => {
  assert.equal(shortName("Boxes being made (paperboard output)"), "paperboard output");
  const doc = { ticker: "AMZN", name: "Amazon", updatedAt: "2026-10-14T00:00:00Z", signals: [{ name: "Cardboard box prices" }, { name: "Boxes being made (paperboard output)" }, { name: "Online store sales" }] };
  const s = stockSeo(doc);
  assert.equal(s.title, "Amazon (AMZN) hidden signals: Cardboard box prices, paperboard output & more explained | The Other Data");
  assert.match(s.description, /3 offbeat public signals for Amazon \(AMZN\)/);
  assert.equal(s.h1, "Amazon (AMZN) hidden signals");
  const ld = stockJsonLd(doc, "https://theotherdata.com/s/AMZN");
  const j = JSON.parse(ld.replace(/^<script[^>]*>|<\/script>$/g, ""));
  assert.equal(j["@graph"][0].about.tickerSymbol, "AMZN");
  assert.equal(j["@graph"][1]["@type"], "BreadcrumbList");
});

test("every curated stock gets a distinct title", () => {
  const idx = JSON.parse(readFileSync(new URL("../public/data/index.json", import.meta.url)));
  const titles = idx.tickers.map((t) => stockSeo(JSON.parse(readFileSync(new URL(`../public/data/tickers/${t.ticker}.json`, import.meta.url)))).title);
  assert.equal(new Set(titles).size, titles.length);
});

test("signal list and sitemap lastmod", () => {
  assert.match(signalListHtml([{ name: "A & B", url: "https://theotherdata.com/s/X/a" }]), /<a href="\/s\/X\/a">A &amp; B<\/a>/);
  assert.equal(signalListHtml([]), "");
  assert.equal(withLastmod("<url><loc>https://x/</loc></url>", "2026-10-14T20:00:00Z"), "<url><loc>https://x/</loc><lastmod>2026-10-14</lastmod></url>");
  assert.equal(withLastmod("<url><loc>a</loc></url>", "bad"), "<url><loc>a</loc></url>");
});

test("hubSignalsHtml builds unique COIN copy with badges and no lean words", () => {
  const doc = JSON.parse(readFileSync(new URL("../public/data/tickers/COIN.json", import.meta.url)));
  const status = JSON.parse(readFileSync(new URL("../public/data/signal-status.json", import.meta.url)));
  const h = hubSignalsHtml(doc, status, globalThis.TODSize.describe);
  assert.match(h, /data-tod-hub/);
  assert.match(h, /Bitcoin price/);
  assert.match(h, /Bitcoin curiosity/);
  assert.match(h, /Coinbase hiring/);
  assert.match(h, /href="\/s\/COIN\/bitcoin-curiosity"/);
  assert.match(h, /ts-badge/);
  assert.match(h, /What the data did/);
  assert.match(h, /Latest:/);
  assert.doesNotMatch(h, /\b(lean|tailwind|headwind|buy|sell)\b/i);
  assert.match(hubLinkHtml(doc), /href="\/s\/COIN"/);
  assert.match(statusBadgeHtml(status.signals["COIN|bitcoin"]), /Tested: no predictive power found/);
  assert.ok(hubLatestLine(doc.signals.find((s) => s.id === "bitcoin")).includes("$"));
});

test("sibling signal permalinks are not near-duplicates (META curiosity pages, Search Console Oct 26 2026)", async () => {
  await import("../public/signal-size.js"); await import("../public/card-model.js");
  const { plan, permalinkHtml } = await import("../scripts/cards.mjs");
  const items = (await plan()).filter((i) => i.model.ticker === "META" && i.model.kind === "signal");
  const ig = items.find((i) => i.model.id === "instagram-curiosity"), th = items.find((i) => i.model.id === "threads-curiosity");
  assert.ok(ig && th);
  const base = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const body = (m) => permalinkHtml(base, m).match(/<section class="detail" id="detail">([\s\S]*?)<\/section>/)[1];
  assert.notEqual(body(ig.model), body(th.model));
  assert.match(body(th.model), /<h1>Threads curiosity: a Meta Platforms \(META\) signal<\/h1>/);
  assert.match(body(ig.model), /Why it can matter to Meta Platforms/);
  assert.notEqual(ig.model.description.replace(/[\d.,%K→:]+/g, ""), th.model.description.replace(/[\d.,%K→:]+/g, ""));
  for (const it of items) assert.doesNotMatch(it.model.description, /\blean|tailwind|headwind|\bbuy\b|\bsell\b/i);
  assert.match(body(ig.model), /href="\/s\/META"/);
});


test("PLTR dev-chatter and HD lumber titles, and Palantir meta lead from real data", async () => {
  const { plan, permalinkHtml } = await import("../scripts/cards.mjs");
  const items = await plan(undefined, new Set(["PLTR", "HD"]));
  const pltr = items.find((i) => i.page === "s/PLTR/dev-chatter.html");
  const hd = items.find((i) => i.page === "s/HD/lumber.html");
  assert.ok(pltr && hd);
  assert.equal(pltr.model.title, "Palantir (PLTR) Developer Chatter Tracker: Tech News Mentions, 4-Week Trend | The Other Data");
  assert.equal(hd.model.title, "Lumber Prices Chart vs Home Depot (HD) Stock | The Other Data");
  const doc = JSON.parse(readFileSync(new URL("../public/data/tickers/PLTR.json", import.meta.url)));
  const sig = doc.signals.find((s) => s.id === "dev-chatter");
  const lead = palantirChatterMetaLead(sig);
  assert.ok(lead, "current Palantir reading must be present in the snapshot");
  assert.match(lead, /^Tech news mentions of Palantir this week: \d+, vs a 4-week average of [\d.]+.$/);
  assert.ok(pltr.model.description.startsWith(lead));
  assert.doesNotMatch(pltr.model.description, /\b(lean|tailwind|headwind|buy|sell)\b/i);
  const html = permalinkHtml(readFileSync(new URL("../public/index.html", import.meta.url), "utf8"), pltr.model);
  assert.match(html, /<title>Palantir \(PLTR\) Developer Chatter Tracker: Tech News Mentions, 4-Week Trend \| The Other Data<\/title>/);
  assert.match(html, /<meta property="og:title" content="Palantir \(PLTR\) Developer Chatter Tracker: Tech News Mentions, 4-Week Trend">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/theotherdata\.com\/s\/PLTR\/dev-chatter">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/theotherdata\.com\/s\/PLTR\/dev-chatter">/);
  const hdHtml = permalinkHtml(readFileSync(new URL("../public/index.html", import.meta.url), "utf8"), hd.model);
  assert.match(hdHtml, /<title>Lumber Prices Chart vs Home Depot \(HD\) Stock \| The Other Data<\/title>/);
  assert.match(hdHtml, /<meta property="og:title" content="Lumber Prices Chart vs Home Depot \(HD\) Stock">/);
  assert.match(hdHtml, /<link rel="canonical" href="https:\/\/theotherdata\.com\/s\/HD\/lumber">/);
  assert.match(pltr.model.shellHtml, /Tested: no predictive power found/);
  assert.match(hd.model.shellHtml, /Not tested yet/);
});

test("Palantir meta lead is omitted when the reading is missing", () => {
  assert.equal(palantirChatterMetaLead({ status: "ok", name: "Tech chatter about Palantir" }), "");
  assert.equal(palantirChatterMetaLead(null), "");
  const seo = signalSeo({ ticker: "PLTR", name: "Palantir" }, { id: "dev-chatter", name: "Tech chatter about Palantir", status: "ok" }, { line: "Fallback line.", angle: "An angle." });
  assert.equal(seo.title, "Palantir (PLTR) Developer Chatter Tracker: Tech News Mentions, 4-Week Trend | The Other Data");
  assert.doesNotMatch(seo.description, /this week: \d+/);
  assert.match(seo.description, /^Fallback line\./);
});

test("META curiosity pages have distinct openings and their own latest readings", async () => {
  const { plan, permalinkHtml } = await import("../scripts/cards.mjs");
  const items = (await plan(undefined, new Set(["META"]))).filter((i) => i.model.kind === "signal");
  const ig = items.find((i) => i.model.id === "instagram-curiosity");
  const th = items.find((i) => i.model.id === "threads-curiosity");
  const sales = items.find((i) => i.model.id === "online-sales");
  assert.ok(ig && th && sales);
  const doc = JSON.parse(readFileSync(new URL("../public/data/tickers/META.json", import.meta.url)));
  const igS = doc.signals.find((s) => s.id === "instagram-curiosity");
  const thS = doc.signals.find((s) => s.id === "threads-curiosity");
  const igOpen = signalOpening(doc, igS);
  const thOpen = signalOpening(doc, thS);
  assert.match(igOpen, /Instagram curiosity/);
  assert.match(thOpen, /Threads curiosity/);
  assert.match(igOpen, /not the same as our Online store sales signal/);
  assert.match(thOpen, /not the same as Instagram curiosity/);
  assert.match(thOpen, /Online store sales/);
  assert.ok(igOpen.includes(`Latest: ${latestReadingLine(igS)}`));
  assert.ok(thOpen.includes(`Latest: ${latestReadingLine(thS)}`));
  assert.ok(igOpen.includes(igS.display));
  assert.ok(thOpen.includes(thS.display));
  assert.notEqual(igOpen, thOpen);
  assert.doesNotMatch(igOpen, /\b(lean|tailwind|headwind|\bbuy\b|\bsell\b)\b/i);
  assert.doesNotMatch(thOpen, /\b(lean|tailwind|headwind|\bbuy\b|\bsell\b)\b/i);
  const base = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const igHtml = permalinkHtml(base, ig.model);
  const thHtml = permalinkHtml(base, th.model);
  const salesHtml = permalinkHtml(base, sales.model);
  assert.match(igHtml, /<p class="shell-lede">This page follows Instagram curiosity/);
  assert.match(thHtml, /<p class="shell-lede">This page follows Threads curiosity/);
  assert.doesNotMatch(salesHtml, /This page follows Instagram curiosity/);
  assert.match(igHtml, /English Wikipedia article for Instagram/);
  assert.match(thHtml, /English Wikipedia article for Threads \(the social network\)/);
  assert.ok(ig.model.description.startsWith(`Latest: ${latestReadingLine(igS)}`));
  assert.ok(th.model.description.startsWith(`Latest: ${latestReadingLine(thS)}`));
  assert.match(ig.model.shellHtml, /Tested: no predictive power found/);
  assert.match(th.model.shellHtml, /Tested: no predictive power found/);
});
