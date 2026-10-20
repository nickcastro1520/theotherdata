# Resumable: SEC companyfacts, keeping only share counts with their filing dates (point in time), for every CIK with a
# current ticker and Yahoo prices. ~7 requests/second.
import requests,json,os,time,threading
from concurrent.futures import ThreadPoolExecutor
UA={"User-Agent":"theotherdata.com research nickcastro1520@gmail.com"}
LOCK=threading.Lock();last=[0.0]
tj=json.load(open("/workspace/tod-cache/idx/tickers.json")); ck={}
for r in tj["data"]: ck.setdefault(r[0],r[2].replace(".","-"))
ck[34088]="XOM"
ciks=[c for c,t in ck.items() if os.path.exists(f"/workspace/tod-cache/yahoo/{t}.json")]
def get(c):
  p=f"cf/{c}.json"
  if os.path.exists(p): return
  for k in range(5):
    with LOCK:
      w=last[0]+0.14-time.time()
      if w>0: time.sleep(w)
      last[0]=time.time()
    try:
      r=requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json",headers=UA,timeout=60)
      if r.status_code==404: json.dump({},open(p,"w")); return
      if r.status_code in (429,503): time.sleep(10*(k+1)); continue
      j=r.json()["facts"]; out={}
      for ns,tag in (("dei","EntityCommonStockSharesOutstanding"),("us-gaap","WeightedAverageNumberOfDilutedSharesOutstanding"),("us-gaap","WeightedAverageNumberOfSharesOutstandingBasic")):
        u=j.get(ns,{}).get(tag,{}).get("units",{}).get("shares",[])
        out[tag]=[[x.get("start"),x["end"],x["val"],x["filed"],x.get("form")] for x in u]
      json.dump(out,open(p,"w")); return
    except Exception: time.sleep(5*(k+1))
  print("err",c,flush=True)
print(len(ciks),flush=True)
with ThreadPoolExecutor(6) as ex:
  for i,_ in enumerate(ex.map(get,ciks)):
    if i%500==0: print(i,flush=True)
print("done",flush=True)
