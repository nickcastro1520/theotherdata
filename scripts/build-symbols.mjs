// Refresh public/data/symbols.json (the searchable US symbol directory).
//   node scripts/build-symbols.mjs               -> always refresh
//   node scripts/build-symbols.mjs --max-age=7d  -> only refresh if the current file is older than 7 days
// Safety: never replaces a good file with a much smaller one (e.g. if a source returns a partial file).
import { readFile, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDirectory } from "../lib/symbol-directory.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/data/symbols.json");
const MIN_ROWS = 6000;

const arg = process.argv.find((a) => a.startsWith("--max-age="));
const maxAgeDays = arg ? Number(arg.split("=")[1].replace(/d$/, "")) : 0;

let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
if (prev && maxAgeDays > 0) {
  const ageDays = (Date.now() - Date.parse(prev.generatedAt)) / 864e5;
  if (ageDays < maxAgeDays) {
    console.log(`symbols.json is ${ageDays.toFixed(1)} days old (< ${maxAgeDays}); skipping refresh`);
    process.exit(0);
  }
}

const doc = await fetchDirectory();
const n = doc.rows.length;
if (n < MIN_ROWS) { console.error(`Refusing to write: only ${n} symbols (min ${MIN_ROWS}).`); process.exit(prev ? 0 : 1); }
if (prev?.rows?.length && n < prev.rows.length * 0.8) { console.error(`Refusing to write: ${n} symbols vs ${prev.rows.length} before (>20% drop).`); process.exit(0); }

// One row per line keeps git diffs readable while staying compact.
const { rows, ...meta } = doc;
const body = JSON.stringify(meta).slice(0, -1) + `,"rows":[\n` + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]}\n";
JSON.parse(body);
await writeFile(OUT + ".tmp", body);
await rename(OUT + ".tmp", OUT);
console.log(`symbols.json: ${n} symbols (${doc.stats.stocks} stocks, ${doc.stats.etfs} ETFs, ${doc.stats.otc} SEC-reporting OTC, ${doc.stats.withCik} with CIK)`);
