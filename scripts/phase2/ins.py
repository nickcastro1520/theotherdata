# Insider open-market buys (Form 4 code P by officers/directors) in a point-in-time top-500 market-cap universe.
# Market cap each month = latest XBRL dei:EntityCommonStockSharesOutstanding (frame end date + 90 days, so it was public)
# x last close before the month. Only companies with a current SEC ticker and Yahoo prices can be ranked (survivorship).
import json,glob,sys,bisect,datetime as dt; sys.path.insert(0,"."); from lib import *
tj=json.load(open("/workspace/tod-cache/idx/tickers.json")); tk={}
for r in tj["data"]: tk.setdefault(r[0],r[2].replace(".","-"))
fr=[]
for p in sorted(glob.glob("frames/*.json")):
  for x in json.load(open(p))["data"]:
    if x["cik"] in tk: fr.append((x["end"],x["cik"],x["val"]))
fr.sort(); sh={}
months=[f"{y}-{m:02d}" for y in range(2012,2027) for m in range(1,13) if f"{y}-{m:02d}"<="2026-09"]
uni={}; j=0; 
for ym in months:
  cut=(dt.date.fromisoformat(ym+"-01")-dt.timedelta(days=90)).isoformat()
  while j<len(fr) and fr[j][0]<=cut: sh[fr[j][1]]=fr[j][2]; j+=1
  caps=[]
  for c,v in sh.items():
    s=px(tk[c])
    if not s: continue
    d=[x[0] for x in s]; i=bisect.bisect_left(d,ym+"-01")
    if i==0 or (dt.date.fromisoformat(ym+"-01")-dt.date.fromisoformat(d[i-1])).days>10: continue
    caps.append((v*s[i-1][1],tk[c]))
  caps.sort(reverse=True); uni[ym]=set(t for _,t in caps[:500])
json.dump({k:sorted(v) for k,v in uni.items()},open("top500.json","w"))
ev=json.load(open("form4_all_buys.json"))
ev=[dict(e,link=f"https://www.sec.gov/Archives/edgar/data/{e['cik']}/{e['accessions'][0].replace('-','')}/") for e in ev if e["ticker"] in uni.get(e["filed"][:7],())]
print("events in top500:",len(ev),flush=True)
out={"universeNote":"Top 500 by point-in-time market cap each month","events":len(ev)}
for H in (21,63):
  for b in BENCH:
    r=event_study(ev,1,H,"cap",b); out[f"cap|{H}|{b}"]=r; I=r["independent"]
    print(H,b,r["raw"]["n"],I["n"],I["hit"],I["ci"],r["baseline"],I["meanExcess"],I["meanCI"],I["flippedHit"],r["beatsBaseline"],r["years"],flush=True)
out["calendar"]=calendar_time(ev); print(out["calendar"])
json.dump(out,open("ins_phase2.json","w"))
