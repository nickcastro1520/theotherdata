// GET /api/search?q=rocket lab  -> symbol suggestions from the US symbol directory (public/data/symbols.json).
// Ranking: exact ticker > alias > name prefix > ticker prefix > word prefix > contains > fuzzy.
// Falls back to Finnhub symbol search only when the directory has no match (e.g. a brand-new listing).
import { searchDirectory } from "../lib/symbols.js";
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
  const cache = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" };
  let results = [], dirError = null;
  try { results = searchDirectory(q.trim(), 8).map((r) => ({ ...r, pack: r.curated ? "deep" : "light", source: "directory" })); }
  catch (e) { dirError = String(e.message || e).slice(0, 120); }
  if (results.length) return json({ results }, 200, cache);
  try {
    const remote = await searchSymbols(q.trim());
    return json({ results: remote.map((r) => ({ ...r, pack: "light", source: "finnhub" })), ...(dirError ? { note: dirError } : {}) }, 200, cache);
  } catch (e) {
    return json({ error: "error", message: String(e.message || e).slice(0, 120), results: [] }, 502, { "Cache-Control": "no-store" });
  }
}
