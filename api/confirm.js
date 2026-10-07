// Double opt-in confirmation. The emailed link opens a page with one button (GET never changes
// anything, so link scanners in mail apps can't confirm on someone's behalf); the button POSTs here.
import { getStore, signingKey, readToken, confirmKey, getByKey } from "../lib/subscribers.js";
import { page, redirect, readBody, escHtml } from "../lib/page.js";

const bad = (why) => page({ status: 400, title: "Link problem", body: `<h1>That link didn't work</h1><p class="lede-sm">${why === "expired" ? "This confirmation link has expired (they last 7 days)." : "This confirmation link is incomplete or has been changed."} You can <a href="/subscribe">sign up again</a>; it only takes a few seconds.</p>` });

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const store = getStore();
  if (!store) return redirect("/subscribe?status=not_open");
  const r = readToken(await signingKey(store), "confirm", token);
  if (r.error) return bad(r.error);
  const rec = await getByKey(store, r.key);
  if (!rec) return redirect("/subscribe?status=missing");
  if (rec.status === "confirmed") return redirect("/subscribe?status=confirmed");
  return page({ title: "Confirm your email", body: `<p class="eyebrow-k">Weekly digest</p><h1>One click to confirm</h1>
<p class="lede-sm">Confirm that <strong>${escHtml(rec.email)}</strong> should get the weekly email of the strangest signal moves. You can unsubscribe in one click anytime.</p>
<form method="post" action="/api/confirm" class="sub-confirm"><input type="hidden" name="token" value="${escHtml(token)}"><button class="btn" type="submit">Yes, send me the digest</button></form>
<p class="fine">Didn't ask for this? Just close this page. Unconfirmed addresses are deleted after 14 days.</p>` });
}

export async function POST(request) {
  const store = getStore();
  if (!store) return redirect("/subscribe?status=not_open");
  const { data = {} } = await readBody(request);
  const r = readToken(await signingKey(store), "confirm", data.token || new URL(request.url).searchParams.get("token"));
  if (r.error) return redirect(`/subscribe?status=${r.error === "expired" ? "expired" : "invalid"}`);
  try {
    const out = await confirmKey(store, r.key);
    return redirect(`/subscribe?status=${out.ok ? "confirmed" : "missing"}`);
  } catch (e) {
    console.error("confirm failed:", String(e.message || e).slice(0, 160));
    return redirect("/subscribe?status=error");
  }
}
