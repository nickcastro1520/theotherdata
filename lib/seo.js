// Discovery helpers, used at build time (scripts/build.mjs, scripts/cards.mjs). Pure functions, tested in test/seo.test.js.
const SITE = "https://theotherdata.com";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Live scoreboard counts for the home page, straight from data/scoreboard.json (never hand-typed).
export function scoreboardCounts(sb) {
  const c = sb?.counts?.mkt;
  if (!c) return null;
  const tested = (c.up || 0) + (c.unproven || 0) + (c.down || 0);
  if (!tested) return null;
  return { tested, holding: c.up || 0, unproven: c.unproven || 0, worse: c.down || 0, window: sb.windowLabel || "1 month" };
}

export function scoreboardStripHtml(sb) {
  const k = scoreboardCounts(sb);
  if (!k) return "";
  const hold = k.holding === 1 ? "1 is holding up" : `${k.holding} are holding up`;
  return `<a class="sb-strip" href="/scoreboard"><span class="sb-strip-k">Honest scoreboard</span><span class="sb-strip-t"><b>${k.tested}</b> signals tested against the market · <b>${hold}</b> so far · <b>${k.unproven}</b> not proven yet</span><span class="sb-strip-go">See every signal's score →</span></a>`;
}

// Short, readable signal names for titles ("Boxes being made (paperboard output)" -> "paperboard output").
export function shortName(name) {
  const m = String(name).match(/\(([^)]+)\)/);
  return (m ? m[1] : String(name)).trim();
}

export function stockSeo(doc) {
  const names = (doc.signals || []).map((s) => shortName(s.name)).filter(Boolean);
  const uniq = [...new Set(names)];
  const head = uniq.slice(0, 2).join(", ");
  const label = `${doc.name} (${doc.ticker})`;
  const title = uniq.length ? `${label} hidden signals: ${head}${uniq.length > 2 ? " & more" : ""} explained | The Other Data` : `${label} hidden signals explained | The Other Data`;
  const list = uniq.slice(0, 4).join(", ");
  const description = uniq.length
    ? `${uniq.length} offbeat public signal${uniq.length === 1 ? "" : "s"} for ${label}: ${list}. What each number did, why it can matter to the business, and an honest track record. Education only, not advice.`
    : `Public data on ${label}, explained in plain English. Education only, not advice.`;
  return { title, description, h1: `${label} hidden signals`, signals: uniq };
}

export function stockJsonLd(doc, url) {
  const graph = [
    { "@type": "WebPage", "@id": `${url}#page`, url, name: stockSeo(doc).title.replace(/ \| The Other Data$/, ""), description: stockSeo(doc).description, isPartOf: { "@id": `${SITE}/#website` }, dateModified: doc.updatedAt || undefined, about: { "@type": "Corporation", name: doc.name, tickerSymbol: doc.ticker } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "The Other Data", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: `${doc.name} (${doc.ticker})`, item: url }] },
  ];
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}

// Crawlable static list of the stock's signals (the app replaces it once live data loads).
export function signalListHtml(links) {
  if (!links?.length) return "";
  return `<ul class="shell-sigs" aria-label="Signals tracked">${links.map((l) => `<li><a href="${esc(String(l.url).replace(SITE, ""))}">${esc(l.name)}</a></li>`).join("")}</ul>`;
}

export function withLastmod(sitemap, lastmod) {
  const d = String(lastmod || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return sitemap;
  return sitemap.replace(/<url><loc>([^<]+)<\/loc><\/url>/g, `<url><loc>$1</loc><lastmod>${d}</lastmod></url>`);
}

// Static first paint for a single-signal permalink (/s/TICKER/signal). Each signal page gets its own H1,
// "what it is" / "why it can matter" text, source and test-status badge, so sibling signal pages
// on the same stock are not near-duplicates of each other (Search Console flagged META's two
// Wikipedia "curiosity" pages, Oct 26 2026). The app replaces this once live data loads.
export function signalShellHtml(doc, s, { line = "", dataDate = "", status = null, siblings = [] } = {}) {
  const label = `${doc.name} (${doc.ticker})`;
  const badge = status ? `<a class="ts-badge ${status.status === "tested" ? "ts-tested" : status.status === "passed" ? "ts-passed" : "ts-untested"}" href="${esc(status.link || "/scoreboard")}">${esc(status.label)}</a>` : "";
  const src = s.source?.name ? (s.source.url ? `<a href="${esc(s.source.url)}" rel="nofollow noopener" target="_blank">${esc(s.source.name)}</a>` : esc(s.source.name)) : "";
  const sib = siblings.filter((x) => x.id !== s.id);
  return `<div class="wrap" data-tod-shell>
      <div class="dtop"><a class="back" href="/s/${esc(doc.ticker)}">← All ${esc(label)} signals</a></div>
      <div class="dhead"><div><div class="tk">${esc(doc.ticker)}</div><h1>${esc(s.name)}: a ${esc(label)} signal</h1><div class="meta">${esc(s.metric || "")}${dataDate ? ` · ${esc(dataDate)}` : ""}</div>${badge ? `<div>${badge}</div>` : ""}</div></div>
      ${line ? `<p class="shell-lede">${esc(line)}</p>` : ""}
      ${s.what ? `<h2>What this number is</h2><p>${esc(s.what)}</p>` : ""}
      ${s.why ? `<h2>Why it can matter to ${esc(doc.name)}</h2><p>${esc(s.why)}</p>` : ""}
      ${src ? `<p>Source: ${src}. Education only, not advice.</p>` : "<p>Education only, not advice.</p>"}
      ${sib.length ? `<h2>Other ${esc(label)} signals</h2>${signalListHtml(sib)}` : ""}
    </div>`;
}

export function signalJsonLd(doc, s, url, description) {
  const stockUrl = `${SITE}/s/${doc.ticker}`;
  const graph = [
    { "@type": "WebPage", "@id": `${url}#page`, url, name: `${s.name}: a ${doc.name} (${doc.ticker}) signal`, description, isPartOf: { "@id": `${SITE}/#website` }, dateModified: s.asOf || doc.updatedAt || undefined, about: { "@type": "Corporation", name: doc.name, tickerSymbol: doc.ticker } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "The Other Data", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: `${doc.name} (${doc.ticker})`, item: stockUrl }, { "@type": "ListItem", position: 3, name: s.name, item: url }] },
  ];
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}
