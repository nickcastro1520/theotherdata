// Local dev server: serves public/ with the same HTML transform and security headers as production,
// plus /api/lookup and /api/search (same handlers as Vercel).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { loadSettings, transformHtml } from "./scripts/build.mjs";

const settings = await loadSettings();
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const SEC_HEADERS = Object.fromEntries(vercel.headers.find((h) => h.source === "/(.*)").headers.map((h) => [h.key, h.value.replace(/;\s*upgrade-insecure-requests/, "")]));

const lookup = await import("./api/lookup.js");
const search = await import("./api/search.js");

function toRequest(req, url, body) {
  return new Request(url.href, { method: req.method, headers: req.headers, body });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/lookup" || url.pathname === "/api/search") {
    const handler = url.pathname === "/api/lookup" ? lookup.GET : search.GET;
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const out = await handler(toRequest(req, url, body.length ? body : undefined));
      const buf = Buffer.from(await out.arrayBuffer());
      const headers = Object.fromEntries(out.headers.entries());
      res.writeHead(out.status, { ...SEC_HEADERS, ...headers });
      return res.end(buf);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json", ...SEC_HEADERS });
      return res.end(JSON.stringify({ error: "error", message: String(e.message || e) }));
    }
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  if (!extname(p)) p += ".html";
  const file = normalize(join("public", p));
  if (!file.startsWith("public")) { res.writeHead(400); return res.end(); }
  try {
    let data = await readFile(file);
    if (file.endsWith(".html")) data = transformHtml(data.toString(), settings);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache", ...SEC_HEADERS });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": TYPES[".html"], ...SEC_HEADERS });
    res.end(await readFile("public/404.html"));
  }
}).listen(process.env.PORT || 3000, () => console.log("dev on", process.env.PORT || 3000));
