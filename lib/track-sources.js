// Long-history fetchers for the backtest. Same public endpoints as lib/sources.js, but asking for
// several years of dated history (and, for SEC, the date each number was first filed).
import { get } from "./http.js";
import * as src from "./sources.js";

const iso = (d) => d.toISOString().slice(0, 10);

export const fredLong = (series, years = 6) => src.fred({ series, years });
export async function wikiLong(article, from) {
  const days = Math.ceil((Date.now() - Date.parse(from + "T00:00:00Z")) / 864e5);
  return src.wiki({ article, days });
}

// Weekly HN story counts in fixed Monday→Monday (UTC) buckets, dated by the bucket's end.
export async function hnWeekly(query, from) {
  let start = Date.parse(from + "T00:00:00Z");
  start -= ((new Date(start).getUTCDay() + 6) % 7) * 864e5; // back to Monday
  const series = [];
  for (let a = start; a + 7 * 864e5 <= Date.now(); a += 7 * 864e5) {
    const f = Math.floor(a / 1000), to = f + 7 * 86400;
    const j = await get(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=0&numericFilters=${encodeURIComponent(`created_at_i>=${f},created_at_i<${to}`)}`);
    if (typeof j.nbHits !== "number") throw new Error("HN search: unexpected response");
    series.push({ t: iso(new Date(to * 1000)), v: j.nbHits });
  }
  return { series };
}

// TSA checkpoint counts for every year since `fromYear` (one public page per year).
export async function tsaYears(fromYear) {
  const parse = (h) => [...h.matchAll(/<td[^>]*>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*<\/td>/g)]
    .map((m) => ({ t: `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`, v: Number(m[4].replace(/,/g, "")) }));
  const yr = new Date().getUTCFullYear();
  const map = new Map();
  for (let y = fromYear; y < yr; y++) for (const r of parse(await get(`https://www.tsa.gov/travel/passenger-volumes/${y}`, { type: "text" }))) map.set(r.t, r.v);
  for (const r of parse(await get("https://www.tsa.gov/travel/passenger-volumes", { type: "text" }))) map.set(r.t, r.v);
  const series = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => ({ t, v }));
  if (series.length < 400) throw new Error("TSA: too little history");
  return { series };
}

// Quarter-end inventory as FIRST reported, with the date it was first filed (point-in-time).
export async function secInventoryFiled(ticker) {
  const cik = await src.secCik(ticker);
  const j = await get(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/InventoryNet.json`);
  const quarterEnds = new Set((j.units?.USD || []).filter((r) => /^CY\d{4}Q\dI$/.test(r.frame || "")).map((r) => r.end));
  const first = new Map();
  for (const r of j.units?.USD || []) {
    if (!quarterEnds.has(r.end) || !r.filed) continue;
    const p = first.get(r.end);
    if (!p || r.filed < p.filed) first.set(r.end, { filed: r.filed, val: r.val });
  }
  const series = [...first.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, x]) => ({ t, v: x.val / 1e9, filed: x.filed }));
  if (series.length < 8) throw new Error(`SEC ${ticker}: not enough quarterly inventory data`);
  return { series };
}

export const eiaLong = (series) => src.eiaWeeklyXls({ series });
