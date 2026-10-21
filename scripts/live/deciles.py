"""Monthly market-cap deciles for the live late-filing test, same method as the backtest (scripts/phase2/caps2.py):
shares = latest 10-K/10-Q cover-page share count (dei:EntityCommonStockSharesOutstanding) FILED before the month starts,
         or, if none in the past 15 months, the latest 10-K/10-Q diluted weighted-average count (highest-priced class);
         isolated 10x outliers and values >5x from the company's split-adjusted median dropped; skipped when cover-page
         and diluted counts disagree >5x. Foreign filers (20-F/40-F) drop out.
price  = as-traded close at the prior month end (Yahoo split-adjusted monthly close x later splits).
Deciles over every company that can be sized. Writes public/data/live/deciles/YYYY-MM.json.
  python3 scripts/live/deciles.py [YYYY-MM] [--cache DIR]
"""
import json, os, sys, bisect, statistics, datetime as dt
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__)); from common import http, DECILES
args = [a for a in sys.argv[1:] if not a.startswith("--")]
ym = args[0] if args else dt.date.today().strftime("%Y-%m")
cache = sys.argv[sys.argv.index("--cache") + 1] if "--cache" in sys.argv else "/tmp/live-cache"
CF, YM = f"{cache}/cf", f"{cache}/yahoo_m"
os.makedirs(CF, exist_ok=True); os.makedirs(YM, exist_ok=True)
OK = {"10-K", "10-Q", "10-K/A", "10-Q/A", "10-KT"}
tj = json.loads(http("https://www.sec.gov/files/company_tickers_exchange.json", sec=True))
tks = {}
for r in tj["data"]: tks.setdefault(r[0], []).append(r[2].replace(".", "-"))

def get_cf(c):
    p = f"{CF}/{c}.json"
    if os.path.exists(p): return
    b = http(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json", sec=True)
    out = {}
    if b:
        j = json.loads(b).get("facts", {})
        for ns, tag in (("dei", "EntityCommonStockSharesOutstanding"), ("us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding"), ("us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic")):
            u = j.get(ns, {}).get(tag, {}).get("units", {}).get("shares", [])
            out[tag] = [[x.get("start"), x["end"], x["val"], x["filed"], x.get("form")] for x in u]
    json.dump(out, open(p, "w"))

def get_m(t):
    p = f"{YM}/{t}.json"
    if os.path.exists(p) and dt.date.fromtimestamp(os.path.getmtime(p)).strftime("%Y-%m") >= ym: return
    b = http(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?period1=1293840000&period2={int(dt.datetime.now().timestamp())}&interval=1mo&events=split")
    d = {"bars": [], "splits": []}
    if b:
        try:
            j = json.loads(b)["chart"]["result"][0]; ts = j.get("timestamp") or []
            cl = (j["indicators"]["quote"][0].get("close") or []) if ts else []
            d = {"bars": [[dt.datetime.fromtimestamp(a, dt.timezone.utc).date().isoformat(), c] for a, c in zip(ts, cl) if c],
                 "splits": sorted([dt.datetime.fromtimestamp(int(v["date"]), dt.timezone.utc).date().isoformat(), v["numerator"] / v["denominator"]] for v in (j.get("events") or {}).get("splits", {}).values())}
        except Exception: pass
    json.dump(d, open(p, "w"))

allt = sorted({t for v in tks.values() for t in v if "-P" not in t})
with ThreadPoolExecutor(3) as ex: list(ex.map(get_m, allt))
for c in tks: get_cf(c)

def mon(t):
    p = f"{YM}/{t}.json"
    return json.load(open(p)) if os.path.exists(p) else None

def raw_close(t, ym):
    d = mon(t)
    if not d or not d["bars"]: return None
    y, m = map(int, ym.split("-")); m -= 1
    if m == 0: y, m = y - 1, 12
    prev = f"{y:04d}-{m:02d}"
    c = next((c for dd, c in d["bars"] if dd[:7] == prev), None)
    if c is None: return None
    f = 1.0
    for sd, r in d["splits"]:
        if sd >= ym + "-01": f *= r
    return c * f

def clean(rows, splits=()):
    r = sorted({(f, v, e) for s, e, v, f, fm in rows if fm in OK and v and v > 0})
    def adj(e, v):
        for sd, x in splits:
            if sd > e: v *= x
        return v
    if len(r) >= 3:
        med = statistics.median(adj(e, v) for f, v, e in r)
        r = [(f, v, e) for f, v, e in r if med / 5 <= adj(e, v) <= med * 5]
    keep = []
    for k, (f, v, e) in enumerate(r):
        nb = [r[j][1] for j in (k - 1, k + 1) if 0 <= j < len(r)]
        if nb and all(v > 10 * x or v < x / 10 for x in nb): continue
        keep.append((f, v, e))
    return keep

def latest(lst, d0, old, splits=()):
    i = bisect.bisect_left([x[0] for x in lst], d0)
    if not (i and lst[i - 1][0] >= old): return None
    f, v, e = lst[i - 1]
    for sd, x in splits:
        if e < sd < d0: v *= x
    return v

d0 = ym + "-01"; old = (dt.date.fromisoformat(d0) - dt.timedelta(days=456)).isoformat(); caps = {}
for c, ts0 in tks.items():
    p = f"{CF}/{c}.json"
    if not os.path.exists(p): continue
    j = json.load(open(p))
    if not j: continue
    ts = [x for x in ts0 if "-P" not in x] or ts0; t = ts[0]; sp = (mon(t) or {}).get("splits", [])
    dei = clean(j.get("EntityCommonStockSharesOutstanding", []), sp)
    wad = clean(j.get("WeightedAverageNumberOfDilutedSharesOutstanding", []), sp) or clean(j.get("WeightedAverageNumberOfSharesOutstandingBasic", []), sp)
    v = latest(dei, d0, old, sp); pr = None; s = "dei"
    if v: pr = raw_close(t, ym)
    else:
        v = latest(wad, d0, old, sp); s = "diluted"
        if v:
            ps = [p for p in (raw_close(x, ym) for x in ts) if p]; pr = max(ps) if ps else None
    if v and pr:
        w = latest(wad, d0, old, sp)
        if s == "dei" and w and not (w / 5 <= v <= w * 5): continue
        cap = v * pr
        if cap < 6e12 and (t not in caps or cap > caps[t]): caps[t] = cap
it = sorted((c, t) for t, c in caps.items()); n = len(it)
dec = {t: min(9, k * 10 // n) + 1 for k, (c, t) in enumerate(it)}
os.makedirs(DECILES, exist_ok=True)
json.dump({"month": ym, "method": "scripts/live/deciles.py (same as backtest scripts/phase2/caps2.py)", "builtAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
           "companies": n, "decile": dict(sorted(dec.items())), "capUSD": {t: round(caps[t]) for t in sorted(caps)}}, open(f"{DECILES}/{ym}.json", "w"), separators=(",", ":"))
print(ym, "sized companies:", n)
