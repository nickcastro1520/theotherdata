# Resumable: EDGAR submissions JSON (+older pages back to 2012) for every CIK in ciks.txt. ~8 req/s max.
import requests,json,os,time,sys
UA={"User-Agent":"theotherdata.com research nickcastro1520@gmail.com"}
S=requests.Session();S.headers.update(UA)
def get(url):
  for k in range(4):
    try:
      with LOCK:
        w=last[0]+0.135-time.time()
        if w>0: time.sleep(w)
        last[0]=time.time()
      r=requests.get(url,headers=UA,timeout=30)
      if r.status_code==404: return None
      if r.status_code in(429,503): time.sleep(10*(k+1));continue
      r.raise_for_status(); return r.json()
    except Exception: time.sleep(3*(k+1))
  return "ERR"
ciks=[int(l) for l in open("ciks.txt") if l.strip()]
import threading,queue
LOCK=threading.Lock();last=[0.0]
def one(i,c):
  p=f"subs/{c}.json"
  if os.path.exists(p): return
  j=get(f"https://data.sec.gov/submissions/CIK{c:010d}.json")
  if j=="ERR": print("err",c,flush=True);return
  if j is None: json.dump({},open(p,"w"));return
  keep=["form","filingDate","acceptanceDateTime","accessionNumber","items"]
  rec={k:j["filings"]["recent"].get(k,[]) for k in keep}
  for f in j["filings"].get("files",[]):
    if f.get("filingTo","9999")<"2011-06-01": continue
    o=get("https://data.sec.gov/submissions/"+f["name"])
    if isinstance(o,dict):
      for k in keep: rec[k]+=o.get(k,[])
  json.dump({"name":j.get("name"),"tickers":j.get("tickers"),"exchanges":j.get("exchanges"),"f":rec},open(p,"w"))
  if i%500==0: print(i,c,flush=True)
Q=queue.Queue()
for i,c in enumerate(ciks): Q.put((i,c))
def worker():
  while True:
    try: i,c=Q.get_nowait()
    except queue.Empty: return
    one(i,c)
T=[threading.Thread(target=worker) for _ in range(6)]
[t.start() for t in T];[t.join() for t in T]
print("done",flush=True)
