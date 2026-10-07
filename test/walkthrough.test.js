import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const files = ["public/tour.js", "public/how-to-read.js", "public/how-to-read.html"];

test("walkthrough files exist and pages link to the guide", () => {
  for (const f of files) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
  for (const page of ["public/index.html", "public/how.html", "public/track.html", "public/how-to-read.html"]) {
    const html = read(page);
    assert.match(html, /href="\/how-to-read"/, `${page} nav links to /how-to-read`);
    assert.match(html, /class="help-btn"/, `${page} has the ? button`);
  }
  assert.match(read("public/index.html"), /src="\/tour\.js"/);
  assert.match(read("public/sitemap.xml"), /\/how-to-read/);
});

test("walkthrough copy respects the CSP and the no-advice rule", () => {
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /\sstyle="/, `${f}: inline style attributes are blocked by the CSP`);
    assert.doesNotMatch(src, /<script>(?!\s*<\/script>)/, `${f}: no inline scripts`);
    // "buy"/"sell" may only appear in disclaimers ("...tells you to buy or sell", advice-sounding words list).
    const lines = src.split("\n").filter((l) => /\b(buy|sell)\b/i.test(l));
    for (const l of lines) assert.match(l, /(not|never|nothing|throw it out|advice)/i, `${f}: buy/sell outside a disclaimer: ${l.trim().slice(0, 120)}`);
  }
  assert.match(read("public/how-to-read.html"), /Not financial advice/i);
  assert.match(read("public/tour.js"), /Not financial advice/i);
});
