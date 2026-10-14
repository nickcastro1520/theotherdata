import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { splitTrack } from "../lib/track-split.js";

test("track split: summary drops per-stock history, per-ticker files keep it all", async () => {
  const full = JSON.parse(await readFile("public/data/track-record.json", "utf8"));
  const { summary, perTicker } = splitTrack(full);
  assert.deepEqual(Object.keys(perTicker).sort(), Object.keys(full.tickers).sort());
  for (const [tk, t] of Object.entries(full.tickers)) {
    assert.ok(!("history" in summary.tickers[tk].backtest), `${tk} summary has no history`);
    assert.equal(summary.tickers[tk].backtest.historyCount, t.backtest.history.length);
    assert.deepEqual(perTicker[tk].history, t.backtest.history);
    assert.deepEqual(summary.tickers[tk].backtest.summary, t.backtest.summary);
    assert.deepEqual(summary.tickers[tk].live, t.live);
  }
  assert.deepEqual(summary.backtest, full.backtest);
  assert.deepEqual(summary.live, full.live);
  assert.ok(JSON.stringify(summary).length < JSON.stringify(full).length / 4, "summary is much smaller");
});

test("committed track summary and per-ticker files match the full track record", async () => {
  const full = JSON.parse(await readFile("public/data/track-record.json", "utf8"));
  const sum = JSON.parse(await readFile("public/data/track-summary.json", "utf8"));
  assert.equal(sum.generatedAt, full.generatedAt);
  for (const tk of Object.keys(full.tickers)) {
    const d = JSON.parse(await readFile(`public/data/track/${tk}.json`, "utf8"));
    assert.equal(d.history.length, full.tickers[tk].backtest.history.length);
  }
});

test("site pages read the small summary, not the full track file", async () => {
  for (const f of ["public/app.js", "public/tour.js", "public/how-to-read.js", "public/track.js"]) {
    const s = await readFile(f, "utf8");
    assert.ok(s.includes("/data/track-summary.json"), `${f} uses the summary`);
    assert.ok(!/fetch\([^)]*track-record\.json|get\("\/data\/track-record\.json"/.test(s), `${f} doesn't fetch the full file`);
  }
});
