// Weekly "strangest signals" digest: picks the week's most interesting live signal moves from the
// data the site already publishes, then renders an email (HTML + plain text) from those numbers only.
// Nothing here invents a figure: every number comes from public/data/*.json.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import "../public/featured.js";
import "../public/track-text.js";

const F = globalThis.TODFeatured;
const T = globalThis.TODTrack;
export const SITE = "https://theotherdata.com";
export const DISCLAIMER = "Education only. Not financial advice. These are clues from public data, not predictions, and nothing here tells you to buy or sell anything. Signals can be wrong, late, or already priced in.";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ISO week id like "2026-W41" (weeks start Monday, UTC).
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const y = d.getUTCFullYear();
  const wk = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}
// Monday of the ISO week, "Oct 5, 2026".
export function weekOf(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const dataThrough = (asOf, freq) => {
  if (!asOf) return "";
  const [y, m, d] = String(asOf).slice(0, 10).split("-").map(Number);
  if (!y || !m) return "";
  return freq === "daily" || freq === "weekly" || (d && d > 1) ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${y}`;
};
const signed = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p) >= 10 ? Math.round(Math.abs(p)) : Math.abs(p).toFixed(1).replace(/\.0$/, "")}%`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Build the issue from already-published data. `details` maps ticker -> /data/tickers/<T>.json.
export function buildDigestData({ index, details = {}, track = null, now = new Date(), site = SITE, limit = 5 }) {
  // Rank by "offbeat" score alone (no flagship), so the issue isn't the same story every week.
  const picks = F.pick(index, { limit, flagship: [] }).map((c) => {
    const d = details[c.ticker];
    const full = d?.signals?.find((s) => s.id === c.signal.id) || {};
    const s = { ...full, ...c.signal };
    const pct = Number(s.pct);
    return {
      ticker: c.ticker,
      company: c.name,
      id: s.id,
      signal: s.name,
      change: signed(pct),
      pct: Math.round(pct * 10) / 10,
      direction: pct > 0 ? "up" : "down",
      basis: s.basis || "",
      reading: s.reading,
      strength: full.strength || null,
      plain: F.plainRead(full.now) || null,
      what: F.firstSentence(full.what || ""),
      why: F.firstSentence(full.why || ""),
      dataThrough: dataThrough(s.asOf, full.freq),
      source: { name: (typeof s.source === "string" ? s.source : s.source?.name) || "", url: s.sourceUrl || full.source?.url || "" },
      url: `${site}/#/${encodeURIComponent(c.ticker)}`,
    };
  });
  if (!picks.length) return null;

  // The story: the top pick, told in three plain sentences straight from its card.
  const top = picks[0];
  const topFull = details[top.ticker]?.signals?.find((s) => s.id === top.id) || {};
  const story = {
    ticker: top.ticker,
    company: top.company,
    signal: top.signal,
    title: `${top.signal} ${top.direction === "up" ? "rose" : "fell"} ${top.change.replace(/^[+−]/, "")} (${top.basis || "vs its recent past"})`,
    paragraphs: [
      topFull.what ? topFull.what : null,
      topFull.why ? `Why it might matter for ${top.company}: ${topFull.why.charAt(0).toLowerCase()}${topFull.why.slice(1)}` : null,
      top.plain ? `What it shows now: ${top.plain.charAt(0).toLowerCase()}${top.plain.slice(1)} We read that as a ${top.strength ? `${top.strength} ` : ""}${top.reading} for ${top.company}, which is a clue, not a forecast.` : null,
    ].filter(Boolean),
    url: top.url,
  };

  // Track-record line: the honest scorecard, from /data/track-record.json.
  let trackLine = null;
  if (track?.backtest?.summary) {
    const w = track.primary || "1m";
    const bt = track.backtest.summary[w];
    if (bt?.calls) {
      const v = T.verdict(bt);
      trackLine = `In our backtest (${T.month(track.backtest.from)}–${T.month(track.backtest.to)}), the stock moved the way the lean pointed over the next month ${T.fmtPct(bt.hits, bt.calls)} of the time (${bt.hits} of ${bt.calls}). ${v.key === "coin" ? "That's about a coin flip, so treat these as conversation starters, not predictions." : v.text}`;
      const lv = track.live?.summary?.[w];
      if (lv?.calls) trackLine += ` Live since ${T.day(track.live.startedOn)}: ${lv.hits} of ${lv.calls} right on direction.`;
      else if (track.live?.startedOn) trackLine += ` Live tracking started ${T.day(track.live.startedOn)}${track.live.firstResultsAfter ? `; first live results after ${T.day(track.live.firstResultsAfter)}` : ""}.`;
    }
  }

  // Subject: the top signal names as written on the site, cut at a whole name to stay short.
  let subject = "This week's strangest signals: ";
  const names = [...new Set(picks.map((p) => p.signal))];
  names.forEach((n, i) => { if (i < 3 && (subject + n).length <= 95) subject += (i ? ", " : "") + n; });
  if (subject.endsWith(": ")) subject = "This week's strangest signals";
  return {
    version: 1,
    issueId: isoWeek(now),
    weekOf: weekOf(now),
    generatedAt: now.toISOString(),
    dataUpdatedAt: index.generatedAt || null,
    subject,
    preheader: `${top.signal} for ${top.company}: ${top.change} ${top.basis}. Plus ${picks.length - 1} more offbeat moves, explained in plain English.`,
    picks,
    story,
    trackLine,
    links: { site, track: `${site}/track`, guide: `${site}/how-to-read`, sample: `${site}/digest`, privacy: `${site}/privacy` },
    disclaimer: DISCLAIMER,
  };
}

export async function loadDigestInputs(dir) {
  const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
  let track = null;
  try { track = JSON.parse(await readFile(join(dir, "track-record.json"), "utf8")); } catch {}
  const details = {};
  for (const t of index.tickers || []) {
    try { details[t.ticker] = JSON.parse(await readFile(join(dir, "tickers", `${t.ticker}.json`), "utf8")); } catch {}
  }
  return { index, details, track };
}

// ---------- rendering ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https:\/\//i.test(String(u || "")) ? String(u) : "#");
const C = { bg: "#f4f6f8", card: "#ffffff", ink: "#0f172a", dim: "#5b6474", line: "#e3e8ee", teal: "#0f766e", up: "#047857", down: "#b91c1c", amber: "#92400e" };

function readingChip(p) {
  const tw = p.reading === "tailwind";
  const color = tw ? C.up : C.down;
  const bg = tw ? "#ecfdf5" : "#fef2f2";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:700;letter-spacing:.02em;text-transform:uppercase">${esc(p.strength ? `${p.strength} ` : "")}${esc(p.reading)}</span>`;
}

// opts: { unsubscribeUrl, webUrl } (unsubscribeUrl omitted in previews)
export function renderDigestHtml(d, opts = {}) {
  const unsub = opts.unsubscribeUrl || `${d.links.site}/subscribe`;
  const rows = d.picks.map((p, i) => `
      <tr><td style="padding:16px 0;border-top:1px solid ${C.line}">
        <div style="font-size:12px;color:${C.dim};letter-spacing:.04em;text-transform:uppercase;font-weight:700">${i + 1}. ${esc(p.company)} (${esc(p.ticker)})</div>
        <div style="font-size:17px;font-weight:700;color:${C.ink};margin:4px 0 6px">${esc(p.signal)}
          <span style="font-family:Menlo,Consolas,monospace;font-size:14px;color:${p.direction === "up" ? C.up : C.down};white-space:nowrap">${esc(p.change)}</span>
          <span style="font-size:13px;color:${C.dim};font-weight:400">${esc(p.basis)}</span></div>
        <div style="margin:0 0 8px">${readingChip(p)}</div>
        ${p.plain ? `<div style="font-size:15px;line-height:1.5;color:${C.ink}">${esc(p.plain)}</div>` : ""}
        ${p.why ? `<div style="font-size:14px;line-height:1.5;color:${C.dim};margin-top:4px">Why it might matter: ${esc(p.why)}</div>` : ""}
        <div style="font-size:12px;color:${C.dim};margin-top:8px">Source: ${p.source.url ? `<a href="${esc(safeUrl(p.source.url))}" style="color:${C.dim}">${esc(p.source.name)}</a>` : esc(p.source.name)}${p.dataThrough ? ` · data through ${esc(p.dataThrough)}` : ""} · <a href="${esc(p.url)}" style="color:${C.teal};font-weight:700">See the ${esc(p.ticker)} page →</a></div>
      </td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(d.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(d.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border-radius:14px;border:1px solid ${C.line}">
  <tr><td style="padding:22px 28px 6px">
    <div style="font-size:15px;font-weight:800;letter-spacing:-.01em"><a href="${esc(d.links.site)}" style="color:${C.ink};text-decoration:none">the<span style="color:${C.teal}">other</span>data</a></div>
    <div style="font-size:12px;color:${C.dim};margin-top:2px">Weekly digest · week of ${esc(d.weekOf)}</div>
  </td></tr>
  <tr><td style="padding:10px 28px 0">
    <div style="background:#fffbeb;border:1px solid #fde68a;color:${C.amber};font-size:12.5px;line-height:1.45;border-radius:8px;padding:8px 12px">Education only. Not financial advice. These are clues from public data, not predictions.</div>
  </td></tr>
  <tr><td style="padding:18px 28px 0">
    <h1 style="font-size:24px;line-height:1.25;margin:0 0 6px;color:${C.ink}">This week's strangest signals</h1>
    <p style="font-size:15px;line-height:1.55;color:${C.dim};margin:0">The offbeat public numbers that moved the most this week, and what they might hint at. Green or red tells you whether the number went up or down. Tailwind or headwind tells you whether that's good or bad for the company.</p>
  </td></tr>
  <tr><td style="padding:18px 28px 0">
    <div style="font-size:12px;color:${C.teal};letter-spacing:.06em;text-transform:uppercase;font-weight:800">The story</div>
    <h2 style="font-size:19px;line-height:1.3;margin:6px 0 8px;color:${C.ink}">${esc(d.story.title)}</h2>
    ${d.story.paragraphs.map((t) => `<p style="font-size:15px;line-height:1.6;margin:0 0 10px;color:${C.ink}">${esc(t)}</p>`).join("")}
    <p style="margin:6px 0 0"><a href="${esc(d.story.url)}" style="display:inline-block;background:${C.teal};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 16px;border-radius:8px">See ${esc(d.story.company)}'s signals →</a></p>
  </td></tr>
  <tr><td style="padding:22px 28px 0">
    <div style="font-size:12px;color:${C.teal};letter-spacing:.06em;text-transform:uppercase;font-weight:800">Top ${d.picks.length} moves</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>
  ${d.trackLine ? `<tr><td style="padding:8px 28px 0"><div style="background:${C.bg};border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.5;color:${C.ink}"><strong>Our honest scorecard.</strong> ${esc(d.trackLine)} <a href="${esc(d.links.track)}" style="color:${C.teal}">Track record →</a></div></td></tr>` : ""}
  <tr><td style="padding:18px 28px 0;font-size:14px;line-height:1.6;color:${C.dim}">
    New to this? <a href="${esc(d.links.guide)}" style="color:${C.teal}">Read the 2-minute beginner's guide</a> · <a href="${esc(d.links.site)}" style="color:${C.teal}">Browse every stock</a>
  </td></tr>
  <tr><td style="padding:18px 28px 24px">
    <p style="font-size:12px;line-height:1.55;color:${C.dim};margin:0 0 8px;border-top:1px solid ${C.line};padding-top:14px">${esc(d.disclaimer)}</p>
    <p style="font-size:12px;line-height:1.55;color:${C.dim};margin:0">You're getting this because you signed up at theotherdata.com and confirmed your email. <a href="${esc(unsub)}" style="color:${C.dim}">Unsubscribe in one click</a> · <a href="${esc(d.links.privacy)}" style="color:${C.dim}">Privacy</a>${opts.webUrl ? ` · <a href="${esc(opts.webUrl)}" style="color:${C.dim}">View in browser</a>` : ""}<br>Built by Nick Castro · theotherdata.com</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

export function renderDigestText(d, opts = {}) {
  const unsub = opts.unsubscribeUrl || `${d.links.site}/subscribe`;
  const L = [];
  L.push(`THE OTHER DATA · weekly digest · week of ${d.weekOf}`, "", "Education only. Not financial advice. These are clues from public data, not predictions.", "", "THIS WEEK'S STRANGEST SIGNALS", "");
  L.push(`THE STORY: ${d.story.title}`, "", ...d.story.paragraphs.flatMap((t) => [t, ""]), `See ${d.story.company}'s signals: ${d.story.url}`, "");
  L.push(`TOP ${d.picks.length} MOVES`, "");
  d.picks.forEach((p, i) => {
    L.push(`${i + 1}. ${p.company} (${p.ticker}): ${p.signal} ${p.change} ${p.basis}. Reading: ${p.strength ? `${p.strength} ` : ""}${p.reading}.`);
    if (p.plain) L.push(`   ${p.plain}`);
    if (p.why) L.push(`   Why it might matter: ${p.why}`);
    L.push(`   Source: ${p.source.name}${p.dataThrough ? ` · data through ${p.dataThrough}` : ""}`, `   ${p.url}`, "");
  });
  if (d.trackLine) L.push(`OUR HONEST SCORECARD: ${d.trackLine}`, d.links.track, "");
  L.push(`New to this? Beginner's guide: ${d.links.guide}`, "", d.disclaimer, "", `Unsubscribe in one click: ${unsub}`, `Privacy: ${d.links.privacy}`, "Built by Nick Castro · theotherdata.com");
  return L.join("\n");
}

// Confirmation email (double opt-in).
export function renderConfirmEmail({ confirmUrl, site = SITE }) {
  const subject = "Confirm your weekly digest from The Other Data";
  const text = [
    "Hi,",
    "",
    "Someone (hopefully you) asked to get The Other Data's weekly email: the strangest signal moves of the week, explained in plain English.",
    "",
    `Confirm here: ${confirmUrl}`,
    "",
    "If you didn't ask for this, ignore this email. You won't hear from us again, and we delete unconfirmed addresses after 14 days.",
    "",
    "Education only. Not financial advice.",
    `${site}/privacy`,
  ].join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.card};border:1px solid ${C.line};border-radius:14px"><tr><td style="padding:24px 28px">
<div style="font-size:15px;font-weight:800">the<span style="color:${C.teal}">other</span>data</div>
<h1 style="font-size:21px;margin:14px 0 8px">Confirm your weekly digest</h1>
<p style="font-size:15px;line-height:1.55;margin:0 0 16px">Someone (hopefully you) asked to get our weekly email: the strangest signal moves of the week, explained in plain English.</p>
<p style="margin:0 0 16px"><a href="${esc(confirmUrl)}" style="display:inline-block;background:${C.teal};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:11px 18px;border-radius:8px">Yes, send me the digest</a></p>
<p style="font-size:13px;line-height:1.5;color:${C.dim};margin:0 0 10px">If you didn't ask for this, ignore this email. You won't hear from us again, and we delete unconfirmed addresses after 14 days.</p>
<p style="font-size:12px;color:${C.dim};margin:0">Education only. Not financial advice. <a href="${esc(site)}/privacy" style="color:${C.dim}">Privacy</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
