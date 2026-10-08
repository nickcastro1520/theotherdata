// Optional AI summary. Off unless GEMINI_API_KEY is set (same key name Nick's other sites use).
// The model only rewrites facts we already computed, including the page's lean, strength and time window.
// Output is validated and retried; if every attempt fails, the caller keeps the template summary, which is
// built from the same lean and so always agrees with the page.
import { summarize, templateImpactText } from "./analyze.js";

const MODELS = (process.env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);

// Advice filter. Ordinary business words ("bulk-buying", "best-selling", "shoes are selling", "car buyers")
// are fine; telling the reader to trade, or predicting the stock, is not.
const BENIGN = /\b(bulk[- ]buy(?:ing|ers?)?|buy(?:ing)? in bulk|best[- ]sell(?:ing|ers?)|car[- ]buy(?:ing|ers?)|home[- ]buy(?:ing|ers?)|panic[- ]buy(?:ing)?|sell[- ]through|(?:is|are|was|were|keeps?|kept|been|be|not|n't|items?|products?|shoes|cars|goods|tickets) selling|selling (?:fast|faster|slower|slowly|well|out|through|more|less|at full price)|buys? (?:coffee|beans|aluminum|sugar|jets?|chips|ads)|(?:shoppers|consumers|people|customers|buyers|households|americans|drivers|roasters) (?:buy|buying|sell))\b/gi;
const BANNED = /\b(buy|buying|sell|selling|short it|shorting|guarantee[ds]?|will (rise|fall|go up|go down|climb|drop|soar|crash)|price target|strong buy|you should|invest now|sure thing|undervalued|overvalued|outperform|underperform|bullish|bearish)\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const aiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

// Returns the advice-sounding phrase (or null). Exported for tests and debugging.
export function adviceHit(text) {
  const m = String(text || "").replace(BENIGN, " ").match(BANNED);
  return m ? m[0] : null;
}

// Every number in the summary must appear in the facts (small counts like "two" or "3" are allowed).
export function validateSummary(text, facts) {
  if (!text || text.length < 60 || text.length > 700) return "length";
  if (adviceHit(text)) return "advice";
  const pool = facts.replace(/,/g, "");
  for (const n of text.replace(/,/g, "").match(/\d+(\.\d+)?/g) || []) {
    if (Number(n) <= 10) continue;
    if (!pool.includes(n)) return `number ${n} not in facts`;
  }
  return null;
}

// Does the summary's overall direction agree with the page's computed lean?
// Individual signals may still be called tailwinds or headwinds; what we check is the overall call.
const OVERALL = String.raw`(?:net|overall|on balance|generally|broadly|mostly|largely|collectively|combined|altogether|taken together)`;
const SAYS = {
  tailwind: new RegExp(String.raw`\b(net tailwind|${OVERALL}[\w ,-]{0,20}\b(?:tailwind|positive|favorable|upbeat)|leaning positive|lean(?:s|ing)? (?:up|upward|positive|favorable))\b`, "i"),
  headwind: new RegExp(String.raw`\b(net headwind|${OVERALL}[\w ,-]{0,20}\b(?:headwind|negative|unfavorable|downbeat)|leaning negative|lean(?:s|ing)? (?:down|downward|negative|unfavorable))\b`, "i"),
  // Overall "mixed" claims (a single signal giving "mixed context" is fine).
  mixed: /\b(mixed (?:picture|outlook|environment|bag|conditions|signals|readings?|view|lean|result|set)|(?:is|are|looks?|remains?|stays?) mixed|(?:roughly |evenly )?balanced (?:picture|lean|outlook)|no clear (?:lean|direction)|cancel(?:s|ing)? each other out|offset each other)\b/i,
  quiet: /\b(quiet|nothing (?:is )?(?:loud|moving|stand)|no clear (?:lean|direction|signal)|not moving|within (?:its|their|the) normal|neutral (?:outlook|position|picture|reading|stance))\b/i,
};
export function directionConflict(text, lean) {
  const t = String(text || "");
  if (!SAYS[lean]) return null;
  if (lean === "tailwind" || lean === "headwind") {
    const other = lean === "tailwind" ? "headwind" : "tailwind";
    if (!new RegExp(String.raw`\bnet ${lean}\b`, "i").test(t)) return `doesn't state the net ${lean}`;
    if (new RegExp(String.raw`\bnet ${other}\b`, "i").test(t)) return `says net ${other}, page says ${lean}`;
    if (SAYS.mixed.test(t)) return `says mixed, page says ${lean}`;
    if (/\bquiet\b/i.test(t)) return `says quiet, page says ${lean}`;
    return null;
  }
  if (lean === "mixed") {
    if (!/\bmixed\b/i.test(t)) return "doesn't state the mixed picture";
    if (SAYS.tailwind.test(t)) return "implies an overall tailwind, page says mixed";
    if (SAYS.headwind.test(t)) return "implies an overall headwind, page says mixed";
    return null;
  }
  // quiet
  if (!SAYS.quiet.test(t)) return "doesn't say the signals are quiet";
  if (/\bnet (tailwind|headwind)\b/i.test(t) || SAYS.tailwind.test(t) || SAYS.headwind.test(t)) return "implies a direction, page says quiet";
  return null;
}

let chain = Promise.resolve();
let lastCall = 0;
// Serialize calls and space them out to stay inside free-tier rate limits.
function turn(fn) { const p = chain.then(async () => { const w = lastCall + 4500 - Date.now(); if (w > 0) await sleep(w); lastCall = Date.now(); return fn(); }); chain = p.catch(() => {}); return p; }

async function callModel(model, prompt) {
  const cfg = { temperature: 0.3, maxOutputTokens: 900 };
  cfg.thinkingConfig = /^gemini-2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "low" };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: cfg }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return { err: `HTTP ${res.status}` };
  const j = await res.json();
  const c = j.candidates?.[0];
  if (c?.finishReason && c.finishReason !== "STOP") return { err: c.finishReason };
  return { text: (c?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("").trim() };
}

const LEAN_PHRASE = { tailwind: "a net tailwind", headwind: "a net headwind", mixed: "a mixed picture", quiet: "quiet (nothing moving enough to lean either way)" };

export function buildPrompt(company, ticker, facts, impact) {
  const lean = impact.lean;
  const rules = {
    tailwind: `Your FIRST sentence must say these offbeat signals lean toward a "net tailwind" for ${company} (use the exact words "net tailwind"). Do not call the overall picture mixed, balanced, quiet, or a headwind; you may mention that individual signals are headwinds.`,
    headwind: `Your FIRST sentence must say these offbeat signals lean toward a "net headwind" for ${company} (use the exact words "net headwind"). Do not call the overall picture mixed, balanced, quiet, or a tailwind; you may mention that individual signals are tailwinds.`,
    mixed: `Your FIRST sentence must say these offbeat signals give a "mixed" picture for ${company} (use the word "mixed"). Do not say the overall picture is positive, negative, a net tailwind, or a net headwind.`,
    quiet: `Your FIRST sentence must say these offbeat signals are "quiet" for ${company} right now (use the word "quiet"). Do not claim any overall direction.`,
  }[lean];
  return `You explain alternative data to everyday people. Using ONLY the facts below about ${company} (${ticker}), write 2 or 3 short, plain-English sentences (under 80 words total).

The page has ALREADY computed the overall lean; your summary must agree with it exactly:
- Overall lean: ${LEAN_PHRASE[lean]} (${impact.tw} favorable readings, ${impact.hw} unfavorable)
- Strength: ${impact.magnitude}
- Typical time window: ${impact.horizon}
${rules}

Then mention the most notable signals by name and why they matter. Frame it as "what these offbeat signals lean toward," not as a stock call. Be hedged ("hints", "suggests", "could"). Never give investment advice, never use the words buy, sell, bullish or bearish, never predict the stock price, and do not use any number that is not in the facts. No preamble, no markdown.

Facts:
${facts}`;
}

export function factsFor(signals) {
  return signals.filter((s) => s.status === "ok" || s.status === "stale").map((s) => `- ${s.name} (${s.reading}${s.strength ? `, ${s.strength}` : ""}): ${s.now}`).join("\n");
}

// summary: the output of summarize() for the same signals (computed here if omitted).
export async function aiSummary(company, ticker, signals, summary = null) {
  if (!aiEnabled()) return null;
  const facts = factsFor(signals);
  if (!facts) return null;
  const s = summary || summarize(company, ticker, signals);
  const impact = { lean: s.impact?.lean || "mixed", tw: s.tailwinds ?? 0, hw: s.headwinds ?? 0, magnitude: s.impact?.magnitude || "unclear", horizon: s.impact?.horizon || "weeks to a quarter" };
  const base = buildPrompt(company, ticker, facts, impact);
  return turn(async () => {
    let feedback = "";
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await callModel(model, base + feedback);
          if (r.err) { if (/HTTP (429|5\d\d)/.test(r.err) && attempt === 0) { await sleep(3000); continue; } break; }
          const text = r.text.replace(/\s+/g, " ").replace(/\*+/g, "");
          const bad = validateSummary(text, facts) || directionConflict(text, impact.lean);
          if (!bad) return { text, model, lean: impact.lean, generatedAt: new Date().toISOString() };
          console.warn(`  ${ticker}: AI summary rejected (${bad}) from ${model}`);
          feedback = `\n\nA previous draft was rejected (${bad}). Write a new one that follows every rule above.`;
          if (attempt === 0) { await sleep(1500); continue; } // one retry per model, with feedback
          break;
        } catch { break; }
      }
    }
    return null;
  });
}

// Is a stored AI summary still consistent with the page? Used to decide which tickers to regenerate.
export function storedSummaryProblem(doc) {
  const lean = doc?.summary?.impact?.lean;
  const text = doc?.ai?.text;
  if (!text) return "missing";
  if (doc.ai.lean && doc.ai.lean !== lean) return `written for ${doc.ai.lean}, page now ${lean}`;
  return validateSummary(text, factsFor(doc.signals || [])) || directionConflict(text, lean);
}

export { templateImpactText };
