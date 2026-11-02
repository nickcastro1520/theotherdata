import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const py = (code) => JSON.parse(execFileSync("python3", ["-c", "import sys,json; sys.path.insert(0,'scripts/live'); from dedupe import dedupe_new\n" + code]).toString());
test("live log dedupe: drops accessions repeated in a run or already logged, keeps gaps and order", () => {
  const out = py(`print(json.dumps(dedupe_new([{"type":"gap","date":"2026-10-28"},{"type":"filing","accession":"A"},{"type":"filing","accession":"B"},{"type":"filing","accession":"A"},{"type":"filing","accession":"OLD"}], {"OLD"})))`);
  assert.deepEqual(out.map(e => e.accession ?? e.date), ["2026-10-28", "A", "B"]);
});
test("live log dedupe: tolerates past duplicates already in the log", () => {
  const out = py(`print(json.dumps(dedupe_new([{"type":"filing","accession":"X"},{"type":"filing","accession":"Y"}], {"X","X"})))`);
  assert.deepEqual(out.map(e => e.accession), ["Y"]);
});
test("log.py no longer compares against the set it grows (root cause of the Oct 28+ AssertionError)", async () => {
  const src = (await import("node:fs")).readFileSync("scripts/live/log.py", "utf8");
  assert.match(src, /logged_before = frozenset\(have\)/);
  assert.match(src, /dedupe_new\(new, logged_before\)/);
});
