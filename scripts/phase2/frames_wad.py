# Fallback share counts for companies with no single dei cover-page share count (multi-class, e.g. Alphabet, Berkshire):
# us-gaap WeightedAverageNumberOfDilutedSharesOutstanding quarterly frames. Resumable.
import requests,os,time
S=requests.Session();S.headers["User-Agent"]="theotherdata.com research nickcastro1520@gmail.com"
for y in range(2010,2027):
  for q in range(1,5):
    p=f"frames_wad/CY{y}Q{q}.json"
    if os.path.exists(p): continue
    r=S.get(f"https://data.sec.gov/api/xbrl/frames/us-gaap/WeightedAverageNumberOfDilutedSharesOutstanding/shares/CY{y}Q{q}.json",timeout=60)
    if r.status_code==200: open(p,"w").write(r.text)
    time.sleep(0.3)
print("done")
