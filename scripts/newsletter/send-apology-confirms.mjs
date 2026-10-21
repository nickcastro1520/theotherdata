// ONE-TIME apology confirm email to every pending signup (test/monitor addresses excluded).
// Default is a dry run: prints the recipient COUNT and the rendered text (with a placeholder link),
// never addresses. Sending needs BOTH `--send` and APOLOGY_SEND_APPROVED=yes. Do not run --send
// without Nick's explicit go-ahead.
//
// Idempotent: each record gets apologySentAt the moment its email is accepted; records that already
// have it are skipped forever (no reminders). Resend also gets a per-address Idempotency-Key.
// Each sent record gets expiresAt = send time + 14 days; api/digest.js deletes it after that
// if still unconfirmed. The confirm link is valid for the same 14 days.
// Env: BLOB_READ_WRITE_TOKEN, RESEND_API_KEY (send only). Run: node scripts/newsletter/send-apology-confirms.mjs
import { getStore, allRecords, saveRecord, signingKey, makeToken, isTestRecord, emailKey } from "../../lib/subscribers.js";
import { renderApologyConfirmEmail } from "../../lib/digest.js";
import { sendEmail } from "../../lib/mailer.js";

const SITE = "https://theotherdata.com";
const TTL_DAYS = 14;
const send = process.argv.includes("--send");
const store = getStore();
if (!store) { console.error("No Blob store (BLOB_READ_WRITE_TOKEN missing)."); process.exit(1); }
const records = await allRecords(store);
const pending = records.filter((r) => r.status === "pending");
const tests = pending.filter(isTestRecord);
const already = pending.filter((r) => !isTestRecord(r) && r.apologySentAt);
const todo = pending.filter((r) => !isTestRecord(r) && !r.apologySentAt);
console.log(JSON.stringify({ pending: pending.length, testExcluded: tests.length, alreadySent: already.length, recipients: todo.length, signupDates: todo.map((r) => String(r.createdAt).slice(0, 10)).sort() }));
const sample = renderApologyConfirmEmail({ confirmUrl: `${SITE}/api/confirm?token=<per-address token, valid ${TTL_DAYS} days>` });
console.log(`--- Subject: ${sample.subject}\n${sample.text}\n---`);
if (!send) { console.log("Dry run. Nothing sent."); process.exit(0); }
if (process.env.APOLOGY_SEND_APPROVED !== "yes") { console.error("Refusing: set APOLOGY_SEND_APPROVED=yes (only with Nick's approval)."); process.exit(2); }
const key = await signingKey(store);
let sent = 0;
for (const r of todo) {
  const fresh = await store.get(`subs/${emailKey(r.email)}.json`);
  if (!fresh || fresh.status !== "pending" || fresh.apologySentAt) continue; // confirmed/removed/sent meanwhile
  const now = new Date();
  const confirmUrl = `${SITE}/api/confirm?token=${makeToken(key, "confirm", r.email, { ttlDays: TTL_DAYS, now: now.getTime() })}`;
  await sendEmail({ to: r.email, ...renderApologyConfirmEmail({ confirmUrl }), tags: [{ name: "type", value: "apology-confirm" }] }, process.env, `apology-confirm-${emailKey(r.email)}`);
  await saveRecord(store, { ...fresh, apologySentAt: now.toISOString(), confirmSentAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL_DAYS * 864e5).toISOString() });
  sent++;
}
console.log(JSON.stringify({ sent }));
