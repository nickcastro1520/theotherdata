import json,sys; sys.path.insert(0,"."); from lib import *
ev=json.load(open("/workspace/tod-cache/nt_events.json"))
out={}
for mode in ("none","oldfilter","cap"):
  for H in (21,63):
    for b in BENCH:
      r=event_study(ev,-1,H,mode,b); out[f"{mode}|{H}|{b}"]=r
      I=r["independent"]; print(mode,H,b,r["raw"]["n"],I["n"],I["hit"],I["ci"],r["baseline"],I["meanExcess"],I["meanCI"],I["flippedHit"],r["beatsBaseline"],flush=True)
      json.dump(out,open("nt_phase2.json","w"))
out["calendar"]=calendar_time(ev); print(out["calendar"])
json.dump(out,open("nt_phase2.json","w"))
