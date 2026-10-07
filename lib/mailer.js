// Outgoing email via Resend (free tier: 3,000/month, 100/day). Switched on only by RESEND_API_KEY.
// The key goes in a header and never appears in errors or logs. Locally (not on Vercel), setting
// TOD_EMAIL_OUTBOX writes messages to files instead, so the whole flow can be tested without sending.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_FROM = "The Other Data <digest@theotherdata.com>";
export function mailerStatus(env = process.env) {
  if (env.RESEND_API_KEY) return { enabled: true, provider: "resend" };
  if (!env.VERCEL && env.TOD_EMAIL_OUTBOX) return { enabled: true, provider: "outbox" };
  return { enabled: false, provider: null };
}
const base = (env, m) => ({
  from: env.DIGEST_FROM || DEFAULT_FROM,
  to: [m.to],
  subject: m.subject,
  html: m.html,
  text: m.text,
  ...(env.DIGEST_REPLY_TO ? { reply_to: env.DIGEST_REPLY_TO } : {}),
  ...(m.headers ? { headers: m.headers } : {}),
  ...(m.tags ? { tags: m.tags } : {}),
});

async function resend(env, path, body, idem) {
  const r = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "theotherdata-digest/1.0", ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  if (!r.ok) throw new Error(`resend ${r.status}: ${String(j?.message || j?.name || "request failed").slice(0, 160)}`);
  return j;
}
async function outbox(env, msgs) {
  await mkdir(env.TOD_EMAIL_OUTBOX, { recursive: true });
  for (const m of msgs) await writeFile(join(env.TOD_EMAIL_OUTBOX, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`), JSON.stringify(m, null, 1));
  return { data: msgs.map(() => ({ id: "outbox" })) };
}

export async function sendEmail(m, env = process.env, idem) {
  const st = mailerStatus(env);
  if (!st.enabled) throw new Error("email_disabled");
  const msg = base(env, m);
  return st.provider === "resend" ? resend(env, "/emails", msg, idem) : outbox(env, [msg]);
}
// Up to 100 per call (Resend batch limit).
export async function sendBatch(list, env = process.env, idem) {
  const st = mailerStatus(env);
  if (!st.enabled) throw new Error("email_disabled");
  const msgs = list.map((m) => base(env, m));
  return st.provider === "resend" ? resend(env, "/emails/batch", msgs, idem) : outbox(env, msgs);
}
