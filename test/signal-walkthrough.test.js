import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { walkthroughStats, fillWalkthrough } from "../lib/signal-walkthrough.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p) => JSON.parse(read(p));
const data = () => ({ tickerDoc: json("public/data/tickers/AMZN.json"), track: json("public/data/track/AMZN.json"), study: json("public/data/signal-study.json"), summary: json("public/data/track-summary.json") });

test("walkthrough stats come from the real AMZN paperboard data", () => {
  const d = data(), s = walkthroughStats(d);
  assert.equal(s.series, "IPN32213N");
  const row = d.study.signals.find((r) => r.tk === "AMZN" && r.id === "paperboard");
  assert.equal(s.calls, String(row.calls));
  assert.equal(Number(s.up) + Number(s.down), row.calls, "scored calls = up + down checkpoints");
  assert.equal(s.rateX, `${row.rateX.toFixed(1)}%`);
  assert.match(s.svg, /^<svg[^>]+role="img"/);
});

test("every placeholder on the page resolves, and unknown ones fail loudly", () => {
  const html = fillWalkthrough(read("public/signal-walkthrough.html"), walkthroughStats(data()));
  assert.doesNotMatch(html, /<!--SW:/);
  assert.doesNotMatch(html, /n\/a|undefined|NaN/);
  assert.throws(() => fillWalkthrough("<!--SW:nope-->", {}));
});

test("walkthrough page is linked, education-only, CSP-safe and brand-clean", () => {
  const html = read("public/signal-walkthrough.html");
  assert.match(html, /Not financial advice/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/theotherdata.com\/signal-walkthrough">/);
  assert.doesNotMatch(html, /\sstyle="|<script>(?!\s*<\/script>)/);
  assert.doesNotMatch(html, /grok/i);
  for (const l of html.split("\n").filter((l) => /\b(buy|sell)\b/i.test(l))) assert.match(l, /(not|never|advice)/i, l.trim().slice(0, 100));
  for (const p of ["public/index.html", "public/how-i-built-this.html", "public/track.html", "public/how.html"]) assert.match(read(p), /href="\/signal-walkthrough"/, p);
  assert.match(read("public/sitemap.xml"), /\/signal-walkthrough/);
  assert.match(read("scripts/build.mjs"), /fillWalkthrough/);
});
