import test from "node:test";
import assert from "node:assert/strict";
import { frequency, compare, readingFor, analyze, analyzeSnapshot, fmt, summarize } from "../lib/analyze.js";

const days = (n, f) => Array.from({ length: n }, (_, i) => ({ t: new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10), v: f(i) }));
const months = (n, f) => Array.from({ length: n }, (_, i) => ({ t: new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10), v: f(i) }));

test("detects frequency", () => {
  assert.equal(frequency(days(60, () => 1)), "daily");
  assert.equal(frequency(months(24, () => 1)), "monthly");
});

test("recent daily compare uses 28-day windows", () => {
  const s = days(56, (i) => (i < 28 ? 100 : 110));
  const c = compare(s, "recent");
  assert.equal(Math.round(c.current), 110);
  assert.equal(Math.round(c.baseline), 100);
});

test("yoy monthly compare uses same months last year", () => {
  const s = months(30, (i) => 100 + i);
  const c = compare(s, "yoy");
  assert.equal(Math.round(c.current - c.baseline), 12);
});

test("readings respect polarity and noise band", () => {
  assert.equal(readingFor(10, 1, 5), "tailwind");
  assert.equal(readingFor(10, -1, 5), "headwind");
  assert.equal(readingFor(3, 1, 5), "neutral");
  assert.equal(readingFor(30, 0, 5), "context");
  assert.equal(readingFor(null, 1, 5), "unknown");
});

test("explanations are built from real numbers and never claim certainty", () => {
  const sig = { metric: "Test metric", unit: "views", compare: "recent", polarity: 1, threshold: 5, up: "more interest", down: "less interest" };
  const a = analyze(sig, days(56, (i) => (i < 28 ? 100 : 120)), "Acme");
  assert.equal(a.reading, "tailwind");
  assert.match(a.now, /120 views\/day/);
  assert.match(a.now, /up 20%/);
  assert.doesNotMatch(a.now, /\b(buy|sell|will rise|guarantee)\b/i);
});

test("snapshot signals say 'tracking' until history exists", () => {
  const sig = { metric: "Open roles", unit: "roles", polarity: 1, threshold: 5, up: "u", down: "d" };
  assert.equal(analyzeSnapshot(sig, [{ t: "2026-10-06", v: 200 }], "Acme").reading, "tracking");
  const a = analyzeSnapshot(sig, [{ t: "2026-09-20", v: 200 }, { t: "2026-10-06", v: 230 }], "Acme");
  assert.equal(a.reading, "tailwind");
});

test("formats units", () => {
  assert.equal(fmt(3.456, "usdGal"), "$3.46/gal");
  assert.equal(fmt(1875000, "downloads"), "1.88M downloads/day");
  assert.equal(fmt(1275, "thousandUnits"), "1.28M/yr pace");
});

test("summary counts readings", () => {
  const s = summarize("Acme", "ACME", [
    { status: "ok", reading: "tailwind", pct: 12, name: "A", basis: "vs x" },
    { status: "ok", reading: "headwind", pct: -30, name: "B", basis: "vs y" },
    { status: "error", name: "C" },
  ]);
  assert.equal(s.tailwinds, 1); assert.equal(s.headwinds, 1);
  assert.match(s.text, /2 of 3/);
});

test("AI summary validator rejects advice and invented numbers", async () => {
  const { validateSummary } = await import("../lib/explain.js");
  const facts = "- PyTorch: 1.97M downloads/day, down 21% vs the 28 days before.";
  assert.equal(validateSummary("Developer interest in AI tooling cooled, with PyTorch downloads down 21% from the prior month, which hints at a softer patch.", facts), null);
  assert.equal(validateSummary("PyTorch downloads fell 21%, so investors should sell the stock before it drops further today.", facts), "advice");
  assert.match(validateSummary("PyTorch downloads fell 35% last month, which hints at softer AI developer activity across the board.", facts), /number 35/);
});

test("summary includes an educational impact call", () => {
  const s = summarize("Acme", "ACME", [
    { status: "ok", reading: "tailwind", pct: 12, name: "A", basis: "vs x" },
    { status: "ok", reading: "tailwind", pct: 8, name: "B", basis: "vs y" },
    { status: "ok", reading: "headwind", pct: -5, name: "C", basis: "vs z" },
  ]);
  assert.equal(s.impact.lean, "tailwind");
  assert.match(s.impact.label, /tailwind/i);
  assert.match(s.impact.text, /lean toward/i);
  assert.match(s.impact.text, /not advice to buy or sell/i);
});

test("directionOf maps pct to up/down/flat", async () => {
  const { directionOf } = await import("../lib/analyze.js");
  assert.equal(directionOf(3), "up");
  assert.equal(directionOf(-1), "down");
  assert.equal(directionOf(0), "flat");
});
