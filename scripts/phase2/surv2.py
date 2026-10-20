# Same as surv.py, but notices from companies we could not classify (no Form 25/15 found) are ADDED at a 0% return\n# instead of being left out. Failed firms at 0%, -30%, -100% as before.\n# Survivorship check for late filers: NT filers we have no prices for, classified from their own EDGAR filings.
# failed   = Form 25/25-NSE or 15-12B/15-12G/15-15D within 400 days after the notice, with no 8-K Item 2.01 in the 120 days before it
# acquired = same deregistration, but preceded by an 8-K Item 2.01 (completion of acquisition)  -> left out (no price)
# unknown  = no deregistration filing found -> left out
# Failed firms are added with an assumed delisting return of 0%, -30% or -100% over the window.
import json,glob,re,os,sys,datetime as dt,bisect; sys.path.insert(0,"."); from lib import *
tj=json.load(open("/workspace/tod-cache/idx/tickers.json")); tk={}
for r in tj["data"]: tk.setdefault(r[0],r[2].replace(".","-"))
ev=[]
for p in sorted(glob.glob("/workspace/tod-cache/idx/*.idx")):
  for l in open(p,errors="replace"):
    m=re.match(r"^(NT 10-[KQ])\s+(.*?)\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\S+)",l)
    if m: ev.append({"cik":int(m.group(3)),"company":m.group(2),"filed":m.group(4),"link":"https://www.sec.gov/Archives/"+m.group(5)})
seen=set(); ev=[e for e in ev if not ((e["cik"],e["filed"]) in seen or seen.add((e["cik"],e["filed"])))]
nopx=[e for e in ev if not (tk.get(e["cik"]) and px(tk[e["cik"]]))]
D=lambda s: dt.date.fromisoformat(s)
cls={"failed":[],"acquired":[],"unknown":[],"nosubs":[]}
for e in nopx:
  p=f"subs/{e['cik']}.json"
  if not os.path.exists(p): cls["nosubs"].append(e); continue
  f=json.load(open(p)).get("f") or {"form":[],"filingDate":[],"items":[]}
  rows=list(zip(f["form"],f["filingDate"],f.get("items") or [""]*len(f["form"])))
  dereg=[d for fm,d,_ in rows if fm in ("25","25-NSE","15-12B","15-12G","15-15D") and 0<=(D(d)-D(e["filed"])).days<=400]
  if not dereg: cls["unknown"].append(e); continue
  d0=min(dereg)
  acq=any(fm=="8-K" and "2.01" in (it or "") and 0<=(D(d0)-D(d)).days<=120 for fm,d,it in rows)
  cls["acquired" if acq else "failed"].append(dict(e,dereg=d0))
print({k:len(v) for k,v in cls.items()},"of",len(nopx),"no-price notices;",len(ev),"total notices",flush=True)
spy=px("SPY"); sd=[x[0] for x in spy]
base_ev=json.load(open("/workspace/tod-cache/nt_events.json"))
def mk(lst,H,Dl):
  extra=[]; last={}; inside=0
  for e in sorted(lst,key=lambda e:e["filed"]):
    i=bisect.bisect_right(sd,e["filed"])
    if i+H>=len(sd): continue
    if e["cik"] in last and i-last[e["cik"]]<=H: inside+=1; continue
    last[e["cik"]]=i
    extra.append({"ticker":f"CIK{e['cik']}","filed":e["filed"],"link":e["link"],"entry":sd[i],"exit":sd[i+H],"r":Dl})
  return extra,inside
out={"counts":{k:len(v) for k,v in cls.items()},"noPrice":len(nopx),"allNotices":len(ev),"runs":{}}
out["unknownDetail"]={"noCurrentTicker":sum(1 for e in cls["unknown"] if not tk.get(e["cik"])),"tickerButNoPrices":sum(1 for e in cls["unknown"] if tk.get(e["cik"])),"companies":len({e["cik"] for e in cls["unknown"]})}
for H in (21,63):
  u,ins=mk(cls["unknown"],H,0.0); out["unknownDetail"][f"{H}"]={"independentWindows":len(u),"insideAnEarlierWindowSameCompany":ins,"windowNotFinished":len(cls["unknown"])-len(u)-ins}
print(out["unknownDetail"],flush=True)
for Dl in (0,-0.3,-1.0):
  for H in (21,63):
    ef,_=mk(cls["failed"],H,Dl); eu,_=mk(cls["unknown"],H,0.0)
    for b in BENCH:
      r=event_study(base_ev,-1,H,"cap",b,extra=ef+eu,sample_n=0); out["runs"][f"{Dl}|{H}|{b}"]=r; I=r["independent"]
      print(Dl,H,b,len(ef),len(eu),I["n"],I["hit"],I["ci"],r["baseline"],I["meanExcess"],I["meanCI"],r["beatsBaseline"],flush=True)
  em={}
  for e in cls["failed"]: em.setdefault(ym_add(e["filed"][:7],1),[]).append(Dl)
  for e in cls["unknown"]: em.setdefault(ym_add(e["filed"][:7],1),[]).append(0.0)
  out["runs"][f"{Dl}|calendar"]=calendar_time(base_ev,extra_month_rets=em); print(Dl,"calendar",out["runs"][f"{Dl}|calendar"],flush=True)
json.dump(out,open("surv2_phase2.json","w"))
