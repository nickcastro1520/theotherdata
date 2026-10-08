// Regenerate summaries for curated tickers from the data already on disk (no data refetch).
//   node scripts/resummarize.mjs            -> only tickers whose stored AI summary is missing or disagrees with the lean
//   node scripts/resummarize.mjs --all      -> every curated ticker
//   node scripts/resummarize.mjs --only JPM,COST
// Also refreshes the template text and the summary copy in public/data/index.json.
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { summarize } from "../lib/analyze.js";
import { aiEnabled, aiSummary, storedSummaryProblem } from "../lib/explain.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "data");
const args = process.argv.slice(2);
const all = args.includes("--all");
const only = (() => { const i = args.indexOf("--only"); return i >= 0 ? new Set(args[i + 1].split(",").map((s) => s.trim().toUpperCase())) : null; })();

const index = JSON.parse(await readFile(join(OUT, "index.json"), "utf8"));
let changed = 0;
for (const row of index.tickers) {
  if (only && !only.has(row.ticker)) continue;
  const p = join(OUT, "tickers", `${row.ticker}.json`);
  const doc = JSON.parse(await readFile(p, "utf8"));
  const problem = storedSummaryProblem(doc);
  if (!all && !only && !problem) continue;
  const summary = summarize(doc.name, doc.ticker, doc.signals);
  const ai = aiEnabled() ? await aiSummary(doc.name, doc.ticker, doc.signals, summary) : null;
  summary.impact = ai?.text ? { ...summary.impact, text: ai.text, source: "ai" } : { ...summary.impact, source: "template" };
  doc.summary = summary; doc.ai = ai;
  await writeFile(p, JSON.stringify(doc));
  row.summary = summary;
  changed++;
  console.log(`${row.ticker.padEnd(6)} ${summary.impact.lean.padEnd(9)} was: ${problem || "ok"} -> ${ai ? `AI (${ai.model})` : "template"}`);
}
await writeFile(join(OUT, "index.json"), JSON.stringify(index));
console.log(`Updated ${changed} ticker summaries.`);
