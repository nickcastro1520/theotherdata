import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "../public/signal-size.js";
import "../public/card-model.js";
import { plan, permalinkHtml, sitemapWithPermalinks } from "../scripts/cards.mjs";
import { renderCard } from "../lib/card-render.js";

const C = globalThis.TODCard;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const doc = {
  ticker: "AMZN", name: "Amazon", updatedAt: "2026-10-08T01:13:43.043Z",
  summary: { tailwinds: 2, headwinds: 1, impact: { lean: "tailwind", magnitude: "moderate", horizon: "weeks to a quarter" } },
  signals: [
    { id: "cardboard", name: "Cardboard box prices", status: "ok", reading: "tailwind", strength: "notable", pct: 6.054, unit: "index", compare: "yoy", threshold: 2, current: 491.85, baseline: 463.77, basis: "vs the same period last year", asOf: "2026-08-01", freq: "monthly", display: "491.8", currentLabel: "last 3 months, average", source: { name: "FRED" }, now: "Index: 491.8, up 6.1%. In plain English: box prices are up from a year ago, a hint of firm demand for shipping boxes. We read that as a notable tailwind for Amazon." },
    { id: "aws-sdk", name: "Developers wiring up AWS", status: "ok", reading: "headwind", strength: "notable", pct: -4.6, unit: "downloads", compare: "recent", freq: "daily", threshold: 5, current: 83501911.75, baseline: 87484169.86, basis: "vs the 28 days before", now: "In plain English: AWS SDK installs dipped. We read that as a notable headwind for Amazon." },
    { id: "aws-chatter", name: "AWS chatter", status: "ok", reading: "tailwind", strength: "notable", pct: 117.6, unit: "stories", compare: "recent", freq: "weekly", threshold: 15, current: 9.25, baseline: 4.25, basis: "vs the 4 weeks before" },
    { id: "paperboard", name: "U.S. paperboard production", status: "ok", reading: "neutral", pct: -1.8, unit: "index", compare: "yoy", freq: "monthly", threshold: 3, current: 88.15, baseline: 89.73, basis: "vs the same period last year", now: "Down 1.8%." },
    { id: "broken", name: "Broken", status: "error" },
  ],
};
const DIRECTION = /\blean|tailwind|headwind|▲|▼|\bbuy\b|\bsell\b/i;
const cardText = (m) => [m.headline, m.line, m.box?.pct, m.box?.raw, m.box?.basis, ...(m.facts || []).flat(), ...(m.rows || []).flatMap((r) => [r.name, r.change]), m.alt, m.description].filter(Boolean).join(" | ");

test("stock card: describes what the data did, with raw numbers and no lean", () => {
  const m = C.stockCard(doc);
  assert.equal(m.headline, "Cardboard box prices → Amazon");
  assert.equal(m.line, "Cardboard box prices rose 6%: 463.8 → 491.9, vs the same period last year.");
  assert.deepEqual(m.box, { pct: "+6.1%", raw: "463.8 → 491.9", basis: "vs the same period last year" });
  assert.equal(m.lean, undefined); assert.equal(m.strength, undefined);
  assert.equal(m.url, "https://theotherdata.com/s/AMZN");
  assert.equal(m.img, "/cards/AMZN.png"); assert.equal(m.imgVertical, "/cards/AMZN-vertical.png");
  assert.ok(!m.rows.some((r) => r.name === "Broken"), "error signals are left off");
  assert.ok(!m.rows.some((r) => r.name === "AWS chatter"), "small samples are never featured on a share image");
  assert.doesNotMatch(cardText(m), DIRECTION);
});

test("signal cards: raw numbers, data date, small samples get no image", () => {
  const up = C.signalCard(doc, doc.signals[0]);
  assert.equal(up.url, "https://theotherdata.com/s/AMZN/cardboard");
  assert.equal(up.dataDate, "Data through Aug 2026");
  assert.equal(up.change, "+6.1% (463.8 → 491.9) vs the same period last year");
  assert.equal(up.img, "/cards/AMZN/cardboard.png");
  const small = C.signalCard(doc, doc.signals[2]);
  assert.equal(small.featured, false); assert.equal(small.img, null); assert.equal(small.imgVertical, null);
  assert.equal(small.change, "+118% (17 → 37) vs the 4 weeks before");
  for (const s of doc.signals.slice(0, 4)) assert.doesNotMatch(cardText(C.signalCard(doc, s)), DIRECTION);
});

test("no share image carries a direction: every planned card model and the renderer source", async () => {
  const items = await plan();
  assert.ok(items.length > 35);
  for (const it of items) assert.doesNotMatch(cardText(it.model), DIRECTION, `${it.model.ticker} ${it.model.id || ""}`);
  for (const it of items) if (it.model.kind === "signal" && !it.model.noImage) assert.ok(globalThis.TODSize.passes((JSON.parse(read(`public/data/tickers/${it.model.ticker}.json`)).signals.find((s) => C.slug(s.id) === it.model.id))), `${it.model.ticker}/${it.model.id} fails rule 3 but has an image`);
  const src = read("lib/card-render.js");
  assert.doesNotMatch(src, /m\.lean|leanBox|arrow\(/, "renderer draws no lean box or up/down arrow");
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
