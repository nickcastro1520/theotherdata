// Submit every sitemap URL to IndexNow once (one POST, deduped). Run daily from GitHub Actions.
import { readFile } from "node:fs/promises";
import { ENDPOINT, HOST, sitemapUrls, buildPayload } from "../lib/indexnow.js";

let xml;
try {
  const r = await fetch(`https://${HOST}/sitemap.xml`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  xml = await r.text();
} catch (e) {
  console.warn(`live sitemap unavailable (${e.message}); using public/sitemap.xml`);
  xml = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
}
const payload = buildPayload(sitemapUrls(xml));
if (!payload.urlList.length) { console.error("no URLs found"); process.exit(1); }
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});
console.log(`IndexNow: submitted ${payload.urlList.length} URLs -> HTTP ${res.status}`);
if (res.status !== 200 && res.status !== 202) { console.error(await res.text()); process.exit(1); }
