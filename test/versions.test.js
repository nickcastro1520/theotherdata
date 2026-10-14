import { test } from "node:test";
import assert from "node:assert/strict";
import { TICKERS } from "../lib/catalog.js";
import { loadRegistry, fingerprint, currentVersion, bump } from "../lib/signal-versions.js";

test("every curated signal has a version whose fingerprint matches its current logic", () => {
  const reg = loadRegistry();
  const bad = [];
  for (const t of TICKERS) for (const sig of t.signals) {
    const c = currentVersion(reg, t.ticker, sig);
    if (!c || c.hash !== fingerprint(sig) || !/^\d{4}-\d{2}-\d{2}$/.test(c.since)) bad.push(`${t.ticker}/${sig.id}`);
  }
  assert.deepEqual(bad, [], `Signal logic changed without a version bump (run: npm run versions:bump): ${bad.join(", ")}`);
});

test("changing a threshold changes the fingerprint and bumps the version; wording does not", () => {
  const sig = { ...TICKERS[0].signals[0] };
  assert.notEqual(fingerprint({ ...sig, threshold: sig.threshold + 1 }), fingerprint(sig));
  assert.notEqual(fingerprint({ ...sig, params: { ...sig.params, x: 1 } }), fingerprint(sig));
  assert.equal(fingerprint({ ...sig, why: "reworded" }), fingerprint(sig));
  const t = { ticker: "T", signals: [sig] };
  const r1 = bump({ signals: {} }, [t], "2026-01-01").reg;
  assert.equal(bump(r1, [t], "2026-02-01").changed.length, 0);
  const r2 = bump(r1, [{ ticker: "T", signals: [{ ...sig, threshold: 99 }] }], "2026-02-01");
  assert.deepEqual(r2.reg.signals["T/" + sig.id].map((v) => [v.v, v.since]), [[1, "2026-01-01"], [2, "2026-02-01"]]);
});
