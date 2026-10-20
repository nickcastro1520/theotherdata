# 8-K item 5.02 filings that mention the chief financial officer together with a departure word (EDGAR full-text search).
import requests,json,os,time,datetime as dt
UA={"User-Agent":"theotherdata.com research nickcastro1520@gmail.com"}
Q='"chief financial officer" AND (resign OR resigned OR resignation OR "step down" OR departure OR terminated)'
import sys
d=dt.date(int(sys.argv[1]),1,1)
while d<min(dt.date(int(sys.argv[2])+1,1,1),dt.date(2026,10,1)):
  e=(d.replace(day=28)+dt.timedelta(days=4)).replace(day=1)-dt.timedelta(days=1)
  p=f"cfo/{d:%Y-%m}.json"
  if not os.path.exists(p):
    hits=[];frm=0
    while True:
      for k in range(4):
        try:
          r=requests.get("https://efts.sec.gov/LATEST/search-index",params={"q":Q,"forms":"8-K","dateRange":"custom","startdt":d.isoformat(),"enddt":e.isoformat(),"from":frm},headers=UA,timeout=60).json()
          if "hits" in r: break
          time.sleep(10*(k+1)); r=None
        except Exception: time.sleep(5*(k+1)); r=None
      if not r: break
      h=r["hits"]["hits"]; tot=r["hits"]["total"]["value"]
      hits+=[{"adsh":x["_source"]["adsh"],"ciks":x["_source"]["ciks"],"date":x["_source"]["file_date"],"items":x["_source"].get("items",[])} for x in h]
      frm+=len(h); time.sleep(0.4)
      if not h or frm>=tot or frm>=9900: break
    json.dump({"total":tot if r else None,"hits":hits},open(p,"w"))
  d=e+dt.timedelta(days=1)
print("done",flush=True)
