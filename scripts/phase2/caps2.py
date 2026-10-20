# Point-in-time market cap, first of each month 2012-01..2026-09, for companies with a current ticker and Yahoo prices.
# v2 (replaces caps.py / the v1 top-500 universe, which had bugs: dividend- and split-adjusted prices, XBRL "frames" that drop
# multi-class companies such as Alphabet and Berkshire, foreign ADR prices times ordinary share counts, and Exxon's old CIK).
# shares = latest 10-K/10-Q cover-page share count (dei:EntityCommonStockSharesOutstanding) FILED before the month starts
#          (SEC companyfacts, so it uses the real filing date); if none in the past 15 months, the latest 10-K/10-Q diluted
#          weighted-average share count (us-gaap), priced at the highest-priced share class.
#          Isolated values more than 10x away from both neighbours (scale typos) are dropped.
# price  = as-traded close at the prior month end (Yahoo split-adjusted monthly close x later split ratios).
# A company-month is skipped when the cover-page and diluted counts disagree more than 5x.
# Foreign filers (20-F / 40-F) have no 10-K/10-Q share count and drop out.
import json,os,bisect,datetime as dt
tj=json.load(open("/workspace/tod-cache/idx/tickers.json")); tks={}
for r in tj["data"]: tks.setdefault(r[0],[]).append(r[2].replace(".","-"))
tks.setdefault(34088,["XOM"])
OK={"10-K","10-Q","10-K/A","10-Q/A","10-KT"}
import statistics
def clean(rows,splits=()):
  r=sorted({(f,v,e) for s,e,v,f,fm in rows if fm in OK and v and v>0})
  # put every count on today's split basis; drop values more than 5x away from the company's median (unit/scale typos)
  def adj(e,v):
    for sd,x in splits:
      if sd>e: v*=x
    return v
  if len(r)>=3:
    med=statistics.median(adj(e,v) for f,v,e in r)
    r=[(f,v,e) for f,v,e in r if med/5<=adj(e,v)<=med*5]
  keep=[]
  for k,(f,v,e) in enumerate(r):
    nb=[r[j][1] for j in (k-1,k+1) if 0<=j<len(r)]
    if nb and all(v>10*x or v<x/10 for x in nb): continue
    keep.append((f,v,e))
  return keep
M={}
def mon(t):
  if t not in M:
    p=f"/workspace/tod-cache/yahoo_m/{t}.json"; M[t]=json.load(open(p)) if os.path.exists(p) else None
  return M[t]
def raw_close(t,ym):
  d=mon(t)
  if not d or not d["bars"]: return None
  y,m=map(int,ym.split("-")); m-=1
  if m==0: y,m=y-1,12
  prev=f"{y:04d}-{m:02d}"
  c=next((c for dd,c in d["bars"] if dd[:7]==prev),None)
  if c is None: return None
  f=1.0
  for sd,r in d["splits"]:
    if sd>=ym+"-01": f*=r
  return c*f
SH={}
for c in tks:
  p=f"cf/{c}.json"
  if not os.path.exists(p): continue
  j=json.load(open(p))
  if j:
    sp=(mon(([x for x in tks[c] if "-P" not in x] or tks[c])[0]) or {}).get("splits",[])
    a=clean(j.get("EntityCommonStockSharesOutstanding",[]),sp); b=clean(j.get("WeightedAverageNumberOfDilutedSharesOutstanding",[]),sp)
    if not b: b=clean(j.get("WeightedAverageNumberOfSharesOutstandingBasic",[]),sp)
    SH[c]=(a,b)
def latest(lst,d0,old,splits=()):
  # share count on the price date's split basis: apply splits after the count's as-of date and before the month start
  i=bisect.bisect_left([x[0] for x in lst],d0)
  if not (i and lst[i-1][0]>=old): return None
  f,v,e=lst[i-1]
  for sd,x in splits:
    if e<sd<d0: v*=x
  return v
months=[f"{y}-{m:02d}" for y in range(2012,2027) for m in range(1,13) if f"{y}-{m:02d}"<="2026-09"]
caps={};src={"dei":0,"diluted":0}
for ym in months:
  d0=ym+"-01"; old=(dt.date.fromisoformat(d0)-dt.timedelta(days=456)).isoformat(); out={}
  for c,(dei,wad) in SH.items():
    ts=[x for x in tks[c] if '-P' not in x] or tks[c]; t=ts[0]; sp=(mon(t) or {}).get('splits',[]); v=latest(dei,d0,old,sp); pr=None
    if v: pr=raw_close(t,ym); s="dei"
    else:
      v=latest(wad,d0,old,sp); s="diluted"
      if v:
        ps=[p for p in (raw_close(x,ym) for x in ts) if p]; pr=max(ps) if ps else None
    if v and pr:
      w=latest(wad,d0,old,sp)
      if s=="dei" and w and not (w/5<=v<=w*5): continue   # cover-page and diluted counts disagree >5x: unreliable, skip
      cap=v*pr
      if cap<6e12 and (t not in out or cap>out[t]): out[t]=cap; src[s]+=1
  caps[ym]=out
  if ym.endswith("-01"): print(ym,len(out),flush=True)
print(src)
json.dump(caps,open("caps2.json","w"))
