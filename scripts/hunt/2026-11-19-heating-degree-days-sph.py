# Weekly offbeat-signal hunt, Nov 19 2026: NOAA heating degree days (how cold the winter month was) -> Suburban Propane (SPH).
# Idea (from this week's news: Suburban Propane's fiscal 2026 results, Nov 12 2026,
#   https://investor.suburbanpropane.com/2026-11-12-Suburban-Propane-Partners,-L-P-Announces-Full-Year-and-Fourth-Quarter-Results ,
#   which tied gallons sold to heating degree days: cold East helped, a record-warm West and a near-record-warm spring hurt;
#   UGI's AmeriGas results the same week also blamed warmer weather in the West for a 5% drop in gallons):
#   propane is mostly sold for home heating, so a much colder-than-normal winter month means more gallons for SPH and a
#   much warmer one means fewer. NOAA's Climate Prediction Center publishes a population-weighted national heating-degree-day
#   total and its departure from normal every month, around the 2nd of the next month.
# RULE, FIXED BEFORE THE FIRST SCORING (not retuned):
#   heating-season data months only: Nov, Dec, Jan, Feb, Mar.
#   Reading = CPC Heating Degree Day Monthly Summary, "UNITED STATES" population-weighted line: month total (HDD) and
#   departure from normal (dev). normal = HDD - dev (CPC's own normal as printed in that report). First-published copy only
#   (if the archive has two copies of a month, the earliest-posted one is used).
#   Minimum-size rule (2 x sqrt(baseline)): bar = 2*sqrt(normal).
#     dev >= +bar  -> "+" (much colder than normal: more heating demand, tailwind)
#     dev <= -bar  -> "-" (much warmer than normal: less heating demand, headwind)
#     otherwise no call.
#   Decision date d = the 5th of the following month, or the file's posted date (+1 day) if later and the file was posted
#   within 60 days of month end (later posts are archive re-uploads, not first release). So only data published before d is used.
#   Window = d -> same day one month later (first trading day on/after each), adjusted closes (Tiingo), SPH vs SPY.
# Scoring = study rules v2 (same as scripts/hunt/2026-11-12-nrc-callaway-aee.py): baseline = better of always-up / always-down
#   vs SPY over the same months. Calls for back-to-back data months in the same direction merge into one independent event.
#   PASS = event hit rate > event baseline AND the 95% Wilson lower bound > event baseline. Need >= 20 independent events.
#   The flipped rule (cold = headwind) is reported for information only.
# Point-in-time caveat: files from 1997-2008 carry archive upload dates (2000-2008), not original posting times; their values are
#   CPC's as-archived numbers. From Nov 2008 on, files are posted around the 2nd of the next month.
# Raw data: data/cpc-hdd-us-monthly.json (built from
#   https://ftp.cpc.ncep.noaa.gov/htdocs/products/analysis_monitoring/cdus/degree_days/archives/Heating%20degree%20Days/monthly%20states/<YEAR>/<Mon YEAR>.txt )
import json,datetime as dt,bisect,math,sys
sys.path.insert(0,"scripts"); from prices_full import tiingo
D=dt.date.fromisoformat; iso=lambda d:d.isoformat()
PTS=json.load(open("data/cpc-hdd-us-monthly.json"))["points"]
def addm(y,m,k=1):
  m+=k; y+=(m-1)//12; m=(m-1)%12+1; return y,m
cands=[]
for p in PTS:
  y,m=map(int,p["month"].split("-"))
  if m not in (11,12,1,2,3): continue
  ny,nm=addm(y,m); d=dt.date(ny,nm,5); end=dt.date(ny,nm,1)
  posted=D(p["posted"][:10])+dt.timedelta(days=1)
  if posted>d and (posted-end).days<=60: d=posted
  bar=2*math.sqrt(p["normal"]); dev=p["devFromNormal"]
  call="+" if dev>=bar else "-" if dev<=-bar else "0"
  cands.append({"ym":(y,m),"d":d,"call":call,"detail":f"US heating degree days {p['month']}: {p['hdd']} vs normal {p['normal']} ({dev:+d}, bar {bar:.0f}; CPC, posted {p['posted'][:10]})"})
def wilson(k,n,z=1.96):
  if not n: return None
  p=k/n; c=(p+z*z/(2*n))/(1+z*z/n); h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n); return [round(100*(c-h),1),round(100*(c+h),1)]
pct=lambda k,n: round(100*k/n,1) if n else None
def ret(px,dates,a,b):
  i=bisect.bisect_left(dates,a); j=bisect.bisect_left(dates,b)
  if i>=len(dates) or j>=len(dates): return None
  return dates[i],dates[j],px[j][1]/px[i][1]-1
SPY=tiingo("SPY"); SPYd=[x[0] for x in SPY]; TK="SPH"; px=tiingo(TK); dates=[x[0] for x in px]
rows=[]
for c in cands:
  d=c["d"]
  if c["call"] not in("+","-") or d<D(dates[0])+dt.timedelta(days=5): continue
  ny,nm=addm(d.year,d.month); nx=dt.date(ny,nm,min(d.day,28))
  a=ret(px,dates,iso(d),iso(nx)); m=ret(SPY,SPYd,iso(d),iso(nx))
  if not a or not m or a[:2]!=m[:2]: continue
  rows.append({"d":iso(d),"ym":c["ym"],"call":c["call"],"detail":c["detail"],"from":a[0],"to":a[1],"stock":round(100*a[2],2),"spy":round(100*m[2],2),"x":a[2]-m[2]})
s=lambda c:1 if c=="+" else -1
n=len(rows); hit=sum(1 for r in rows if s(r["call"])*r["x"]>0); beat=sum(1 for r in rows if r["x"]>0); base=max(beat,n-beat)
ev=[]
for r in rows:
  if ev and ev[-1]["call"]==r["call"] and addm(*ev[-1]["lastym"])==r["ym"]: ev[-1]["x"]+=r["x"]; ev[-1]["last"]=r["d"]; ev[-1]["lastym"]=r["ym"]; ev[-1]["months"]+=1
  else: ev.append({"call":r["call"],"first":r["d"],"last":r["d"],"lastym":r["ym"],"x":r["x"],"months":1})
ne=len(ev); eh=sum(1 for e in ev if s(e["call"])*e["x"]>0); eb=sum(1 for e in ev if e["x"]>0); ebase=max(eb,ne-eb)
ci=wilson(eh,ne); enough=ne>=20; passed=bool(enough and eh>ebase and ci and ci[0]>pct(ebase,ne))
for r in rows: r["right"]=s(r["call"])*r["x"]>0; r["excess"]=round(100*r["x"],2)
by=lambda c:[e for e in ev if e["call"]==c]
side={c:{"events":len(by(c)),"hits":sum(1 for e in by(c) if s(c)*e["x"]>0)} for c in "+-"}
pick=[rows[i] for i in sorted({0,n//2,n-1})] if n else []
res={"id":"2026-11-19-heating-degree-days-sph","huntWeek":"2026-11-19","name":"U.S. heating degree days (NOAA CPC) -> Suburban Propane","ticker":TK,
 "source":"NOAA Climate Prediction Center monthly heating degree days, population-weighted U.S., departure from normal (Nov-Mar)","sourceUrl":"https://ftp.cpc.ncep.noaa.gov/htdocs/products/analysis_monitoring/cdus/degree_days/archives/Heating%20degree%20Days/monthly%20states/",
 "from":rows[0]["d"] if rows else None,"to":rows[-1]["d"] if rows else None,
 "rawCalls":n,"rawUp":sum(1 for r in rows if r["call"]=="+"),"rawDown":sum(1 for r in rows if r["call"]=="-"),
 "rawHitVsSpy":pct(hit,n),"rawCI":wilson(hit,n),"rawBaseline":pct(base,n),"rawBaselineSide":"always up" if beat>=n-beat else "always down","rawFlipped":pct(n-hit,n),
 "meanExcessPerCall":round(100*sum(s(r["call"])*r["x"] for r in rows)/n,2) if n else None,
 "events":ne,"eventHits":eh,"eventHitVsSpy":pct(eh,ne),"eventCI":ci,"eventBaseline":pct(ebase,ne),"eventBaselineSide":"always up" if eb>=ne-eb else "always down",
 "eventFlipped":pct(ne-eh,ne),"eventFlippedCI":wilson(ne-eh,ne),"enoughEvents":enough,"pass":passed,"bySide":side,
 "samples":[{k:v for k,v in r.items() if k not in("x","ym")} for r in pick]}
print(json.dumps({k:v for k,v in res.items() if k!="samples"},indent=1))
for e in ev: print(e["first"],e["last"],e["call"],e["months"],round(100*e["x"],1))
if "--write" in sys.argv:
  P="public/data/weekly-hunt.json"; H=json.load(open(P))
  H["tests"]=[t for t in H["tests"] if t["id"]!=res["id"]]+[res]; H["updatedAt"]=dt.datetime.now(dt.timezone.utc).isoformat()
  json.dump(H,open(P,"w"),indent=1); print("wrote",P)
