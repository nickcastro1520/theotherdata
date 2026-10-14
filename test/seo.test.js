import test from "node:test";
import assert from "node:assert/strict";
import { scoreboardCounts, scoreboardStripHtml, shortName, stockSeo, stockJsonLd, signalListHtml, withLastmod } from "../lib/seo.js";
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
