import json,os,bisect,math,datetime as dt
YC="/workspace/tod-cache/yahoo"
_px={}
def px(t):
  if t not in _px:
    p=f"{YC}/{t}.json"; _px[t]=json.load(open(p)) if os.path.exists(p) else None
  return _px[t]
def wilson(k,n,z=1.96):
  if not n: return None
  p=k/n; c=(p+z*z/(2*n))/(1+z*z/n); h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n); return [round(100*(c-h),1),round(100*(c+h),1)]
def mci(xs):
  n=len(xs)
  if n<2: return None,None
  m=sum(xs)/n; sd=(sum((x-m)**2 for x in xs)/(n-1))**.5; return m,[m-1.96*sd/n**.5,m+1.96*sd/n**.5]
def nw_t(xs,L=3):
  n=len(xs); m=sum(xs)/n; e=[x-m for x in xs]
  g0=sum(a*a for a in e)/n; s=g0
  for l in range(1,L+1): s+=2*(1-l/(L+1))*sum(e[i]*e[i-l] for i in range(l,n))/n
  return m/math.sqrt(s/n) if s>0 else None
BENCH=("SPY","IWM","IWC")
def win(series,date,H):
  d=[x[0] for x in series]; i=bisect.bisect_right(d,date)
  if i+H>=len(series): return None
  return i,series[i][0],series[i+H][0],series[i+H][1]/series[i][1]-1
_bd={}
def bret(b,a,z):
  if b not in _bd: _bd[b]={x[0]:x[1] for x in px(b)}
  d=_bd[b]
  return d[z]/d[a]-1 if a in d and z in d else None
def event_study(events,direction,H,mode,bench="SPY",extra=None,sample_n=3,seed=7):
  """events: dicts ticker, filed(YYYY-MM-DD), link. mode: none | oldfilter | cap. extra: list of synthetic rows for delisted firms."""
  rows=[];last={};ind=[];evidx={}
  for e in events:
    s=px(e["ticker"])
    if not s: continue
    w=win(s,e["filed"],H)
    if not w: continue
    i,a,z,r=w
    if mode=="oldfilter" and (s[i][1]<1 or abs(r)>5): continue
    if mode=="cap": r=max(-1,min(1,r))
    m=bret(bench,a,z)
    if m is None: continue
    x=r-m; row={"ticker":e["ticker"],"filed":e["filed"],"link":e.get("link"),"entry":a,"exit":z,"stock":round(100*r,2),"bench":round(100*m,2),"excess":round(100*x,2),"right":direction*x>0}
    rows.append(row); evidx.setdefault(e["ticker"],[]).append(i)
    li=last.get(e["ticker"])
    if li is None or i-li>H: ind.append(row); last[e["ticker"]]=i
  for r in (extra or []):
    m=bret(bench,r["entry"],r["exit"])
    if m is None: continue
    x=r["r"]-m; row={"ticker":r["ticker"],"filed":r["filed"],"link":r.get("link"),"entry":r["entry"],"exit":r["exit"],"stock":round(100*r["r"],2),"bench":round(100*m,2),"excess":round(100*x,2),"right":direction*x>0,"delisted":True}
    rows.append(row); ind.append(row)
  # baseline: same stocks, non-event windows (non-overlapping H-day windows that do not overlap any event window)
  c=[0,0]; yrs={r["filed"][:4] for r in rows}
  for t,ix in evidx.items():
    s=px(t); bad=set()
    for i in ix: bad.update(range(i-H,i+H+1))
    for j in range(0,len(s)-H,H):
      if j in bad or s[j][0][:4] not in yrs: continue
      r=s[j+H][1]/s[j][1]-1
      if mode=="oldfilter" and (s[j][1]<1 or abs(r)>5): continue
      if mode=="cap": r=max(-1,min(1,r))
      m=bret(bench,s[j][0],s[j+H][0])
      if m is None: continue
      c[0 if r-m>0 else 1]+=1
  base=round(100*max(c)/sum(c),1) if sum(c) else None
  def summ(rs):
    n=len(rs); k=sum(r["right"] for r in rs); m,ci=mci([r["excess"] for r in rs])
    return {"n":n,"hit":round(100*k/n,1) if n else None,"ci":wilson(k,n),"meanExcess":round(m,2) if m is not None else None,"meanCI":[round(x,2) for x in ci] if ci else None,"flippedHit":round(100*(n-k)/n,1) if n else None,"flippedMean":round(-m,2) if m is not None else None}
  import random; random.seed(seed); smp=random.sample(ind,min(sample_n,len(ind)))
  I=summ(ind)
  return {"raw":summ(rows),"independent":I,"baseline":base,"baselineWindows":sum(c),"beatsBaseline":bool(I["ci"] and I["ci"][0]>base) if base else False,"years":[min(yrs),max(yrs)] if yrs else None,"samples":smp}
def monthly(t):
  s=px(t)
  if not s: return {}
  out={};prev=None
  for d,c in s:
    if not isinstance(c,(int,float)) or c<=0: continue
    ym=d[:7]
    if prev and ym!=prev[0]: out[prev[0]]=prev[1]
    prev=(ym,c)
  if prev: out[prev[0]]=prev[1]
  ks=sorted(out); return {ks[i]:out[ks[i]]/out[ks[i-1]]-1 for i in range(1,len(ks))}
def ym_add(ym,k):
  y,m=map(int,ym.split("-")); m+=k; y+=(m-1)//12; m=(m-1)%12+1; return f"{y:04d}-{m:02d}"
def calendar_time(events,lookback=3,cap=True,start=None,end=None,extra_month_rets=None):
  """Each month, equal-weight all stocks with an event filed in the prior `lookback` months (before the month starts)."""
  byym={}
  for e in events: byym.setdefault(e["filed"][:7],set()).add(e["ticker"])
  mons={}; months=sorted(byym)
  if not months: return None
  s=start or ym_add(months[0],1); f=end or "2026-09"; ym=s; res={b:[] for b in BENCH}; ns=[]
  B={b:monthly(b) for b in BENCH}
  while ym<=f:
    mem=set()
    for k in range(1,lookback+1): mem|=byym.get(ym_add(ym,-k),set())
    rs=[]
    for t in mem:
      if t not in mons: mons[t]=monthly(t)
      r=mons[t].get(ym)
      if r is None: continue
      rs.append(max(-1,min(1,r)) if cap else r)
    for r in (extra_month_rets or {}).get(ym,[]): rs.append(r)
    if rs:
      p=sum(rs)/len(rs); ns.append(len(rs))
      for b in BENCH:
        if ym in B[b]: res[b].append(p-B[b][ym])
    ym=ym_add(ym,1)
  out={"months":len(res["SPY"]),"avgStocks":round(sum(ns)/len(ns),1) if ns else 0}
  for b in BENCH:
    x=res[b]
    if len(x)>6: out[b]={"meanMonthly":round(100*sum(x)/len(x),2),"nwT":round(nw_t(x),2),"months":len(x)}
  return out
