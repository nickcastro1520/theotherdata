// Polite HTTP helper: identifies itself, spaces requests per host, retries on 429/5xx, hard timeouts.
export const USER_AGENT = "TheOtherData/0.1 (+https://theotherdata.com; contact nickcastro1520@gmail.com)";

// Minimum gap between requests to the same host (ms). GDELT asks for one request every 5 s;
// FRED's robots.txt sets Crawl-delay: 1; SEC allows up to 10/s.
const HOST_GAP = {
  "api.gdeltproject.org": 7000,
  "fred.stlouisfed.org": 1200,
  "data.sec.gov": 200,
  "www.sec.gov": 200,
  "wikimedia.org": 150,
  "en.wikipedia.org": 200,
  "api.fda.gov": 400,
  "api.nhtsa.gov": 400,
  "www.tsa.gov": 1500,
  "pypistats.org": 1200,
  "hn.algolia.com": 150,
  "boards-api.greenhouse.io": 500,
  "api.lever.co": 500,
  "api.npmjs.org": 500,
  "finnhub.io": 1100,      // free tier: 60 calls/minute
  "api.tiingo.com": 1000,  // free tier: 50 calls/hour, 1,000/day (we fetch prices once a day)
  "www.eia.gov": 1500,
};
const last = new Map();
const queues = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitTurn(host) {
  const prev = queues.get(host) || Promise.resolve();
  let release;
  const mine = new Promise((r) => (release = r));
  queues.set(host, prev.then(() => mine));
  await prev;
  const gap = HOST_GAP[host] ?? 300;
  const wait = (last.get(host) || 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  last.set(host, Date.now());
  // Gap is measured from when the previous request finished, not when it started.
  return () => { last.set(host, Date.now()); release(); };
}

// Error messages carry only the host, never the URL, so API keys in query strings can't leak into the data files.
export async function get(url, { type = "json", timeout = 25000, retries = 2, headers = {} } = {}) {
  const host = new URL(url).host;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const release = await waitTurn(host);
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      let res, body;
      try {
        res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: type === "json" ? "application/json" : "*/*", ...headers }, signal: ctl.signal });
        // Read the body under the same timer: a stalled body would otherwise hang forever.
        if (!res.ok) body = null;
        else if (type === "arrayBuffer") body = await res.arrayBuffer();
        else body = await res.text();
      } finally { clearTimeout(t); }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} from ${host}`);
        release();
        await sleep((host.includes("gdelt") ? 20000 : 3000) * (attempt + 1));
        continue;
      }
      if (!res.ok) { release(); throw Object.assign(new Error(`HTTP ${res.status} from ${host}`), { fatal: true }); }
      release();
      if (type === "arrayBuffer") return body;
      if (type === "text") return body;
      try { return JSON.parse(body); } catch { throw Object.assign(new Error(`Bad JSON from ${host}: ${String(body).slice(0, 80)}`), { fatal: true }); }
    } catch (e) {
      release();
      if (e.fatal) throw e;
      lastErr = e.name === "AbortError" ? new Error(`Timed out after ${timeout / 1000}s (${host})`) : e;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastErr;
}
