# Event study: return vs SPY over 21 and 63 trading days, entry = close of the first trading day AFTER the filing date
# (point in time even if the filing landed after the close). Expected direction: +1 (insider buys) or -1 (late filings).
# Baseline = better of always-up and always-down vs SPY over every non-overlapping 21/63-day window of the same stocks
# in the same years (the event windows themselves can't be the baseline for a one-direction signal: it would always tie).
# Independent events: per ticker, a new event only if more than 63 trading days after that ticker's last counted event.
import json,bisect,math,sys,random
sys.path.insert(0,"/workspace/tod-cache"); from yh import get
def wilson(k,n,z=1.96):
  if not n: return None
  p=k/n; c=(p+z*z/(2*n))/(1+z*z/n); h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n); return [round(100*(c-h),1),round(100*(c+h),1)]
def run(events,direction,label,link):
  spy=get("SPY"); sd={d:i for i,(d,_) in enumerate(spy)}; sdates=[d for d,_ in spy]
  out={}
  for H in (21,63):
    rows=[];ctrl=[0,0];last={};indep=[]
    tick={}
    for e in events:
      px=tick.get(e["ticker"])
      if px is None: px=tick[e["ticker"]]=get(e["ticker"]) or []
      if not px: continue
      dts=[d for d,_ in px]; i=bisect.bisect_right(dts,e["filed"])
      if i+H>=len(px): continue
      a,b=px[i][0],px[i+H][0]
      if a not in sd or b not in sd: continue
      r=px[i+H][1]/px[i][1]-1
      if px[i][1]<1 or abs(r)>5: continue  # data hygiene: sub-$1 adjusted prices and >500% moves are mostly split/adjustment errors
      m=spy[sd[b]][1]/spy[sd[a]][1]-1; x=r-m
      row={"ticker":e["ticker"],"filed":e["filed"],"link":e.get("link"),"entry":a,"exit":b,"stock":round(100*r,2),"spy":round(100*m,2),"excess":round(100*x,2),"right":direction*x>0}
      rows.append(row)
      li=last.get(e["ticker"])
      if li is None or i-li>63: indep.append(row); last[e["ticker"]]=i
    yrs=sorted({r["filed"][:4] for r in rows}); tks=sorted({r["ticker"] for r in rows})
    for t in tks:
      px=tick[t]
      for j in range(0,len(px)-H,H):
        if px[j][0][:4] in yrs and px[j][0] in sd and px[j+H][0] in sd:
          if px[j][1]<1 or abs(px[j+H][1]/px[j][1]-1)>5: continue
          x=(px[j+H][1]/px[j][1]-1)-(spy[sd[px[j+H][0]]][1]/spy[sd[px[j][0]]][1]-1); ctrl[0 if x>0 else 1]+=1
    base=round(100*max(ctrl)/sum(ctrl),1) if sum(ctrl) else None
    def summ(rs):
      n=len(rs); k=sum(r["right"] for r in rs); mx=sum(r["excess"] for r in rs)/n if n else None
      sdv=(sum((r["excess"]-mx)**2 for r in rs)/(n-1))**.5 if n>1 else None
      return {"n":n,"hitVsSpy":round(100*k/n,1),"ci":wilson(k,n),"meanExcess":round(mx,2),"meanExcessCI":[round(mx-1.96*sdv/n**.5,2),round(mx+1.96*sdv/n**.5,2)],
        "flippedHit":round(100*(n-k)/n,1),"flippedMeanExcess":round(-mx,2),"medianExcess":sorted(r["excess"] for r in rs)[n//2]}
    random.seed(7); smp=random.sample(indep,3) if len(indep)>=3 else indep
    out[f"{H}d"]={"raw":summ(rows),"independent":summ(indep),"baseline":base,"baselineWindows":sum(ctrl),
      "passes":bool(wilson(sum(r["right"] for r in indep),len(indep))[0]>base),"years":[yrs[0],yrs[-1]] if yrs else None,"tickers":len(tks),"samples":smp}
    print(label,H,json.dumps({k:v for k,v in out[f"{H}d"].items() if k!="samples"}),flush=True)
  return out
