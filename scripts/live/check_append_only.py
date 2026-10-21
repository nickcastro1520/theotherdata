"""CI guard: the live late-filing log and score files are append-only.
Fails if any line that existed at the base commit was changed, removed or reordered, or if any hash chain is broken.
  python3 scripts/live/check_append_only.py <base-commit>
"""
import subprocess, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from common import read_chain, LOG, SCORES
base = sys.argv[1] if len(sys.argv) > 1 else "HEAD~1"
bad = False
for p in (LOG, SCORES):
    read_chain(p)  # raises on a broken chain
    try: old = subprocess.run(["git", "show", f"{base}:{p}"], capture_output=True, check=True).stdout.decode()
    except subprocess.CalledProcessError: old = ""
    new = open(p, encoding="utf-8").read() if os.path.exists(p) else ""
    if not new.startswith(old):
        print(f"FAIL: {p} changed existing lines since {base}"); bad = True
    else:
        print(f"ok: {p} ({old.count(chr(10))} old lines kept, {new.count(chr(10)) - old.count(chr(10))} appended)")
sys.exit(1 if bad else 0)
