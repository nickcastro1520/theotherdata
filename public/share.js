// Share menu for stock and signal pages: copy link, post to X or LinkedIn, or download the card image
// (wide for posts, vertical for TikTok / Instagram Stories). Uses the TODCard model from card-model.js.
// No inline styles or scripts (strict CSP). Education only, not advice.
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let pop = null, lastFocus = null;
  const track = (method, m) => { try { window.gtag && window.gtag("event", "share", { method, content_type: m.kind || "stock", item_id: m.id ? `${m.ticker}/${m.id}` : m.ticker }); } catch {} };

  function close() {
    if (!pop) return;
    pop.remove(); pop = null;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onOutside, true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
  function onOutside(e) { if (pop && !pop.contains(e.target) && !e.target.closest("[data-share-stock],[data-share-signal]")) close(); }

  async function copy(text, input) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { try { input.select(); return document.execCommand("copy"); } catch { return false; } }
  }

  function open(m, trigger) {
    close();
    lastFocus = trigger || document.activeElement;
    const C = window.TODCard;
    const links = C.shareLinks(m.url, m.shareText);
    const file = (v) => `theotherdata-${m.ticker}${m.id ? `-${m.id}` : ""}${v ? "-vertical" : ""}.png`;
    pop = document.createElement("div");
    pop.className = "share-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "false");
    pop.setAttribute("aria-label", m.kind === "signal" ? "Share this signal" : "Share this stock");
    pop.innerHTML = `
      <div class="share-head"><strong>${m.kind === "signal" ? "Share this signal" : `Share ${esc(m.ticker)}`}</strong><button type="button" class="share-x" aria-label="Close">×</button></div>
      ${m.img ? `<img class="share-prev" src="${esc(m.img)}" alt="${esc(`Share card: ${m.headline}, ${m.lean.word}`)}" width="1200" height="630" loading="lazy">` : ""}
      <label class="share-l" for="share-url">Link</label>
      <div class="share-row"><input id="share-url" class="share-url" type="text" readonly value="${esc(m.url)}"><button type="button" class="btn share-copy">Copy link</button></div>
      <div class="share-btns">
        <a class="share-b x" href="${esc(links.x)}" target="_blank" rel="noopener" data-m="x">Post on X</a>
        <a class="share-b li" href="${esc(links.linkedin)}" target="_blank" rel="noopener" data-m="linkedin">Share on LinkedIn</a>
        ${navigator.share ? `<button type="button" class="share-b more" data-m="native">More…</button>` : ""}
      </div>
      ${m.img ? `<p class="share-l">Download the card</p>
      <div class="share-btns">
        <a class="share-b dl" href="${esc(m.img)}" download="${esc(file(false))}" data-m="download_wide">Image for posts (1200×630)</a>
        <a class="share-b dl" href="${esc(m.imgVertical)}" download="${esc(file(true))}" data-m="download_vertical">TikTok / IG Stories (1080×1920)</a>
      </div>` : `<p class="share-note">Image cards are made for the curated stocks on the home page.</p>`}
      <p class="share-fine">Education only, not advice.</p>
      <p class="share-msg" role="status" aria-live="polite"></p>`;
    document.body.appendChild(pop);
    const msg = pop.querySelector(".share-msg");
    const input = pop.querySelector(".share-url");
    pop.querySelector(".share-x").addEventListener("click", close);
    pop.querySelector(".share-copy").addEventListener("click", async () => {
      const ok = await copy(m.url, input);
      msg.textContent = ok ? "Link copied." : "Couldn't copy. Select the link and copy it.";
      if (ok) track("copy_link", m);
    });
    pop.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      if (b.dataset.m === "native") {
        e.preventDefault();
        try { await navigator.share({ title: m.title, text: m.shareText, url: m.url }); track("native", m); } catch {}
        return;
      }
      track(b.dataset.m, m);
      if (b.dataset.m.startsWith("download")) msg.textContent = "Downloading the card…";
    });
    document.addEventListener("keydown", onKey, true);
    setTimeout(() => document.addEventListener("pointerdown", onOutside, true), 0);
    pop.querySelector(".share-copy").focus();
  }

  window.TODShare = { open, close };
})();
