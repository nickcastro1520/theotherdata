# Per-stock study under the Oct 20 2026 rules (Nick):
#  1) each signal is judged on its own stock, not on the site-wide +1 point bar;
#  2) baseline = the better of "always up" and "always down" vs SPY over the SAME months the signal made calls;
#  3) raw monthly calls AND independent events (back-to-back monthly calls in the same direction, e.g. one winter or one
#     crisis, count as one event, scored on the summed excess return over its months);
#  4) full point-in-time history (each signal starts when both its data and the stock's prices exist).
# Signal rules are the ones fixed before the first scoring (see scripts/model-study.mjs); nothing was retuned.
# PASS = independent-event hit rate vs SPY beats the event baseline AND the 95% Wilson lower bound is above that baseline.
import json,datetime as dt,bisect,math,sys
sys.path.insert(0,"scripts"); from prices_full import tiingo
D=lambda s: dt.date.fromisoformat(s)
def wilson(k,n,z=1.96):
  if not n: return None
  p=k/n; c=(p+z*z/(2*n))/(1+z*z/n); h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n); return [round(100*(c-h),1),round(100*(c+h),1)]
pct=lambda k,n: round(100*k/n,1) if n else None
SPY=tiingo("SPY"); SPYd=[x[0] for x in SPY]
def ret(px,dates,a,b):
  i=bisect.bisect_left(dates,a); j=bisect.bisect_left(dates,b)
  if i>=len(dates) or j>=len(dates): return None
  return dates[i],dates[j],px[j][1]/px[i][1]-1
def months(a,b):
  y,m=a.year,a.month
  while (y,m)<=(b.year,b.month):
    yield dt.date(y,m,1); m+=1
    if m==13: y,m=y+1,1
iso=lambda d:d.isoformat()
prev=lambda d:d-dt.timedelta(days=1)
# ---- readers: return (call in '+','-','0' or None, detail) using only data before checkpoint d ----
J=lambda f: json.load(open(f"data/{f}"))
BOX=J("boxoffice-weekly.json")["points"]; BT=[p["t"] for p in BOX]
def box(d):
  cut=iso(d-dt.timedelta(days=4)); i=bisect.bisect_right(BT,cut)
  if i<60: return None,None
  cur=BOX[i-4:i]; ly=D(cur[-1]["t"])-dt.timedelta(days=364); k=bisect.bisect_right(BT,iso(ly)); prv=BOX[k-4:k]
  if len(prv)<4: return None,None
  a=sum(p["v"] for p in cur)/4; b=sum(p["v"] for p in prv)/4; r=a/b
  return ("+" if r>=1.1 else "-" if r<=0.9 else "0"), f"last 4 weeks to {cur[-1]['t']}: ${a:.1f}M/wk vs ${b:.1f}M a year earlier ({r:.2f}x; bars 1.10x/0.90x)"
SN=J("snotel-vail-basket.json")["points"]; ST=[p["t"] for p in SN]
def snotel(d):
  if not (d.month>=11 or d.month<=4): return None,None
  i=bisect.bisect_right(ST,iso(prev(d)))
  if not i: return None,None
  p=SN[i-1]
  if p["m"]<1 or (d-D(p["t"])).days>7: return None,None
  r=p["v"]/p["m"]; return ("+" if r>=1.1 else "-" if r<=0.9 else "0"), f"{p['t']}: {p['v']} in SWE vs {p['m']} in median ({r:.0%}; bars 110%/90%)"
GH={p["t"]:p["v"] for p in J("ghcn-snow-cities.json")["points"]}; G0=min(GH)
def std(end):
  y=end.year-(1 if end.month<10 else 0); s=dt.date(y,10,1); t=0
  while s<=end: t+=GH.get(iso(s),0); s+=dt.timedelta(days=1)
  return t
def ghcn(d):
  if not (d.month>=11 or d.month<=3): return None,None
  end=prev(d); cur=std(end); past=[]
  for k in range(1,11):
    try: e=end.replace(year=end.year-k)
    except ValueError: e=end.replace(year=end.year-k,day=28)
    if iso(e)>="%s"%iso(D(G0)+dt.timedelta(days=1)) and e.month in(10,11,12,1,2,3): past.append(std(e))
  if len(past)<5: return None,None
  a=sum(past)/len(past)
  if a<=0: return None,None
  r=cur/a; return ("+" if r>=1.2 else "-" if r<=0.8 else "0"), f"season to {iso(end)}: {cur:.0f} mm vs {a:.0f} mm avg of {len(past)} earlier seasons ({r:.0%}; bars 120%/80%)"
HP=J("hpai-flocks.json")["events"]
def hpai(d):
  if iso(d)>"2025-06-12" or iso(d)<"2022-03-01": return None,None
  egg=[e for e in HP if "Table Egg" in e["type"]]
  b28=sum(e["birds"] for e in egg if d-dt.timedelta(days=28)<=D(e["t"])<d); n90=sum(1 for e in egg if d-dt.timedelta(days=90)<=D(e["t"])<d)
  return ("+" if b28>=1e6 else "-" if n90==0 else "0"), f"{b28:,} egg-laying birds in 28 days; {n90} egg flocks in 90 days (good at >=1M; bad at 0 flocks)"
COF=J("cattle-on-feed.json")["points"]; CT=[p["t"] for p in COF]
def cof(d):
  i=bisect.bisect_left(CT,iso(d))
  if not i: return None,None
  p=COF[i-1]
  if (d-D(p["t"])).days>45: return None,None
  return ("+" if p["yoy"]>=2 else "-" if p["yoy"]<=-2 else "0"), f"released {p['t']}: {p['head']}M head on {p['asOf']}, {p['yoy']:+.0f}% vs a year earlier (bars +/-2%)"
OE=[e for e in J("oe417-events.json")["events"] if e["t"]>="2008-01-01"]
def oe(d):
  if iso(d)>"2026-01-01" or iso(d)<"2009-01-01": return None,None
  s=lambda end: sum(e["customers"] or 0 for e in OE if end-dt.timedelta(days=90)<=D(e["t"])<end)
  a=s(d); b=s(d-dt.timedelta(days=365))
  if not b: return None,None
  r=a/b; return ("+" if r>=1.5 else "-" if r<=0.67 else "0"), f"{a:,} customers affected in 90 days vs {b:,} a year earlier ({r:.2f}x; bars 1.5x/0.67x)"
SZ={p["t"]:p["v"] for p in J("portwatch-suez.json")["points"]}
def suez(d):
  def av(end):
    x=[SZ[iso(end-dt.timedelta(days=k))] for k in range(1,29) if iso(end-dt.timedelta(days=k)) in SZ]
    return sum(x)/len(x) if len(x)>=20 else None
  a=av(d); b=av(d-dt.timedelta(days=364))
  if not a or not b: return None,None
  r=a/b; return ("+" if r<=0.85 else "-" if r>=1.15 else "0"), f"{a:.1f} transits/day vs {b:.1f} a year earlier ({r:.2f}x; good at <=0.85x, bad at >=1.15x)"
SIGS=[("US box office -> Disney","DIS",box,"Box Office Mojo weekly domestic gross"),("Ski-country snowpack -> Vail Resorts","MTN",snotel,"USDA NRCS SNOTEL"),
 ("Midwest/Northeast snowfall -> Compass Minerals","CMP",ghcn,"NOAA GHCN-Daily"),("Bird flu in egg flocks -> Cal-Maine","CALM",hpai,"USDA APHIS via CDC"),
 ("Cattle on Feed -> Tyson","TSN",cof,"USDA NASS Cattle on Feed"),("Major power outages -> Generac","GNRC",oe,"DOE OE-417 (published after year end)"),
 ("Suez Canal transits -> ZIM","ZIM",suez,"IMF PortWatch")]
end=dt.date(2026,9,1); out=[]
for name,tk,fn,src in SIGS:
  px=tiingo(tk); dates=[x[0] for x in px]; rows=[]
  for d in months(max(D(dates[0])+dt.timedelta(days=5),dt.date(1993,3,1)),end):
    c,det=fn(d)
    if c not in("+","-"): continue
    nx=(d.replace(day=28)+dt.timedelta(days=4)).replace(day=1)
    a=ret(px,dates,iso(d),iso(nx)); m=ret(SPY,SPYd,iso(d),iso(nx))
    if not a or not m or a[:2]!=m[:2]: continue
    rows.append({"d":iso(d),"call":c,"detail":det,"from":a[0],"to":a[1],"stock":round(100*a[2],2),"spy":round(100*m[2],2),"x":a[2]-m[2]})
  s=lambda c:1 if c=="+" else -1
  n=len(rows); hit=sum(1 for r in rows if s(r["call"])*r["x"]>0); beat=sum(1 for r in rows if r["x"]>0)
  base=max(beat,n-beat)
  # independent events
  ev=[]
  for r in rows:
    if ev and ev[-1]["call"]==r["call"] and (D(r["d"])-D(ev[-1]["last"])).days<=31: ev[-1]["x"]+=r["x"]; ev[-1]["last"]=r["d"]; ev[-1]["months"]+=1
    else: ev.append({"call":r["call"],"first":r["d"],"last":r["d"],"x":r["x"],"months":1})
  ne=len(ev); eh=sum(1 for e in ev if s(e["call"])*e["x"]>0); eb=sum(1 for e in ev if e["x"]>0); ebase=max(eb,ne-eb)
  ci=wilson(eh,ne); passed=bool(ne and eh>ebase and ci and ci[0]>pct(ebase,ne))
  for r in rows: r["right"]=s(r["call"])*r["x"]>0; r["excess"]=round(100*r["x"],2)
  pick=[rows[i] for i in sorted({0,n//2,n-1})] if n else []
  res={"name":name,"ticker":tk,"source":src,"from":rows[0]["d"] if rows else None,"to":rows[-1]["d"] if rows else None,
   "rawCalls":n,"rawHitVsSpy":pct(hit,n),"rawCI":wilson(hit,n),"rawBaseline":pct(base,n),"rawFlipped":pct(n-hit,n),
   "meanExcessPerCall":round(100*sum(s(r["call"])*r["x"] for r in rows)/n,2) if n else None,
   "events":ne,"eventHitVsSpy":pct(eh,ne),"eventCI":ci,"eventBaseline":pct(ebase,ne),"eventFlipped":pct(ne-eh,ne),"eventFlippedCI":wilson(ne-eh,ne),
   "pass":passed,"samples":[{k:v for k,v in r.items() if k!="x"} for r in pick]}
  out.append(res)
  print(json.dumps({k:v for k,v in res.items() if k!="samples"}))
json.dump({"generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"rules":"Per-stock test. Baseline = better of always-up and always-down vs SPY over the same months the signal made calls. Monthly calls in a row in the same direction count as one independent event (summed excess return). Pass = event hit rate above the event baseline with the 95% Wilson lower bound above it too. Window: checkpoint (1st of month) to the 1st of the next month, adjusted closes (Tiingo), vs SPY.","signals":out},open("public/data/single-stock-study.json","w"),indent=1)
