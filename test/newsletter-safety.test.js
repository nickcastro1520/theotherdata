import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, isTestEmail, PENDING_PURGE_PAUSED, saveRecord, getRecord } from "../lib/subscribers.js";
import { renderApologyConfirmEmail } from "../lib/digest.js";
import { run } from "../api/digest.js";

test("test/monitor addresses are recognised", () => {
  assert.ok(isTestEmail("nickcastro@mail.grokbot.com"));
  assert.ok(isTestEmail("NickCastro+monitor20261021@mail.grokbot.com"));
  assert.ok(!isTestEmail("someone@example.com"));
});
test("apology email carries the approved sentence and the link", () => {
  const m = renderApologyConfirmEmail({ confirmUrl: "https://theotherdata.com/api/confirm?token=x" });
  assert.match(m.text, /^Sorry, our confirmation email didn't send when you signed up\. Click to confirm your subscription to The Other Data weekly digest\./);
  assert.match(m.text, /api\/confirm\?token=x/);
});
test("cron: purge paused, test records ignored, apology expiry honoured", async () => {
  assert.equal(PENDING_PURGE_PAUSED, true);
  const s = new MemoryStore(); const old = "2026-01-01T00:00:00Z";
  await saveRecord(s, { email: "old@example.com", status: "pending", createdAt: old, confirmSentAt: old });
  await saveRecord(s, { email: "nickcastro@mail.grokbot.com", status: "confirmed", createdAt: old });
  await saveRecord(s, { email: "exp@example.com", status: "pending", createdAt: old, confirmSentAt: old, expiresAt: "2026-02-01T00:00:00Z" });
  const r = await run({ env: {}, store: s, now: new Date("2026-10-21T14:00:00Z") });
  assert.equal(r.confirmed, 0);
  assert.equal(r.pending, 2);
  assert.ok(await getRecord(s, "old@example.com"), "old pending not deleted while paused");
  assert.equal(await getRecord(s, "exp@example.com"), null, "apology expiry still applies");
});
