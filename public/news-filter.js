// Third-party headlines sometimes carry buy/sell calls ("Now Is the Perfect Time to Buy …").
// We never make those calls, so stock pages tuck such headlines into a clearly labeled,
// collapsed "third-party opinions" group instead of listing them as news.
(function (root) {
  "use strict";
  const OPINION = [
    /\b(strong\s+)?(buy|sell)\b(?![-\s]?(off|offs|side|out|back|now,?\s+pay))/i,
    /\bprice\s+target/i,
    /\b(upgrade[sd]?|downgrade[sd]?)\b/i,
    /\b(outperform|underperform|overweight|underweight)\b/i,
    /\bstocks?\s+to\s+(own|hold|watch|avoid|dump)\b/i,
    /\bshould\s+you\s+(own|hold|invest|dump)\b/i,
    /\b(no[-\s]brainer|screaming|millionaire[-\s]maker|too\s+cheap\s+to\s+ignore|load\s+up)\b/i,
    /\b(time|chance)\s+to\s+(invest|get\s+in|pile\s+in)\b/i,
  ];
  const isOpinion = (title) => OPINION.some((re) => re.test(String(title || "")));
  function split(articles) {
    const facts = [], opinions = [];
    for (const a of articles || []) (isOpinion(a && a.title) ? opinions : facts).push(a);
    return { facts, opinions };
  }
  root.TODNews = { isOpinion, split };
})(typeof globalThis !== "undefined" ? globalThis : this);
