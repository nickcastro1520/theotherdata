// Symbol directory: parsing of the Nasdaq Trader / SEC files, the committed index, and search ranking.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseNasdaqListed, parseOtherListed, mergeDirectory, cleanName, isCommonEquity } from "../lib/symbol-directory.js";
import { searchDirectory, findTicker } from "../lib/symbols.js";
import { wikiTitleMatches, wikiCanonicalOk } from "../lib/light.js";
import "../public/symbol-search.js";

const NASDAQ = `Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
RKLB|Rocket Lab Corporation - Common Stock|G|N|N|100|N|N
SOUN|SoundHound AI, Inc. - Class A Common Stock|G|N|N|100|N|N
SOUNW|SoundHound AI, Inc. - Warrant|G|N|N|100|N|N
ABCDU|ABCD Acquisition Corp - Units|S|N|N|100|N|N
ABCDR|ABCD Acquisition Corp - Rights|S|N|N|100|N|N
ZXZZT|NASDAQ TEST STOCK|G|Y|N|100|N|N
QQQ|Invesco QQQ Trust, Series 1|G|N|N|100|Y|N
AACG|ATA Creativity Global - American Depositary Shares, each representing two common shares|S|N|D|100|N|N
File Creation Time: 1006202621:31||||||`;
const OTHER = `ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
BRK.B|Berkshire Hathaway Inc. New Common Stock|N|BRK.B|N|40|N|BRK.B
BFH$A|Bread Financial Holdings, Inc. Depositary Shares, 8.625% Preferred Stock, Series A|N|BFHpA|N|100|N|BFH-A
ET|Energy Transfer LP Common Units|F|ET|N|100|N|ET
LMND|Lemonade, Inc. Common Stock|N|LMND|N|100|N|LMND
SPY|SPDR S&P 500 ETF Trust|P|SPY|Y|100|N|SPY
ZIEXT|IEX Test Company Test Symbol One for IEX|V|ZIEXT|N|100|Y|ZIEXT
File Creation Time: 1006202621:31|||||||`;

test("parses Nasdaq Trader files: keeps common stock, ADRs, ETFs, MLP units; drops tests, warrants, rights, SPAC units, preferreds", () => {
  const n = parseNasdaqListed(NASDAQ), o = parseOtherListed(OTHER);
  assert.deepEqual(n.map((r) => r.t), ["RKLB", "SOUN", "QQQ", "AACG"]);
  assert.deepEqual(o.map((r) => r.t), ["BRK.B", "ET", "LMND", "SPY"]);
  assert.equal(n.find((r) => r.t === "SOUN").n, "SoundHound AI, Inc. (Class A)");
  assert.equal(n.find((r) => r.t === "AACG").n, "ATA Creativity Global (ADR)");
  assert.equal(n.find((r) => r.t === "QQQ").k, "e");
  assert.equal(o.find((r) => r.t === "ET").n, "Energy Transfer LP");
  assert.equal(cleanName("Berkshire Hathaway Inc. New Common Stock"), "Berkshire Hathaway Inc.");
  assert.equal(isCommonEquity("Foo Corp 6.5% Notes due 2030"), false);
});

test("merge adds SEC CIKs and SEC-reporting OTC names", () => {
  const sec = { fields: ["cik", "name", "ticker", "exchange"], data: [[1819994, "Rocket Lab Corp", "RKLB", "Nasdaq"], [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"], [1134982, "APPLE ISPORTS GROUP INC", "AAPI", "OTC"], [1, "NO TICKER", "", "OTC"]] };
  const { rows, stats } = mergeDirectory({ nasdaq: parseNasdaqListed(NASDAQ), other: parseOtherListed(OTHER), sec });
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  assert.equal(by.RKLB[3], 1819994);
  assert.equal(by["BRK.B"][3], 1067983);
  assert.deepEqual(by.AAPI, ["AAPI", "Apple Isports Group Inc", "O", 1134982, "s"]);
  assert.equal(stats.otc, 1);
});

test("committed symbols.json covers the US market and is well formed", async () => {
  const doc = JSON.parse(await readFile("public/data/symbols.json", "utf8"));
  assert.ok(Date.parse(doc.generatedAt));
  assert.deepEqual(doc.fields, ["t", "n", "x", "c", "k"]);
  assert.ok(doc.rows.length > 8000, `only ${doc.rows.length} symbols`);
  const seen = new Set();
  for (const r of doc.rows) {
    assert.ok(/^[A-Z]{1,6}(\.[A-Z]{1,2})?$/.test(r[0]), `bad ticker ${r[0]}`);
    assert.ok(!seen.has(r[0]), `duplicate ${r[0]}`); seen.add(r[0]);
    assert.ok(typeof r[1] === "string" && r[1].length > 0);
    assert.ok(["s", "e"].includes(r[4]));
  }
  for (const t of ["AAPL", "RKLB", "LMND", "SOUN", "RBLX", "SPY", "BRK.B"]) assert.ok(seen.has(t), `missing ${t}`);
  assert.ok(findTicker("AAPL").cik === 320193);
});

test("search ranks exact ticker, then name prefix, with typo tolerance", () => {
  const top = (q) => searchDirectory(q, 5)[0]?.symbol;
  assert.equal(top("roblox"), "RBLX");
  assert.equal(top("rocket lab"), "RKLB");
  assert.equal(top("rocketlab"), "RKLB");
  assert.equal(top("lemonade"), "LMND");
  assert.equal(top("sofi"), "SOFI");
  assert.equal(top("palantir"), "PLTR");
  assert.equal(top("soundhound"), "SOUN");
  assert.equal(top("sound hound"), "SOUN");
  assert.equal(top("apple"), "AAPL");
  assert.equal(top("google"), "GOOGL");
  assert.equal(top("F"), "F");
  assert.equal(top("brk-b"), "BRK.B");
  assert.equal(top("palantr"), "PLTR");
  const f = searchDirectory("F", 3)[0];
  assert.equal(f.curated, true);
  assert.equal(searchDirectory("RKLB", 3)[0].curated, false);
  assert.deepEqual(searchDirectory("zzzzqqqx", 3), []);
});

test("Wikipedia matching never swaps a company for a same-named thing", () => {
  assert.equal(wikiTitleMatches("Lemonade", "Lemonade Inc"), false);
  assert.equal(wikiTitleMatches("Lemonade (album)", "Lemonade Inc"), false);
  assert.equal(wikiTitleMatches("Lemonade, Inc.", "Lemonade Inc"), true);
  assert.equal(wikiTitleMatches("Apple Inc.", "Apple iSports Group Inc"), false);
  assert.equal(wikiTitleMatches("Rocket Lab Electron", "Rocket Lab Corp"), false);
  assert.equal(wikiTitleMatches("Rocket Lab Corporation", "Rocket Lab Corp"), true);
  assert.equal(wikiCanonicalOk("Lemonade Tycoon", "Lemonade Inc"), false);
  assert.equal(wikiCanonicalOk("Rocket Lab", "Rocket Lab Corp"), true);
  assert.equal(wikiCanonicalOk("Invesco QQQ", "Invesco QQQ Trust, Series 1"), true);
});
