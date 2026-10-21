"""Score live late-filing entries 63 trading days after entry, same method as the backtest (scripts/phase2/control.py):
entry = adjusted close of the first trading day after the filing date, exit 63 trading days later (SPY calendar),
returns capped at +/-100%, gap = filer return - equal-weight average of its frozen control list over the same days.
'placeboBelow' = share of controls below the control average (the fair bar, since single-stock returns are skewed).
Writes scores to the separate append-only, hash-chained file public/data/live-late-filings-scores.jsonl (keyed by accession;
the log itself is never touched) and a summary to public/data/live-late-filings-summary.json.
"""
import json, os, sys, math, datetime as dt
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__)); from common import yahoo_daily, read_chain, append, LOG, SCORES, SUMMARY, H
log, _ = read_chain(LOG)
gap_days = [e["date"] for e in log if e.get("type") == "gap"]
scores, prev = read_chain(SCORES)
done = {s["accession"] for s in scores}
log = [e for e in log if e.get("type", "filing") == "filing"]
todo = [e for e in log if e["scorable"] and e["accession"] not in done]
new = []
if todo:
    spy = yahoo_daily("SPY", min(e["filed"] for e in todo)) or []
    D = [d for d, _ in spy]
    cache = {}
    def px(t):
        if t not in cache: cache[t] = {d: c for d, c in (yahoo_daily(t, min(e["filed"] for e in todo)) or [])}
        return cache[t]
    for e in todo:
        i = next((k for k, d in enumerate(D) if d > e["filed"]), None)
        if i is None or i + H >= len(D): continue  # not yet 63 trading days after entry
        a, z = D[i], D[i + H]
        with ThreadPoolExecutor(4) as ex: list(ex.map(px, [e["ticker"]] + e["controls"]))
        def ret(t):
            p = px(t)
            return max(-1.0, min(1.0, p[z] / p[a] - 1)) if a in p and z in p and p[a] > 0 else None
        r = ret(e["ticker"]); cr = [x for x in (ret(t) for t in e["controls"]) if x is not None]
        base = {"accession": e["accession"], "ticker": e["ticker"], "filed": e["filed"], "entry": a, "exit": z, "scoredAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
        if r is None or not cr:
            new.append(dict(base, status="no price", stock=None, controlMean=None, controlN=len(cr), gap=None, lagged=None, placeboBelow=None)); continue
        m = sum(cr) / len(cr)
        new.append(dict(base, status="scored", stock=round(100 * r, 3), controlMean=round(100 * m, 3), controlN=len(cr), gap=round(100 * (r - m), 3),
                        lagged=r < m, placeboBelow=round(sum(x < m for x in cr) / len(cr), 4)))
append(SCORES, prev, new)
scores += new
ok = [s for s in scores if s["status"] == "scored"]

def wilson(k, n, z=1.96):
    if not n: return None
    p = k / n; c = (p + z * z / (2 * n)) / (1 + z * z / n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [round(100 * (c - h), 1), round(100 * (c + h), 1)]

def nw_t(xs, L=3):
    n = len(xs); m = sum(xs) / n; e = [x - m for x in xs]; s = sum(a * a for a in e) / n
    for l in range(1, L + 1): s += 2 * (1 - l / (L + 1)) * sum(e[i] * e[i - l] for i in range(l, n)) / n
    return round(m / math.sqrt(s / n), 2) if s > 0 else None

n = len(ok); bym = {}
for s in ok: bym.setdefault(s["filed"][:7], []).append(s["gap"])
monthly = [sum(v) / len(v) for k, v in sorted(bym.items())]
gaps = [s["gap"] for s in ok]; mean = sum(gaps) / n if n else None
sd = (sum((g - mean) ** 2 for g in gaps) / (n - 1)) ** .5 if n > 1 else None
summ = {"since": "2026-10-20", "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "holdingDays": H,
        "logged": len(log), "scorable": sum(e["scorable"] for e in log), "scored": n,
        "pending": sum(1 for e in log if e["scorable"] and e["accession"] not in {s["accession"] for s in scores}),
        "noPrice": sum(1 for s in scores if s["status"] == "no price"),
        "avgGap": round(mean, 2) if n else None, "avgGapCI": [round(mean - 1.96 * sd / n ** .5, 2), round(mean + 1.96 * sd / n ** .5, 2)] if sd else None,
        "lagged": round(100 * sum(s["lagged"] for s in ok) / n, 1) if n else None, "laggedCI": wilson(sum(s["lagged"] for s in ok), n),
        "placebo": round(100 * sum(s["placeboBelow"] for s in ok) / n, 1) if n else None,
        "months": len(monthly), "monthlyT": nw_t(monthly) if len(monthly) >= 24 else None,
        "gaps": gap_days, "monthlyTNote": "Newey-West t of the average gap by filing month; shown only once there are 24+ months" }
json.dump(summ, open(SUMMARY, "w"), indent=1)
print(f"scores: {len(new)} new, {n} scored in total; summary written")
