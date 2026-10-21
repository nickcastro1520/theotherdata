"""Append new late-filing notices (NT 10-K / NT 10-Q) to the live, append-only log public/data/live-late-filings.jsonl.
Runs twice a day (about 6:17am and 12:00pm New York) after scripts/late-filers.mjs.
A filing (keyed by SEC accession number) can never be logged twice. A trading day with no successful run gets a
"no run on DATE" gap entry, appended by the next successful run. Only filings that can still be logged BEFORE their entry close are added
(entry = close of the first trading day after the filing date, 4pm New York), so nothing is logged with hindsight.
Each entry freezes: ticker, CIK, accession, EDGAR acceptance time, the market-cap decile at the start of the filing month
(public/data/live/deciles/YYYY-MM.json, same method as the backtest), and the matched control list = every other
company in that decile with no NT filing seen that month so far. Each line carries a sha256 hash chained to the line before.
The script verifies the whole chain first and refuses to run if any existing line changed; it only ever appends.
"""
import json, os, sys, datetime as dt
from zoneinfo import ZoneInfo
sys.path.insert(0, os.path.dirname(__file__)); from common import http, read_chain, append, LOG, DECILES
NY = ZoneInfo("America/New_York")
START = "2026-10-20"  # live test start: filings on or after this date
rows, prev = read_chain(LOG)
filings = [r for r in rows if r.get("type", "filing") == "filing"]
have = {r["accession"] for r in filings}
if len(have) != len(filings): raise SystemExit("duplicate accession already in the log; refusing to run")
RUNS = "public/data/live-late-filings-runs.json"
TODAY = dt.datetime.now(NY).date()
lf = json.load(open("public/data/late-filers.json"))
now = dt.datetime.now(dt.timezone.utc)

def next_weekday(d):
    d += dt.timedelta(days=1)
    while d.weekday() >= 5: d += dt.timedelta(days=1)
    return d

def deciles_for(ym):
    p = f"{DECILES}/{ym}.json"
    return json.load(open(p)) if os.path.exists(p) else None

subs = {}
def acceptance(cik, acc):
    if cik not in subs:
        b = http(f"https://data.sec.gov/submissions/CIK{cik:010d}.json", sec=True); subs[cik] = json.loads(b)["filings"]["recent"] if b else {}
    f = subs[cik]
    for a, t in zip(f.get("accessionNumber", []), f.get("acceptanceDateTime", [])):
        if a == acc: return t
    return None

new, skipped = [], {"beforeStart": 0, "entryPassed": 0, "alreadyLogged": 0}
nt_month = {}
for r in filings: nt_month.setdefault(r["filed"][:7], set()).add(r["ticker"])
for it in lf["items"]: nt_month.setdefault(it["filed"][:7], set()).add(it["ticker"])
for it in sorted(lf["items"], key=lambda x: (x["filed"], x["ticker"])):
    acc = it["link"].rstrip("/").split("/")[-1].replace("-index.htm", "")
    cik = int(it["link"].split("/data/")[1].split("/")[0])
    if acc in have: skipped["alreadyLogged"] += 1; continue
    if it["filed"] < START: skipped["beforeStart"] += 1; continue
    # entry close = 4pm New York on the next weekday (exchange holidays only push it later, which is still safe)
    ed = next_weekday(dt.date.fromisoformat(it["filed"]))
    entry_close = dt.datetime(ed.year, ed.month, ed.day, 16, 0, tzinfo=NY)
    if now >= entry_close: skipped["entryPassed"] += 1; continue
    ym = it["filed"][:7]; D = deciles_for(ym)
    dec = D["decile"].get(it["ticker"]) if D else None
    controls = sorted(t for t, d in D["decile"].items() if d == dec and t not in nt_month.get(ym, set())) if dec else []
    new.append({"type": "filing", "ticker": it["ticker"], "cik": cik, "accession": acc, "form": it["form"], "filed": it["filed"],
                "acceptance": acceptance(cik, acc), "link": it["link"], "loggedAt": now.isoformat(timespec="seconds"),
                "decileMonth": ym if D else None, "decile": dec, "scorable": bool(dec and controls),
                "reasonNotScorable": None if dec and controls else ("no decile file for month" if not D else "company could not be sized (no 10-K/10-Q share count or price)"),
                "controls": controls})
    have.add(acc)
# Gap entries: every past trading day (SPY traded) since the last successful run on which no run succeeded.
from common import yahoo_daily
st = json.load(open(RUNS)) if os.path.exists(RUNS) else {"lastSuccess": None}
gaps = []
if st.get("lastSuccess"):
    logged_gaps = {r["date"] for r in rows if r.get("type") == "gap"}
    days = [d for d, _ in (yahoo_daily("SPY", st["lastSuccess"]) or [])]
    for d in days:
        if st["lastSuccess"] < d < TODAY.isoformat() and d not in logged_gaps:
            gaps.append({"type": "gap", "date": d, "note": f"no run on {d}", "detectedAt": now.isoformat(timespec="seconds")})
new = gaps + new
assert len({e["accession"] for e in new if e["type"] == "filing"} | have) == len(have) + sum(e["type"] == "filing" for e in new)
append(LOG, prev, new)
json.dump({"lastSuccess": TODAY.isoformat(), "lastRunAt": now.isoformat(timespec="seconds"), "note": "Date (New York) of the last successful run of scripts/live/log.py; used to detect days with no run."}, open(RUNS, "w"), indent=1)
print(f"live log: {len(rows)} existing, {len(new) - len(gaps)} filings and {len(gaps)} gap entries appended, skipped {skipped}")
