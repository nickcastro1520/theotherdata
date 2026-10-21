// Daily signup check (GitHub Action): sign up a +tagged bot-inbox address on the live site, then
// confirm via the Resend sent-emails API that a confirmation email to it was created and delivered.
// Always removes the test record afterward. Exit 1 on failure (the workflow then opens an issue).
// Env: RESEND_API_KEY, BLOB_READ_WRITE_TOKEN. Test addresses are excluded from counts and digests
// by isTestRecord in lib/subscribers.js.
import { getStore, removeEmail, isTestEmail } from "../../lib/subscribers.js";
const SITE = process.env.SITE || "https://theotherdata.com";
const tag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const to = `nickcastro+monitor${tag}@mail.grokbot.com`;
if (!isTestEmail(to)) throw new Error("monitor address must match the test pattern");
const store = getStore();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false, why = "";
try {
  const started = Date.now();
  const r = await fetch(`${SITE}/api/subscribe`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "theotherdata-signup-monitor" },
    body: JSON.stringify({ email: to, consent: true, page: "/monitor", t: started - 5000 }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`subscribe HTTP ${r.status} ${body.status || ""}`);
  if (body.status !== "check_inbox") throw new Error(`subscribe said "${body.status}" (expected check_inbox)`);
  for (let i = 0; i < 12 && !ok; i++) {
    await sleep(10000);
    const lr = await fetch("https://api.resend.com/emails?limit=50", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
    if (!lr.ok) { why = `resend list HTTP ${lr.status}`; continue; }
    const hit = (await lr.json()).data?.find((e) => (e.to || []).map((x) => x.toLowerCase()).includes(to) && Date.parse(e.created_at) >= started - 60e3);
    if (!hit) { why = "no confirmation email in Resend log"; continue; }
    if (["bounced", "complained", "failed"].includes(hit.last_event)) throw new Error(`confirmation email ${hit.last_event}`);
    if (hit.last_event === "delivered") ok = true; else why = `confirmation email status: ${hit.last_event}`;
  }
} catch (e) { why = String(e.message || e).slice(0, 200); }
finally { if (store) { try { await removeEmail(store, to); } catch (e) { console.error("cleanup failed:", String(e.message).slice(0, 120)); } } }
console.log(ok ? "OK: confirmation email delivered" : `FAIL: ${why}`);
process.exit(ok ? 0 : 1);
