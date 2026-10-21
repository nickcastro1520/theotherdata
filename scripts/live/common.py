"""Shared helpers for the live late-filing test (stdlib only, so it runs in GitHub Actions without installs)."""
import json, time, urllib.request, urllib.error, hashlib, datetime as dt, os, gzip
SEC_UA = "theotherdata.com research nickcastro1520@gmail.com"
LOG = "public/data/live-late-filings.jsonl"
SCORES = "public/data/live-late-filings-scores.jsonl"
SUMMARY = "public/data/live-late-filings-summary.json"
DECILES = "public/data/live/deciles"
H = 63  # trading days, same as the backtest
_last = [0.0]

def http(url, sec=False, tries=4, timeout=60):
    for k in range(tries):
        if sec:  # SEC fair access: <= ~7 requests/second
            w = _last[0] + 0.15 - time.time()
            if w > 0: time.sleep(w)
            _last[0] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": SEC_UA if sec else "Mozilla/5.0", "Accept-Encoding": "gzip"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                return b
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(5 * (k + 1) if e.code in (429, 503) else 2)
        except Exception:
            time.sleep(3 * (k + 1))
    return None

def yahoo_daily(t, start="2026-01-01"):
    """Adjusted daily closes [[date, close], ...] (same series type as the backtest)."""
    p1 = int(dt.datetime.fromisoformat(start).replace(tzinfo=dt.timezone.utc).timestamp())
    b = http(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?period1={p1}&period2={int(time.time()) + 86400}&interval=1d")
    if not b: return None
    try:
        j = json.loads(b)["chart"]["result"][0]; ts = j.get("timestamp") or []
        ac = j["indicators"]["adjclose"][0]["adjclose"] if ts else []
        return [[dt.datetime.fromtimestamp(a, dt.timezone.utc).date().isoformat(), c] for a, c in zip(ts, ac) if c]
    except Exception:
        return None

def canon(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def entry_hash(prev, body):
    """sha256 over the previous line's hash + this entry's canonical JSON (without its own hash): a hash chain."""
    return hashlib.sha256((prev + canon(body)).encode()).hexdigest()

def read_chain(path):
    """Read an append-only JSONL file and verify every line's hash chain. Raises on any edit, deletion or reorder."""
    rows, prev = [], "genesis"
    if not os.path.exists(path): return rows, prev
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if not line.strip(): raise SystemExit(f"{path}: blank line {n}")
            o = json.loads(line); h = o.pop("hash", None)
            if h != entry_hash(prev, o): raise SystemExit(f"{path}: hash mismatch at line {n}; the log was edited")
            o["hash"] = h; rows.append(o); prev = h
    return rows, prev

def append(path, prev, bodies):
    """Append only. Never rewrites existing lines."""
    with open(path, "a", encoding="utf-8") as f:
        for b in bodies:
            h = entry_hash(prev, b); f.write(canon(dict(b, hash=h)) + "\n"); prev = h
    return prev
