// Digest subscribers: storage, signed links, and the subscribe → confirm → unsubscribe lifecycle.
// Storage is a private Vercel Blob store (one small JSON file per address, keyed by a hash of the
// address). Locally and in tests a JSON file or in-memory store stands in. No IP addresses are stored.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export const CONSENT_VERSION = "v1";
export const CONSENT_TEXT = "Send me The Other Data's weekly email of the strangest signal moves. I can unsubscribe in one click anytime.";
export const PENDING_TTL_DAYS = 14;      // unconfirmed addresses are deleted this long after the confirm email
export const RESEND_COOLDOWN_MIN = 15;   // don't re-send a confirm email to the same address more often

export const normEmail = (e) => String(e ?? "").trim().toLowerCase();
export function validEmail(e) {
  const s = normEmail(e);
  if (s.length < 6 || s.length > 254) return false;
  const m = /^([^\s@<>()",;:\\[\]]{1,64})@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/.exec(s);
  return Boolean(m && /\.[a-z]{2,}$/.test(m[2]) && !m[1].startsWith(".") && !m[1].endsWith(".") && !m[1].includes(".."));
}
export const emailKey = (e) => createHash("sha256").update(normEmail(e)).digest("hex").slice(0, 40);
const subPath = (e) => `subs/${emailKey(e)}.json`;
const keyPath = (k) => `subs/${k}.json`;
const KEY_RE = /^[a-f0-9]{40}$/;

// ---------- stores ----------
async function blobApi() { return import("@vercel/blob"); }
class BlobStore {
  kind = "vercel-blob";
  async get(path) {
    const { get } = await blobApi();
    try {
      const r = await get(path, { access: "private", useCache: false });
      if (!r || r.statusCode !== 200) return null;
      return JSON.parse(await new Response(r.stream).text());
    } catch (e) {
      if (/not.?found/i.test(String(e?.name) + String(e?.message))) return null;
      throw e;
    }
  }
  async put(path, obj, { overwrite = true } = {}) {
    const { put } = await blobApi();
    await put(path, JSON.stringify(obj), { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: overwrite, cacheControlMaxAge: 60 });
  }
  async del(path) { const { del } = await blobApi(); try { await del(path); } catch (e) { if (!/not.?found/i.test(String(e?.message))) throw e; } }
  async list(prefix) {
    const { list } = await blobApi();
    const out = []; let cursor;
    do { const r = await list({ prefix, cursor, limit: 1000 }); out.push(...r.blobs.map((b) => b.pathname)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
    return out;
  }
}
export class MemoryStore {
  kind = "memory";
  constructor() { this.m = new Map(); }
  async get(p) { return this.m.has(p) ? JSON.parse(this.m.get(p)) : null; }
  async put(p, obj, { overwrite = true } = {}) { if (!overwrite && this.m.has(p)) throw new Error("blob already exists"); this.m.set(p, JSON.stringify(obj)); }
  async del(p) { this.m.delete(p); }
  async list(prefix) { return [...this.m.keys()].filter((k) => k.startsWith(prefix)); }
}
class FileStore extends MemoryStore {
  kind = "file";
  constructor(file) { super(); this.file = file; }
  async load() { try { this.m = new Map(Object.entries(JSON.parse(await readFile(this.file, "utf8")))); } catch { this.m = new Map(); } }
  async save() { await writeFile(this.file, JSON.stringify(Object.fromEntries(this.m), null, 1)); }
  async get(p) { await this.load(); return super.get(p); }
  async put(p, o, opt) { await this.load(); await super.put(p, o, opt); await this.save(); }
  async del(p) { await this.load(); await super.del(p); await this.save(); }
  async list(prefix) { await this.load(); return super.list(prefix); }
}

// Production: Vercel Blob when the project has a Blob store connected. Local dev: TOD_SUBS_FILE.
export function getStore(env = process.env) {
  if (env.BLOB_READ_WRITE_TOKEN || (env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN)) return new BlobStore();
  if (!env.VERCEL && env.TOD_SUBS_FILE) return new FileStore(env.TOD_SUBS_FILE);
  return null;
}

// ---------- signed links ----------
// Links carry a hash of the address, never the address itself.
// The signing key lives in the private store itself (generated once, never printed), unless
// DIGEST_SECRET is set. Rotating it invalidates every confirm/unsubscribe link already sent.
let cachedKey = null;
export async function signingKey(store, env = process.env) {
  if (env.DIGEST_SECRET && env.DIGEST_SECRET.length >= 32) return env.DIGEST_SECRET;
  if (cachedKey?.store === store) return cachedKey.key;
  const path = "_config/signing-key.json";
  let rec = await store.get(path);
  if (!rec?.key) {
    try { await store.put(path, { key: randomBytes(32).toString("base64url"), createdAt: new Date().toISOString() }, { overwrite: false }); } catch {}
    rec = await store.get(path);
  }
  if (!rec?.key) throw new Error("signing key unavailable");
  cachedKey = { store, key: rec.key };
  return rec.key;
}
const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (key, payload) => createHmac("sha256", key).update(payload).digest("base64url").slice(0, 32);
export function makeToken(key, purpose, email, { ttlDays = 0, now = Date.now() } = {}) {
  const payload = b64(JSON.stringify({ p: purpose, k: emailKey(email), x: ttlDays ? Math.floor(now / 1000) + ttlDays * 86400 : 0 }));
  return `${payload}.${sign(key, payload)}`;
}
export function readToken(key, purpose, token, { now = Date.now() } = {}) {
  const m = /^([A-Za-z0-9_-]{10,600})\.([A-Za-z0-9_-]{32})$/.exec(String(token || ""));
  if (!m) return { error: "invalid" };
  const a = Buffer.from(sign(key, m[1])), b = Buffer.from(m[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { error: "invalid" };
  let d; try { d = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")); } catch { return { error: "invalid" }; }
  if (d.p !== purpose || !KEY_RE.test(String(d.k))) return { error: "invalid" };
  if (d.x && d.x * 1000 < now) return { error: "expired" };
  return { key: d.k };
}

// ---------- lifecycle ----------
export async function addPending(store, email, { page = "", now = new Date() } = {}) {
  const e = normEmail(email);
  const cur = await store.get(subPath(e));
  if (cur?.status === "confirmed") return { action: "already", record: cur };
  if (cur?.status === "pending") {
    const last = cur.confirmSentAt ? Date.parse(cur.confirmSentAt) : 0;
    if (last && now - last < RESEND_COOLDOWN_MIN * 60e3) return { action: "cooldown", record: cur };
    return { action: "resend", record: cur };
  }
  const record = { email: e, status: "pending", createdAt: now.toISOString(), consent: { version: CONSENT_VERSION, text: CONSENT_TEXT, at: now.toISOString(), page: String(page).slice(0, 80) }, confirmSentAt: null };
  await store.put(subPath(e), record);
  return { action: "created", record };
}
export async function markConfirmSent(store, record, now = new Date()) {
  const r = { ...record, confirmSentAt: now.toISOString() };
  await store.put(subPath(r.email), r);
  return r;
}
export async function confirmKey(store, key, now = new Date()) {
  if (!KEY_RE.test(String(key))) return { ok: false, error: "missing" };
  const cur = await store.get(keyPath(key));
  if (!cur) return { ok: false, error: "missing" };
  if (cur.status === "confirmed") return { ok: true, already: true };
  await store.put(keyPath(key), { ...cur, status: "confirmed", confirmedAt: now.toISOString() });
  return { ok: true };
}
export async function getByKey(store, key) { return KEY_RE.test(String(key)) ? store.get(keyPath(key)) : null; }
export async function removeKey(store, key) { if (KEY_RE.test(String(key))) await store.del(keyPath(key)); return { ok: true }; }
// Unsubscribing deletes the record entirely: nothing about the address is kept.
export async function removeEmail(store, email) { await store.del(subPath(email)); return { ok: true }; }
export async function getRecord(store, email) { return store.get(subPath(email)); }
export async function saveRecord(store, record) { await store.put(subPath(record.email), record); }
export async function allRecords(store) {
  const out = [];
  for (const p of await store.list("subs/")) { const r = await store.get(p); if (r?.email) out.push(r); }
  return out;
}

// ---------- spam protection ----------
// Per-instance sliding-window limiter (Vercel reuses warm instances). Keys are hashed, never stored.
const hits = new Map();
export function rateLimited(key, { max = 5, windowMs = 10 * 60e3, now = Date.now() } = {}) {
  const k = createHash("sha256").update(String(key)).digest("hex").slice(0, 16);
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(k, arr);
  if (hits.size > 5000) for (const [kk, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(kk);
  return arr.length > max;
}
export function clientIp(request) {
  const h = request.headers;
  return (h.get("x-real-ip") || h.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}
