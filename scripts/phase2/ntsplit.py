# 3-month late-filing size-matched calendar-time result split into 2012-2020 and 2021-2026 (by filing date).
import json
exec(open("control.py").read().split("nt=json.load")[0])
nt=json.load(open("/workspace/tod-cache/nt_events.json")); res={}
res["2012-2020"]=run("nt train",[e for e in nt if e["filed"]<"2021-01-01"],63)
res["2021-2026"]=run("nt test",[e for e in nt if e["filed"]>="2021-01-01"],63)
json.dump(res,open("ntsplit_phase2.json","w"),default=lambda o:o.item())
