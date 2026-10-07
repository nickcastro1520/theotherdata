// "How to read this" guided tour for stock pages. No libraries: a spotlight box, a small dialog,
// keyboard support, and a localStorage flag so it only offers itself once.
(() => {
  "use strict";
  const KEY = "tod.tour.v1"; // "done" | "dismissed"
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode: fine */ } },
  };
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const detailOpen = () => { const d = $("#detail"); return d && !d.hidden && $(".dhead", d); };

  const monthName = (d) => { const m = /^(\d{4})-(\d{2})/.exec(d || ""); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 15)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : ""; };
  let track = null, trackP = null;
  const loadTrack = () => (trackP ||= fetch("/data/track-record.json", { cache: "default" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => (track = j)));

  // ---------- steps ----------
  function buildSteps(ctx) {
    const firstSig = $("#detail .sig");
    const sigName = firstSig ? $("h3", firstSig)?.firstChild?.textContent?.trim() : "";
    const chg = $("#detail .sig .chg");
    const flip = [...document.querySelectorAll("#detail .sig")].find((c) => {
      const ch = $(".nums .chg", c); if (!ch) return false;
      return (ch.classList.contains("up") && c.classList.contains("headwind")) || (ch.classList.contains("down") && c.classList.contains("tailwind"));
    });
    const call = $("#detail .impact .call .badge");
    const counts = $("#detail .impact .call .meta");
    const aiTag = $("#detail .ai-tag");
    const isAi = aiTag && /^AI summary/.test(aiTag.textContent);
    const co = ctx.company;
    const bt = track?.backtest?.summary?.[track?.primary || "1m"];
    const btPct = bt?.vsMktCalls ? Math.round((1000 * bt.vsMktHits) / bt.vsMktCalls) / 10 : null;
    const dirPct = bt?.calls ? Math.round((1000 * bt.hits) / bt.calls) / 10 : null;
    const trackLine = $("#track-line:not([hidden])");
    return [
      { title: `Welcome to ${co}'s page`, body: `<p>Here's a 1-minute walk through each part of the page, so you know what you're looking at.</p><p class="tour-sm">You can leave any time with <kbd>Esc</kbd> or "Skip". Use the arrow keys or the buttons to move.</p>` },
      { target: () => firstSig, title: "This is a signal card", body: `<p>Each card is one piece of offbeat public data${sigName ? `, like <strong>${esc(sigName)}</strong>` : ""}. It shows the latest number, a small chart of its recent history, and three short notes: what it is, why it might matter for ${esc(co)}, and what it's showing now.</p>` },
      { target: () => chg, title: "Green or red: did the number go up or down?", body: `<p>This tag compares the latest reading with its own recent past, called the <em>baseline</em> (for example, this year vs last year). <b class="t-up">Green</b> means the number went up. <b class="t-down">Red</b> means it went down.</p><p>On its own, it doesn't say whether that's good or bad.${chg ? ` Here it reads <strong>${esc(chg.textContent.trim())}</strong>.` : ""}</p>` },
      { target: () => $("#detail .sig .top .badge"), title: "Tailwind or headwind: good or bad for the company?", body: `<p>A <b class="t-up">tailwind</b> is a push in the company's favor. A <b class="t-down">headwind</b> pushes against it. <em>Neutral</em> means the move is small enough to be normal noise.</p><p>Usually "up" is a tailwind, but some signals <strong>flip</strong>. A pile-up of unsold inventory, or more owner complaints, is a headwind even though the number is up (green). Fewer complaints are red but a tailwind.${flip ? ` On this page, <strong>${esc($("h3", flip)?.firstChild?.textContent?.trim())}</strong> is one of those flips.` : ""}</p>` },
      { target: () => $("#detail .impact .call"), title: "The lean: all the signals added up", body: `<p>We count the tailwinds and headwinds. More tailwinds gives <em>Lean tailwind</em>, more headwinds gives <em>Lean headwind</em>, a tie is <em>Mixed</em>, and nothing moving is <em>Quiet</em>.</p>${call ? `<p>Right now for ${esc(co)}: <strong>${esc(call.textContent.trim())}</strong>${counts ? ` (${esc(counts.textContent.trim())})` : ""}.</p>` : ""}` },
      { target: () => $("#detail .impact-steps .istep:nth-child(3)"), title: "Strength: how loud is the lean?", body: `<p><em>Mild</em>, <em>moderate</em>, or <em>strong</em> depends on how many signals moved a lot versus a little. It is not a price target, and it doesn't say how much the stock will move.</p>` },
      { target: () => $("#detail .impact-steps .istep:nth-child(4)"), title: "\u201cWeeks to a quarter\u201d: the usual time frame", body: `<p>Data like this is often treated as an early clue that may show up in a company's results over the next few weeks to about three months (a <em>quarter</em>). It's a rough range, not a clock, and the market may already know.</p>` },
      { target: () => $("#detail #summary-box"), title: isAi ? "The AI summary" : "The summary", body: isAi ? `<p>This paragraph is written by an AI (Google's Gemini) using only the numbers on this page. If it sounds like buy or sell advice, we throw it out and use a plain template instead.</p><p>Think of it as a handy recap, not an extra source of truth.</p>` : `<p>This paragraph is written from a template using the numbers on this page. It's a quick recap of the cards below.</p>` },
      { target: () => $("#detail .sig .srcline"), title: "Where the data comes from", body: `<p>Every card names its source with a link. The <strong>"data through"</strong> date tells you how recent the newest number is.</p><p>Some sources only publish monthly, so a number can be a few weeks old even though we check for new data every 4 hours.</p>` },
      { target: () => $("#detail .pricebox"), title: "The stock price, for context", body: `<p>This is the current share price, so you can compare. The signals don't predict it.</p>` },
      { target: () => trackLine, title: "Has this worked before?", body: `<p>We log every lean and later check what the stock did.${btPct != null ? ` In our backtest (${esc(monthName(track.backtest.from))} to ${esc(monthName(track.backtest.to))}), the stock moved the way the lean pointed over the next month <strong>${dirPct}%</strong> of the time (${bt.hits} of ${bt.calls}), and beat or lagged the S&amp;P 500 as leaned <strong>${btPct}%</strong> of the time. That's <strong>about a coin flip</strong>.` : " The track record page shows how past leans did."}</p><p>So treat a lean as a <strong>conversation starter</strong>, a reason to look closer, not a prediction.</p>` },
      { title: "That's it!", body: `<ul class="tour-recap"><li><b class="t-up">Green</b> / <b class="t-down">red</b> = the number went up or down.</li><li>Tailwind / headwind = good or bad for the company (some signals flip).</li><li>The lean adds the signals up. Strength says how loud it is.</li><li>Past leans were about a coin flip, so use them to start a conversation.</li></ul><p class="tour-fine">Education only. Not financial advice. Nothing here tells you to buy or sell.</p><p><a href="/how-to-read">Read the full beginner's guide →</a></p>${window.TODSubscribeForm ? `<div class="sub-tour"><p class="tour-sm"><strong>Want the strangest signals in your inbox once a week?</strong></p>${window.TODSubscribeForm.html("tour")}</div>` : ""}` },
    ];
  }

  // ---------- UI ----------
  let state = null;
  function ensureUi() {
    let spot = $("#tour-spot"), dlg = $("#tour-dlg");
    if (!spot) { spot = document.createElement("div"); spot.id = "tour-spot"; spot.className = "tour-spot"; spot.setAttribute("aria-hidden", "true"); document.body.appendChild(spot); }
    if (!dlg) {
      dlg = document.createElement("div"); dlg.id = "tour-dlg"; dlg.className = "tour-dlg";
      dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "false"); dlg.setAttribute("aria-labelledby", "tour-title"); dlg.setAttribute("aria-describedby", "tour-body"); dlg.tabIndex = -1;
      document.body.appendChild(dlg);
    }
    return { spot, dlg };
  }

  function place() {
    if (!state) return;
    const { spot, dlg } = ensureUi();
    const el = state.el;
    const vw = window.innerWidth, vh = window.innerHeight, mobile = vw < 640;
    dlg.classList.toggle("sheet", mobile);
    if (!el) {
      spot.classList.add("full"); spot.style.top = spot.style.left = "0px"; spot.style.width = vw + "px"; spot.style.height = vh + "px";
      dlg.classList.add("center"); dlg.style.left = dlg.style.top = "";
      return;
    }
    spot.classList.remove("full"); dlg.classList.remove("center");
    const r = el.getBoundingClientRect(), pad = 6;
    const top = Math.max(r.top - pad, 4), bottom = Math.min(r.bottom + pad, vh - 4);
    spot.style.left = Math.max(r.left - pad, 4) + "px";
    spot.style.top = top + "px";
    spot.style.width = Math.min(r.width + pad * 2, vw - 8) + "px";
    spot.style.height = Math.max(bottom - top, 24) + "px";
    if (mobile) { dlg.style.left = dlg.style.top = ""; return; }
    const dw = dlg.offsetWidth, dh = dlg.offsetHeight, gap = 14;
    let y = r.bottom + gap;
    if (y + dh > vh - 8) y = r.top - gap - dh;           // not enough room below → above
    if (y < 70) y = Math.min(vh - dh - 12, Math.max(70, r.top + 12)); // tall target → overlap its top area
    let x = Math.min(Math.max(r.left, 12), vw - dw - 12);
    dlg.style.left = x + "px"; dlg.style.top = Math.max(y, 12) + "px";
  }

  function scrollToTarget(el) {
    if (!el) return;
    const header = $("header.top")?.offsetHeight || 0;
    const r = el.getBoundingClientRect();
    const mobile = window.innerWidth < 640;
    const room = window.innerHeight - header - (mobile ? Math.min(window.innerHeight * 0.48, 360) : 0);
    // Short targets: center them in the free area. Tall ones: align their top under the header.
    const offset = r.height < room - 40 ? header + (room - r.height) / 2 : header + 16;
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - offset), behavior: reduceMotion() ? "auto" : "smooth" });
  }

  function render() {
    const { dlg } = ensureUi();
    const steps = state.steps;
    const s = steps[state.i];
    state.el = s.target ? s.target() : null;
    const last = state.i === steps.length - 1;
    dlg.innerHTML = `<div class="tour-head"><span class="tour-count">${state.i + 1} of ${steps.length}</span><button type="button" class="tour-x" data-tour="skip" aria-label="Close the tour">×</button></div>
      <h2 id="tour-title">${esc(s.title)}</h2>
      <div id="tour-body" class="tour-body">${s.body}</div>
      <div class="tour-bar" aria-hidden="true"><i></i></div>
      <div class="tour-actions">
        ${state.i ? `<button type="button" class="tour-btn ghost" data-tour="back">← Back</button>` : `<button type="button" class="tour-btn ghost" data-tour="skip">Skip tour</button>`}
        <button type="button" class="tour-btn" data-tour="${last ? "done" : "next"}">${last ? "Done" : "Next →"}</button>
      </div>`;
    const bar = $(".tour-bar i", dlg); if (bar) bar.style.width = `${Math.round(((state.i + 1) / steps.length) * 100)}%`;
    scrollToTarget(state.el);
    place();
    // Re-place once smooth scrolling settles.
    clearTimeout(state.t1); state.t1 = setTimeout(place, reduceMotion() ? 0 : 450);
    (dlg.querySelector('[data-tour="next"],[data-tour="done"]') || dlg).focus({ preventScroll: true });
    const live = $("#tour-live"); if (live) live.textContent = `Step ${state.i + 1} of ${steps.length}: ${s.title}`;
  }

  function go(i) { if (!state) return; state.i = Math.max(0, Math.min(state.steps.length - 1, i)); render(); }

  async function start() {
    if (state) return;
    if (!detailOpen()) { location.href = "/?tour=1#/AMZN"; return; }
    await loadTrack();
    const company = $("#detail .dhead h1")?.textContent?.trim() || "this company";
    const steps = buildSteps({ company }).filter((s) => !s.target || s.target());
    state = { i: 0, steps, el: null, opener: document.activeElement };
    document.body.classList.add("touring");
    $(".tour-invite")?.remove();
    if (!$("#tour-live")) { const l = document.createElement("p"); l.id = "tour-live"; l.className = "sr"; l.setAttribute("aria-live", "polite"); document.body.appendChild(l); }
    window.addEventListener("resize", onMove); window.addEventListener("scroll", onMove, { passive: true });
    render();
  }
  function end(how) {
    if (!state) return;
    store.set(how === "done" ? "done" : "dismissed");
    const opener = state.opener;
    clearTimeout(state.t1);
    state = null;
    document.body.classList.remove("touring");
    $("#tour-spot")?.remove(); $("#tour-dlg")?.remove();
    window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  }
  let raf = 0;
  const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

  // ---------- wiring ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tour],[data-tour-start],[data-tour-dismiss],.help-btn");
    if (!t) return;
    if (t.matches("[data-tour-start]")) { e.preventDefault(); start(); return; }
    if (t.matches(".help-btn")) { if (detailOpen()) { e.preventDefault(); start(); } return; } // elsewhere: follow the link to /how-to-read
    if (t.matches("[data-tour-dismiss]")) { store.set("dismissed"); t.closest(".tour-invite")?.remove(); return; }
    const a = t.dataset.tour;
    if (a === "next") go(state.i + 1); else if (a === "back") go(state.i - 1); else if (a === "skip") end("skip"); else if (a === "done") end("done");
  });
  document.addEventListener("keydown", (e) => {
    if (!state) return;
    if (e.key === "Escape") { e.preventDefault(); end("skip"); }
    else if (e.key === "ArrowRight" && !e.target.closest("input,textarea")) { e.preventDefault(); if (state.i < state.steps.length - 1) go(state.i + 1); }
    else if (e.key === "ArrowLeft" && !e.target.closest("input,textarea")) { e.preventDefault(); go(state.i - 1); }
    else if (e.key === "Tab") { // keep focus inside the dialog while touring
      const f = [...$("#tour-dlg").querySelectorAll("button:not([disabled]),a[href],input:not([type=hidden]):not([tabindex='-1']):not([disabled])")];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
    }
  });
  window.addEventListener("hashchange", () => end("skip"));

  // Offer the tour once on stock pages; ?tour=1 starts it straight away.
  const wantTour = new URLSearchParams(location.search).get("tour") === "1";
  document.addEventListener("tod:detail", (e) => {
    if (wantTour && !state && !document.body.dataset.tourAuto) {
      document.body.dataset.tourAuto = "1";
      history.replaceState(null, "", location.pathname + location.hash);
      setTimeout(start, 350);
      return;
    }
    const seen = store.get();
    if (seen || e.detail?.pack === "light" || $(".tour-invite")) return;
    const top = $("#detail .dtop");
    if (!top) return;
    top.insertAdjacentHTML("afterend", `<div class="tour-invite" role="region" aria-label="Guided tour offer"><p><strong>New to this?</strong> Take a 1-minute tour of this page: what the colors, leans, and dates mean.</p><div><button type="button" class="tour-btn" data-tour-start>Start the tour</button><button type="button" class="tour-btn ghost" data-tour-dismiss>No thanks</button></div></div>`);
  });

  window.TODTour = { start, end: () => end("skip"), reset: () => { try { localStorage.removeItem(KEY); } catch { /* */ } } };
})();
