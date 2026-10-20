// Recent late-filing notices (SEC Form 12b-25: NT 10-K / NT 10-Q) from the EDGAR daily form index.
// Writes public/data/late-filers.json with the last ~30 days of filings that map to a listed ticker.
//   node scripts/late-filers.mjs [--days=30]
// SEC fair access: identifies itself with a contact email and stays well under 10 requests a second.
import { writeFile } from "node:fs/promises";

const UA = "theotherdata.com research nickcastro1520@gmail.com";
const DAYS = Number((process.argv.find((a) => a.startsWith("--days=")) || "--days=30").split("=")[1]);
const OUT = "public/data/late-filers.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
    if (r.status === 404 || r.status === 403) return null; // weekends, holidays, and days not yet published
    if (r.ok) return r;
    await sleep(2000 * (i + 1));
  }
  throw new Error(`EDGAR request failed: ${url}`);
}

export function parseFormIdx(text, date) {
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^(NT 10-[KQ])\s+(.*?)\s{2,}(\d+)\s+(\d{8})\s+(\S+)\s*$/);
    if (!m) continue;
    const d = m[4];
    rows.push({ form: m[1], company: m[2].trim(), cik: Number(m[3]), filed: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` || date, path: m[5] });
  }
  return rows;
}

async function main() {
  const tj = await (await get("https://www.sec.gov/files/company_tickers_exchange.json")).json();
  const byCik = new Map();
  for (const r of tj.data) { const o = Object.fromEntries(tj.fields.map((f, i) => [f, r[i]])); if (!byCik.has(o.cik)) byCik.set(o.cik, o); }
  const items = [], seen = new Set(); let unmapped = 0, days = 0;
  for (let k = 0; k <= DAYS; k++) {
    const d = new Date(Date.now() - k * 864e5), y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3) + 1;
    const ymd = d.toISOString().slice(0, 10).replaceAll("-", "");
    if ([0, 6].includes(d.getUTCDay())) continue;
    const r = await get(`https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${q}/form.${ymd}.idx`);
    await sleep(250);
    if (!r) continue;
    days++;
    for (const f of parseFormIdx(await r.text())) {
      const t = byCik.get(f.cik);
      if (!t) { unmapped++; continue; }
      const key = `${f.cik}|${f.form}|${f.filed}`;
      if (seen.has(key)) continue; seen.add(key);
      const acc = f.path.split("/").pop().replace(".txt", "");
      items.push({ ticker: t.ticker.replace(".", "-"), company: t.name || f.company, exchange: t.exchange || null, form: f.form, filed: f.filed,
        link: `https://www.sec.gov/Archives/edgar/data/${f.cik}/${acc.replaceAll("-", "")}/${acc}-index.htm` });
    }
  }
  items.sort((a, b) => b.filed.localeCompare(a.filed) || a.ticker.localeCompare(b.ticker));
  const doc = { generatedAt: new Date().toISOString(), windowDays: DAYS, indexDaysRead: days, count: items.length, unmappedFilings: unmapped,
    source: "SEC EDGAR daily form index (NT 10-K, NT 10-Q), tickers from SEC company_tickers_exchange.json", sourceUrl: "https://www.sec.gov/Archives/edgar/daily-index/", items };
  await writeFile(OUT, JSON.stringify(doc, null, 1));
  console.log(`late filers: ${items.length} mapped (${unmapped} without a listed ticker) from ${days} index days`);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
