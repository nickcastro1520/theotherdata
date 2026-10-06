// Keyed providers are parsed correctly and never leak their keys into errors or URLs.
import test from "node:test";
import assert from "node:assert/strict";

test("Finnhub and Tiingo adapters parse responses and keep keys out of errors", async () => {
  process.env.FINNHUB_API_KEY = "fh_test_key";
  process.env.TIINGO_API_KEY = "ti_test_key";
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push({ url: String(url), headers: opts.headers });
    const u = String(url);
    let body;
    if (u.includes("company-news")) body = [{ headline: "Acme beats estimates", url: "https://www.example.com/a", source: "Example", datetime: 1791300000 }, { headline: "Acme beats estimates", url: "https://example.com/dup", datetime: 1791200000 }];
    else if (u.includes("/quote")) body = { c: 101.5, d: 1.5, dp: 1.5, pc: 100, t: 1791300000 };
    else if (u.includes("tiingo")) body = [{ date: "2026-10-01T00:00:00.000Z", adjClose: 99.123 }, { date: "2026-10-02T00:00:00.000Z", adjClose: 101.5 }];
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const src = await import("../lib/sources.js");
    const news = await src.finnhubNews({ ticker: "ACME" });
    assert.equal(news.length, 1);
    assert.equal(news[0].domain, "example.com");
    const q = await src.finnhubQuote({ ticker: "ACME" });
    assert.equal(q.price, 101.5);
    const h = await src.tiingoPrices({ ticker: "ACME" });
    assert.deepEqual(h.map((p) => p.v), [99.12, 101.5]);
    for (const s of seen) assert.ok(!s.url.includes("test_key"), "keys go in headers, not URLs");
    globalThis.fetch = async () => new Response("nope", { status: 403 });
    await assert.rejects(src.finnhubQuote({ ticker: "ACME" }), (e) => !String(e.message).includes("test_key"));
  } finally {
    globalThis.fetch = real;
    delete process.env.FINNHUB_API_KEY; delete process.env.TIINGO_API_KEY;
  }
});
