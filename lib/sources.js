// Source adapters. Each returns { series: [{ t: "YYYY-MM-DD", v: number }], url, note? }.
// Every number shown on the site comes from one of these public endpoints. Nothing is invented:
// if a request fails the adapter throws, and the refresh job records the error instead of a value.
import { get } from "./http.js";

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n, from = new Date()) => new Date(from.getTime() - n * 864e5);
const ymd = (d) => iso(d).replace(/-/g, "");

// ---------- FRED (St. Louis Fed) public CSV download, no key needed ----------
export async function fred({ series, years = 4 }) {
  const cosd = iso(new Date(Date.UTC(new Date().getUTCFullYear() - years, 0, 1)));
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}&cosd=${cosd}`;
  const csv = await get(url, { type: "text" });
  const rows = csv.trim().split(/\r?\n/).slice(1);
  const out = [];
  for (const r of rows) {
    const [t, raw] = r.split(",");
    const v = Number(raw);
    if (t && raw !== "" && raw !== "." && Number.isFinite(v)) out.push({ t, v });
  }
  if (!out.length) throw new Error(`FRED ${series}: no observations`);
  return { series: out, url: `https://fred.stlouisfed.org/series/${series}` };
}

// ---------- Wikipedia pageviews (Wikimedia REST API) ----------
export async function wiki({ article, days = 400 }) {
  const end = daysAgo(1), start = daysAgo(days);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${ymd(start)}/${ymd(end)}`;
  const j = await get(url);
  const series = (j.items || []).map((i) => ({ t: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, v: i.views }));
  if (!series.length) throw new Error(`Wikipedia ${article}: no pageview data`);
  return { series, url: `https://pageviews.wmcloud.org/?project=en.wikipedia.org&platform=all-access&agent=user&range=latest-90&pages=${encodeURIComponent(article)}` };
}

// ---------- PyPI downloads (pypistats.org) ----------
export async function pypi({ pkg }) {
  const j = await get(`https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/overall?mirrors=false`);
  const series = (j.data || []).filter((d) => d.category === "without_mirrors").map((d) => ({ t: d.date, v: d.downloads })).sort((a, b) => a.t.localeCompare(b.t));
  if (!series.length) throw new Error(`pypistats ${pkg}: no data`);
  return { series, url: `https://pypistats.org/packages/${encodeURIComponent(pkg)}` };
}

// ---------- Hacker News stories mentioning a term (Algolia HN Search API), weekly counts ----------
export async function hn({ query, weeks = 16 }) {
  const now = Math.floor(Date.now() / 1000);
  const series = [];
  for (let w = weeks; w >= 1; w--) {
    const from = now - w * 7 * 86400, to = from + 7 * 86400;
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=0&numericFilters=${encodeURIComponent(`created_at_i>=${from},created_at_i<${to}`)}`;
    const j = await get(url);
    if (typeof j.nbHits !== "number") throw new Error("HN search: unexpected response");
    series.push({ t: iso(new Date(to * 1000)), v: j.nbHits });
  }
  return { series, url: `https://hn.algolia.com/?dateRange=pastMonth&query=${encodeURIComponent(query)}&type=story` };
}

// ---------- openFDA adverse event reports, monthly totals ----------
export async function openfda({ generic, years = 3 }) {
  const start = ymd(new Date(Date.UTC(new Date().getUTCFullYear() - years, 0, 1)));
  const q = `patient.drug.openfda.generic_name:"${generic}"+AND+receivedate:[${start}+TO+${ymd(new Date())}]`;
  const url = `https://api.fda.gov/drug/event.json?search=${encodeURI(q).replace(/%2B/g, "+")}&count=receivedate`;
  const j = await get(url);
  const days = j.results || [];
  if (!days.length) throw new Error(`openFDA ${generic}: no reports`);
  const byMonth = new Map();
  let lastDay = "";
  for (const d of days) {
    const m = `${d.time.slice(0, 4)}-${d.time.slice(4, 6)}-01`;
    byMonth.set(m, (byMonth.get(m) || 0) + d.count);
    if (d.time > lastDay) lastDay = d.time;
  }
  let series = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => ({ t, v }));
  // Drop a trailing month that is clearly incomplete in the FDA's quarterly release.
  if (Number(lastDay.slice(6, 8)) < 25) series = series.slice(0, -1);
  return { series, url: `https://open.fda.gov/apis/drug/event/`, note: `FDA data released quarterly; latest report date ${lastDay.slice(0, 4)}-${lastDay.slice(4, 6)}-${lastDay.slice(6, 8)}.` };
}

// ---------- NHTSA owner complaints, monthly counts by filing date ----------
export async function nhtsa({ make, model, years }) {
  const seen = new Map();
  for (const y of years) {
    const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${y}`;
    let j;
    try { j = await get(url); } catch (e) { if (/HTTP 400/.test(e.message)) continue; throw e; }
    for (const r of j.results || []) seen.set(r.odiNumber, r.dateComplaintFiled);
  }
  if (!seen.size) throw new Error(`NHTSA ${make} ${model}: no complaints returned`);
  const byMonth = new Map();
  for (const d of seen.values()) {
    const [mm, , yyyy] = String(d).split("/");
    if (!yyyy) continue;
    const k = `${yyyy}-${mm.padStart(2, "0")}-01`;
    byMonth.set(k, (byMonth.get(k) || 0) + 1);
  }
  const thisMonth = `${iso(new Date()).slice(0, 7)}-01`;
  // Fill gaps with zero over the last 24 months and drop the current (partial) month.
  const series = [];
  const now = new Date();
  for (let i = 24; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const k = iso(d);
    if (k !== thisMonth) series.push({ t: k, v: byMonth.get(k) || 0 });
  }
  return { series, url: `https://www.nhtsa.gov/vehicle/${years[years.length - 1]}/${encodeURIComponent(make)}/${encodeURIComponent(model)}`, note: `Model years ${years[0]}–${years[years.length - 1]}.` };
}

// ---------- TSA checkpoint throughput (public HTML table on tsa.gov) ----------
let tsaCache = null;
export async function tsa() {
  if (tsaCache) return tsaCache;
  const yr = new Date().getUTCFullYear();
  const parse = (h) => [...h.matchAll(/<td[^>]*>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*<\/td>/g)]
    .map((m) => ({ t: `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`, v: Number(m[4].replace(/,/g, "")) }));
  const cur = parse(await get("https://www.tsa.gov/travel/passenger-volumes", { type: "text" }));
  const prev = parse(await get(`https://www.tsa.gov/travel/passenger-volumes/${yr - 1}`, { type: "text" }));
  const map = new Map([...prev, ...cur].map((r) => [r.t, r.v]));
  const series = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => ({ t, v }));
  if (cur.length < 7) throw new Error("TSA: could not read the passenger table");
  tsaCache = { series, url: "https://www.tsa.gov/travel/passenger-volumes" };
  return tsaCache;
}

// ---------- Greenhouse public job boards (snapshot; history accumulates across refreshes) ----------
export async function greenhouse({ board }) {
  const j = await get(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs`);
  if (!Array.isArray(j.jobs)) throw new Error(`Greenhouse ${board}: unexpected response`);
  return { snapshot: j.jobs.length, url: `https://boards.greenhouse.io/${encodeURIComponent(board)}` };
}

// ---------- SEC EDGAR ----------
let tickerMap = null;
export async function secCik(ticker) {
  if (!tickerMap) {
    const j = await get("https://www.sec.gov/files/company_tickers.json");
    tickerMap = new Map(Object.values(j).map((r) => [r.ticker.toUpperCase(), String(r.cik_str).padStart(10, "0")]));
  }
  const cik = tickerMap.get(ticker.toUpperCase());
  if (!cik) throw new Error(`SEC: no CIK for ${ticker}`);
  return cik;
}

export async function secInventory({ ticker }) {
  const cik = await secCik(ticker);
  const j = await get(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/InventoryNet.json`);
  const rows = (j.units?.USD || []).filter((r) => /^CY\d{4}Q\dI$/.test(r.frame || ""));
  const byEnd = new Map();
  for (const r of rows) byEnd.set(r.end, r.val);
  const series = [...byEnd.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => ({ t, v: v / 1e9 }));
  if (series.length < 5) throw new Error(`SEC ${ticker}: not enough quarterly inventory data`);
  return { series, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-Q&dateb=&owner=include&count=40` };
}

// Recent filings + insider (Form 4) activity for the context panel.
export async function secFilings({ ticker }) {
  const cik = await secCik(ticker);
  const j = await get(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const r = j.filings?.recent;
  if (!r) throw new Error("SEC: no recent filings");
  const now = Date.now();
  let f4recent = 0, f4prior = 0;
  const notable = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i], date = r.filingDate[i];
    const age = (now - Date.parse(date)) / 864e5;
    if (form === "4") { if (age <= 90) f4recent++; else if (age <= 180) f4prior++; }
    if (["8-K", "10-Q", "10-K", "20-F", "6-K", "DEF 14A"].includes(form) && notable.length < 6) {
      const acc = r.accessionNumber[i].replace(/-/g, "");
      notable.push({ form, date, desc: r.primaryDocDescription[i] || "", items: r.items?.[i] || "", url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${r.primaryDocument[i]}` });
    }
  }
  return { cik, name: j.name, form4Last90: f4recent, form4Prior90: f4prior, notable, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&owner=include&count=40` };
}

// ---------- GDELT news (DOC 2.0 API) ----------
export async function gdeltArticles({ query, max = 8 }) {
  const q = `${query} sourcelang:english`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=${max * 3}&timespan=4d&sort=datedesc`;
  const j = await get(url, { retries: 1, timeout: 30000 });
  const seen = new Set();
  const out = [];
  for (const a of j.articles || []) {
    const key = (a.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 70);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const s = a.seendate || "";
    out.push({ title: a.title.trim(), url: a.url, domain: a.domain, seen: s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:00Z` : null });
    if (out.length >= max) break;
  }
  return out;
}

// Hacker News stories about a company in the last two weeks (fallback / complement to GDELT).
export async function hnStories({ query, must, days = 14, max = 5 }) {
  const re = must ? new RegExp(must, "i") : null;
  const from = Math.floor(Date.now() / 1000) - days * 86400;
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${max * 6}&numericFilters=${encodeURIComponent(`created_at_i>${from},points>2`)}`;
  const j = await get(url);
  // Only keep stories whose title actually names the company (HN search also matches URLs and text).
  return (j.hits || []).filter((h) => h.title && (!re || re.test(h.title))).slice(0, max).map((h) => ({
    title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
    domain: h.url ? new URL(h.url).hostname.replace(/^www\./, "") : "news.ycombinator.com", seen: h.created_at, points: h.points,
  }));
}

export async function gdeltVolume({ query }) {
  const q = `${query} sourcelang:english`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=timelinevolraw&format=json&timespan=60d`;
  const j = await get(url);
  const data = j.timeline?.[0]?.data || [];
  const series = data.map((d) => ({ t: `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`, v: d.value }));
  if (!series.length) throw new Error("GDELT: empty timeline");
  return { series, url: `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=timelinevolraw&timespan=60d` };
}
