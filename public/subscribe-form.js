// Weekly digest signup form: one template (used by the build for static pages and by the tour at
// runtime) plus progressive enhancement. Without JS the form still posts to /api/subscribe.
(function (root) {
  "use strict";
  const CONSENT = "Send me the weekly email of the strangest signal moves. I can unsubscribe in one click anytime.";
  let n = 0;
  function html(variant = "full") {
    const id = `sub-${variant}-${++n}`;
    const compact = variant !== "full";
    return `<form class="sub-form sub-${variant}" method="post" action="/api/subscribe" data-sub>
  <label class="sub-l${compact ? " sr" : ""}" for="${id}">Your email</label>
  <div class="sub-row"><input id="${id}" type="email" name="email" required maxlength="254" autocomplete="email" inputmode="email" placeholder="you@example.com"><button class="btn" type="submit">Get the weekly digest</button></div>
  <label class="sub-consent"><input type="checkbox" name="consent" value="on" required> <span>${CONSENT}</span></label>
  <p class="sub-fine">We email a confirmation link first, and use your address only for this digest. <a href="/privacy">Privacy</a> · <a href="/digest">See this week's issue</a> · Education only, not financial advice.</p>
  <div class="hp" aria-hidden="true"><label>Leave this field empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="t" value=""><input type="hidden" name="page" value="">
  <p class="sub-msg" role="status" aria-live="polite"></p>
</form>`;
  }

  const STATUS = {
    check_inbox: ["ok", "Almost done. Check your inbox for a confirmation link (and your spam folder, just in case)."],
    waitlist: ["ok", "You're on the list. Email sending isn't switched on yet, so your confirmation link will arrive before the first issue. Nothing is sent until you click it."],
    confirmed: ["ok", "You're in. The digest arrives once a week. Every issue has a one-click unsubscribe link."],
    unsubscribed: ["ok", "You're unsubscribed, and we've deleted your address. Sorry to see you go."],
    missing: ["warn", "That confirmation link is no longer active (unconfirmed signups are cleared after 14 days). Sign up again below."],
    expired: ["warn", "That confirmation link has expired. Sign up again below and we'll send a fresh one."],
    invalid: ["warn", "That link is incomplete or has been changed. Try it again from the email, or sign up again below."],
    not_open: ["warn", "Signups open soon. The digest isn't live yet, so nothing was saved."],
    invalid_email: ["warn", "That email address doesn't look right. Mind checking it?"],
    need_consent: ["warn", "Please tick the box to confirm you want the weekly email."],
    rate_limited: ["warn", "Too many tries from this connection. Please wait a few minutes and try again."],
    error: ["warn", "Something went wrong on our side. Nothing was sent. Please try again later."],
  };

  function enhance(doc) {
    let state = null;
    const status = () => (state ||= fetch("/api/subscribe", { headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    const prep = (f) => {
      if (f.dataset.ready) return;
      f.dataset.ready = "1";
      f.elements.t.value = String(Date.now());
      f.elements.page.value = location.pathname;
      status().then((s) => {
        if (s && s.open === false) {
          f.classList.add("sub-closed");
          const m = f.querySelector(".sub-msg"); m.className = "sub-msg warn"; m.textContent = "Signups open soon. The digest isn't live yet.";
          for (const el of f.querySelectorAll("input,button")) el.disabled = true;
        }
      });
    };
    const scan = () => doc.querySelectorAll("form[data-sub]").forEach(prep);
    scan();
    new MutationObserver(scan).observe(doc.body, { childList: true, subtree: true });

    doc.addEventListener("submit", async (ev) => {
      const f = ev.target.closest && ev.target.closest("form[data-sub]");
      if (!f) return;
      ev.preventDefault();
      const msg = f.querySelector(".sub-msg");
      const say = (kind, text) => { msg.className = `sub-msg ${kind}`; msg.textContent = text; };
      const email = f.elements.email, consent = f.elements.consent;
      if (!email.value.trim() || !email.checkValidity()) { say("warn", STATUS.invalid_email[1]); email.focus(); return; }
      if (!consent.checked) { say("warn", STATUS.need_consent[1]); consent.focus(); return; }
      const btn = f.querySelector("button[type=submit]");
      btn.disabled = true; say("", "Sending…");
      try {
        const r = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: email.value, consent: consent.checked, website: f.elements.website.value, t: Number(f.elements.t.value) || 0, page: f.elements.page.value }) });
        const j = await r.json().catch(() => ({}));
        const [kind, text] = STATUS[j.status] || STATUS.error;
        say(kind, j.message || text);
        if (j.ok) { f.classList.add("sub-done"); email.value = ""; consent.checked = false; }
      } catch { say("warn", STATUS.error[1]); }
      finally { btn.disabled = false; }
    });

    // /subscribe?status=… (where the confirm/unsubscribe buttons and no-JS form posts land)
    const box = doc.querySelector("[data-sub-status]");
    const code = new URLSearchParams(location.search).get("status");
    if (box && code && STATUS[code]) {
      box.hidden = false;
      box.classList.add(STATUS[code][0]);
      box.textContent = STATUS[code][1];
      if (code === "confirmed" || code === "unsubscribed") doc.title = (code === "confirmed" ? "You're subscribed" : "Unsubscribed") + " | The Other Data";
    }
  }

  const api = { html, CONSENT, STATUS };
  root.TODSubscribeForm = api;
  if (typeof document !== "undefined" && document.addEventListener) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => enhance(document)); else enhance(document);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
