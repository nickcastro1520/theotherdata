// Home-page featured example: picks only live, directional signals that exist in the data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "../public/featured.js";

const F = globalThis.TODFeatured;
const sig = (id, o = {}) => ({ id, name: id, status: "ok", reading: "tailwind", pct: 10, series: [1, 2, 3], sourceUrl: `https://x/${id}`, ...o });

test("flagship (Amazon cardboard) leads when live and directional", () => {
  const ix = { tickers: [
    { ticker: "F", name: "Ford", signals: [sig("f150-complaints", { pct: -40 })] },
    { ticker: "AMZN", name: "Amazon", signals: [sig("cardboard", { pct: 6 })] },
  ] };
  const picks = F.pick(ix);
  assert.equal(picks[0].ticker, "AMZN");
  assert.equal(picks[0].signal.id, "cardboard");
  assert.equal(picks[0].reason, "flagship");
  assert.equal(picks[1].ticker, "F");
});

test("falls back to the highest-scoring offbeat move when the flagship is neutral or stale", () => {
  const ix = { tickers: [
    { ticker: "AMZN", name: "Amazon", signals: [sig("cardboard", { reading: "neutral", pct: 1 }), sig("paperboard", { status: "stale" })] },
    { ticker: "XOM", name: "Exxon", signals: [sig("wti", { pct: 30 })] },
    { ticker: "LLY", name: "Lilly", signals: [sig("tirzepatide-reports", { pct: 20 })] },
  ] };
  const picks = F.pick(ix);
  assert.equal(picks[0].ticker, "LLY", "offbeat FDA reports outrank a plain oil price");
  assert.ok(!picks.some((p) => p.ticker === "AMZN"));
});

test("skips errors, context readings, artifacts (>150%), and duplicate series/tickers", () => {
  const gas = "https://fred/GASREGW";
  const ix = { tickers: [
    { ticker: "NVO", name: "Novo", signals: [sig("semaglutide-reports", { pct: 248 })] },
    { ticker: "WMT", name: "Walmart", signals: [sig("gas-wallet", { pct: 8, reading: "headwind", sourceUrl: gas }), sig("jobless-claims", { reading: "context" })] },
    { ticker: "TSLA", name: "Tesla", signals: [sig("gas-ev", { pct: 8, sourceUrl: gas }), sig("x", { status: "error" })] },
    { ticker: "MSFT", name: "Microsoft", signals: [sig("copilot-chatter", { pct: 49 }), sig("copilot-curiosity", { pct: 24 })] },
  ] };
  const picks = F.pick(ix);
  const ids = picks.map((p) => `${p.ticker}:${p.signal.id}`);
  assert.ok(!ids.includes("NVO:semaglutide-reports"));
  assert.equal(picks.filter((p) => p.signal.sourceUrl === gas).length, 1);
  assert.equal(picks.filter((p) => p.ticker === "MSFT").length, 1);
});

test("plainRead and firstSentence pull clean copy", () => {
  assert.equal(F.plainRead("X: 491.8, up 6.1%. In plain English: box prices are up from a year ago. We read that as a notable tailwind for Amazon."), "Box prices are up from a year ago.");
  assert.equal(F.plainRead("That's within the ±2% range we treat as normal noise."), null);
  assert.equal(F.firstSentence("The U.S. average price of gas. More text."), "The U.S. average price of gas.");
});

test("picks from the committed data are real signals with real numbers", async () => {
  const ix = JSON.parse(await readFile(new URL("../public/data/index.json", import.meta.url), "utf8"));
  const picks = F.pick(ix);
  assert.ok(picks.length >= 1 && picks.length <= 4);
  for (const p of picks) {
    const t = ix.tickers.find((x) => x.ticker === p.ticker);
    assert.ok(t.signals.includes(p.signal), "pick must reference a signal object from the index");
    assert.ok(Number.isFinite(p.signal.pct) && p.signal.status === "ok");
  }
});
