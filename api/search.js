// GET /api/search?q=meta  -> symbol suggestions (Finnhub)
import { searchSymbols } from "../lib/light.js";

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extra },
  });

export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  if (q.trim().length < 1) return json({ results: [] });
  if (q.length > 64) return json({ error: "bad_query" }, 400);
  try {
    const results = await searchSymbols(q.trim());
    return json({ results }, 200, { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" });
  } catch (e) {
    return json({ error: "error", message: String(e.message || e).slice(0, 120), results: [] }, 502, { "Cache-Control": "no-store" });
  }
}
