// Draws the shareable cards (PNG) from the TODCard model with satori (layout -> SVG) and resvg (SVG -> PNG).
// Fonts come from the @fontsource/inter npm package, so the Vercel build needs no system fonts.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
// The CommonJS build: satori's ESM build looks up __dirname to find its layout engine, which ESM lacks.
const satoriMod = require("satori");
const satori = satoriMod.default || satoriMod;
const C = { bg: "#070b16", panel: "#0f1629", line: "#2a3858", ink: "#e8edf7", mut: "#9aa8c3", dim: "#6b7a99", teal: "#5eead4", amber: "#fbbf24", up: "#34d399", down: "#f87171", flat: "#94a3b8" };
const TONE = { up: { fg: C.up, bg: "rgba(52,211,153,0.12)", br: "rgba(52,211,153,0.55)" }, down: { fg: C.down, bg: "rgba(248,113,113,0.12)", br: "rgba(248,113,113,0.55)" }, flat: { fg: C.flat, bg: "rgba(148,163,184,0.10)", br: "rgba(148,163,184,0.45)" } };
export const SIZES = { wide: { w: 1200, h: 630 }, vertical: { w: 1080, h: 1920 } };

let fonts;
async function loadFonts() {
  if (fonts) return fonts;
  const f = (w) => readFile(require.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff`));
  const [r, m, b, x] = await Promise.all([f(400), f(600), f(700), f(800)]);
  fonts = [{ name: "Inter", data: r, weight: 400 }, { name: "Inter", data: m, weight: 600 }, { name: "Inter", data: b, weight: 700 }, { name: "Inter", data: x, weight: 800 }];
  return fonts;
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const h = (type, style, ...children) => ({ type, props: { style: clean({ display: "flex", ...style }), children: children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== "") } });
const t = (text, style) => ({ type: "div", props: { style: { display: "flex", ...style }, children: String(text) } });

function logo(size) {
  const svg = { type: "svg", props: { width: size * 1.3, height: size * 1.3, viewBox: "0 0 64 64", children: [
    { type: "path", props: { d: "M8 40h10l6-16 8 26 7-20 5 10h12", fill: "none", stroke: C.teal, "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round" } },
    { type: "circle", props: { cx: 52, cy: 22, r: 5, fill: C.amber } },
  ] } };
  return h("div", { alignItems: "center", gap: size * 0.4 }, svg,
    h("div", { fontSize: size, fontWeight: 600, color: C.ink, letterSpacing: "-0.02em" }, t("the", {}), t("other", { color: C.teal, fontWeight: 800 }), t("data", {})));
}

function arrow(tone, size) {
  const fg = TONE[tone].fg;
  const pts = tone === "up" ? "12,3 22,20 2,20" : tone === "down" ? "2,4 22,4 12,21" : null;
  if (!pts) return { type: "svg", props: { width: size, height: size, viewBox: "0 0 24 24", children: [{ type: "rect", props: { x: 3, y: 10, width: 18, height: 4, rx: 2, fill: fg } }] } };
  return { type: "svg", props: { width: size, height: size, viewBox: "0 0 24 24", children: [{ type: "polygon", props: { points: pts, fill: fg } }] } };
}
const dot = (tone, size) => h("div", { width: size, height: size, borderRadius: size, backgroundColor: TONE[tone].fg, flexShrink: 0 });

function leanBox(m, s) {
  const tone = TONE[m.lean.tone];
  return h("div", { flexDirection: "column", padding: `${s(22)}px ${s(26)}px`, borderRadius: s(20), backgroundColor: tone.bg, border: `${s(2)}px solid ${tone.br}` },
    t("THE LEAN", { fontSize: s(15), fontWeight: 700, letterSpacing: "0.14em", color: C.mut }),
    h("div", { alignItems: "center", gap: s(14), marginTop: s(8) }, arrow(m.lean.tone, s(m.lean.word.length <= 7 ? 40 : 32)), t(m.lean.word, { fontSize: s(m.lean.word.length <= 7 ? 46 : m.lean.word.length <= 9 ? 40 : 30), fontWeight: 800, color: tone.fg, letterSpacing: "-0.03em" })),
    t(m.lean.sub, { fontSize: s(20), color: tone.fg, fontWeight: 600, marginTop: s(4) }),
    m.leanDetail && m.leanDetail !== m.lean.sub ? t(m.leanDetail, { fontSize: s(17), color: C.mut, marginTop: s(6) }) : null);
}

function facts(m, s, dir = "column") {
  const item = (k, v) => h("div", { flexDirection: "column", flex: dir === "row" ? 1 : undefined, padding: `${s(12)}px 0`, borderTop: dir === "column" ? `1px solid ${C.line}` : "none" },
    t(k, { fontSize: s(14), fontWeight: 700, letterSpacing: "0.12em", color: C.dim }), t(v, { fontSize: s(21), fontWeight: 600, color: C.ink, marginTop: s(3) }));
  return h("div", { flexDirection: dir, gap: dir === "row" ? s(24) : 0, marginTop: s(16) },
    item("STRENGTH", m.strength), item("TIME WINDOW", m.window), item(m.kind === "signal" ? "DATA DATE" : "UPDATED", m.kind === "signal" ? m.dataDate.replace(/^Data through /, "through ") : m.dataDate));
}

// "Cardboard box prices" / "→ Amazon". The arrow is drawn (the font subset has no arrow glyph).
function headline(m, size, gap) {
  const parts = m.headline.split(" → ");
  const from = parts.length > 1 ? parts.slice(0, -1).join(" → ") : m.headline;
  const to = parts.length > 1 ? parts[parts.length - 1] : null;
  const arrowSvg = { type: "svg", props: { width: size * 0.8, height: size * 0.8, viewBox: "0 0 24 24", children: [{ type: "path", props: { d: "M3 12h16M13 5l7 7-7 7", fill: "none", stroke: C.teal, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" } }] } };
  return h("div", { flexDirection: "column", marginTop: gap },
    t(from, { fontSize: size, fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.035em" }),
    to ? h("div", { alignItems: "center", gap: size * 0.25, marginTop: size * 0.12 }, arrowSvg, t(to, { fontSize: size, fontWeight: 800, color: C.teal, letterSpacing: "-0.035em", lineHeight: 1.06 })) : null);
}

function header(m, s) {
  return h("div", { alignItems: "center", gap: s(16) },
    t(m.ticker, { fontSize: s(24), fontWeight: 800, color: C.bg, backgroundColor: C.teal, padding: `${s(6)}px ${s(14)}px`, borderRadius: s(10), letterSpacing: "0.02em" }),
    t(m.company, { fontSize: s(26), fontWeight: 600, color: C.mut }));
}

function detail(m, s) {
  if (m.kind === "signal") {
    return h("div", { flexDirection: "column", marginTop: s(18) },
      m.big ? h("div", { alignItems: "baseline", gap: s(14) }, t(m.big, { fontSize: s(40), fontWeight: 800, color: C.ink }), t(m.bigLabel, { fontSize: s(18), color: C.dim })) : null,
      m.change ? t(m.change, { fontSize: s(20), color: C.mut, marginTop: s(4) }) : null);
  }
  if (!m.rows.length) return null;
  return h("div", { flexDirection: "column", gap: s(8), marginTop: s(20) },
    t("ALSO WATCHING", { fontSize: s(14), fontWeight: 700, letterSpacing: "0.12em", color: C.dim }),
    ...m.rows.map((r) => h("div", { alignItems: "center", gap: s(10) }, dot(r.tone, s(12)), t(r.name, { fontSize: s(19), color: C.ink }), t(`· ${r.word}`, { fontSize: s(19), color: TONE[r.tone].fg }))));
}

function footer(m, s, big = false) {
  return h("div", { flexDirection: big ? "column" : "row", justifyContent: "space-between", alignItems: big ? "flex-start" : "center", gap: big ? s(6) : 0, borderTop: `1px solid ${C.line}`, paddingTop: s(16) },
    t(big ? "theotherdata.com" : m.kind === "signal" && m.source ? `Source: ${m.source}`.slice(0, 70) : "Free public data, explained in plain English", { fontSize: s(big ? 30 : 17), fontWeight: big ? 800 : 400, color: big ? C.teal : C.dim }),
    t("Education only, not advice.", { fontSize: s(17), color: C.dim }));
}

const bg = { backgroundColor: C.bg, backgroundImage: "radial-gradient(circle at 92% 0%, rgba(94,234,212,0.20), rgba(7,11,22,0) 45%), radial-gradient(circle at 0% 100%, rgba(167,139,250,0.16), rgba(7,11,22,0) 45%)" };

function wide(m) {
  const s = (n) => n;
  const hl = m.headline.split(" → ")[0].length > 30 ? 44 : 52;
  return h("div", { ...bg, width: 1200, height: 630, padding: "44px 56px 34px", flexDirection: "column", fontFamily: "Inter", color: C.ink },
    h("div", { justifyContent: "space-between", alignItems: "center" }, logo(28), t("theotherdata.com", { fontSize: 22, fontWeight: 700, color: C.teal })),
    h("div", { flex: 1, gap: 40, marginTop: 30 },
      h("div", { flex: 1, flexDirection: "column" },
        header(m, s),
        headline(m, hl, 18),
        m.line ? t(m.line, { fontSize: 24, color: C.mut, lineHeight: 1.35, marginTop: 14 }) : null,
        detail(m, s)),
      h("div", { width: 340, flexDirection: "column" }, leanBox(m, s), facts(m, s))),
    footer(m, s));
}

function vertical(m) {
  const s = (n) => Math.round(n * 1.85);
  return h("div", { ...bg, width: 1080, height: 1920, padding: "110px 80px 90px", flexDirection: "column", fontFamily: "Inter", color: C.ink },
    logo(46),
    h("div", { flexDirection: "column", flex: 1, justifyContent: "center" },
      header(m, s),
      headline(m, m.headline.split(" → ")[0].length > 24 ? 80 : 96, 30),
      m.line ? t(m.line, { fontSize: 40, color: C.mut, lineHeight: 1.35, marginTop: 26, marginBottom: 6 }) : null,
      detail(m, s),
      h("div", { flexDirection: "column", marginTop: 48 }, leanBox(m, s), facts(m, s, "row"))),
    footer(m, s, true));
}

export async function renderCard(model, size = "wide") {
  const { w, h: hh } = SIZES[size];
  const svg = await satori(size === "vertical" ? vertical(model) : wide(model), { width: w, height: hh, fonts: await loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: w }, font: { loadSystemFonts: false } }).render().asPng();
}
