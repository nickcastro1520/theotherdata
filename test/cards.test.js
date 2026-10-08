import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "../public/card-model.js";
import { plan, permalinkHtml, sitemapWithPermalinks } from "../scripts/cards.mjs";
import { renderCard } from "../lib/card-render.js";

const C = globalThis.TODCard;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const doc = {
  ticker: "AMZN", name: "Amazon", updatedAt: "2026-10-08T01:13:43.043Z",
  summary: { tailwinds: 2, headwinds: 1, impact: { lean: "tailwind", magnitude: "moderate", horizon: "weeks to a quarter" } },
  signals: [
    { id: "cardboard", name: "Cardboard box prices", status: "ok", reading: "tailwind", strength: "notable", pct: 6.054, basis: "vs the same period last year", asOf: "2026-08-01", freq: "monthly", display: "491.8", currentLabel: "last 3 months, average", source: { name: "FRED" }, now: "Index: 491.8, up 6.1%. In plain English: box prices are up from a year ago, a hint of firm demand for shipping boxes. We read that as a notable tailwind for Amazon." },
    { id: "aws-sdk", name: "Developers wiring up AWS", status: "ok", reading: "headwind", strength: "notable", pct: -11.2, basis: "vs the 28 days before", now: "In plain English: AWS SDK installs dipped. We read that as a notable headwind for Amazon." },
    { id: "paperboard", name: "U.S. paperboard production", status: "ok", reading: "neutral", pct: -1.8, basis: "vs the same period last year", now: "Down 1.8%." },
    { id: "broken", name: "Broken", status: "error" },
  ],
};

test("stock card: headline signal agrees with the lean, plain English, green/red tone", () => {
  const m = C.stockCard(doc);
  assert.equal(m.headline, "Cardboard box prices → Amazon");
  assert.equal(m.line, "Box prices are up from a year ago, a hint of firm demand for shipping boxes.");
  assert.equal(m.lean.word, "Lean up"); assert.equal(m.lean.tone, "up");
  assert.equal(m.strength, "Moderate"); assert.equal(m.window, "Weeks to a quarter");
  assert.equal(m.url, "https://theotherdata.com/s/AMZN");
  assert.equal(m.img, "/cards/AMZN.png"); assert.equal(m.imgVertical, "/cards/AMZN-vertical.png");
  assert.ok(!m.rows.some((r) => r.name === "Broken"), "error signals are left off");
});

test("signal cards: lean per reading and data date", () => {
  const up = C.signalCard(doc, doc.signals[0]);
  assert.equal(up.url, "https://theotherdata.com/s/AMZN/cardboard");
  assert.equal(up.dataDate, "Data through Aug 2026");
  assert.equal(up.change, "+6.1% vs the same period last year");
  assert.equal(C.signalCard(doc, doc.signals[1]).lean.tone, "down");
  const flat = C.signalCard(doc, doc.signals[2]);
  assert.equal(flat.lean.word, "No clear lean");
  assert.match(flat.line, /inside its normal range/);
});

test("permalink page carries og/twitter tags and the ticker hint, and drops the generic ones", () => {
  const base = read("public/index.html");
  const html = permalinkHtml(base, C.stockCard(doc));
  assert.match(html, /<meta property="og:image" content="https:\/\/theotherdata\.com\/cards\/AMZN\.png">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/theotherdata\.com\/cards\/AMZN\.png">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/theotherdata\.com\/s\/AMZN">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/theotherdata\.com\/s\/AMZN">/);
  assert.match(html, /<meta name="tod-ticker" content="AMZN">/);
  assert.equal((html.match(/property="og:image"/g) || []).length, 1, "exactly one og:image");
  assert.equal((html.match(/<title>/g) || []).length, 1, "exactly one title");
  assert.doesNotMatch(html, /og\.png/);
  const sm = sitemapWithPermalinks("<urlset>\n</urlset>", [{ model: C.stockCard(doc) }]);
  assert.match(sm, /<loc>https:\/\/theotherdata\.com\/s\/AMZN<\/loc>/);
});

test("every curated stock gets a stock card and its live signals get cards", async () => {
  const items = await plan();
  const idx = JSON.parse(read("public/data/index.json"));
  for (const t of idx.tickers) assert.ok(items.some((i) => i.page === `s/${t.ticker}.html`), t.ticker);
  assert.ok(items.length > idx.tickers.length);
  for (const i of items) assert.match(i.model.url, /^https:\/\/theotherdata\.com\/s\/[A-Z.]+(\/[a-z0-9-]+)?$/);
});

test("card renders to a PNG at the right size", async () => {
  const png = await renderCard(C.stockCard(doc), "wide");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  const v = await renderCard(C.signalCard(doc, doc.signals[0]), "vertical");
  assert.equal(v.readUInt32BE(16), 1080); assert.equal(v.readUInt32BE(20), 1920);
});

test("share copy respects the CSP and the no-advice rule", () => {
  for (const f of ["public/share.js", "public/card-model.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /\sstyle="/, `${f}: no inline style attributes`);
    const lines = src.split("\n").filter((l) => /\b(buy|sell|bullish|bearish)\b/i.test(l));
    for (const l of lines) assert.match(l, /(not|never|nothing|advice)/i, `${f}: ${l.trim().slice(0, 120)}`);
    assert.match(src, /Education only, not advice/);
  }
  assert.match(read("public/index.html"), /src="\/share\.js"/);
  assert.match(read("public/app.js"), /data-share-stock/);
});
