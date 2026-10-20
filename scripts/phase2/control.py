# Matched control for late-filing notices (NT 10-K/10-Q) and 8-K Item 4.01 auditor changes.
# Each event is compared with the equal-weight average of stocks in the SAME market-cap decile in the SAME month that had no
# such filing that month (caps from caps.json, deciles over every company we can price and size), and with the
# equal-weight average of the whole universe. Same entry/exit days (close of first trading day after the filing date,
# +21 / +63 trading days); every return capped at +/-100%. Independent events: same ticker needs a gap of more than H days.
# "Placebo" = how often a no-event stock lands on the same side of its own decile average (the fair coin-flip level, since
# single-stock returns are skewed). Calendar time: each month, equal-weight event stocks (filing in the prior 1 or 3 months),
# minus their decile's no-event average (or the whole universe), Newey-West t (lag 3).
import json,os,sys,math,numpy as np; sys.path.insert(0,"."); from lib import px,wilson,mci,nw_t,ym_add
caps=json.load(open("caps.json")); months=sorted(caps)
spy=px("SPY"); D=[d for d,_ in spy]; DI={d:i for i,d in enumerate(D)}
T=sorted({t for v in caps.values() for t in v}); TI={t:i for i,t in enumerate(T)}
P=np.full((len(T),len(D)),np.nan,dtype=np.float64)
for t,i in TI.items():
  s=px(t)
  if not s: continue
  for d,c in s:
    j=DI.get(d)
    if j is not None and isinstance(c,(int,float)) and c>0: P[i,j]=c
DEC={}
for ym in months:
  it=[(c,t) for t,c in caps[ym].items() if not np.isnan(P[TI[t]]).all()]
  it.sort(); n=len(it)
  DEC[ym]={t:min(9,k*10//n) for k,(c,t) in enumerate(it)}
print("universe tickers",len(T),"avg per month",round(sum(len(v) for v in DEC.values())/len(DEC)),flush=True)
import bisect
def entry_idx(f):
  i=bisect.bisect_right(D,f); return i
# month-end indices for calendar time
ME={}
for j,d in enumerate(D): ME[d[:7]]=j
def run(name,ev,H):
  ev=sorted(ev,key=lambda e:e["filed"])
  evm={}
  for e in ev: evm.setdefault(e["filed"][:7],set()).add(e["ticker"])
  grp={}; rows=[]; last={}; miss=0
  for e in ev:
    ym=e["filed"][:7]; t=e["ticker"]
    if ym not in DEC or t not in DEC[ym]: miss+=1; continue
    i=entry_idx(e["filed"])
    if i+H>=len(D): continue
    k=TI[t]; a,b=P[k,i],P[k,i+H]
    if np.isnan(a) or np.isnan(b): miss+=1; continue
    r=max(-1,min(1,b/a-1)); dec=DEC[ym][t]; key=(ym,dec,i)
    if key not in grp:
      mem=[TI[x] for x,dd in DEC[ym].items() if dd==dec and x not in evm[ym]]
      rr=np.clip(P[mem,i+H]/P[mem,i]-1,-1,1); rr=rr[~np.isnan(rr)]
      allm=[TI[x] for x in DEC[ym]]; ra=np.clip(P[allm,i+H]/P[allm,i]-1,-1,1); ra=ra[~np.isnan(ra)]
      mu=rr.mean() if len(rr) else np.nan
      grp[key]=(mu,(rr<mu).mean() if len(rr) else np.nan,ra.mean(),len(rr))
    mu,below,ew,nc=grp[key]
    if np.isnan(mu): continue
    li=last.get(t)
    if li is not None and i-li<=H: continue
    last[t]=i
    rows.append({"ticker":t,"filed":e["filed"],"link":e.get("link"),"entry":D[i],"exit":D[i+H],"decile":dec+1,"stock":round(100*r,2),"control":round(100*mu,2),"controlN":nc,"ew":round(100*ew,2),"vsControl":round(100*(r-mu),2),"vsEW":round(100*(r-ew),2),"placeboBelow":below})
  def summ(key):
    xs=[r[key] for r in rows]; k=sum(x<0 for x in xs); n=len(xs); m,ci=mci(xs)
    return {"n":n,"hitDown":round(100*k/n,1),"ci":wilson(k,n),"meanExcess":round(m,2),"meanCI":[round(ci[0],2),round(ci[1],2)]}
  out={"events":len(rows),"noSizeOrPrice":miss,"vsControl":summ("vsControl"),"vsEW":summ("vsEW"),
       "placeboHitDown":round(100*sum(r["placeboBelow"] for r in rows)/len(rows),1)}
  out["vsControl"]["beatsPlacebo"]=out["vsControl"]["ci"][0]>out["placeboHitDown"]
  # calendar time
  L=1 if H==21 else 3; cal={"control":[],"ew":[]}; ns=[]
  ms=[m for m in months if m>=ym_add(min(evm),1)]
  for ym in ms:
    if ym not in DEC: continue
    pym=ym_add(ym,-1)
    if pym not in ME or ym not in ME: continue
    j0,j1=ME[pym],ME[ym]
    mem=set()
    for q in range(1,L+1): mem|=evm.get(ym_add(ym,-q),set())
    dd=DEC[ym]
    R=np.clip(P[:,j1]/P[:,j0]-1,-1,1)
    decavg={}
    for q in range(10):
      idx=[TI[x] for x,v in dd.items() if v==q and x not in mem]; z=R[idx]; z=z[~np.isnan(z)]; decavg[q]=z.mean() if len(z) else np.nan
    allz=R[[TI[x] for x in dd]]; ewm=np.nanmean(allz)
    ad=[];rw=[]
    for t in mem:
      if t in dd and not np.isnan(R[TI[t]]) and not np.isnan(decavg[dd[t]]):
        ad.append(R[TI[t]]-decavg[dd[t]]); rw.append(R[TI[t]])
    if ad: cal["control"].append(float(np.mean(ad))); cal["ew"].append(float(np.mean(rw)-ewm)); ns.append(len(ad))
  out["calendar"]={k:{"meanMonthly":round(100*sum(v)/len(v),2),"nwT":round(nw_t(v),2),"months":len(v)} for k,v in cal.items()}
  out["calendar"]["avgStocks"]=round(sum(ns)/len(ns),1)
  import random; random.seed(7); out["samples"]=random.sample(rows,3)
  for s in out["samples"]: s.pop("placeboBelow",None)
  print(name,H,{k:v for k,v in out.items() if k!="samples"},flush=True)
  return out
nt=json.load(open("/workspace/tod-cache/nt_events.json"))
aud=json.load(open("aud_events.json"))
res={}
for name,ev in (("Late-filing notices",nt),("8-K 4.01 auditor change",aud)):
  for H in (21,63):
    res[f"{name}|{H}"]=run(name,ev,H); json.dump(res,open("control_phase2.json","w"),default=lambda o:o.item())
# split the auditor-change result into the 2012-2020 rule period and the 2021-2026 check period
for H in (63,):
  res[f"8-K 4.01 auditor change|{H}|2012-2020"]=run("aud train",[e for e in aud if e["filed"]<"2021-01-01"],H)
  res[f"8-K 4.01 auditor change|{H}|2021-2026"]=run("aud test",[e for e in aud if e["filed"]>="2021-01-01"],H)
json.dump(res,open("control_phase2.json","w"),default=lambda o:o.item())
