# Insider open-market buys (Form 4 code P by officers/directors) in a point-in-time top-500 market-cap universe.
# v2: sizes from caps2.py (as-traded prices, filing-date share counts, multi-class fallback, Exxon's old CIK).
# v1 market cap each month = latest XBRL dei:EntityCommonStockSharesOutstanding (frame end date + 90 days, so it was public)
# x last close before the month. Only companies with a current SEC ticker and Yahoo prices can be ranked (survivorship).
import json,glob,sys,bisect,datetime as dt; sys.path.insert(0,"."); from lib import *
caps=json.load(open("caps2.json"))
uni={ym:set(t for t,_ in sorted(v.items(),key=lambda x:-x[1])[:500]) for ym,v in caps.items()}
json.dump({k:sorted(v) for k,v in uni.items()},open("top500_v2.json","w"))
ev=json.load(open("form4_all_buys_v2.json"))
ev=[dict(e,link=f"https://www.sec.gov/Archives/edgar/data/{e['cik']}/{e['accessions'][0].replace('-','')}/") for e in ev if e["ticker"] in uni.get(e["filed"][:7],())]
print("events in top500:",len(ev),flush=True)
out={"universeNote":"Top 500 by point-in-time market cap each month","events":len(ev)}
for H in (21,63):
  for b in BENCH:
    r=event_study(ev,1,H,"cap",b); out[f"cap|{H}|{b}"]=r; I=r["independent"]
    print(H,b,r["raw"]["n"],I["n"],I["hit"],I["ci"],r["baseline"],I["meanExcess"],I["meanCI"],I["flippedHit"],r["beatsBaseline"],r["years"],flush=True)
out["calendar"]=calendar_time(ev); print(out["calendar"])
json.dump(out,open("ins2_phase2.json","w"))
