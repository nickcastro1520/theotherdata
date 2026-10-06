// Local dev server: serves public/ with the same HTML transform and security headers as production.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { loadSettings, transformHtml } from "./scripts/build.mjs";

const settings = await loadSettings();
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const SEC_HEADERS = Object.fromEntries(vercel.headers.find((h) => h.source === "/(.*)").headers.map((h) => [h.key, h.value.replace(/;\s*upgrade-insecure-requests/, "")]));

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
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
