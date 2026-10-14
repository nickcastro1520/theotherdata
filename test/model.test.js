import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../lib/model.js";
const rec = (d, tk, sig, x, r = x) => ({ d, tk, sig, w: { "1m": { x, r, to: d.replace(/-01$/, "-28") } } });
test("parseSig reads +/-/0", () => {
  assert.deepEqual(M.parseSig({ sig: "a:+,b-c:-,d:0" }), [{ id: "a", v: 1 }, { id: "b-c", v: -1 }, { id: "d", v: 0 }]);
});
test("train only uses outcomes known before the cutoff, keeps helpful signals, mutes the rest", () => {
  const recs = [];
  for (let i = 1; i <= 9; i++) recs.push(rec(`2023-0${i}-01`, "X", "good:+,bad:-", 0.02));
  recs.push(rec("2023-10-01", "X", "good:+,bad:-", 0.02));
  recs.push(rec("2024-02-01", "X", "good:-,bad:+", 0.5)); // after cutoff: must be ignored
  const m = M.train(recs, "2024-01-01");
  assert.equal(m.trainRecords, 10);
  assert.equal(m.weights["X:good"], 1);
  assert.equal(m.weights["X:bad"], 0);
  assert.equal(m.stats["X:good"].hitsX, 10);
  assert.equal(M.leanFromVote(M.netVote("X", M.parseSig({ sig: "good:-,bad:+" }), m.weights).s, 1), "headwind");
});
test("too few calls stays muted; nothing is flipped", () => {
  const recs = [1, 2, 3].map((i) => rec(`2023-0${i}-01`, "X", "s:+", -0.05));
  const m = M.train(recs, "2024-01-01");
  assert.equal(m.weights["X:s"], 0);
  assert.equal(M.leanFromVote(M.netVote("X", [{ id: "s", v: 1 }], m.weights).s, 1), "quiet");
});
test("wilson interval brackets the rate", () => {
  const [lo, hi] = M.wilson(50, 100);
  assert.ok(lo < 0.5 && hi > 0.5 && lo > 0.39 && hi < 0.61);
});
