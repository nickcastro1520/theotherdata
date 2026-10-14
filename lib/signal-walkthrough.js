// Real numbers for /signal-walkthrough, computed from the repo's data snapshot at build time.
// Every value comes from public/data; nothing here is typed in by hand.
const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? "n/a" : `${v.toFixed(d)}%`);
const month = (iso) => { if (!iso) return "n/a"; const [y, m] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); };

export function walkthroughStats({ tickerDoc, track, study, summary, ticker = "AMZN", id = "paperboard" }) {
  const sig = (tickerDoc.signals || []).find((s) => s.id === id);
  if (!sig) throw new Error(`${ticker} has no ${id} signal`);
  const counts = { "+": 0, "-": 0, "0": 0 };
  for (const r of track.history || []) { const m = new RegExp(`${id}:([+\\-0])`).exec(r.sig || ""); if (m) counts[m[1]]++; }
  const row = (study.signals || []).find((s) => s.tk === ticker && s.id === id) || {};
  const bt = summary.tickers?.[ticker]?.backtest?.summary?.["1m"] || {};
  const cov = (summary.backtest?.coverage?.[ticker]?.used || []).find((u) => u.id === id) || {};
  const v1 = study.models?.primary?.v1 || {};
  const readingWord = { tailwind: "a tailwind", headwind: "a headwind", neutral: "quiet (no call)" }[sig.reading] || sig.reading;
  const checkpoints = counts["+"] + counts["-"] + counts["0"];
  return {
    series: sig.source?.url?.split("/").pop() || "",
    sourceName: sig.source?.name || "",
    sourceUrl: sig.source?.url || "",
    asOf: month(sig.asOf),
    latest: sig.latest?.toFixed(1),
    current: sig.current?.toFixed(1),
    baseline: sig.baseline?.toFixed(1),
    change: pct(sig.pct),
    threshold: `${sig.threshold}%`,
    reading: readingWord,
    points: String((sig.series || []).length),
    lagDays: String(cov.lagDays ?? "n/a"),
    from: month(summary.backtest?.from),
    to: month(summary.backtest?.to),
    checkpoints: String(checkpoints),
    up: String(counts["+"]), down: String(counts["-"]), quiet: String(counts["0"]),
    calls: String(row.calls ?? "n/a"),
    rate: pct(row.rate), rateX: pct(row.rateX),
    ciLo: pct(row.ciX?.[0]), ciHi: pct(row.ciX?.[1]),
    kept: row.wouldKeep ? "kept" : "muted",
    stockCalls: String(bt.calls ?? "n/a"),
    stockRate: bt.calls ? pct((bt.hits / bt.calls) * 100, 0) : "n/a",
    stockRateX: bt.vsMktCalls ? pct((bt.vsMktHits / bt.vsMktCalls) * 100, 0) : "n/a",
    allCalls: (v1.calls ?? 0).toLocaleString("en-US"),
    allRate: pct(v1.rate), allRateX: pct(v1.rateX),
    tried: String(study.configurationsTried ?? "n/a"),
    candidates: String((study.candidates || []).length),
    svg: sparkSvg(sig.series || []),
    admitted: String((study.candidates || []).filter((c) => c.admitted).length),
  };
}

function sparkSvg(series) {
  if (series.length < 2) return "";
  const W = 640, H = 160, P = 10, vs = series.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (i) => P + (i * (W - 2 * P)) / (series.length - 1), y = (v) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo || 1);
  const d = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const first = series[0], last = series.at(-1);
  return `<svg class="sw-spark" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="sw-sp-t"><title id="sw-sp-t">Paperboard mill output, ${month(first.t)} to ${month(last.t)}: from ${first.v.toFixed(1)} to ${last.v.toFixed(1)} (index), low ${lo.toFixed(1)}, high ${hi.toFixed(1)}.</title><path d="${d}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;
}

const RAW = new Set(["svg"]);
export const fillWalkthrough = (html, stats) => html.replace(/<!--SW:(\w+)-->/g, (_, k) => {
  if (!(k in stats)) throw new Error(`unknown walkthrough stat ${k}`);
  if (RAW.has(k)) return String(stats[k]);
  return String(stats[k]).replace(/&/g, "&amp;").replace(/</g, "&lt;");
});
