import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "../public/signal-size.js";
import "../public/featured.js";
import "../public/card-model.js";
import { hookFor, hookHtml } from "../scripts/build.mjs";

const Z = globalThis.TODSize, F = globalThis.TODFeatured;
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const count = (o) => ({ id: "x-chatter", name: "Tech chatter", status: "ok", reading: "tailwind", unit: "stories", compare: "recent", freq: "weekly", basis: "vs the 4 weeks before", ...o });

test("rule 3: count signals need 20+ baseline events (window total, not the average)", () => {
  // Weekly averages over 4 weeks: 4.25/wk = 17 stories in the baseline window.
  const r = Z.check(count({ current: 9.25, baseline: 4.25, pct: 117.6 }));
  assert.equal(r.kind, "count"); assert.equal(r.baselineCount, 17); assert.equal(r.currentCount, 37); assert.equal(r.change, 20);
  assert.equal(r.pass, false); assert.match(r.reason, /baseline under 20/);
  assert.equal(Z.check(count({ current: 10, baseline: 5, pct: 100 })).baselineCount, 20);
});

test("rule 3: count change must be at least 2 × √baseline", () => {
  // 100 baseline → needs |change| ≥ 20.
  const ok = Z.check(count({ freq: "monthly", current: 40, baseline: 100 / 3, pct: 20 }));
  assert.equal(ok.baselineCount, 100); assert.equal(ok.threshold, 20); assert.equal(ok.change, 20); assert.equal(ok.pass, true);
  const no = Z.check(count({ freq: "monthly", current: 39, baseline: 100 / 3, pct: 17 }));
  assert.equal(no.change, 17); assert.equal(no.pass, false); assert.match(no.reason, /2×√baseline/);
  // Falls work too (absolute change).
  assert.equal(Z.check(count({ freq: "monthly", current: 80 / 3, baseline: 100 / 3, pct: -20 })).pass, true);
  // Snapshots (job boards) compare single counts: 164 → 165 roles is noise.
  assert.equal(Z.check({ status: "ok", unit: "roles", compare: "snapshot", freq: "daily", current: 165, baseline: 164, pct: 0.6 }).pass, false);
});

test("rule 3: continuous data keeps its own noise band; missing data never passes", () => {
  assert.equal(Z.check({ status: "ok", unit: "usdGal", compare: "recent", freq: "daily", threshold: 3, pct: 14.2, current: 4.45, baseline: 3.9 }).pass, true);
  assert.equal(Z.check({ status: "ok", unit: "index", compare: "yoy", freq: "monthly", threshold: 3, pct: -1.8 }).pass, false);
  assert.equal(Z.check({ status: "ok", unit: "index", threshold: 3, pct: -3 }).kind, "continuous");
  assert.equal(Z.check(count({ current: null, baseline: 30, pct: 5 })).pass, false);
  assert.equal(Z.check(count({ status: "error", current: 90, baseline: 30, pct: 200 })).pass, false);
  assert.equal(Z.check(count({ status: "tracking", current: 90, baseline: 30, pct: 200 })).pass, false);
});

test("raw before → after numbers: real values only, omitted when missing", () => {
  assert.equal(Z.changeText(count({ current: 9.25, baseline: 4.25, pct: 117.6 })), "+118% (17 → 37)");
  assert.equal(Z.beforeAfter(count({ current: 9.25, baseline: 4.25 })).long, "17 → 37 stories in 4 weeks");
  assert.equal(Z.changeText({ unit: "usdGal", pct: 14.2, current: 4.45, baseline: 3.9 }), "+14% ($3.90/gal → $4.45/gal)");
  assert.equal(Z.changeText({ unit: "index", pct: -1.8 }), "−1.8%");
  assert.equal(Z.changeText({ unit: "index" }), "");
  assert.equal(Z.describe(count({ current: 10, baseline: 5, pct: 100 })), "Tech chatter doubled: 20 → 40 stories in 4 weeks, vs the 4 weeks before.");
});

test("featured picks (hero + digest) only use signals that pass rule 3", () => {
  const big = count({ id: "big-chatter", freq: "monthly", current: 60, baseline: 40, pct: 50, series: [1, 2] });
  const small = count({ id: "small-chatter", current: 9.25, baseline: 4.25, pct: 117.6, series: [1, 2] });
  const index = { tickers: [{ ticker: "AAA", name: "Aaa", signals: [small] }, { ticker: "BBB", name: "Bbb", signals: [big] }] };
  assert.equal(F.qualifies(small), false); assert.equal(F.qualifies(big), true);
  assert.deepEqual(F.pick(index, { limit: 5, flagship: [] }).map((p) => p.ticker), ["BBB"]);
  assert.equal(F.hook(index).signal.id, "big-chatter");
});

test("hero fallback still finds something valid when no signal is directional", () => {
  const quietBig = count({ id: "quiet", reading: "neutral", freq: "monthly", current: 60, baseline: 40, pct: 50 });
  const small = count({ id: "small", reading: "neutral", current: 9.25, baseline: 4.25, pct: 117.6 });
  const h = F.hook({ tickers: [{ ticker: "ZZZ", name: "Zzz", signals: [small, quietBig] }] });
  assert.equal(h.signal.id, "quiet"); assert.equal(h.reason, "fallback");
  assert.equal(F.hook({ tickers: [{ ticker: "ZZZ", name: "Zzz", signals: [small] }] }), null);
});

test("live data: the hero passes rule 3 and its card says what the data did, never a lean", () => {
  const index = read("public/data/index.json");
  const p = F.hook(index);
  assert.ok(p, "the hero finds a signal in the live snapshot");
  const doc = read(`public/data/tickers/${p.ticker}.json`);
  const full = doc.signals.find((s) => s.id === p.signal.id);
  assert.ok(Z.passes(full));
  const html = hookHtml(hookFor(index, { [p.ticker]: doc }));
  assert.match(html, /Today's hidden signal/);
  assert.match(html, /→/, "shows before → after numbers");
  assert.doesNotMatch(html, /\blean|tailwind|headwind|▲|▼/i);
  for (const c of F.pick(index, { limit: 5, flagship: [] })) assert.ok(Z.passes(c.signal), `${c.ticker} ${c.signal.id}`);
});
