// Start a new version for every signal whose logic changed: node scripts/bump-versions.mjs
import { writeFileSync } from "node:fs";
import { TICKERS } from "../lib/catalog.js";
import { loadRegistry, bump, REGISTRY_PATH } from "../lib/signal-versions.js";
const reg0 = loadRegistry();
const { reg, changed } = bump({ note: reg0.note || "Signal rule versions. A change to a signal's logic or thresholds starts a new version (and a new track record) on its 'since' date. Checked by test/versions.test.js.", signals: reg0.signals || {} }, TICKERS, new Date().toISOString().slice(0, 10));
writeFileSync(REGISTRY_PATH, `{\n "note": ${JSON.stringify(reg.note)},\n "signals": {\n${Object.entries(reg.signals).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n }\n}\n`);
console.log(changed.length ? `new versions: ${changed.join(", ")}` : "no signal logic changed");
