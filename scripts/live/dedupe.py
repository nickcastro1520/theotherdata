"""Drop filing entries whose SEC accession number is already logged or repeated within this run (main/backup run, amended notices).
The first occurrence wins. Gap entries pass through untouched."""
def dedupe_new(entries, logged):
    seen, out = set(logged), []
    for e in entries:
        if e.get("type", "filing") == "filing":
            if e["accession"] in seen: continue
            seen.add(e["accession"])
        out.append(e)
    return out
