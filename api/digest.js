// Weekly digest sender, run by Vercel Cron once a day (see vercel.json "crons").
// OFF unless all of these are set in the Vercel project:
//   CRON_SECRET            Vercel sends it as "Authorization: Bearer …" on cron calls; anything else gets 401.
//   RESEND_API_KEY         the email provider key.
//   DIGEST_SEND_ENABLED    must be exactly "true" to email subscribers.
// Optional: DIGEST_TEST_TO (send each new issue only to this one address, for a first look),
// DIGEST_DAILY_CAP (default 90, Resend's free plan allows 100/day), DIGEST_SEND_DAY (default "mon").
// A new issue starts on the send day (or the day after, if that run was missed). Its content is frozen at
// that moment, and it goes out in daily chunks under the cap until every confirmed subscriber has it.
import { createHash } from "node:crypto";
import { getStore, allRecords, removeEmail, saveRecord, signingKey, makeToken, validEmail, normEmail, emailKey, PENDING_TTL_DAYS } from "../lib/subscribers.js";
import { mailerStatus, sendBatch } from "../lib/mailer.js";
import { renderDigestHtml, renderDigestText, renderConfirmEmail, isoWeek, SITE } from "../lib/digest.js";
import { json } from "../lib/page.js";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dayNum = (d) => ((DAYS.indexOf(d) + 6) % 7) + 1; // Mon=1 … Sun=7

export function digestMessage(data, email, key) {
  const token = makeToken(key, "unsub", email);
  const unsubscribeUrl = `${SITE}/api/unsubscribe?token=${token}`;
  return {
    to: email,
    subject: data.subject,
    html: renderDigestHtml(data, { unsubscribeUrl, webUrl: `${SITE}/digest` }),
    text: renderDigestText(data, { unsubscribeUrl }),
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "type", value: "digest" }, { name: "issue", value: data.issueId.replace(/[^A-Za-z0-9_-]/g, "-") }],
  };
}

export async function run({ env = process.env, now = new Date(), store = getStore(env), fetchData } = {}) {
  const mail = mailerStatus(env);
  const enabled = mail.enabled && env.DIGEST_SEND_ENABLED === "true";
  const testTo = env.DIGEST_TEST_TO && validEmail(env.DIGEST_TEST_TO) ? normEmail(env.DIGEST_TEST_TO) : null;
  const cap = Math.min(1000, Math.max(1, Number(env.DIGEST_DAILY_CAP) || 90));
  const sendDay = DAYS.includes(String(env.DIGEST_SEND_DAY || "").toLowerCase().slice(0, 3)) ? String(env.DIGEST_SEND_DAY).toLowerCase().slice(0, 3) : "mon";
  const report = { at: now.toISOString(), mode: enabled ? "send" : mail.enabled && testTo ? "test" : "dry-run", storage: Boolean(store), email: mail.provider, confirmed: 0, pending: 0, expiredRemoved: 0, confirmsSent: 0, digestsSent: 0, issue: null, notes: [] };
  if (!store) { report.notes.push("No subscriber storage connected (Vercel Blob)."); return report; }

  const records = await allRecords(store);
  const confirmed = records.filter((r) => r.status === "confirmed");
  const pending = records.filter((r) => r.status === "pending");
  report.confirmed = confirmed.length; report.pending = pending.length;

  // Housekeeping: unconfirmed addresses go away 14 days after their confirm email.
  for (const r of pending) if (r.confirmSentAt && now - Date.parse(r.confirmSentAt) > PENDING_TTL_DAYS * 864e5) { await removeEmail(store, r.email); report.expiredRemoved++; }

  const issueId = isoWeek(now);
  const today = dayNum(DAYS[now.getUTCDay()]);
  // Start on the send day, or the day after if that day's cron run was missed. Never mid-week.
  const lag = today - dayNum(sendDay);
  const startsToday = lag === 0 || lag === 1;
  const getData = fetchData || (async () => { const r = await fetch(`${SITE}/data/digest.json`, { cache: "no-store", signal: AbortSignal.timeout(15000) }); return r.ok ? r.json() : null; });

  if (report.mode === "dry-run") {
    report.notes.push(!mail.enabled ? "Email is off (no RESEND_API_KEY). Nothing sent." : "DIGEST_SEND_ENABLED is not \"true\". Nothing sent.");
    report.issue = { id: issueId, wouldStartThisRun: startsToday && !(await store.get(`digest/issues/${issueId}.json`)) };
    return report;
  }
  const key = await signingKey(store, env);
  let budget = cap;

  if (report.mode === "test") {
    const marker = `digest/test/${issueId}.json`;
    if (!startsToday || (await store.get(marker))) { report.notes.push("Test issue already sent this week (or not send day yet)."); return report; }
    const data = await getData();
    if (!data?.picks?.length) { report.notes.push("No digest data available."); return report; }
    await sendBatch([digestMessage({ ...data, issueId }, testTo, key)], env, `test-${issueId}`);
    await store.put(marker, { sentAt: now.toISOString(), to: emailKey(testTo) });
    report.digestsSent = 1; report.issue = { id: issueId, test: true };
    return report;
  }

  // 1) Confirm emails for anyone who signed up before email was switched on.
  const backlog = pending.filter((r) => !r.confirmSentAt).slice(0, Math.floor(budget / 2));
  if (backlog.length) {
    const msgs = backlog.map((r) => ({ to: r.email, ...renderConfirmEmail({ confirmUrl: `${SITE}/api/confirm?token=${makeToken(key, "confirm", r.email, { ttlDays: 7 })}` }), tags: [{ name: "type", value: "confirm" }] }));
    for (let i = 0; i < msgs.length; i += 100) {
      await sendBatch(msgs.slice(i, i + 100), env);
      for (const r of backlog.slice(i, i + 100)) await saveRecord(store, { ...r, confirmSentAt: now.toISOString() });
    }
    report.confirmsSent = backlog.length; budget -= backlog.length;
  }

  // 2) This week's issue.
  const statePath = `digest/issues/${issueId}.json`;
  let state = await store.get(statePath);
  if (!state) {
    if (!startsToday) { report.notes.push(`Next issue starts on ${sendDay}.`); return report; }
    const data = await getData();
    if (!data?.picks?.length) { report.notes.push("No digest data available; will retry next run."); return report; }
    state = { issueId, startedAt: now.toISOString(), data: { ...data, issueId }, sentTo: [] };
    await store.put(statePath, state);
  }
  const done = new Set(state.sentTo);
  const todo = confirmed.filter((r) => !done.has(emailKey(r.email))).slice(0, Math.max(0, budget));
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const idem = `${issueId}-${createHash("sha256").update(chunk.map((r) => r.email).join(",")).digest("hex").slice(0, 24)}`;
    await sendBatch(chunk.map((r) => digestMessage(state.data, r.email, key)), env, idem);
    state.sentTo.push(...chunk.map((r) => emailKey(r.email)));
    await store.put(statePath, state);
    report.digestsSent += chunk.length;
  }
  const left = confirmed.filter((r) => !new Set(state.sentTo).has(emailKey(r.email))).length;
  report.issue = { id: issueId, startedAt: state.startedAt, sentSoFar: state.sentTo.length, remaining: left };
  if (left) report.notes.push(`${left} left for this issue; they go out on the next run (daily cap ${cap}).`);
  return report;
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  try {
    const report = await run();
    console.log("digest run:", JSON.stringify(report));
    return json(report);
  } catch (e) {
    const msg = String(e.message || e).slice(0, 200);
    console.error("digest run failed:", msg);
    return json({ error: "failed", message: msg }, 500);
  }
}
