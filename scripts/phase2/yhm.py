# Monthly Yahoo bars with split events, to rebuild unadjusted (as-traded) prices for market caps:
# raw close = split-adjusted close x product of split ratios that happen after that date. Resumable cache.
import requests,json,os,time,sys,datetime as dt
from concurrent.futures import ThreadPoolExecutor
C="/workspace/tod-cache/yahoo_m"
S=requests.Session();S.headers["User-Agent"]="Mozilla/5.0"
def get(t):
  p=f"{C}/{t}.json"
  if os.path.exists(p): return
  for k in range(4):
    try:
      r=S.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}",params={"period1":1293840000,"period2":1792800000,"interval":"1mo","events":"split"},timeout=30)
      if r.status_code==404: d={"bars":[],"splits":[]};break
      if r.status_code==429: time.sleep(30*(k+1));continue
      j=r.json()["chart"]["result"][0]; ts=j.get("timestamp") or []; cl=j["indicators"]["quote"][0].get("close") or [] if ts else []
      sp=[[dt.datetime.utcfromtimestamp(int(v["date"])).date().isoformat(),v["numerator"]/v["denominator"]] for v in (j.get("events") or {}).get("splits",{}).values()]
      d={"bars":[[dt.datetime.utcfromtimestamp(a).date().isoformat(),c] for a,c in zip(ts,cl) if c],"splits":sorted(sp)};break
    except Exception: d=None; time.sleep(5)
  if d is not None: json.dump(d,open(p,"w"))
ts=sorted(f[:-5] for f in os.listdir("/workspace/tod-cache/yahoo") if f.endswith(".json"))
with ThreadPoolExecutor(3) as ex:
  for i,_ in enumerate(ex.map(get,ts)):
    if i%500==0: print(i,len(os.listdir(C)),flush=True)
print("done",flush=True)
