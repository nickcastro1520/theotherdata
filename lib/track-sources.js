// Long-history fetchers for the backtest. Same public endpoints as lib/sources.js, but asking for
// several years of dated history (and, for SEC, the date each number was first filed).
import { get, USER_AGENT } from "./http.js";
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
export async function secInventoryFiled(ticker, concept = "InventoryNet") {
  const cik = await src.secCik(ticker);
  const j = await get(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${encodeURIComponent(concept)}.json`);
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

// ---------- ALFRED (archival FRED): point-in-time vintages, public CSV, no key needed ----------
// For a backtest checkpoint `asOf`, take the series exactly as it stood the day BEFORE asOf: only observations
// that had actually been released by then, at the values published then (no later revisions). Real release
// dates replace the flat publication-lag guess. One request carries up to 12 vintages; requests are spaced
// 2 s apart (ALFRED robots.txt Crawl-delay: 2) and cached on disk, since a past vintage never changes.
import { readFile as _rf, writeFile as _wf, mkdir as _mk } from "node:fs/promises";
export const alfredVintageDate = (asOf) => new Date(Date.parse(asOf + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
let lastAlfred = 0;
async function alfredGet(url) {
  let err;
  for (let i = 0; i < 4; i++) {
    const wait = lastAlfred + 2100 - Date.now();
    if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
    try {
      const r = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(45000) });
      lastAlfred = Date.now();
      if (!r.ok) throw new Error(`HTTP ${r.status} from alfred.stlouisfed.org`);
      return await r.text();
    } catch (e) { lastAlfred = Date.now(); err = e; await new Promise((ok) => setTimeout(ok, 3000 * (i + 1))); }
  }
  throw err;
}
// Returns { [asOf]: [{t, v}] } for the checkpoints ALFRED has a vintage for.
export async function fredVintages(series, checkpoints, { from = "2021-06-01", cacheDir } = {}) {
  const out = {};
  for (let i = 0; i < checkpoints.length; i += 12) {
    const chunk = checkpoints.slice(i, i + 12), vds = chunk.map(alfredVintageDate);
    const file = cacheDir ? `${cacheDir}/${series}_${vds[0]}_${vds.at(-1)}.csv` : null;
    let csv = null;
    if (file) { try { csv = await _rf(file, "utf8"); } catch { /* not cached */ } }
    if (csv == null) {
      csv = await alfredGet(`https://alfred.stlouisfed.org/graph/alfredgraph.csv?id=${chunk.map(() => encodeURIComponent(series)).join(",")}&vintage_date=${vds.join(",")}&cosd=${chunk.map(() => from).join(",")}`);
      if (!/^observation_date,/i.test(csv)) throw new Error("ALFRED: unexpected response");
      if (file) { await _mk(cacheDir, { recursive: true }); await _wf(file, csv); }
    }
    const cols = parseAlfredCsv(csv);
    chunk.forEach((asOf, j) => { const pts = (cols[vds[j].replace(/-/g, "")] || []).filter((p) => p.t <= vds[j]); if (pts.length) out[asOf] = pts; });
  }
  return out;
}
// Multi-vintage CSV → { YYYYMMDD: [{t, v}] } keyed by each column's vintage date.
export function parseAlfredCsv(csv) {
  const lines = String(csv || "").trim().split(/\r?\n/);
  if (!/^observation_date,/i.test(lines[0] || "")) throw new Error("ALFRED: unexpected response");
  const keys = lines[0].split(",").slice(1).map((h) => (h.match(/_(\d{8})$/) || [])[1] || h);
  const out = Object.fromEntries(keys.map((k) => [k, []]));
  for (const r of lines.slice(1)) {
    const [t, ...vals] = r.split(",");
    vals.forEach((raw, j) => { const v = Number(raw); if (t && raw !== "" && raw !== "." && Number.isFinite(v)) out[keys[j]].push({ t, v }); });
  }
  return out;
}
