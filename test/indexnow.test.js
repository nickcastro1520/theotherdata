import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INDEXNOW_KEY, sitemapUrls, buildPayload } from "../lib/indexnow.js";

test("key is valid and served from public/", () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/);
  assert.equal(readFileSync(new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url), "utf8").trim(), INDEXNOW_KEY);
});
test("sitemap parsing dedupes and keeps only our https host", () => {
  const xml = "<loc>https://theotherdata.com/</loc><loc>https://theotherdata.com/</loc><loc>https://evil.com/x</loc><loc>http://theotherdata.com/a</loc><loc> https://theotherdata.com/track </loc>";
  assert.deepEqual(sitemapUrls(xml), ["https://theotherdata.com/", "https://theotherdata.com/track"]);
});
test("real sitemap yields URLs and a well-formed payload", () => {
  const urls = sitemapUrls(readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8"));
  assert.ok(urls.length > 5);
  const p = buildPayload([...urls, urls[0]]);
  assert.equal(p.host, "theotherdata.com");
  assert.equal(p.urlList.length, urls.length);
  assert.equal(p.keyLocation, `https://theotherdata.com/${INDEXNOW_KEY}.txt`);
});
