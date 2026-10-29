# Weekly offbeat-signal hunt, Oct 29 2026: CDC flu-like illness share of doctor visits -> QDEL (QuidelOrtho, maker of rapid flu tests).
# Idea (from this week's news: Walgreens cold/flu purchases +21.7% y/y and its Flu Index "four weeks ahead"; UBS on early flu
#   lifting Reckitt/Haleon; Haleon -15% on Oct 29 citing weak/delayed flu demand): a heavy flu season means more people at the
#   doctor and more rapid flu tests sold; a mild season means fewer. QuidelOrtho's Sofia/QuickVue flu tests swing with the season.
# RULE, FIXED BEFORE THE FIRST SCORING (not retuned):
#   checkpoints d = 1st of Nov, Dec, Jan, Feb, Mar, Apr (flu season only). Reading = mean national weighted ILI % (CDC ILINet)
#   of the latest 2 epiweeks as FIRST RELEASED (Delphi Epidata fluview lag=1 issue) with release_date before d.
#   Compare with the same 2 week-of-year numbers in every EARLIER season (final values; need >= 10 earlier seasons).
#   Percentile <= 25% -> "-" (mild flu: headwind); >= 75% -> "+" (heavy flu: tailwind); else no call.
# Point-in-time: the current reading is the first-release value, and it is used only after its release date. First-release
#   history exists from epiweek 2009-01, so the test starts Nov 2009. Earlier seasons are used only as the "normal" range.
# Scoring = study rules v2 (same as scripts/hunt/2026-10-22-mississippi-adm.py): 1-month window checkpoint -> next 1st,
#   adjusted closes (Tiingo), vs SPY. Baseline = better of always-up / always-down vs SPY over the same months. Back-to-back
#   calls in the same direction merge into one independent event. PASS = event hit rate > event baseline AND the 95% Wilson
#   lower bound > event baseline. Need >= 20 independent events. (The 2 x sqrt(baseline) move bar is for count data; ILI % is a
#   share, so the move bar here is the 25/75 percentile band.)
import json,datetime as dt,bisect,math,sys,os,urllib.request
sys.path.insert(0,"scripts"); from prices_full import tiingo
D=dt.date.fromisoformat; iso=lambda d:d.isoformat()
RAW="data/cdc-ilinet-national.json"
if not os.path.exists(RAW) or "--refresh" in sys.argv:
  g=lambda u: json.load(urllib.request.urlopen(u,timeout=120))
  uf="https://api.delphi.cmu.edu/epidata/fluview/?regions=nat&epiweeks=199740-202643"
  u1="https://api.delphi.cmu.edu/epidata/fluview/?regions=nat&epiweeks=200901-202643&lag=1"
  F=g(uf)["epidata"]; L=g(u1)["epidata"]
  json.dump({"source":"CDC ILINet national weighted ILI % via Delphi Epidata fluview (final values, and first-release lag=1 values with release dates)",
    "urls":[uf,u1],"fetched":dt.date.today().isoformat(),
    "final":[{"w":x["epiweek"],"v":x["wili"]} for x in F if x["wili"] is not None],
    "first":[{"w":x["epiweek"],"rel":x["release_date"],"v":x["wili"]} for x in L if x["wili"] is not None]},open(RAW,"w"))
R=json.load(open(RAW)); FIN={x["w"]:x["v"] for x in R["final"]}; FIRST=sorted(R["first"],key=lambda x:x["w"])
wk=lambda w:min(w%100,52)
def flu(d):
  av=[x for x in FIRST if x["rel"]<iso(d)][-2:]
  if len(av)<2 or av[1]["w"]-av[0]["w"] not in(1,49,50): return None,None   # consecutive weeks (incl. year rollover)
  cur=(av[0]["v"]+av[1]["v"])/2; ws=[wk(x["w"]) for x in av]; yr=av[1]["w"]//100
  past=[]
  for k in range(1,40):
    vals=[]
    for x in av:
      y=x["w"]//100-k; c=[v for w,v in FIN.items() if w//100==y and wk(w)==wk(x["w"])]
      if c: vals.append(c[0])
    if len(vals)==2: past.append(sum(vals)/2)
  if len(past)<10: return None,None
  pc=100*sum(1 for x in past if x<cur)/len(past)
  return ("-" if pc<=25 else "+" if pc>=75 else "0"), f"weeks {av[0]['w']}-{av[1]['w']} (released by {av[1]['rel']}): {cur:.2f}% of doctor visits flu-like, percentile {pc:.0f} of {len(past)} earlier seasons (bars 25/75)"
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
SPY=tiingo("SPY"); SPYd=[x[0] for x in SPY]; TK="QDEL"; px=tiingo(TK); dates=[x[0] for x in px]
rows=[]
for d in months(max(D(dates[0])+dt.timedelta(days=5),dt.date(2009,11,1)),dt.date(2026,9,1)):
  if d.month not in(11,12,1,2,3,4): continue
  c,det=flu(d)
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
res={"id":"2026-10-29-flu-qdel","huntWeek":"2026-10-29","name":"Flu-like doctor visits (CDC ILINet) -> QuidelOrtho","ticker":TK,
 "source":"CDC ILINet national weighted % of doctor visits for flu-like illness, first-release values via Delphi Epidata","sourceUrl":"https://www.cdc.gov/fluview/",
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
