# 8-K items 4.02 / 4.01 / 3.01 / 5.02 (+ CFO departures via full-text search) and Schedule 13D, for companies with a
# current listed ticker and Yahoo prices. Rule chosen on 2012-2020 only (direction x horizon by train mean excess vs SPY,
# capped returns), then confirmed ONCE on 2021-2026.
import json,glob,os,sys; sys.path.insert(0,"."); from lib import *
tj=json.load(open("/workspace/tod-cache/idx/tickers.json")); tk={}
for r in tj["data"]:
  if r[3] in ("NYSE","Nasdaq","CBOE"): tk.setdefault(r[0],r[2].replace(".","-"))
sig={k:[] for k in ("8-K 4.02 non-reliance","8-K 4.01 auditor change","8-K 3.01 delisting notice","8-K 5.02 officer/director change","8-K 5.02 CFO departure","Schedule 13D")}
for c,t in tk.items():
  p=f"subs/{c}.json"
  if not os.path.exists(p) or not px(t): continue
  f=json.load(open(p)).get("f")
  if not f: continue
  for form,d,acc,items in zip(f["form"],f["filingDate"],f["accessionNumber"],f["items"]):
    if d<"2012-01-01": continue
    link=f"https://www.sec.gov/Archives/edgar/data/{c}/{acc.replace('-','')}/"
    e={"ticker":t,"filed":d,"link":link,"cik":c}
    if form=="8-K":
      it=set(x.strip() for x in (items or "").split(","))
      for code,name in (("4.02","8-K 4.02 non-reliance"),("4.01","8-K 4.01 auditor change"),("3.01","8-K 3.01 delisting notice"),("5.02","8-K 5.02 officer/director change")):
        if code in it: sig[name].append(e)
    elif form in ("SC 13D","SCHEDULE 13D"): sig["Schedule 13D"].append(e)
cfo=set()
for p in glob.glob("cfo/*.json"):
  for h in json.load(open(p))["hits"]:
    if "5.02" in h["items"]: cfo.add(h["adsh"])
for e in sig["8-K 5.02 officer/director change"]:
  if e["link"].rstrip("/").split("/")[-1] in {a.replace("-","") for a in []}: pass
acc={e["link"].rstrip("/").split("/")[-1]:e for e in sig["8-K 5.02 officer/director change"]}
cfo_n={a.replace("-","") for a in cfo}
sig["8-K 5.02 CFO departure"]=[e for a,e in acc.items() if a in cfo_n]
for k in sig:
  seen=set(); sig[k]=sorted([e for e in sig[k] if not ((e["ticker"],e["filed"]) in seen or seen.add((e["ticker"],e["filed"])))],key=lambda e:e["filed"])
  print(k,len(sig[k]),flush=True)
res={}
for k,ev in sig.items():
  tr=[e for e in ev if e["filed"]<"2021-01-01"]; te=[e for e in ev if e["filed"]>="2021-01-01"]
  best=None
  for H in (21,63):
    r=event_study(tr,1,H,"cap","SPY",sample_n=0); m=r["independent"]["meanExcess"]
    if m is None: continue
    cand=(abs(m),H,1 if m>0 else -1)
    if not best or cand>best: best=cand
  _,H,dirn=best
  out={"rule":{"horizonDays":H,"direction":"up" if dirn>0 else "down","chosenOn":"2012-2020"},"train":{},"test":{}}
  for b in BENCH:
    out["train"][b]=event_study(tr,dirn,H,"cap",b,sample_n=0)
    out["test"][b]=event_study(te,dirn,H,"cap",b)
  out["trainCalendar"]=calendar_time(tr,lookback=3 if H==63 else 1,end="2020-12")
  out["testCalendar"]=calendar_time(te,lookback=3 if H==63 else 1,start="2021-02")
  T=out["test"]["SPY"]; ct=out["testCalendar"]["SPY"]
  out["confirmed"]=bool(T["beatsBaseline"] and ct and ((dirn>0 and ct["nwT"]>2) or (dirn<0 and ct["nwT"]<-2)))
  res[k]=out; I=T["independent"]
  print(k,out["rule"],"test",T["raw"]["n"],I["n"],I["hit"],I["ci"],T["baseline"],I["meanExcess"],I["flippedHit"],"cal",ct,"confirmed",out["confirmed"],flush=True)
  json.dump(res,open("k8_phase2.json","w"))
