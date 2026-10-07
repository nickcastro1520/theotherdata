// Track record: no peeking in the backtest, honest scoring, append-only live log, and well-formed output.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as T from "../lib/track.js";
import { TICKERS } from "../lib/catalog.js";
import "../public/track-text.js";

const TT = globalThis.TODTrack;
const days = (from, n, f) => Array.from({ length: n }, (_, i) => ({ t: T.addDays(from, i), v: f(i) }));

test("knownAsOf applies publication lags and SEC filing dates", () => {
  const monthly = { source: "fred", params: { series: "PCU322211322211" } };
  const s = [{ t: "2026-06-01", v: 1 }, { t: "2026-07-01", v: 2 }, { t: "2026-08-01", v: 3 }];
  // Default monthly lag is 50 days: August's value (Aug 1 + 50 = Sep 20) isn't known on Sep 15.
  assert.deepEqual(T.knownAsOf(monthly, s, "2026-09-15", "monthly").map((p) => p.t), ["2026-06-01", "2026-07-01"]);
  assert.equal(T.knownAsOf(monthly, s, "2026-09-20", "monthly").length, 3);
  const sec = { source: "secInventory" };
  const q = [{ t: "2026-03-31", v: 1, filed: "2026-05-01" }, { t: "2026-06-30", v: 2, filed: "2026-08-02" }];
  assert.equal(T.knownAsOf(sec, q, "2026-08-01", "quarterly").length, 1);
  assert.equal(T.knownAsOf(sec, q, "2026-08-02", "quarterly").length, 2);
});

test("leanAsOf ignores data published after the checkpoint", () => {
  const tk = { ticker: "XX", name: "Test Co", signals: [{ id: "views", name: "Views", source: "wiki", params: {}, metric: "m", unit: "views", polarity: 1, threshold: 8, compare: "recent", up: "up", down: "down" }] };
  // Flat 1,000 views/day for 120 days, then a huge spike starting on day 120.
  const series = days("2026-01-01", 160, (i) => (i < 120 ? 1000 : 5000));
  const before = T.leanAsOf(tk, { views: { series, freq: "daily" } }, T.addDays("2026-01-01", 120));
  assert.equal(before.lean, "quiet", "the spike isn't visible yet on the checkpoint day");
  const after = T.leanAsOf(tk, { views: { series, freq: "daily" } }, T.addDays("2026-01-01", 140));
  assert.equal(after.lean, "tailwind");
});

test("tiny Wikipedia baselines (new pages) don't count as surges", () => {
  const tk = { ticker: "XX", name: "Test Co", signals: [{ id: "views", name: "Views", source: "wiki", params: {}, metric: "m", unit: "views", polarity: 1, threshold: 8, compare: "recent", up: "up", down: "down" }] };
  const series = days("2026-01-01", 70, (i) => (i < 50 ? 3 : 4000)); // baseline window is all 3s
  assert.equal(T.leanAsOf(tk, { views: { series, freq: "daily" } }, "2026-03-15"), null);
});

test("scoring: entry is the first close after the lean date; hits and vs-market", () => {
  const px = [{ t: "2026-01-02", v: 100 }, { t: "2026-01-05", v: 101 }, { t: "2026-01-20", v: 110 }, { t: "2026-02-05", v: 90 }];
  const spy = [{ t: "2026-01-02", v: 100 }, { t: "2026-01-05", v: 100 }, { t: "2026-01-20", v: 105 }, { t: "2026-02-05", v: 100 }];
  const r = T.scoreRecord({ d: "2026-01-02", tk: "X", lean: "tailwind" }, px, spy);
  assert.equal(r.w["2w"].from, "2026-01-05", "no same-day entry");
  assert.equal(r.w["2w"].to, "2026-01-20");
  assert.equal(r.w["2w"].hit, true);
  assert.equal(r.w["2w"].hitX, true); // +8.9% vs +5%
  assert.equal(r.w["1m"].hit, false); // 101 → 90
  assert.equal(r.w["1q"], undefined, "window not complete → unscored");
  const h = T.scoreRecord({ d: "2026-01-02", tk: "X", lean: "headwind" }, px, spy);
  assert.equal(h.w["1m"].hit, true);
  const m = T.scoreRecord({ d: "2026-01-02", tk: "X", lean: "mixed" }, px, spy);
  assert.equal(m.w["2w"].hit, undefined, "mixed isn't a call");
  const agg = T.aggregate([r, h, m]);
  assert.equal(agg["1m"].calls, 2);
  assert.equal(agg["1m"].hits, 1);
  assert.equal(agg["1m"].noCall, 1);
});

test("live log appends one line per stock per day and never rewrites", () => {
  const doc = { ticker: "AMZN", summary: { tailwinds: 2, headwinds: 1, impact: { lean: "tailwind", magnitude: "moderate" } }, signals: [{ status: "ok" }], market: { quote: { price: 259.923, at: "2026-10-07T20:00:00Z" }, quoteSource: { name: "Finnhub" } } };
  const first = T.newLiveLines("", [doc], "2026-10-07T21:23:28Z");
  assert.equal(first.length, 1);
  const rec = JSON.parse(first[0]);
  assert.deepEqual([rec.d, rec.lean, rec.mag, rec.px], ["2026-10-07", "tailwind", "moderate", 259.92]);
  assert.equal(T.newLiveLines(first.join("\n") + "\n", [doc], "2026-10-07T23:00:00Z").length, 0);
  assert.equal(T.newLiveLines(first.join("\n") + "\n", [doc], "2026-10-08T01:00:00Z").length, 1);
  const wk = T.weeklySample([{ d: "2026-10-05", tk: "A" }, { d: "2026-10-07", tk: "A" }, { d: "2026-10-12", tk: "A" }]);
  assert.deepEqual(wk.map((r) => r.d), ["2026-10-05", "2026-10-12"]);
});

test("verdict wording needs a real sample and stays modest", () => {
  assert.equal(TT.verdict({ vsMktCalls: 10, vsMktHits: 9 }).key, "early");
  assert.equal(TT.verdict({ vsMktCalls: 546, vsMktHits: 278 }).key, "coin");
  assert.equal(TT.verdict({ vsMktCalls: 500, vsMktHits: 320 }).key, "edge");
  assert.ok(!/buy|sell/i.test(TT.verdict({ vsMktCalls: 500, vsMktHits: 320 }).text));
});

test("committed track files are well formed and keep backtest and live apart", async () => {
  const bt = JSON.parse(await readFile("data/track/backtest.json", "utf8"));
  assert.equal(bt.label, "backtest");
  for (const r of bt.records) {
    assert.ok(/^\d{4}-\d{2}-01$/.test(r.d) && ["tailwind", "headwind", "mixed", "quiet"].includes(r.lean), JSON.stringify(r));
    assert.ok(!("px" in r), "backtest records carry no logged price");
  }
  for (const t of TICKERS) for (const s of t.signals) {
    const c = bt.coverage[t.ticker];
    assert.ok(c.used.some((u) => u.id === s.id) || c.skipped.some((u) => u.id === s.id && u.why), `${t.ticker}/${s.id} is either used or skipped with a reason`);
    if (!T.backtestable(s)) assert.ok(!c.used.some((u) => u.id === s.id), `${s.id} must not be backtested`);
  }
  const live = T.parseLines(await readFile("data/track/live.jsonl", "utf8"));
  assert.ok(live.length >= TICKERS.length);
  const keys = new Set(live.map((r) => `${r.d}|${r.tk}`));
  assert.equal(keys.size, live.length, "one live line per stock per day");
  const out = JSON.parse(await readFile("public/data/track-record.json", "utf8"));
  assert.ok(out.live.startedOn && out.backtest.records === bt.records.length);
  for (const w of out.windows) {
    const s = out.backtest.summary[w.key];
    assert.ok(s.hits <= s.calls && s.vsMktHits <= s.vsMktCalls);
  }
  assert.equal(Object.keys(out.tickers).length, TICKERS.length);
});
