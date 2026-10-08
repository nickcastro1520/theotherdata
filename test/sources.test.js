// New source adapters (Lever job boards, npm downloads, SEC inventory concepts) and the Wikipedia bot-spike filter.
import test from "node:test";
import assert from "node:assert/strict";
import { lever, npm, secInventory, dropBotSpikes } from "../lib/sources.js";

async function withFetch(handler, fn) {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, opts) => { seen.push(String(url)); const body = handler(String(url)); return body == null ? new Response("nope", { status: 404 }) : new Response(JSON.stringify(body), { status: 200 }); };
  try { return await fn(seen); } finally { globalThis.fetch = real; }
}

test("lever counts public postings as a snapshot", async () => {
  await withFetch((u) => (u.includes("api.lever.co/v0/postings/acme") ? [{ id: 1 }, { id: 2 }, { id: 3 }] : null), async (seen) => {
    const r = await lever({ company: "acme" });
    assert.equal(r.snapshot, 3);
    assert.equal(r.url, "https://jobs.lever.co/acme");
    assert.match(seen[0], /mode=json/);
  });
  await withFetch(() => ({ error: "not a list" }), async () => {
    await assert.rejects(lever({ company: "acme" }), /unexpected response/);
  });
});

test("npm parses daily downloads, keeps scoped names readable, drops untallied trailing zeros", async () => {
  const days = [];
  for (let i = 0; i < 90; i++) days.push({ day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), downloads: 1000 + i });
  days.push({ day: "2026-04-01", downloads: 0 });
  await withFetch((u) => (u.includes("/downloads/range/last-year/@shopify/shopify-api") ? { downloads: days.slice().reverse() } : null), async () => {
    const r = await npm({ pkg: "@shopify/shopify-api" });
    assert.equal(r.series.length, 90, "trailing zero (not yet tallied) is dropped");
    assert.equal(r.series[0].t, "2026-01-01");
    assert.equal(r.series.at(-1).v, 1089);
    assert.equal(r.url, "https://www.npmjs.com/package/@shopify/shopify-api");
  });
  await withFetch(() => ({ downloads: days.slice(0, 10) }), async () => {
    await assert.rejects(npm({ pkg: "tiny" }), /not enough/);
  });
});

test("secInventory can read a non-default XBRL concept", async () => {
  const facts = { units: { USD: [] } };
  for (let y = 2022; y <= 2026; y++) for (let q = 1; q <= 4; q++) facts.units.USD.push({ frame: `CY${y}Q${q}I`, end: `${y}-${String(q * 3).padStart(2, "0")}-30`, val: (y - 2000) * 1e9 });
  await withFetch((u) => (u.includes("/us-gaap/InventoryFinishedGoodsNetOfReserves.json") ? facts : null), async (seen) => {
    const r = await secInventory({ ticker: "ACME", cik: 123, concept: "InventoryFinishedGoodsNetOfReserves" });
    assert.ok(seen[0].includes("CIK0000000123"));
    assert.equal(r.series.length, 20);
    assert.equal(r.series.at(-1).v, 26);
  });
});

test("dropBotSpikes removes isolated one-day bursts but keeps real multi-day spikes", () => {
  const s = [];
  for (let i = 0; i < 40; i++) s.push({ t: `d${String(i).padStart(2, "0")}`, v: 7000 + (i % 5) * 100 });
  s[10].v = 4_800_000; // bot burst: neighbors normal
  s[25].v = 60_000; s[26].v = 45_000; s[27].v = 20_000; // real news spike that fades over days
  const { series, dropped } = dropBotSpikes(s);
  assert.deepEqual(dropped.map((p) => p.t), ["d10"]);
  assert.equal(series.length, 39);
  assert.ok(series.some((p) => p.t === "d25"), "a spike with elevated neighbors is kept");
});
