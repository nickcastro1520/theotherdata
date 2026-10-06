// GET /api/lookup?q=GOOGL  -> light signal pack for any US common stock
// Keys stay on the server (Vercel env). Responses are CDN-cacheable for 30 minutes.
import { buildLightPack } from "../lib/light.js";

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });

// Simple per-instance rate limit (warm lambdas). CDN cache absorbs repeats.
const hits = globalThis.__tod_rl || (globalThis.__tod_rl = new Map());
function rateOk(ip) {
  const now = Date.now(), win = Math.floor(now / 60000);
  const key = `${win}:${ip}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) for (const k of hits.keys()) { if (!k.startsWith(String(win))) hits.delete(k); }
  return n <= 30;
}

export async function GET(request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "bad_query", message: "Pass ?q=TICKER or a company name." }, 400);
  const ip = (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "0").split(",")[0].trim();
  if (!rateOk(ip)) return json({ error: "rate_limited", message: "Too many lookups. Please wait a minute." }, 429, { "Retry-After": "60" });

  try {
    const pack = await buildLightPack(q);
    return json(pack, 200, {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      "CDN-Cache-Control": "public, s-maxage=1800",
    });
  } catch (e) {
    const code = e.code || "error";
    const status = code === "not_found" ? 404 : code === "bad_query" ? 400 : code === "no_provider" ? 503 : 502;
    return json({ error: code, message: e.message || "Lookup failed" }, status, { "Cache-Control": "no-store" });
  }
}
