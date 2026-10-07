// Minimal server-rendered pages for the confirm/unsubscribe links. Same look and CSP as the static
// site: only /styles.css, no inline styles or scripts.
export const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function page({ title, body, status = 200 }) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)} | The Other Data</title><meta name="robots" content="noindex">
<meta name="theme-color" content="#0b1020"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"></head>
<body>
<header class="top"><div class="wrap bar"><a class="logo" href="/" aria-label="The Other Data home"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 40h10l6-16 8 26 7-20 5 10h12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="52" cy="22" r="5" fill="#fbbf24"/></svg><span>the<b>other</b>data</span></a></div></header>
<main id="main" class="doc sub-page"><div class="wrap narrow">${body}</div></main>
<footer class="foot"><div class="wrap"><p class="fine"><strong>Not financial advice. For education only.</strong> <a href="/">Back to the signals</a> · <a href="/privacy">Privacy</a></p></div></footer>
</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}
export const redirect = (to, status = 303) => new Response(null, { status, headers: { Location: to, "Cache-Control": "no-store" } });
export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });

// Reads a small urlencoded or JSON body (max 4 KB).
export async function readBody(request, max = 4096) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > max) return { tooBig: true };
  const raw = await request.text();
  if (raw.length > max) return { tooBig: true };
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) { try { return { data: JSON.parse(raw) || {}, isJson: true }; } catch { return { data: {}, isJson: true }; } }
  return { data: Object.fromEntries(new URLSearchParams(raw)), isJson: false, raw };
}
// Same-origin check for browser POSTs. Requests without Origin (non-browser, old clients) are allowed.
export function sameOrigin(request) {
  const o = request.headers.get("origin");
  if (!o || o === "null") return true;
  try { return new URL(o).host === new URL(request.url).host || /^(theotherdata\.com|www\.theotherdata\.com|localhost(:\d+)?)$/.test(new URL(o).host); } catch { return false; }
}
