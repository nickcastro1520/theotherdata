// Turns a raw series into a comparison, a reading (tailwind / headwind / neutral / context),
// and a plain-English explanation built only from the real numbers.

const DAY = 864e5;
const ts = (t) => Date.parse(t + "T00:00:00Z");
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function frequency(series) {
  if (series.length < 3) return "unknown";
  const gaps = [];
  for (let i = Math.max(1, series.length - 30); i < series.length; i++) gaps.push((ts(series[i].t) - ts(series[i - 1].t)) / DAY);
  gaps.sort((a, b) => a - b);
  const g = gaps[Math.floor(gaps.length / 2)];
  if (g <= 4) return "daily";
  if (g <= 10) return "weekly";
  if (g <= 45) return "monthly";
  return "quarterly";
}

const WINDOW = { daily: 28, weekly: 4, monthly: 3, quarterly: 1 };

// Average of observations in (end - days, end]
function windowAvg(series, endT, days) {
  const end = ts(endT), start = end - days * DAY;
  const pts = series.filter((p) => { const x = ts(p.t); return x > start && x <= end; });
  return pts.length ? { v: mean(pts.map((p) => p.v)), n: pts.length } : null;
}

export function compare(series, mode) {
  const freq = frequency(series);
  const last = series[series.length - 1];
  if (!last) return null;
  if (mode === "recent") {
    if (freq === "daily") {
      const cur = windowAvg(series, last.t, 28);
      const prevEnd = new Date(ts(last.t) - 28 * DAY).toISOString().slice(0, 10);
      const prev = windowAvg(series, prevEnd, 28);
      if (!cur || !prev || prev.n < 5) return null;
      return { freq, current: cur.v, baseline: prev.v, currentLabel: "28-day average", basis: "vs the 28 days before" };
    }
    const k = WINDOW[freq] || 3;
    if (series.length < 2 * k) return null;
    const cur = mean(series.slice(-k).map((p) => p.v));
    const prev = mean(series.slice(-2 * k, -k).map((p) => p.v));
    const unitWord = freq === "weekly" ? "weeks" : freq === "monthly" ? "months" : "quarters";
    return { freq, current: cur, baseline: prev, currentLabel: k === 1 ? "latest" : `last ${k} ${unitWord}, average`, basis: `vs the ${k} ${unitWord} before` };
  }
  if (mode === "yoy" || mode === "yoy7") {
    const k = mode === "yoy7" ? 7 : freq === "daily" ? 28 : freq === "weekly" ? 4 : freq === "monthly" ? 3 : 1;
    const span = mode === "yoy7" ? 7 : freq === "daily" ? 28 : freq === "weekly" ? 28 : freq === "monthly" ? 85 : 1;
    if (freq === "quarterly" || (freq === "monthly" && mode === "yoy" && k === 1)) {
      const target = ts(last.t) - 365 * DAY;
      const ago = series.reduce((best, p) => (Math.abs(ts(p.t) - target) < Math.abs(ts(best.t) - target) ? p : best), series[0]);
      if (Math.abs(ts(ago.t) - target) > 40 * DAY) return null;
      return { freq, current: last.v, baseline: ago.v, currentLabel: "latest quarter", basis: "vs the same quarter a year earlier" };
    }
    const cur = windowAvg(series, last.t, span);
    const shift = mode === "yoy7" ? 364 : 365;
    const prevEnd = new Date(ts(last.t) - shift * DAY).toISOString().slice(0, 10);
    const prev = windowAvg(series, prevEnd, span);
    if (!cur || !prev) return null;
    const label = mode === "yoy7" ? "7-day average" : freq === "monthly" ? "last 3 months, average" : freq === "weekly" ? "last 4 weeks, average" : "28-day average";
    return { freq, current: cur.v, baseline: prev.v, currentLabel: label, basis: mode === "yoy7" ? "vs the same week last year" : "vs the same period last year" };
  }
  return null;
}

// ---------- formatting ----------
const nf = (d) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const compact = (v) => (v >= 1e9 ? `${nf(2).format(v / 1e9)}B` : v >= 1e6 ? `${nf(2).format(v / 1e6)}M` : v >= 1e4 ? `${nf(1).format(v / 1e3)}K` : nf(0).format(v));
export function fmt(v, unit) {
  if (v == null || !Number.isFinite(v)) return "n/a";
  switch (unit) {
    case "views": return `${nf(0).format(v)} views/day`;
    case "downloads": return `${compact(v)} downloads/day`;
    case "stories": return `${nf(1).format(v)} stories/week`;
    case "travelers": return `${compact(v)} travelers/day`;
    case "complaints": return `${nf(1).format(v)} complaints/month`;
    case "reports": return `${nf(0).format(v)} reports/month`;
    case "roles": return `${nf(0).format(v)} open roles`;
    case "usdB": return `$${nf(2).format(v)}B`;
    case "usdM": return v >= 1000 ? `$${nf(2).format(v / 1000)}B/month` : `$${nf(0).format(v)}M/month`;
    case "usdGal": return `$${v.toFixed(2)}/gal`;
    case "usdDozen": return `$${v.toFixed(2)}/dozen`;
    case "usdLb": return `$${v.toFixed(2)}/lb`;
    case "usdBbl": return `$${v.toFixed(2)}/barrel`;
    case "centsLb": return `${v.toFixed(1)}¢/lb`;
    case "usdTon": return `$${nf(0).format(v)}/metric ton`;
    case "usdBnT": return `$${(v / 1000).toFixed(2)}T`; // value in billions, shown in trillions
    case "usd": return `$${nf(0).format(v)}`;
    case "index": return nf(1).format(v);
    case "kbbl": return `${compact(v * 1000)} bbl`;
    case "pct": return `${v.toFixed(2)}%`;
    case "claims": return `${compact(v)} claims/week`;
    case "carloads": return `${compact(v)} carloads/month`;
    case "thousandUnits": return `${nf(2).format(v / 1000)}M/yr pace`;
    case "millionUnits": return `${nf(1).format(v)}M/yr pace`;
    default: return nf(1).format(v);
  }
}
export const fmtDate = (t, freq) => new Date(t + "T12:00:00Z").toLocaleDateString("en-US", freq === "monthly" ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const strength = (pct, th) => (Math.abs(pct) >= th * 3 ? "notable" : "mild");

// Keep sparkline payloads small.
export function trimSeries(series, freq) {
  const keep = { daily: 120, weekly: 52, monthly: 36, quarterly: 16 }[freq] || 60;
  return series.slice(-keep).map((p) => ({ t: p.t, v: Math.round(p.v * 1000) / 1000 }));
}

export function readingFor(pct, polarity, threshold) {
  if (pct == null) return "unknown";
  if (polarity === 0) return "context";
  if (Math.abs(pct) < threshold) return "neutral";
  return (pct > 0) === (polarity > 0) ? "tailwind" : "headwind";
}

export function analyze(sig, series, company) {
  const cmp = compare(series, sig.compare);
  const freq = cmp?.freq || frequency(series);
  const last = series[series.length - 1];
  if (!cmp || !(cmp.baseline > 0)) {
    return { status: "insufficient", freq, asOf: last?.t, latest: last?.v, series: trimSeries(series, freq), now: `Not enough history yet to make a fair comparison. Latest reading: ${fmt(last?.v, sig.unit)} (${fmtDate(last.t, freq)}).` };
  }
  const pct = ((cmp.current - cmp.baseline) / cmp.baseline) * 100;
  const reading = readingFor(pct, sig.polarity, sig.threshold);
  const dir = Math.abs(pct) < 0.5 ? "essentially unchanged" : `${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
  let s = `${sig.metric}: ${fmt(cmp.current, sig.unit)} (${cmp.currentLabel}), ${dir} ${cmp.basis}. Data through ${fmtDate(last.t, freq)}.`;
  if (reading === "tailwind" || reading === "headwind") {
    s += ` In plain English: ${pct > 0 ? sig.up : sig.down}. We read that as a ${strength(pct, sig.threshold)} ${reading} for ${company}.`;
  } else if (reading === "neutral") {
    s += ` That's within the ±${sig.threshold}% range we treat as normal noise, so it reads as neutral for now.`;
  } else if (reading === "context") {
    s += ` In plain English: ${pct > 0 ? sig.up : sig.down}. For ${company} the effect cuts both ways, so we show it as context, not a call.`;
  }
  return { status: "ok", strength: reading === "tailwind" || reading === "headwind" ? strength(pct, sig.threshold) : null, freq, asOf: last.t, latest: last.v, current: cmp.current, baseline: cmp.baseline, currentLabel: cmp.currentLabel, basis: cmp.basis, pct, reading, display: fmt(cmp.current, sig.unit), series: trimSeries(series, freq), now: s };
}

// Snapshot signals (e.g. job-board counts) build their own history across refreshes.
export function analyzeSnapshot(sig, history, company) {
  const pts = history.slice().sort((a, b) => a.t.localeCompare(b.t));
  const last = pts[pts.length - 1];
  const lastT = ts(last.t);
  // Compare with the most recent snapshot at least 7 days older, else the oldest we have.
  const older = pts.filter((p) => ts(p.t) <= lastT - 7 * DAY);
  const base = older.length ? older[older.length - 1] : pts[0];
  const days = Math.round((lastT - ts(base.t)) / DAY);
  if (days < 1 || !(base.v > 0)) {
    return { status: "tracking", freq: "daily", asOf: last.t, latest: last.v, current: last.v, display: fmt(last.v, sig.unit), reading: "tracking", series: pts.slice(-120), now: `${sig.metric}: ${fmt(last.v, sig.unit)} as of ${fmtDate(last.t)}. Job boards only show today's count, so we started saving a snapshot every refresh on ${fmtDate(pts[0].t)}. A trend appears once there's at least a day of history.` };
  }
  const pct = ((last.v - base.v) / base.v) * 100;
  const reading = readingFor(pct, sig.polarity, sig.threshold);
  const dir = Math.abs(pct) < 0.5 ? "essentially unchanged" : `${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}%`;
  let s = `${sig.metric}: ${fmt(last.v, sig.unit)} as of ${fmtDate(last.t)}, ${dir} vs our snapshot ${days} day${days === 1 ? "" : "s"} earlier.`;
  if (reading === "tailwind" || reading === "headwind") s += ` In plain English: ${pct > 0 ? sig.up : sig.down}. We read that as a mild ${reading} for ${company}.`;
  else if (reading === "neutral") s += ` That's within the ±${sig.threshold}% range we treat as normal churn, so it reads as neutral.`;
  if (days < 14) s += " (Short history so far, so treat this lightly.)";
  return { status: "ok", freq: "daily", asOf: last.t, latest: last.v, current: last.v, baseline: base.v, currentLabel: "today", basis: `vs ${days} day${days === 1 ? "" : "s"} earlier`, pct, reading, display: fmt(last.v, sig.unit), series: pts.slice(-120), now: s };
}

// Direction of the raw number vs its baseline (for green/red coloring). Separate from reading (tailwind/headwind).
export function directionOf(pct) {
  if (pct == null || !Number.isFinite(pct)) return "flat";
  if (pct > 0) return "up";
  if (pct < 0) return "down";
  return "flat";
}

export function summarize(company, ticker, signals) {
  const live = signals.filter((s) => s.status === "ok" || s.status === "stale");
  const count = (r) => live.filter((s) => s.reading === r).length;
  const tw = count("tailwind"), hw = count("headwind"), ne = count("neutral"), cx = count("context");
  const scored = live.filter((s) => s.pct != null && (s.reading === "tailwind" || s.reading === "headwind")).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  let lean = "mixed";
  if (tw > hw) lean = "leaning positive"; else if (hw > tw) lean = "leaning negative"; else if (tw === 0 && hw === 0) lean = "quiet";
  const parts = [];
  parts.push(`${live.length} of ${signals.length} hidden signals for ${company} have fresh data: ${tw} tailwind${tw === 1 ? "" : "s"}, ${hw} headwind${hw === 1 ? "" : "s"}, ${ne} neutral${cx ? `, ${cx} context` : ""}.`);
  if (scored[0]) parts.push(`The biggest mover is “${scored[0].name}” (${scored[0].pct > 0 ? "+" : ""}${scored[0].pct.toFixed(1)}% ${scored[0].basis}).`);
  if (lean === "quiet") parts.push("Nothing is moving enough to stand out right now.");
  parts.push("These are clues, not forecasts.");
  const impactLean = lean === "leaning positive" ? "tailwind" : lean === "leaning negative" ? "headwind" : lean === "quiet" ? "quiet" : "mixed";
  const impactLabel = { tailwind: "Lean tailwind", headwind: "Lean headwind", mixed: "Mixed", quiet: "Quiet" }[impactLean];
  const notable = live.filter((s) => s.strength === "notable" && (s.reading === "tailwind" || s.reading === "headwind"));
  const mild = live.filter((s) => s.strength === "mild" && (s.reading === "tailwind" || s.reading === "headwind"));
  const notableTw = notable.filter((s) => s.reading === "tailwind").length;
  const notableHw = notable.filter((s) => s.reading === "headwind").length;
  let magnitude = "unclear", confidence = "low";
  if (impactLean === "quiet") { magnitude = "unclear"; confidence = "low"; }
  else if (impactLean === "mixed") { magnitude = "unclear"; confidence = live.length >= 2 ? "low" : "low"; }
  else if ((impactLean === "tailwind" && notableTw >= 2 && notableHw === 0) || (impactLean === "headwind" && notableHw >= 2 && notableTw === 0)) {
    magnitude = "strong"; confidence = "medium";
  } else if (notable.length >= 1 || (mild.length >= 2 && (tw - hw !== 0))) {
    magnitude = "moderate"; confidence = "medium";
  } else {
    magnitude = "mild"; confidence = "low";
  }
  const whatBits = live.filter((s) => s.reading === "tailwind" || s.reading === "headwind" || s.reading === "context" || s.reading === "neutral")
    .slice(0, 4)
    .map((s) => `${s.name}${s.pct != null ? ` (${s.pct > 0 ? "+" : ""}${s.pct.toFixed(0)}% ${s.basis || ""})` : ""}`);
  const what = whatBits.length
    ? `We're watching: ${whatBits.join("; ")}.`
    : `We have ${live.length} live public series for ${company}, but none are outside their noise bands yet.`;
  const because = impactLean === "tailwind"
    ? `Because more of those readings look favorable than unfavorable (${tw} vs ${hw}), the combined alt-data lean is up (tailwind).`
    : impactLean === "headwind"
    ? `Because more of those readings look unfavorable than favorable (${hw} vs ${tw}), the combined alt-data lean is down (headwind).`
    : impactLean === "quiet"
    ? `Because nothing is outside its normal noise band, there is no clear up/down lean right now.`
    : `Because favorable and unfavorable readings are roughly balanced (${tw} vs ${hw}), the combined lean is mixed.`;
  const magnitudeWhy = magnitude === "strong"
    ? `Magnitude band: strong — at least two notable moves point the same way, with no notable move the other way. This is still not a price target.`
    : magnitude === "moderate"
    ? `Magnitude band: moderate — based on signal strength counts (notable/mild), not a model of dollars of stock price.`
    : magnitude === "mild"
    ? `Magnitude band: mild — the lean is real but small relative to each signal's noise band.`
    : `Magnitude band: unclear — mixed or quiet readings, so we do not force a size.`;
  const horizon = "weeks to a quarter";
  const horizonNote = "Educational time horizon only: alternative-data prints like these are often discussed as concurrent to a few weeks–one quarter ahead of official reports — not a reliable clock, and already partly priced in when public.";
  let impactText;
  if (impactLean === "tailwind") {
    impactText = `What these offbeat signals lean toward right now: a net tailwind for ${company} (${tw} favorable vs ${hw} unfavorable). ${magnitudeWhy} Horizon: ${horizon}. Not a forecast and not advice to buy or sell.`;
  } else if (impactLean === "headwind") {
    impactText = `What these offbeat signals lean toward right now: a net headwind for ${company} (${hw} unfavorable vs ${tw} favorable). ${magnitudeWhy} Horizon: ${horizon}. Not a forecast and not advice to buy or sell.`;
  } else if (impactLean === "quiet") {
    impactText = `What these offbeat signals lean toward right now: nothing loud enough to call for ${company}. Confidence is low. Educational only — not a forecast and not advice to buy or sell.`;
  } else {
    impactText = `What these offbeat signals lean toward right now: a mixed picture for ${company} (${tw} favorable, ${hw} unfavorable). Confidence is low. Educational only — not a forecast and not advice to buy or sell.`;
  }
  if (scored[0]) impactText += ` Biggest mover: “${scored[0].name}”.`;
  return {
    tailwinds: tw, headwinds: hw, neutral: ne, context: cx, lean, text: parts.join(" "),
    impact: {
      lean: impactLean, label: impactLabel, magnitude, magnitudeWhy, confidence,
      what, because, horizon, horizonNote, text: impactText,
    },
  };
}
