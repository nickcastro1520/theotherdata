# Weekly offbeat-signal hunt, Oct 22 2026: Mississippi River level at St. Louis -> ADM (Archer-Daniels-Midland).
# Idea (from this week's news: 10-year-low river at Baton Rouge, barge tows cut 13%, Univ. of Arkansas study on barge costs):
#   ADM moves a lot of US grain by barge down the Mississippi to Gulf export terminals. Low water means lighter loads,
#   smaller tows, pricier freight and slower exports; plenty of water means full loads and cheaper freight.
# RULE, FIXED BEFORE THE FIRST SCORING (not retuned):
#   checkpoint d = 1st of each month. Reading = mean of USGS 07010000 daily 08:00 gage height over the 28 days ending d-2
#   (USGS posts a day's value the next day; we skip one more day for safety). Need >= 20 readings.
#   Compare with the same 28 calendar days in every EARLIER year that has >= 20 readings (need >= 10 earlier years).
#   Percentile <= 25% -> "-" (low water: headwind); >= 75% -> "+" (high water: tailwind); else no call.
# Point-in-time: gage height is a direct reading, not a revised estimate; only data before the checkpoint is used and
#   the "normal" range uses only earlier years. Caveat: provisional USGS values can be edited before approval.
# Scoring = study rules v2 (same as scripts/single-stock-study.py): 1-month window checkpoint -> next 1st, adjusted
#   closes (Tiingo), vs SPY. Baseline = better of always-up / always-down vs SPY over the same months. Back-to-back calls
#   in the same direction merge into one independent event. PASS = event hit rate > event baseline AND the 95% Wilson
#   lower bound > event baseline. Need >= 20 independent events. (The 2 x sqrt(baseline) move bar is for count data;
#   river stage in feet is not a count, so the move bar here is the 25/75 percentile band above.)
import json,datetime as dt,bisect,math,sys,os,urllib.request
sys.path.insert(0,"scripts"); from prices_full import tiingo
D=dt.date.fromisoformat; iso=lambda d:d.isoformat()
RAW="data/usgs-stlouis-stage.json"
if not os.path.exists(RAW) or "--refresh" in sys.argv:
  u="https://waterservices.usgs.gov/nwis/dv/?format=json&sites=07010000&parameterCd=00065&startDT=1982-10-01&endDT=2026-10-21"
  j=json.load(urllib.request.urlopen(u,timeout=120)); v=j["value"]["timeSeries"][0]["values"][0]["value"]
  json.dump({"source":"USGS NWIS daily values, site 07010000 Mississippi River at St. Louis, MO, parameter 00065 gage height (ft), observation at 08:00","url":u,
    "fetched":dt.date.today().isoformat(),"points":[{"t":x["dateTime"][:10],"v":float(x["value"]),"q":x["qualifiers"][0]} for x in v if float(x["value"])>-900]},open(RAW,"w"))
ST={p["t"]:p["v"] for p in json.load(open(RAW))["points"]}
def win(end):
  x=[ST[iso(end-dt.timedelta(days=k))] for k in range(0,28) if iso(end-dt.timedelta(days=k)) in ST]
  return sum(x)/len(x) if len(x)>=20 else None
def river(d):
  end=d-dt.timedelta(days=2); cur=win(end)
  if cur is None: return None,None
  past=[]
  for k in range(1,60):
    try: e=end.replace(year=end.year-k)
    except ValueError: e=end.replace(year=end.year-k,day=28)
    w=win(e)
    if w is not None: past.append(w)
  if len(past)<10: return None,None
  pc=100*sum(1 for x in past if x<cur)/len(past)
  return ("-" if pc<=25 else "+" if pc>=75 else "0"), f"28 days to {iso(end)}: {cur:.1f} ft at St. Louis, percentile {pc:.0f} of {len(past)} earlier years (bars 25/75)"
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
SPY=tiingo("SPY"); SPYd=[x[0] for x in SPY]; TK="ADM"; px=tiingo(TK); dates=[x[0] for x in px]
rows=[]
for d in months(max(D(dates[0])+dt.timedelta(days=5),dt.date(1993,3,1)),dt.date(2026,9,1)):
  c,det=river(d)
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
res={"id":"2026-10-22-mississippi-adm","huntWeek":"2026-10-22","name":"Mississippi River level at St. Louis -> ADM","ticker":TK,
 "source":"USGS NWIS gage 07010000 (Mississippi River at St. Louis), daily gage height","sourceUrl":"https://waterdata.usgs.gov/monitoring-location/07010000/",
 "from":rows[0]["d"] if rows else None,"to":rows[-1]["d"] if rows else None,
 "rawCalls":n,"rawUp":sum(1 for r in rows if r["call"]=="+"),"rawDown":sum(1 for r in rows if r["call"]=="-"),
 "rawHitVsSpy":pct(hit,n),"rawCI":wilson(hit,n),"rawBaseline":pct(base,n),"rawBaselineSide":"always up" if beat>=n-beat else "always down","rawFlipped":pct(n-hit,n),
 "meanExcessPerCall":round(100*sum(s(r["call"])*r["x"] for r in rows)/n,2) if n else None,
 "events":ne,"eventHits":eh,"eventHitVsSpy":pct(eh,ne),"eventCI":ci,"eventBaseline":pct(ebase,ne),"eventBaselineSide":"always up" if eb>=ne-eb else "always down",
 "eventFlipped":pct(ne-eh,ne),"eventFlippedCI":wilson(ne-eh,ne),"enoughEvents":enough,"pass":passed,
 "samples":[{k:v for k,v in r.items() if k!="x"} for r in pick]}
print(json.dumps({k:v for k,v in res.items() if k!="samples"},indent=1))
for e in ev[-5:]: print(e)
if "--write" in sys.argv:
  P="public/data/weekly-hunt.json"; H=json.load(open(P)) if os.path.exists(P) else {"rules":"Weekly offbeat-signal hunt: one new idea a week, tested with study rules v2 (per-stock, baseline = better of always-up/always-down vs SPY over the same months, independent events, 20+ events, pass = hit rate above baseline and 95% Wilson lower bound above it too). Fails are logged here. A pass is not added to the site until Nick approves.","tests":[]}
  H["tests"]=[t for t in H["tests"] if t["id"]!=res["id"]]+[res]; H["updatedAt"]=dt.datetime.now(dt.timezone.utc).isoformat()
  json.dump(H,open(P,"w"),indent=1); print("wrote",P)
