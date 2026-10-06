// Sanity checks on the generated data files: every signal is either backed by numbers or honestly marked.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TICKERS } from "../lib/catalog.js";

test("index and ticker files are well formed", async () => {
  const idx = JSON.parse(await readFile("public/data/index.json", "utf8"));
  assert.ok(Date.parse(idx.generatedAt));
  assert.equal(idx.tickers.length, TICKERS.length);
  for (const t of TICKERS) {
    const d = JSON.parse(await readFile(`public/data/tickers/${t.ticker}.json`, "utf8"));
    for (const s of d.signals) {
      assert.ok(["ok", "stale", "error", "tracking", "insufficient"].includes(s.status), `${t.ticker}/${s.id} status ${s.status}`);
      if (s.status === "ok" && s.reading !== "tracking") {
        assert.ok(Array.isArray(s.series) && s.series.length >= 2, `${t.ticker}/${s.id} has a series`);
        assert.ok(Number.isFinite(s.current), `${t.ticker}/${s.id} has a number`);
      }
      if (s.status === "error") assert.ok(!("current" in s), "errors carry no numbers");
      assert.ok(s.what && s.why && s.now, `${t.ticker}/${s.id} has explanations`);
    }
  }
});
