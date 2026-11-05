# Weekly offbeat-signal hunt, Nov 5 2026: Henry Hub natural gas spot -> CF Industries (CF).
# Idea (from this week's news: CF Q3 results on Nov 4 citing natural-gas feedstock costs; Reuters Nov 2 on pinched
#   Trinidad ammonia exports lifting Midwest ammonia ~30%+ since June; fertilizer market updates tying nitrogen costs
#   to gas): CF makes nitrogen fertilizer from ammonia, and natural gas is roughly 80% of the cost of making that
#   ammonia. Cheap U.S. gas is a cost tailwind; expensive gas is a cost headwind.
# RULE, FIXED BEFORE THE FIRST SCORING (not retuned):
#   checkpoint d = 1st of each month. Reading = mean daily Henry Hub spot ($/MMBtu) over the prior calendar month
#   (all trading days with a print; need >= 15). Only prices dated before d are used, so the prior month is fully known.
#   Compare with the same calendar month's mean in every EARLIER year that has >= 15 prints (need >= 10 earlier years).
#   Percentile <= 25% -> "+" (cheap gas: cost tailwind); >= 75% -> "-" (expensive gas: cost headwind); else no call.
# Point-in-time: Henry Hub spot prints are same-day market prices (EIA RNGWHHD / FRED DHHNGSP); they are not revised
#   estimates. The "normal" range uses only earlier years. CF IPO Aug 2005, so the test starts Sep 2005 once 10 prior
#   same-month means exist (gas history from 1997).
# Scoring = study rules v2 (same as scripts/hunt/2026-10-22-mississippi-adm.py): 1-month window checkpoint -> next 1st,
#   adjusted closes (Tiingo), vs SPY. Baseline = better of always-up / always-down vs SPY over the same months. Back-to-back
#   calls in the same direction merge into one independent event. PASS = event hit rate > event baseline AND the 95% Wilson
#   lower bound > event baseline. Need >= 20 independent events. (The 2 x sqrt(baseline) move bar is for count data; a
#   dollar-per-MMBtu price is not a count, so the move bar here is the 25/75 percentile band.)
import json,datetime as dt,bisect,math,sys,os,csv,urllib.request
sys.path.insert(0,"scripts"); from prices_full import tiingo
D=dt.date.fromisoformat; iso=lambda d:d.isoformat()
RAW="data/henry-hub-daily.json"
if not os.path.exists(RAW) or "--refresh" in sys.argv:
  # Prefer EIA HTML mirror via datahub CSV; fall back to FRED graph CSV.
  pts=None
  for u in ("https://datahub.io/core/natural-gas/_r/-/data/daily.csv",
            "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DHHNGSP"):
    try:
      req=urllib.request.Request(u,headers={"User-Agent":"theotherdata-hunt/1.0"})
      raw=urllib.request.urlopen(req,timeout=90).read().decode()
      rows=list(csv.DictReader(raw.splitlines()))
      key="Price" if "Price" in rows[0] else ("DHHNGSP" if "DHHNGSP" in rows[0] else list(rows[0].keys())[1])
      dkey="Date" if "Date" in rows[0] else list(rows[0].keys())[0]
      pts=[]
      for r in rows:
        try: v=float(r[key])
        except: continue
        if v>0: pts.append({"t":r[dkey][:10],"v":v})
      if len(pts)>1000: break
    except Exception as e:
      print("fetch fail",u,e); pts=None
  if not pts: raise SystemExit("could not fetch Henry Hub history")
  json.dump({"source":"Henry Hub Natural Gas Spot Price ($/MMBtu), daily (EIA RNGWHHD / FRED DHHNGSP)",
    "url":"https://www.eia.gov/dnav/ng/hist/rngwhhdd.htm","fred":"https://fred.stlouisfed.org/series/DHHNGSP",
    "fetched":dt.date.today().isoformat(),"points":pts},open(RAW,"w"))
PTS=json.load(open(RAW))["points"]
# index by year-month -> list of daily values with t < checkpoint
by_ym={}
for p in PTS:
  d=D(p["t"]); by_ym.setdefault((d.year,d.month),[]).append(p["v"])
def month_mean(y,m):
  xs=by_ym.get((y,m))
  return sum(xs)/len(xs) if xs and len(xs)>=15 else None
def gas(d):
  # prior calendar month
  y,m=d.year,d.month
  if m==1: py,pm=y-1,12
  else: py,pm=y,m-1
  cur=month_mean(py,pm)
  if cur is None: return None,None
  past=[]
  for k in range(1,40):
    v=month_mean(py-k,pm)
    if v is not None: past.append(v)
  if len(past)<10: return None,None
  pc=100*sum(1 for x in past if x<cur)/len(past)
  call="+" if pc<=25 else "-" if pc>=75 else "0"
  return call, f"prior month {py}-{pm:02d}: ${cur:.2f}/MMBtu Henry Hub, percentile {pc:.0f} of {len(past)} earlier same-months (bars 25/75)"
def wilson(k,n,z=1.96):
  if not n: return None
  p=k/n; c=(p+z*z/(2*n))/(1+z*z/n); h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n); return [round(100*(c-h),1),round(100*(c+h),1)]
pct=lambda k,n: round(100*k/n,1) if n else None
def ret(px,dates,a,b):
  i=bisect.bisect_left(dates,a); j=bisect.bisect_left(dates,b)
  if i>=len(dates) or j>=len(dates): return None
  return dates[i],dates[j],px[j][1]/px[i][1]-1
def months(a,b):
  y,m=a.year,a.month
  while (y,m)<=(b.year,b.month):
    yield dt.date(y,m,1); m+=1
    if m==13: y,m=y+1,1
SPY=tiingo("SPY"); SPYd=[x[0] for x in SPY]; TK="CF"; px=tiingo(TK); dates=[x[0] for x in px]
rows=[]
for d in months(max(D(dates[0])+dt.timedelta(days=5),dt.date(2005,9,1)),dt.date(2026,10,1)):
  c,det=gas(d)
  if c not in("+","-"): continue
  nx=(d.replace(day=28)+dt.timedelta(days=4)).replace(day=1)
  a=ret(px,dates,iso(d),iso(nx)); m=ret(SPY,SPYd,iso(d),iso(nx))
  if not a or not m or a[:2]!=m[:2]: continue
  rows.append({"d":iso(d),"call":c,"detail":det,"from":a[0],"to":a[1],"stock":round(100*a[2],2),"spy":round(100*m[2],2),"x":a[2]-m[2]})
s=lambda c:1 if c=="+" else -1
n=len(rows); hit=sum(1 for r in rows if s(r["call"])*r["x"]>0); beat=sum(1 for r in rows if r["x"]>0); base=max(beat,n-beat)
ev=[]
for r in rows:
  if ev and ev[-1]["call"]==r["call"] and (D(r["d"])-D(ev[-1]["last"])).days<=31: ev[-1]["x"]+=r["x"]; ev[-1]["last"]=r["d"]; ev[-1]["months"]+=1
  else: ev.append({"call":r["call"],"first":r["d"],"last":r["d"],"x":r["x"],"months":1})
ne=len(ev); eh=sum(1 for e in ev if s(e["call"])*e["x"]>0); eb=sum(1 for e in ev if e["x"]>0); ebase=max(eb,ne-eb)
ci=wilson(eh,ne); enough=ne>=20; passed=bool(enough and eh>ebase and ci and ci[0]>pct(ebase,ne))
for r in rows: r["right"]=s(r["call"])*r["x"]>0; r["excess"]=round(100*r["x"],2)
pick=[rows[i] for i in sorted({0,n//2,n-1})] if n else []
res={"id":"2026-11-05-henryhub-cf","huntWeek":"2026-11-05","name":"Henry Hub natural gas spot -> CF Industries","ticker":TK,
 "source":"Henry Hub Natural Gas Spot Price ($/MMBtu), daily (EIA RNGWHHD / FRED DHHNGSP)","sourceUrl":"https://www.eia.gov/dnav/ng/hist/rngwhhdd.htm",
 "from":rows[0]["d"] if rows else None,"to":rows[-1]["d"] if rows else None,
 "rawCalls":n,"rawUp":sum(1 for r in rows if r["call"]=="+"),"rawDown":sum(1 for r in rows if r["call"]=="-"),
 "rawHitVsSpy":pct(hit,n),"rawCI":wilson(hit,n),"rawBaseline":pct(base,n),"rawBaselineSide":"always up" if beat>=n-beat else "always down","rawFlipped":pct(n-hit,n),
 "meanExcessPerCall":round(100*sum(s(r["call"])*r["x"] for r in rows)/n,2) if n else None,
 "events":ne,"eventHits":eh,"eventHitVsSpy":pct(eh,ne),"eventCI":ci,"eventBaseline":pct(ebase,ne),"eventBaselineSide":"always up" if eb>=ne-eb else "always down",
 "eventFlipped":pct(ne-eh,ne),"eventFlippedCI":wilson(ne-eh,ne),"enoughEvents":enough,"pass":passed,
 "samples":[{k:v for k,v in r.items() if k!="x"} for r in pick]}
print(json.dumps({k:v for k,v in res.items() if k!="samples"},indent=1))
for r in rows: print(r["d"],r["call"],round(100*r["x"],1),r["detail"])
if "--write" in sys.argv:
  P="public/data/weekly-hunt.json"; H=json.load(open(P))
  H["tests"]=[t for t in H["tests"] if t["id"]!=res["id"]]+[res]; H["updatedAt"]=dt.datetime.now(dt.timezone.utc).isoformat()
  json.dump(H,open(P,"w"),indent=1); print("wrote",P)
