// Optional AI summary. Off unless GEMINI_API_KEY is set (same key name Nick's other sites use).
// The model only rewrites facts we already computed; output is validated and falls back to the
// template summary if it is missing, truncated, too long, adds numbers, or sounds like investment advice.
const MODELS = (process.env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);
const BANNED = /\b(buy|buying|sell|selling|short it|shorting|guarantee[ds]?|will (rise|fall|go up|go down|climb|drop|soar|crash)|price target|strong buy|you should|invest now|sure thing|undervalued|overvalued|outperform|underperform)\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const aiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

// Every number in the summary must appear in the facts (small counts like "two" or "3" are allowed).
export function validateSummary(text, facts) {
  if (!text || text.length < 60 || text.length > 700) return "length";
  if (BANNED.test(text)) return "advice";
  const pool = facts.replace(/,/g, "");
  for (const n of text.replace(/,/g, "").match(/\d+(\.\d+)?/g) || []) {
    if (Number(n) <= 10) continue;
    if (!pool.includes(n)) return `number ${n} not in facts`;
  }
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

export async function aiSummary(company, ticker, signals) {
  if (!aiEnabled()) return null;
  const facts = signals.filter((s) => s.status === "ok" || s.status === "stale").map((s) => `- ${s.name} (${s.reading}): ${s.now}`).join("\n");
  if (!facts) return null;
  const prompt = `You explain alternative data to everyday people. Using ONLY the facts below about ${company} (${ticker}), write 2 or 3 short, plain-English sentences (under 80 words total) on what these offbeat signals collectively hint at right now. Mention the most notable signals by name. Be hedged ("hints", "suggests", "could"). Never give investment advice, never tell anyone to buy or sell, never predict the stock price, and do not use any number that is not in the facts. No preamble, no markdown.\n\nFacts:\n${facts}`;
  return turn(async () => {
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await callModel(model, prompt);
          if (r.err) { if (/HTTP (429|5\d\d)/.test(r.err) && attempt === 0) { await sleep(3000); continue; } break; }
          const text = r.text.replace(/\s+/g, " ").replace(/\*+/g, "");
          const bad = validateSummary(text, facts);
          if (!bad) return { text, model, generatedAt: new Date().toISOString() };
          console.warn(`  ${ticker}: AI summary rejected (${bad}) from ${model}`);
          break;
        } catch { break; }
      }
    }
    return null;
  });
}
