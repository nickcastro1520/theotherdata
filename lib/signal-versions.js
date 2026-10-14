// Frozen signal rules. Every curated signal has a version and a start date in data/signal-versions.json.
// The fingerprint covers everything that changes what a signal SAYS (source, series/params, comparison,
// noise threshold, polarity), not its plain-English wording. If the logic changes, the fingerprint changes
// and the test suite fails until a new version is added (npm run versions:bump), which starts that
// version's own track record on its start date.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "signal-versions.json");
const TEXT_FIELDS = new Set(["name", "metric", "what", "why", "up", "down", "sourceName", "id", "scout"]);
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v));
export function logicOf(sig) { const o = {}; for (const [k, v] of Object.entries(sig)) if (!TEXT_FIELDS.has(k) && v !== undefined) o[k] = v; return o; }
export const fingerprint = (sig) => createHash("sha256").update(stable(logicOf(sig))).digest("hex").slice(0, 16);
export const keyOf = (tk, sig) => `${tk}/${sig.id}`;
export function loadRegistry(path = REGISTRY_PATH) { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return { signals: {} }; } }
export function currentVersion(reg, tk, sig) { const h = reg.signals?.[keyOf(tk, sig)]; return h?.length ? h[h.length - 1] : null; }
// Returns the registry with a new version appended for every signal whose logic changed (or is new).
export function bump(reg, tickers, today) {
  const out = { ...reg, signals: { ...(reg.signals || {}) } };
  const changed = [];
  for (const t of tickers) for (const sig of t.signals) {
    const k = keyOf(t.ticker, sig), fp = fingerprint(sig), hist = out.signals[k] || [];
    if (hist.at(-1)?.hash === fp) continue;
    out.signals[k] = [...hist, { v: (hist.at(-1)?.v || 0) + 1, since: today, hash: fp }];
    changed.push(k);
  }
  return { reg: out, changed };
}
// { id: {v, since} } for one ticker, for the site.
export function versionsFor(reg, t) { const o = {}; for (const sig of t.signals) { const c = currentVersion(reg, t.ticker, sig); if (c) o[sig.id] = { v: c.v, since: c.since }; } return o; }
