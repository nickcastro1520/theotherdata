# Weekly offbeat-signal hunt, Nov 12 2026: NRC daily reactor power at Callaway -> Ameren (AEE).
# Idea (from this week's news: ORTEX alt-data note, Nov 12 2026, flagging Ameren's reactor output at an extreme reading
#   on Nov 10): Ameren Missouri owns Callaway, its only nuclear plant (~1.2 GW, a big share of its cheap generation).
#   When Callaway is offline (refueling or a forced outage) Ameren must make or buy replacement power and pay outage
#   costs; when it runs flat out, that is cheap baseload. So a month with a long outage is a possible headwind and a
#   month of normal full-power running a possible tailwind.
# RULE, FIXED BEFORE THE FIRST SCORING (not retuned):
#   checkpoint d = 1st of each month. Reading = Callaway's daily % power from the NRC Power Reactor Status Report for
#   every day of the prior calendar month (need >= 25 daily reports). Only reports dated before d are used.
#   offline days = days at 0% power. If offline days >= 7 -> "-" (outage month: headwind).
#   Else if the month's average power >= 95% -> "+" (running normally: tailwind). Else no call.
# Point-in-time: NRC status reports are same-day operating reports, published daily, not revised estimates.
#   (The 2 x sqrt(baseline) move bar is for count data compared with a baseline count; here the normal state is 0 offline
#   days, so the bar is the fixed 7-day outage cut above, set before scoring.)
# Scoring = study rules v2 (same as scripts/hunt/2026-11-05-henryhub-cf.py): 1-month window checkpoint -> next 1st,
#   adjusted closes (Tiingo), vs SPY. Baseline = better of always-up / always-down vs SPY over the same months. Back-to-back
#   calls in the same direction merge into one independent event. PASS = event hit rate > event baseline AND the 95% Wilson
#   lower bound > event baseline. Need >= 20 independent events.
# Raw data: data/nrc-callaway-daily.json, built from the yearly files at
#   https://www.nrc.gov/documents-reports/document-collections/events-reports-associated-with/power-reactor-status-reports/<YEAR>/<YEAR>powerstatus.txt
import json,datetime as dt,bisect,math,sys
sys.path.insert(0,"scripts"); from prices_full import tiingo
D=dt.date.fromisoformat; iso=lambda d:d.isoformat()
PTS=json.load(open("data/nrc-callaway-daily.json"))["points"]
by_ym={}
for p in PTS:
  d=D(p["t"]); by_ym.setdefault((d.year,d.month),[]).append(p["v"])
def reading(d):
  y,m=(d.year-1,12) if d.month==1 else (d.year,d.month-1)
  xs=by_ym.get((y,m))
  if not xs or len(xs)<25: return None,None
  off=sum(1 for v in xs if v==0); avg=sum(xs)/len(xs)
  call="-" if off>=7 else "+" if avg>=95 else "0"
  return call,f"Callaway {y}-{m:02d}: {off} days offline, average power {avg:.0f}% ({len(xs)} NRC daily reports)"
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
SPY=tiingo("SPY"); SPYd=[x[0] for x in SPY]; TK="AEE"; px=tiingo(TK); dates=[x[0] for x in px]
rows=[]
for d in months(max(D(dates[0])+dt.timedelta(days=5),dt.date(1999,2,1)),dt.date(2026,10,1)):
  c,det=reading(d)
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
by=lambda c:[e for e in ev if e["call"]==c]
side={c:{"events":len(by(c)),"hits":sum(1 for e in by(c) if s(c)*e["x"]>0)} for c in "+-"}
pick=[rows[i] for i in sorted({0,n//2,n-1})] if n else []
res={"id":"2026-11-12-nrc-callaway-aee","huntWeek":"2026-11-12","name":"Callaway nuclear plant output (NRC daily reports) -> Ameren","ticker":TK,
 "source":"NRC Power Reactor Status Reports, daily % power for Callaway","sourceUrl":"https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/index",
 "from":rows[0]["d"] if rows else None,"to":rows[-1]["d"] if rows else None,
 "rawCalls":n,"rawUp":sum(1 for r in rows if r["call"]=="+"),"rawDown":sum(1 for r in rows if r["call"]=="-"),
 "rawHitVsSpy":pct(hit,n),"rawCI":wilson(hit,n),"rawBaseline":pct(base,n),"rawBaselineSide":"always up" if beat>=n-beat else "always down","rawFlipped":pct(n-hit,n),
 "meanExcessPerCall":round(100*sum(s(r["call"])*r["x"] for r in rows)/n,2) if n else None,
 "events":ne,"eventHits":eh,"eventHitVsSpy":pct(eh,ne),"eventCI":ci,"eventBaseline":pct(ebase,ne),"eventBaselineSide":"always up" if eb>=ne-eb else "always down",
 "eventFlipped":pct(ne-eh,ne),"eventFlippedCI":wilson(ne-eh,ne),"enoughEvents":enough,"pass":passed,"bySide":side,
 "samples":[{k:v for k,v in r.items() if k!="x"} for r in pick]}
print(json.dumps({k:v for k,v in res.items() if k!="samples"},indent=1))
for e in ev: print(e["first"],e["last"],e["call"],e["months"],round(100*e["x"],1))
if "--write" in sys.argv:
  P="public/data/weekly-hunt.json"; H=json.load(open(P))
  H["tests"]=[t for t in H["tests"] if t["id"]!=res["id"]]+[res]; H["updatedAt"]=dt.datetime.now(dt.timezone.utc).isoformat()
  json.dump(H,open(P,"w"),indent=1); print("wrote",P)
