// Optional AI summary. Off unless GEMINI_API_KEY is set (same key name Nick's other sites use).
// The model only rewrites facts we already computed; output is validated and falls back to the
// template summary if it is missing, too long, or sounds like investment advice.
const MODELS = (process.env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);
const BANNED = /\b(buy|sell|short|guarantee|guaranteed|will (rise|fall|go up|go down)|price target|strong buy|you should|invest now|sure thing)\b/i;

export const aiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

export async function aiSummary(company, ticker, signals) {
  if (!aiEnabled()) return null;
  const facts = signals.filter((s) => s.status === "ok" || s.status === "stale").map((s) => `- ${s.name}: ${s.now}`).join("\n");
  if (!facts) return null;
  const prompt = `You explain alternative data to everyday people. Using ONLY the facts below about ${company} (${ticker}), write 2 or 3 short sentences in plain English that say what these offbeat signals collectively suggest right now. Be hedged (use words like "hints" or "suggests"), never give investment advice, never predict the stock price, never add numbers that are not in the facts.\n\nFacts:\n${facts}`;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 300 } }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
      if (text && text.length <= 700 && !BANNED.test(text)) return { text, model };
    } catch {}
  }
  return null;
}
