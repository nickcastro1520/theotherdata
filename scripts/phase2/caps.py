# Point-in-time market cap for every company with a current SEC ticker, first of each month 2012-01..2026-09.
# shares: latest dei:EntityCommonStockSharesOutstanding with period end <= month start - 90 days (and not older than a year more);
#         if none, us-gaap WeightedAverageNumberOfDilutedSharesOutstanding (multi-class companies such as Alphabet, Berkshire).
# price:  as-traded close at the prior month end = Yahoo split-adjusted monthly close x splits that happened later
#         (v1 bug: used the split- and dividend-adjusted close, which shrank caps of companies that split later, e.g. Apple 28x).
#         For the share-count fallback, the highest-priced share class is used (Berkshire class A).
import json,glob,os,bisect,datetime as dt
tj=json.load(open("/workspace/tod-cache/idx/tickers.json")); tks={}
for r in tj["data"]: tks.setdefault(r[0],[]).append(r[2].replace(".","-"))
tks.setdefault(34088,["XOM"])  # Exxon Mobil Corp before its 2026 holding-company reorg
def load(pat):
  fr={}
  for p in sorted(glob.glob(pat)):
    for x in json.load(open(p))["data"]:
      if x["cik"] in tks: fr.setdefault(x["cik"],[]).append((x["end"],x["val"]))
  for v in fr.values(): v.sort()
  return fr
DEI=load("frames/*.json"); WAD=load("frames_wad/*.json")
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
def latest(lst,cut,old):
  i=bisect.bisect_right([e for e,_ in lst],cut)
  return lst[i-1][1] if i and lst[i-1][0]>=old else None
months=[f"{y}-{m:02d}" for y in range(2012,2027) for m in range(1,13) if f"{y}-{m:02d}"<="2026-09"]
caps={}
for ym in months:
  d0=dt.date.fromisoformat(ym+"-01"); cut=(d0-dt.timedelta(days=90)).isoformat(); old=(d0-dt.timedelta(days=455)).isoformat()
  out={}
  for c,ts in tks.items():
    t=ts[0]; v=latest(DEI.get(c,[]),cut,old); pr=None
    if v: pr=raw_close(t,ym)
    else:
      v=latest(WAD.get(c,[]),cut,old)
      if v:
        ps=[p for p in (raw_close(x,ym) for x in ts) if p]; pr=max(ps) if ps else None
    if v and pr and v*pr>0:
      if t not in out or c==34088: out[t]=v*pr
  caps[ym]=out
  if ym.endswith("-01"): print(ym,len(out),flush=True)
json.dump(caps,open("caps.json","w"))
