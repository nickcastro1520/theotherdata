import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "../public/subscribe-form.js";
import "../public/card-model.js";
import { transformHtml } from "../scripts/build.mjs";
import { SUB_LINE } from "../lib/card-render.js";

const F = globalThis.TODSubscribeForm;

test("hero signup is compact and posts to the same endpoint as the full form", () => {
  const h = F.html("hero");
  assert.match(h, /action="\/api\/subscribe"/);
  assert.match(h, /data-sub/);
  assert.match(h, /name="consent"[^>]*required/);
  assert.match(h, /Get the free weekly email/);
  assert.match(h, /class="sub-l sr"/, "label is visually hidden but present");
});

test("home page has one full form plus the compact hero form, hero form comes first", async () => {
  const out = transformHtml(await readFile("public/index.html", "utf8"), {});
  assert.equal((out.match(/sub-form sub-full/g) || []).length, 1);
  assert.equal((out.match(/sub-form sub-hero/g) || []).length, 1);
  assert.ok(out.indexOf("sub-hero") < out.indexOf("sub-full"));
  assert.ok(out.indexOf("sub-hero") < out.indexOf('id="stocks"'), "hero signup sits in the hero");
});

test("top-of-page weekly email link on track, scoreboard, walkthrough and stock pages", async () => {
  for (const f of ["track", "scoreboard", "signal-walkthrough"]) {
    const s = await readFile(`public/${f}.html`, "utf8");
    const i = s.indexOf('class="email-cta"');
    assert.ok(i > 0 && i - s.indexOf("<h1") < 400, `${f} has the link right under the h1`);
    assert.match(s, /href="\/subscribe">Get the free weekly email/);
  }
  const app = await readFile("public/app.js", "utf8");
  assert.ok(app.indexOf('class="email-cta"') < app.indexOf("impactPanel(d)}\n"), "stock page link sits above the signals");
});

test("share text and share images carry the weekly email line", async () => {
  assert.equal(SUB_LINE, "Free weekly email: theotherdata.com/subscribe");
  assert.match(await readFile("public/card-model.js", "utf8"), /Free weekly email: theotherdata\.com\/subscribe/);
});
