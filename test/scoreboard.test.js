import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../lib/track.js";
import { parseAlfredCsv, alfredVintageDate } from "../lib/track-sources.js";
import { TICKERS } from "../lib/catalog.js";

test("Wilson 95% interval and labels", () => {
  assert.deepEqual(T.wilson(18, 31), [40.8, 73.6]);
  assert.equal(T.wilson(0, 0), null);
  assert.equal(T.ciLabel(T.wilson(18, 31)).text, "Not proven yet");
  assert.equal(T.ciLabel(T.wilson(80, 100)).text, "Holding up");
  assert.equal(T.ciLabel(T.wilson(20, 100)).text, "Worse than a coin flip");
  assert.equal(T.ciLabel(null).key, "none");
});

test("every curated stock maps to a real sector SPDR ETF", () => {
  for (const t of TICKERS) assert.ok(T.SECTOR_ETFS[T.SECTOR_OF[t.ticker]], `${t.ticker} has no sector ETF`);
});

test("scoreRecord adds beat-its-sector; aggregate counts it", () => {
  const px = (a, b) => [{ t: "2024-01-02", v: 100 * (1 + a) }, { t: "2024-02-05", v: 100 * (1 + b) }];
  const stock = px(0, 0.05), spy = px(0, 0.02), sec = px(0, 0.08);
  const r = T.scoreRecord({ d: "2024-01-01", tk: "X", lean: "tailwind" }, stock, spy, sec);
  assert.equal(r.w["1m"].hit, true);
  assert.equal(r.w["1m"].hitX, true);
  assert.equal(r.w["1m"].hitS, false);
  const a = T.aggregate([r]);
  assert.equal(a["1m"].vsSecCalls, 1);
  assert.equal(a["1m"].vsSecHits, 0);
});

test("signalScores credits each signal's own reading, and respects a version start date", () => {
  const tk = { ticker: "X", signals: [{ id: "a", name: "A", source: "fred" }, { id: "b", name: "B", source: "pypi" }] };
  const recs = [
    { d: "2024-01-01", tk: "X", sig: "a:+,b:-", w: { "1m": { r: 0.05, x: 0.01, s: -0.01 } } },
    { d: "2024-02-01", tk: "X", sig: "a:-,b:0", w: { "1m": { r: 0.03, x: -0.02, s: -0.03 } } },
  ];
  const [a, b] = T.signalScores(recs, [tk]);
  assert.deepEqual([a.dir.hits, a.dir.calls, a.mkt.hits, a.sec.hits], [1, 2, 2, 1]);
  assert.deepEqual([b.dir.hits, b.dir.calls], [0, 1]);
  const [a2] = T.signalScores(recs, [tk], "1m", () => "2024-02-01");
  assert.equal(a2.dir.calls, 1);
});

test("ALFRED multi-vintage CSV parses by column; vintage = day before checkpoint", () => {
  const csv = "observation_date,UNRATE_20240110,UNRATE_20240310\n2023-12-01,3.7,3.7\n2024-01-01,,3.7\n2024-02-01,,3.9\n";
  const p = parseAlfredCsv(csv);
  assert.deepEqual(p["20240110"], [{ t: "2023-12-01", v: 3.7 }]);
  assert.equal(p["20240310"].length, 3);
  assert.equal(alfredVintageDate("2024-03-01"), "2024-02-29");
  assert.throws(() => parseAlfredCsv("<html>"));
});

test("leanAsOf uses the ALFRED vintage when one exists for that checkpoint", () => {
  const t = TICKERS.find((x) => x.signals.some((s) => s.source === "fred"));
  const sig = t.signals.find((s) => s.source === "fred");
  const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ t: new Date(Date.UTC(2021, 6 + i, 1)).toISOString().slice(0, 10), v: f(i) }));
  const flat = mk(40, () => 100), jump = mk(30, (i) => (i > 26 ? 200 : 100));
  const asOf = "2024-02-01";
  const h0 = { [sig.id]: { series: flat, freq: "monthly" } };
  const h1 = { [sig.id]: { series: flat, freq: "monthly", vintages: { [asOf]: jump } } };
  const a = T.leanAsOf(t, h0, asOf), b = T.leanAsOf(t, h1, asOf);
  const read = (r) => r?.sig?.split(",").find((x) => x.startsWith(sig.id + ":"));
  assert.notEqual(read(a), read(b));
});
