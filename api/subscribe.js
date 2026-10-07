// POST /api/subscribe  {email, consent, website (honeypot), t (form render time)}
// GET  /api/subscribe  -> {open, confirmEmails}: is signup storage connected, are confirm emails on?
// Double opt-in: this only stores a *pending* address and sends a confirm link (when email is on).
import { getStore, addPending, markConfirmSent, validEmail, normEmail, rateLimited, clientIp, signingKey, makeToken } from "../lib/subscribers.js";
import { mailerStatus, sendEmail } from "../lib/mailer.js";
import { renderConfirmEmail, SITE } from "../lib/digest.js";
import { json, redirect, readBody, sameOrigin } from "../lib/page.js";

const MESSAGES = {
  check_inbox: "Almost done. Check your inbox for a confirmation link (and your spam folder, just in case). Nothing is sent until you click it.",
  waitlist: "You're on the list. Email sending isn't switched on yet, so your confirmation link will arrive before the first issue. Nothing is sent until you click it.",
  not_open: "Signups open soon. The digest isn't live yet, so nothing was saved.",
  invalid_email: "That email address doesn't look right. Mind checking it?",
  need_consent: "Please tick the box to confirm you want the weekly email.",
  rate_limited: "Too many tries from this connection. Please wait a few minutes and try again.",
  error: "Something went wrong on our side. Nothing was sent. Please try again later.",
};
export const siteUrl = (request) => { const u = new URL(request.url); return /localhost|127\.0\.0\.1/.test(u.host) ? `${u.protocol}//${u.host}` : SITE; };

export async function GET() {
  const store = getStore();
  return json({ open: Boolean(store), confirmEmails: mailerStatus().enabled }, 200, { "Cache-Control": "public, s-maxage=60" });
}

export async function POST(request) {
  const body = await readBody(request);
  const wantsJson = body.isJson || (request.headers.get("accept") || "").includes("application/json");
  const reply = (status, code, http = 200) => wantsJson
    ? json({ ok: code === "check_inbox" || code === "waitlist", status: code, message: MESSAGES[code] }, http)
    : redirect(`/subscribe?status=${code}`);
  if (body.tooBig || !sameOrigin(request)) return reply(null, "error", 400);
  const d = body.data || {};
  const store = getStore();
  const mail = mailerStatus();
  const okCode = mail.enabled ? "check_inbox" : "waitlist";

  // Bots: honeypot filled, or the form was submitted faster than a person could (t = ms timestamp set by JS).
  const t = Number(d.t);
  if (String(d.website || "").trim() || (t > 0 && Date.now() - t < 1500)) return reply(null, store ? okCode : "not_open");
  if (rateLimited(`ip:${clientIp(request)}`, { max: 5 }) || rateLimited("global", { max: 120 })) return reply(null, "rate_limited", 429);

  const email = normEmail(d.email);
  if (!validEmail(email)) return reply(null, "invalid_email", 400);
  if (!(d.consent === true || d.consent === "on" || d.consent === "yes" || d.consent === "1")) return reply(null, "need_consent", 400);
  if (!store) return reply(null, "not_open", 503);
  if (rateLimited(`email:${email}`, { max: 3, windowMs: 60 * 60e3 })) return reply(null, okCode);

  try {
    const { action, record } = await addPending(store, email, { page: String(d.page || "") });
    // "already" and "cooldown" get the same answer as a new signup, so the form never reveals who's subscribed.
    if ((action === "created" || action === "resend") && mail.enabled) {
      const key = await signingKey(store);
      const site = siteUrl(request);
      const confirmUrl = `${site}/api/confirm?token=${makeToken(key, "confirm", email, { ttlDays: 7 })}`;
      try {
        await sendEmail({ to: email, ...renderConfirmEmail({ confirmUrl, site }), tags: [{ name: "type", value: "confirm" }] });
        await markConfirmSent(store, record);
      } catch (e) {
        console.error("confirm email failed:", String(e.message || e).slice(0, 160));
        return reply(null, "waitlist");
      }
    }
    return reply(null, okCode);
  } catch (e) {
    console.error("subscribe failed:", String(e.message || e).slice(0, 160));
    return reply(null, "error", 500);
  }
}
