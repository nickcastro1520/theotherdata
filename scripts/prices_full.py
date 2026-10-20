# Full daily adjusted closes from Tiingo, cached in /workspace/tod-cache/full/<T>.json (key from env TIINGO_API_KEY).
import os,json,requests,sys
C="/workspace/tod-cache/full"
def tiingo(t):
  p=f"{C}/{t}.json"
  if os.path.exists(p): return json.load(open(p))
  r=requests.get(f"https://api.tiingo.com/tiingo/daily/{t}/prices",params={"startDate":"1985-01-01","token":os.environ["TIINGO_API_KEY"]},timeout=120).json()
  d=[[x["date"][:10],x["adjClose"]] for x in r]; json.dump(d,open(p,"w")); return d
if __name__=="__main__":
  for t in sys.argv[1:]: d=tiingo(t); print(t,len(d),d[0][0])
