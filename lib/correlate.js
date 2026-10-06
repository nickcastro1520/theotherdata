// Correlation helpers for the scout: align series, returns, Pearson/Spearman, simple lead scan.

const DAY = 864e5;

export function toDate(t) {
  if (t instanceof Date) return t;
  const s = String(t).slice(0, 10);
  return new Date(s + "T12:00:00Z");
}

export function periodKey(d, freq) {
  const x = toDate(d);
  const y = x.getUTCFullYear();
  const m = x.getUTCMonth();
  if (freq === "monthly") return `${y}-${String(m + 1).padStart(2, "0")}`;
  if (freq === "weekly") {
    // ISO-ish week bucket: Thursday of the week keeps buckets stable
    const t = new Date(Date.UTC(y, m, x.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
    const week1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const w = 1 + Math.round(((t - week1) / DAY - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
    return `${t.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
  }
  return x.toISOString().slice(0, 10);
}

/** Last observation in each period bucket. */
export function resampleLast(series, freq) {
  const map = new Map();
  for (const p of series) {
    if (!Number.isFinite(p.v)) continue;
    const k = periodKey(p.t, freq);
    map.set(k, { t: k, v: p.v, raw: p.t });
  }
  return [...map.values()].sort((a, b) => a.t.localeCompare(b.t));
}

export function pctReturns(series) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1].v, b = series[i].v;
    if (!(a > 0) || !Number.isFinite(b)) continue;
    out.push({ t: series[i].t, v: (b - a) / a });
  }
  return out;
}

export function align(a, b) {
  const mb = new Map(b.map((p) => [p.t, p.v]));
  const xs = [], ys = [], ts = [];
  for (const p of a) {
    if (!mb.has(p.t)) continue;
    xs.push(p.v);
    ys.push(mb.get(p.t));
    ts.push(p.t);
  }
  return { xs, ys, ts };
}

/** Shift series B forward by k periods (positive k => B lags A / A leads). */
export function lagReturns(series, k) {
  if (!k) return series;
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const j = i - k;
    if (j < 0 || j >= series.length) continue;
    out.push({ t: series[i].t, v: series[j].v });
  }
  return out;
}

function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 8) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (!(dx > 0) || !(dy > 0)) return null;
  return num / Math.sqrt(dx * dy);
}

function rank(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(arr.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j < idx.length && idx[j][0] === idx[i][0]) j++;
    const avg = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[idx[k][1]] = avg;
    i = j;
  }
  return ranks;
}

export function spearman(xs, ys) {
  if (xs.length < 8) return null;
  return pearson(rank(xs), rank(ys));
}

/** Approximate two-sided p-value for Pearson r via t-distribution (large-n normal-ish). */
export function pearsonPValue(r, n) {
  if (r == null || n < 8) return null;
  const tt = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
  // Normal approximation for |t| via erfc polyfill (Node may lack Math.erfc).
  const z = Math.abs(tt);
  const erfc = Math.erfc || ((x) => {
    // Abramowitz & Stegun 7.1.26 approximation
    const z0 = Math.abs(x);
    const t = 1 / (1 + 0.5 * z0);
    const ans = t * Math.exp(-z0 * z0 - 1.26551223 +
      t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 +
      t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? ans : 2 - ans;
  });
  const p = erfc(z / Math.SQRT2);
  return Math.min(1, Math.max(0, p));
}

export function bestLead(signalRet, priceRet, maxLead = 2) {
  let best = null;
  for (let lead = 0; lead <= maxLead; lead++) {
    // signal leading price by `lead` periods: align signal[t] with price[t+lead]
    // equivalent to lagging price returns by -lead, or lagging signal by +lead in calendar of price
    const sig = lead === 0 ? signalRet : lagReturns(signalRet, -lead);
    // lagReturns with negative: redefine
    const shiftedSig = lead === 0 ? signalRet : (() => {
      const out = [];
      for (let i = 0; i + lead < signalRet.length; i++) {
        out.push({ t: signalRet[i + lead].t, v: signalRet[i].v });
      }
      return out;
    })();
    const { xs, ys, ts } = align(shiftedSig, priceRet);
    if (xs.length < 12) continue;
    const r = spearman(xs, ys);
    const rp = pearson(xs, ys);
    if (r == null) continue;
    const score = Math.abs(r);
    if (!best || score > Math.abs(best.spearman)) {
      best = { lead, spearman: r, pearson: rp, n: xs.length, from: ts[0], to: ts[ts.length - 1], p: pearsonPValue(rp, xs.length) };
    }
  }
  return best;
}

export function pickFreq(signalFreq, priceLen) {
  // Prefer monthly for short histories / monthly signals; weekly when both are high-freq
  if (signalFreq === "monthly") return "monthly";
  if (signalFreq === "weekly") return "weekly";
  return priceLen > 200 ? "weekly" : "monthly";
}
