import test from "node:test";
import assert from "node:assert/strict";
import { adviceHit, validateSummary, directionConflict, buildPrompt, storedSummaryProblem } from "../lib/explain.js";
import { summarize, templateImpactText } from "../lib/analyze.js";

test("advice filter: ordinary business words are not advice (the COST false positive)", () => {
  assert.equal(adviceHit("Pricier eggs push shoppers toward bulk-buying, which could help Costco."), null);
  assert.equal(adviceHit("Lower egg prices ease the pressure for shoppers to buy in bulk."), null);
  assert.equal(adviceHit("The Model Y is Tesla's best-selling car, and shoes are selling at full price."), null);
  const facts = "- Egg prices (bulk-buying pressure) (headwind, notable): eggs are 40% cheaper than a year ago.";
  assert.equal(validateSummary("These offbeat signals give a mixed picture for Costco. Cheaper eggs ease bulk-buying pressure, a notable headwind.", facts), null);
});

test("advice filter: still blocks trade calls and price predictions", () => {
  assert.ok(adviceHit("Investors should sell the stock now."));
  assert.ok(adviceHit("This is a great time to buy."));
  assert.ok(adviceHit("The stock will rise next month."));
  assert.ok(adviceHit("Signals look bullish for Amazon."));
});

test("direction check: tailwind lean rejects a 'mixed' summary (the JPM bug)", () => {
  const jpm = "Looking at business loan demand and junk-bond stress, what these offbeat signals lean toward right now is mixed. Business loan demand suggests a notable tailwind.";
  assert.ok(directionConflict(jpm, "tailwind"));
  assert.equal(directionConflict("These offbeat signals lean toward a net tailwind for JPMorgan Chase. Junk-bond stress is a mild headwind, though.", "tailwind"), null);
  assert.ok(directionConflict("These offbeat signals lean toward a net headwind for JPMorgan Chase.", "tailwind"));
});

test("direction check: mixed lean rejects an overall direction but allows per-signal ones", () => {
  assert.equal(directionConflict("These offbeat signals give a mixed picture for Chipotle. Beef is a mild headwind while restaurant sales offer a mild tailwind.", "mixed"), null);
  assert.ok(directionConflict("These signals are mixed, but this suggests a generally positive environment for Starbucks.", "mixed"));
  assert.ok(directionConflict("These offbeat signals lean toward a net tailwind for Costco.", "mixed"));
});

test("direction check: headwind lean allows a single signal with 'mixed context'", () => {
  assert.equal(directionConflict("Collectively, these offbeat signals lean toward a net headwind for Walmart. Jobless claims provide mixed context.", "headwind"), null);
  assert.ok(directionConflict("These offbeat signals lean toward a mixed outlook for Walmart, a net headwind maybe.", "headwind"));
});

test("direction check: quiet lean", () => {
  assert.equal(directionConflict("These offbeat signals are quiet for Roblox right now; nothing is moving outside its normal range.", "quiet"), null);
  assert.ok(directionConflict("These offbeat signals lean toward a net tailwind for Roblox.", "quiet"));
});

test("prompt passes the computed lean, strength and window", () => {
  const p = buildPrompt("JPMorgan Chase", "JPM", "- A (tailwind): x", { lean: "tailwind", tw: 2, hw: 1, magnitude: "moderate", horizon: "weeks to a quarter" });
  assert.match(p, /net tailwind/);
  assert.match(p, /2 favorable readings, 1 unfavorable/);
  assert.match(p, /Strength: moderate/);
  assert.match(p, /weeks to a quarter/);
});

test("template summary always matches its lean", () => {
  for (const lean of ["tailwind", "headwind", "mixed", "quiet"]) {
    const t = templateImpactText("Acme", { lean, tw: 2, hw: 1, magnitude: "moderate", top: { name: "A", pct: 12, basis: "vs last year" } });
    assert.equal(directionConflict(t, lean), null, `${lean}: ${t}`);
    assert.match(t, /not advice to buy or sell/);
  }
});

test("stored summaries are flagged when missing or written for another lean", () => {
  const signals = [
    { status: "ok", reading: "tailwind", pct: 12, name: "A", basis: "vs x", now: "A is up 12%." },
    { status: "ok", reading: "tailwind", pct: 8, name: "B", basis: "vs y", now: "B is up 8%." },
    { status: "ok", reading: "headwind", pct: -5, name: "C", basis: "vs z", now: "C is down 5%." },
  ];
  const summary = summarize("Acme", "ACME", signals);
  assert.equal(storedSummaryProblem({ summary, signals, ai: null }), "missing");
  assert.ok(storedSummaryProblem({ summary, signals, ai: { text: "These offbeat signals give a mixed picture for Acme right now, with A up and C down." } }));
  assert.equal(storedSummaryProblem({ summary, signals, ai: { text: "These offbeat signals lean toward a net tailwind for Acme right now, led by A and B." } }), null);
  assert.ok(storedSummaryProblem({ summary, signals, ai: { lean: "headwind", text: "These offbeat signals lean toward a net tailwind for Acme right now, led by A and B." } }));
});

test("every curated ticker's shipped summary agrees with its lean", async () => {
  const { readFile } = await import("node:fs/promises");
  const idx = JSON.parse(await readFile(new URL("../public/data/index.json", import.meta.url), "utf8"));
  for (const t of idx.tickers) {
    const d = JSON.parse(await readFile(new URL(`../public/data/tickers/${t.ticker}.json`, import.meta.url), "utf8"));
    const text = d.summary?.impact?.text;
    assert.ok(text, `${t.ticker} has a summary`);
    if (d.ai?.text) assert.equal(storedSummaryProblem(d), null, `${t.ticker}: ${d.ai.text}`);
    else assert.equal(directionConflict(text, d.summary.impact.lean) ?? null, null, `${t.ticker} template: ${text}`);
  }
});
