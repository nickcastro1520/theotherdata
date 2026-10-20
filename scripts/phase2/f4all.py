import zipfile,csv,io,glob,json,datetime as dt
csv.field_size_limit(10**9)
sp={}
tj=json.load(open("idx/tickers.json"))
for r in tj["data"]: sp.setdefault(r[0],r[2].replace(".","-"))
# Holding-company reorg: Exxon Mobil Corp (CIK 34088) filed under its own CIK until the 2026 reorganization; its ticker now sits on the new holding CIK.
ALIAS={34088:"XOM"}
for c,t in ALIAS.items(): sp.setdefault(c,t)
ev={}
for z in sorted(glob.glob("f345/*.zip")):
  Z=zipfile.ZipFile(z)
  rd=lambda n: csv.DictReader(io.TextIOWrapper(Z.open(n),encoding="utf-8",errors="replace"),delimiter="\t",quoting=csv.QUOTE_NONE)
  sub={}
  for r in rd("SUBMISSION.tsv"):
    if r["DOCUMENT_TYPE"]!="4": continue
    try: c=int(r["ISSUERCIK"])
    except: continue
    if c in sp: sub[r["ACCESSION_NUMBER"]]=(sp[c],c,dt.datetime.strptime(r["FILING_DATE"],"%d-%b-%Y").date().isoformat())
  own={}
  for r in rd("REPORTINGOWNER.tsv"):
    if r["ACCESSION_NUMBER"] in sub: own.setdefault(r["ACCESSION_NUMBER"],set()).update(x.strip() for x in r["RPTOWNER_RELATIONSHIP"].split(","))
  buy={};tdd={}
  for r in rd("NONDERIV_TRANS.tsv"):
    a=r["ACCESSION_NUMBER"]
    if a in sub and r["TRANS_CODE"]=="P" and own.get(a,set())&{"Director","Officer"}:
      try: v=float(r["TRANS_SHARES"] or 0)*float(r["TRANS_PRICEPERSHARE"] or 0)
      except: v=0
      buy[a]=buy.get(a,0)+v
      try: td=dt.datetime.strptime(r["TRANS_DATE"],"%d-%b-%Y").date().isoformat()
      except: td=None
      if td: tdd[a]=min(tdd.get(a,td),td)
  for a,v in buy.items():
    tk,cik,fd=sub[a]; k=(tk,fd); e=ev.setdefault(k,{"ticker":tk,"filed":fd,"accessions":[],"value":0,"cik":cik}); e["accessions"].append(a); e["value"]+=v
    if tdd.get(a): e["tradeDate"]=min(e.get("tradeDate",tdd[a]),tdd[a])
  print(z,len(sub),len(buy),flush=True)
out=sorted(ev.values(),key=lambda e:(e["filed"],e["ticker"]))
json.dump(out,open("p2/form4_all_buys_v2.json","w"));print(len(out))
