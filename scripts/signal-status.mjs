// Test status for every signal, decided from the published backtest (public/data/scoreboard.json):
//   "tested"   = the signal made calls in the walk-forward backtest. None clears the bar once you account for
//                testing ~90 signals x 3 yardsticks at once (Holm correction on two-sided binomial tests vs 50%),
//                so the label is "Tested: no predictive power found".
//   "untested" = no dated history to backtest (skipWhy says why): "Not tested yet".
//   "passed"   = reserved for results that pass the per-stock / event-study rules on /track. Today only
//                late filings (3 months), which is not a stock-page signal.
// Writes public/data/signal-status.json. Run by scripts/build.mjs and scripts/refresh.mjs.
import { readFile, writeFile } from "node:fs/promises";

function lchoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
function binom2(k, n) { // exact two-sided binomial p vs 0.5
  if (!n) return 1;
  const pk = (i) => Math.exp(lchoose(n, i) - n * Math.LN2), obs = pk(k);
  let p = 0; for (let i = 0; i <= n; i++) { const q = pk(i); if (q <= obs * (1 + 1e-9)) p += q; }
  return Math.min(1, p);
}

export async function buildSignalStatus(root = ".") {
  const sb = JSON.parse(await readFile(`${root}/public/data/scoreboard.json`, "utf8"));
  const tests = [];
  for (const r of sb.signals) for (const m of ["dir", "mkt", "sec"]) if (r[m]?.calls) tests.push({ key: `${r.tk}|${r.id}`, m, p: binom2(r[m].hits, r[m].calls) });
  tests.sort((a, b) => a.p - b.p);
  const survive = new Set(); const M = tests.length;
  for (let i = 0; i < M; i++) { if (tests[i].p * (M - i) <= 0.05) survive.add(`${tests[i].key}|${tests[i].m}`); else break; }
  const out = {};
  for (const r of sb.signals) {
    const k = `${r.tk}|${r.id}`, calls = r.dir?.calls || 0;
    const passed = ["dir", "mkt", "sec"].some((m) => survive.has(`${k}|${m}`));
    out[k] = calls
      ? { status: passed ? "review" : "tested", label: passed ? "Under review" : "Tested: no predictive power found", calls, link: `/scoreboard#s-${r.tk}-${r.id}` }
      : { status: "untested", label: "Not tested yet", why: r.skipWhy || null, link: `/scoreboard#s-${r.tk}-${r.id}` };
  }
  const counts = Object.values(out).reduce((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {});
  const doc = { generatedAt: new Date().toISOString(), source: "public/data/scoreboard.json",
    rule: `Tested = made calls in the backtest. A signal would need at least one of its three hit rates (direction, vs S&P 500, vs sector) to differ from 50% after a Holm correction across all ${M} tests (two-sided exact binomial, 5% level). None does.`,
    tests: M, smallestP: tests[0]?.p ?? null, counts,
    stock: { status: "tested", label: "Tested: no predictive power found", link: "/track", note: "The combined up/down lean per stock was backtested on /track and was about a coin flip." },
    passed: [{ name: "Late-filing notices (SEC Form 12b-25), 3 months", label: "Passed", link: "/track#checks" }],
    signals: out };
  await writeFile(`${root}/public/data/signal-status.json`, JSON.stringify(doc, null, 1));
  return doc;
}
if (import.meta.url === `file://${process.argv[1]}`) { const d = await buildSignalStatus(); console.log(d.counts, "tests", d.tests, "min p", d.smallestP); }
