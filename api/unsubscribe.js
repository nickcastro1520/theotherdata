// Unsubscribe. Two ways in, both one click:
//  - Mail apps' built-in button: RFC 8058 one-click POST (List-Unsubscribe-Post header) to this URL.
//  - The footer link: opens a page with a single "Unsubscribe" button (GET alone never deletes,
//    so link scanners can't unsubscribe people by accident).
// Unsubscribing deletes the address entirely.
import { getStore, signingKey, readToken, removeKey, getByKey } from "../lib/subscribers.js";
import { page, redirect, readBody, escHtml } from "../lib/page.js";

const bad = () => page({ status: 400, title: "Link problem", body: `<h1>That link didn't work</h1><p class="lede-sm">This unsubscribe link is incomplete or has been changed. Try the unsubscribe link in a more recent issue, or open it again from the email in case it got cut off.</p>` });

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const store = getStore();
  if (!store) return redirect("/subscribe?status=not_open");
  const r = readToken(await signingKey(store), "unsub", token);
  if (r.error) return bad();
  const rec = await getByKey(store, r.key);
  if (!rec) return redirect("/subscribe?status=unsubscribed");
  return page({ title: "Unsubscribe", body: `<p class="eyebrow-k">Weekly digest</p><h1>Unsubscribe?</h1>
<p class="lede-sm">Stop sending the weekly digest to <strong>${escHtml(rec.email)}</strong>. We'll delete the address right away.</p>
<form method="post" action="/api/unsubscribe" class="sub-confirm"><input type="hidden" name="token" value="${escHtml(token)}"><button class="btn" type="submit">Unsubscribe</button></form>
<p class="fine"><a href="/">Never mind, take me to the site</a></p>` });
}

export async function POST(request) {
  const store = getStore();
  const url = new URL(request.url);
  const { data = {} } = await readBody(request);
  const oneClick = data["List-Unsubscribe"] === "One-Click";
  if (!store) return oneClick ? new Response("unavailable", { status: 503 }) : redirect("/subscribe?status=not_open");
  const r = readToken(await signingKey(store), "unsub", data.token || url.searchParams.get("token"));
  if (r.error) return oneClick ? new Response("invalid link", { status: 400 }) : redirect("/subscribe?status=invalid");
  try {
    await removeKey(store, r.key);
    return oneClick ? new Response("unsubscribed", { status: 200, headers: { "Content-Type": "text/plain" } }) : redirect("/subscribe?status=unsubscribed");
  } catch (e) {
    console.error("unsubscribe failed:", String(e.message || e).slice(0, 160));
    return oneClick ? new Response("error", { status: 500 }) : redirect("/subscribe?status=error");
  }
}
