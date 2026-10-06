import test from "node:test";
import assert from "node:assert/strict";
import { pearson, spearman, pctReturns, resampleLast, bestLead } from "../lib/correlate.js";

test("pearson perfect line is 1", () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const ys = xs.map((x) => 2 * x + 1);
  assert.ok(Math.abs(pearson(xs, ys) - 1) < 1e-9);
});

test("spearman handles monotone transform", () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const ys = xs.map((x) => x * x);
  assert.ok(spearman(xs, ys) > 0.99);
});

test("bestLead finds contemporaneous correlated returns", () => {
  const sig = [], px = [];
  let s = 100, p = 50;
  for (let i = 1; i <= 50; i++) {
    const key = `2024-W${String(i).padStart(2, "0")}`;
    const shock = Math.sin(i / 3) * 0.05;
    s *= 1 + shock;
    p *= 1 + shock * 0.8 + 0.001;
    sig.push({ t: key, v: s });
    px.push({ t: key, v: p });
  }
  const hit = bestLead(pctReturns(sig), pctReturns(px), 2);
  assert.ok(hit);
  assert.ok(hit.n >= 20);
  assert.ok(hit.spearman > 0.5);
});

test("resampleLast buckets monthly", () => {
  const s = [
    { t: "2024-01-05", v: 1 }, { t: "2024-01-20", v: 2 },
    { t: "2024-02-03", v: 3 },
  ];
  const r = resampleLast(s, "monthly");
  assert.equal(r.length, 2);
  assert.equal(r[0].v, 2);
  assert.equal(r[1].v, 3);
});
