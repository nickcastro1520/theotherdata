import requests,json,os,time,sys,datetime as dt
C="/workspace/tod-cache/yahoo"
S=requests.Session();S.headers["User-Agent"]="Mozilla/5.0"
def get(t):
  p=f"{C}/{t}.json"
  if os.path.exists(p): return json.load(open(p))
  for k in range(3):
    try:
      r=S.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}",params={"period1":946684800,"period2":1792800000,"interval":"1d","events":"split,div"},timeout=30)
      if r.status_code==404: d=[];break
      if r.status_code==429: time.sleep(20);continue
      j=r.json()["chart"]["result"][0]; ts=j.get("timestamp") or []; ac=j["indicators"]["adjclose"][0]["adjclose"] if ts else []
      d=[[dt.datetime.utcfromtimestamp(a).date().isoformat(),c] for a,c in zip(ts,ac) if c]; break
    except Exception as e: d=None; time.sleep(3)
  if d is None: return None
  json.dump(d,open(p,"w")); time.sleep(0.4); return d
if __name__=="__main__":
  ts=[l.strip() for l in open(sys.argv[1]) if l.strip()]
  for i,t in enumerate(ts):
    d=get(t)
    if i%100==0: print(i,t,len(d) if d else d,flush=True)
  print("done")
