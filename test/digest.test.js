// Weekly digest: built from real published data, double opt-in signup, signed links, and the
// guarantee that nothing is emailed unless sending is explicitly switched on.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDigestData, loadDigestInputs, renderDigestHtml, renderDigestText, renderConfirmEmail, isoWeek } from "../lib/digest.js";
import { MemoryStore, makeToken, readToken, addPending, confirmKey, removeKey, emailKey, validEmail, getByKey } from "../lib/subscribers.js";
import "../public/news-filter.js";

const inputs = await loadDigestInputs(new URL("../public/data", import.meta.url).pathname);
const advice = /\b(buy|sell)\b/i;
const outsideDisclaimer = (s) => s.split(/\n|<\/p>|<\/div>/).filter((l) => advice.test(l) && !/(not|never|nothing)\b/i.test(l));

test("digest picks 3-5 real signals and copies their numbers exactly", () => {
  const d = buildDigestData(inputs);
  assert.ok(d, "digest built");
  assert.ok(d.picks.length >= 3 && d.picks.length <= 5, `picks: ${d.picks.length}`);
  for (const p of d.picks) {
    const sig = inputs.index.tickers.find((t) => t.ticker === p.ticker).signals.find((s) => s.id === p.id);
    assert.ok(sig, `${p.ticker}/${p.id} exists in index.json`);
    assert.equal(p.pct, Math.round(sig.pct * 10) / 10);
    assert.ok(["tailwind", "headwind"].includes(p.reading));
    assert.equal(new Set(d.picks.map((x) => x.ticker)).size, d.picks.length, "one pick per stock");
  }
  assert.ok(d.story.paragraphs.length >= 2);
  assert.match(d.trackLine, /coin flip|Too few|Better|Worse/);
  assert.match(d.disclaimer, /Not financial advice/);
  assert.match(d.issueId, /^\d{4}-W\d{2}$/);
});

test("digest renders HTML + text with disclaimer, links back, unsubscribe, and no buy/sell calls", () => {
  const d = buildDigestData(inputs);
  const unsub = "https://theotherdata.com/api/unsubscribe?token=T";
  const html = renderDigestHtml(d, { unsubscribeUrl: unsub });
  const text = renderDigestText(d, { unsubscribeUrl: unsub });
  for (const s of [html, text]) {
    assert.ok(s.includes(unsub), "unsubscribe link");
    assert.match(s, /Not financial advice/);
    assert.ok(s.includes("https://theotherdata.com/track"));
    assert.ok(s.includes("https://theotherdata.com/#/"));
    assert.deepEqual(outsideDisclaimer(s), [], "buy/sell only inside disclaimers");
  }
  assert.doesNotMatch(html, /<script/i);
  const c = renderConfirmEmail({ confirmUrl: "https://theotherdata.com/api/confirm?token=X" });
  assert.ok(c.html.includes("token=X") && c.text.includes("token=X"));
});

test("ISO week ids", () => {
  assert.equal(isoWeek(new Date("2026-10-07T12:00:00Z")), "2026-W41");
  assert.equal(isoWeek(new Date("2027-01-01T12:00:00Z")), "2026-W53");
});

test("signed links: round trip, tamper, expiry, purpose; no address inside", () => {
  const key = "k".repeat(40);
  const t = makeToken(key, "confirm", "Someone@Example.com", { ttlDays: 7 });
  assert.equal(readToken(key, "confirm", t).key, emailKey("someone@example.com"));
  assert.ok(!Buffer.from(t.split(".")[0], "base64url").toString().includes("example"), "address not in token");
  assert.equal(readToken(key, "unsub", t).error, "invalid");
  assert.equal(readToken("x".repeat(40), "confirm", t).error, "invalid");
  assert.equal(readToken(key, "confirm", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")).error, "invalid");
  assert.equal(readToken(key, "confirm", t, { now: Date.now() + 8 * 864e5 }).error, "expired");
  assert.ok(readToken(key, "unsub", makeToken(key, "unsub", "a@b.co"), { now: Date.now() + 9e12 }).key, "unsubscribe links never expire");
});

test("email validation", () => {
  for (const ok of ["a@b.co", "first.last+tag@sub.example.org"]) assert.ok(validEmail(ok), ok);
  for (const bad of ["", "a@b", "a b@c.com", "@x.com", "a@.com", "a..b@c.com", "x".repeat(250) + "@a.com"]) assert.ok(!validEmail(bad), bad);
});

test("lifecycle: pending → confirmed → deleted, with resend cooldown", async () => {
  const s = new MemoryStore();
  const now = new Date();
  const a = await addPending(s, "Reader@Example.com", { now });
  assert.equal(a.action, "created");
  assert.equal(a.record.email, "reader@example.com");
  assert.equal(a.record.consent.version, "v1");
  await s.put(`subs/${emailKey("reader@example.com")}.json`, { ...a.record, confirmSentAt: now.toISOString() });
  assert.equal((await addPending(s, "reader@example.com", { now: new Date(+now + 60e3) })).action, "cooldown");
  assert.equal((await addPending(s, "reader@example.com", { now: new Date(+now + 20 * 60e3) })).action, "resend");
  const k = emailKey("reader@example.com");
  assert.deepEqual(await confirmKey(s, k), { ok: true });
  assert.equal((await addPending(s, "reader@example.com")).action, "already");
  await removeKey(s, k);
  assert.equal(await getByKey(s, k), null, "unsubscribe deletes the record");
  assert.equal((await confirmKey(s, k)).error, "missing");
});

test("news filter tucks away buy/sell headlines but keeps ordinary news", () => {
  const N = globalThis.TODNews;
  for (const t of ["Now Is the Perfect Time to Buy Amazon and Alphabet Stock", "Is Nvidia a Buy?", "Analyst upgrades Tesla to Outperform", "3 Stocks to Buy and Hold Forever", "Morgan Stanley raises price target on Lilly"]) assert.ok(N.isOpinion(t), t);
  for (const t of ["Amazon announces $10B buyback", "Stocks sell-off as yields jump", "Affirm buy now, pay later volume rises", "Walmart sells more groceries online", "Delta shares sell off"]) assert.ok(!N.isOpinion(t), t);
});

// ---------- API handlers (local stand-ins for storage and email; no network) ----------
const dir = await mkdtemp(join(tmpdir(), "tod-digest-"));
delete process.env.VERCEL; delete process.env.RESEND_API_KEY; delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.DIGEST_SEND_ENABLED;
const sub = await import("../api/subscribe.js");
const post = (body, headers = {}) => sub.POST(new Request("http://localhost/api/subscribe", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify(body) }));

test("signup is closed (and saves nothing) when no storage is connected", async () => {
  delete process.env.TOD_SUBS_FILE;
  const r = await post({ email: "a@example.com", consent: true });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).status, "not_open");
  assert.equal((await (await sub.GET()).json()).open, false);
});

test("signup: consent required, honeypot and too-fast bots get a fake success, real signups get one confirm email", async () => {
  process.env.TOD_SUBS_FILE = join(dir, "subs.json");
  process.env.TOD_EMAIL_OUTBOX = join(dir, "outbox");
  assert.equal((await (await post({ email: "a@example.com", consent: false })).json()).status, "need_consent");
  assert.equal((await (await post({ email: "nope", consent: true })).json()).status, "invalid_email");
  assert.equal((await (await post({ email: "bot@example.com", consent: true, website: "x" })).json()).ok, true);
  assert.equal((await (await post({ email: "fast@example.com", consent: true, t: Date.now() })).json()).ok, true);
  const ok = await (await post({ email: "real@example.com", consent: true })).json();
  assert.equal(ok.status, "check_inbox");
  const subs = JSON.parse(await readFile(process.env.TOD_SUBS_FILE, "utf8"));
  const emails = Object.entries(subs).filter(([k]) => k.startsWith("subs/")).map(([, v]) => JSON.parse(v).email);
  assert.deepEqual(emails, ["real@example.com"], "bots were not stored");
  const out = await readdir(process.env.TOD_EMAIL_OUTBOX);
  assert.equal(out.length, 1);
  const msg = JSON.parse(await readFile(join(process.env.TOD_EMAIL_OUTBOX, out[0]), "utf8"));
  assert.deepEqual(msg.to, ["real@example.com"]);
  assert.match(msg.text, /\/api\/confirm\?token=/);
  // Cross-site posts are refused.
  assert.equal((await post({ email: "x@example.com", consent: true }, { origin: "https://evil.example" })).status, 400);
});

test("rate limit kicks in per connection", async () => {
  let last;
  for (let i = 0; i < 7; i++) last = await post({ email: `r${i}@example.com`, consent: false }, { "x-real-ip": "10.9.9.9" });
  assert.equal(last.status, 429);
});

test("digest cron: 401 without the secret; dry run unless DIGEST_SEND_ENABLED=true", async () => {
  const dg = await import("../api/digest.js");
  delete process.env.CRON_SECRET;
  assert.equal((await dg.GET(new Request("http://localhost/api/digest"))).status, 401);
  const store = new MemoryStore();
  await store.put(`subs/${emailKey("c@example.com")}.json`, { email: "c@example.com", status: "confirmed" });
  let fetched = false;
  const fetchData = async () => { fetched = true; return buildDigestData(inputs); };
  const monday = new Date("2026-10-12T14:00:00Z");
  const outbox = join(dir, "cron-outbox");
  const dry = await dg.run({ env: { RESEND_API_KEY: "re_test_not_real" }, store, now: monday, fetchData });
  assert.equal(dry.mode, "dry-run"); assert.equal(dry.digestsSent, 0); assert.equal(fetched, false);
  const sent = await dg.run({ env: { TOD_EMAIL_OUTBOX: outbox, DIGEST_SEND_ENABLED: "true" }, store, now: monday, fetchData });
  assert.equal(sent.digestsSent, 1);
  const again = await dg.run({ env: { TOD_EMAIL_OUTBOX: outbox, DIGEST_SEND_ENABLED: "true" }, store, now: new Date("2026-10-13T14:00:00Z"), fetchData });
  assert.equal(again.digestsSent, 0, "never sends the same issue twice");
  const msg = JSON.parse(await readFile(join(outbox, (await readdir(outbox))[0]), "utf8"));
  assert.equal(msg.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(msg.headers["List-Unsubscribe"], /^<https:\/\/theotherdata\.com\/api\/unsubscribe\?token=/);
  const thu = await dg.run({ env: { TOD_EMAIL_OUTBOX: outbox, DIGEST_SEND_ENABLED: "true" }, store: new MemoryStore(), now: new Date("2026-10-15T14:00:00Z"), fetchData });
  assert.equal(thu.digestsSent, 0, "doesn't start a new issue mid-week");
});
