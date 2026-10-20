# Point-in-time market cap, first of each month 2012-01..2026-09, for companies with a current ticker and Yahoo prices.
# v2 (replaces caps.py / the v1 top-500 universe, which had bugs: dividend- and split-adjusted prices, XBRL "frames" that drop
# multi-class companies such as Alphabet and Berkshire, foreign ADR prices times ordinary share counts, and Exxon's old CIK).
# shares = latest 10-K/10-Q cover-page share count (dei:EntityCommonStockSharesOutstanding) FILED before the month starts
#          (SEC companyfacts, so it uses the real filing date); if none in the past 15 months, the latest 10-K/10-Q diluted
#          weighted-average share count (us-gaap), priced at the highest-priced share class.
#          Isolated values more than 10x away from both neighbours (scale typos) are dropped.
# price  = as-traded close at the prior month end (Yahoo split-adjusted monthly close x later split ratios).
# Foreign filers (20-F / 40-F) have no 10-K/10-Q share count and drop out.
import json,os,bisect,datetime as dt
tj=json.load(open("/workspace/tod-cache/idx/tickers.json")); tks={}
for r in tj["data"]: tks.setdefault(r[0],[]).append(r[2].replace(".","-"))
tks.setdefault(34088,["XOM"])
OK={"10-K","10-Q","10-K/A","10-Q/A","10-KT"}
def clean(rows):
  r=sorted({(f,v) for s,e,v,f,fm in rows if fm in OK and v and v>0})
  keep=[]
  for k,(f,v) in enumerate(r):
    nb=[r[j][1] for j in (k-1,k+1) if 0<=j<len(r)]
    if nb and all(v>10*x or v<x/10 for x in nb): continue
    keep.append((f,v))
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
  if j: SH[c]=(clean(j.get("EntityCommonStockSharesOutstanding",[])),clean(j.get("WeightedAverageNumberOfDilutedSharesOutstanding",[])))
def latest(lst,d0,old):
  i=bisect.bisect_left([f for f,_ in lst],d0)
  return lst[i-1][1] if i and lst[i-1][0]>=old else None
months=[f"{y}-{m:02d}" for y in range(2012,2027) for m in range(1,13) if f"{y}-{m:02d}"<="2026-09"]
caps={};src={"dei":0,"diluted":0}
for ym in months:
  d0=ym+"-01"; old=(dt.date.fromisoformat(d0)-dt.timedelta(days=456)).isoformat(); out={}
  for c,(dei,wad) in SH.items():
    ts=tks[c]; t=ts[0]; v=latest(dei,d0,old); pr=None
    if v: pr=raw_close(t,ym); s="dei"
    else:
      v=latest(wad,d0,old); s="diluted"
      if v:
        ps=[p for p in (raw_close(x,ym) for x in ts) if p]; pr=max(ps) if ps else None
    if v and pr:
      cap=v*pr
      if cap<6e12 and (t not in out or cap>out[t]): out[t]=cap; src[s]+=1
  caps[ym]=out
  if ym.endswith("-01"): print(ym,len(out),flush=True)
print(src)
json.dump(caps,open("caps2.json","w"))
