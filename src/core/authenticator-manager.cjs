"use strict";
const localeText = require("../locales/application.json");
// Independent RFC 4226/6238 implementation; no network or renderer secret API.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { performance } = require("node:perf_hooks");
const LIMITS = Object.freeze({
  entries: 2000,
  folders: 256,
  inputBytes: 262144,
  totalBytes: 4 * 1024 * 1024,
  parts: 100,
  secretBytes: 128,
});
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ENTRY_KEYS = [
  "id",
  "revision",
  "issuer",
  "account",
  "secret",
  "type",
  "algorithm",
  "digits",
  "period",
  "counter",
  "folderId",
  "createdAt",
  "updatedAt",
];
const INPUT_KEYS = ENTRY_KEYS.filter(
  (k) => !["createdAt", "updatedAt"].includes(k),
);
function fail(message = localeText.message_80bec8e) {
  throw Error(message);
}
function obj(p, keys) {
  if (
    !p ||
    Object.getPrototypeOf(p) !== Object.prototype ||
    Reflect.ownKeys(p).some(
      (k) =>
        typeof k !== "string" ||
        !keys.includes(k) ||
        !Object.getOwnPropertyDescriptor(p, k).hasOwnProperty("value"),
    )
  )
    fail();
}
function str(v, max, empty = true) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\u0000-\u001f\u007f]/u.test(v)
  )
    fail();
  const s = v.trim();
  if (!empty && !s) fail();
  return s;
}
function integer(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail();
  return v;
}
function id(v) {
  if (
    typeof v !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)
  )
    fail();
  return v;
}
function encode32(bytes) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(value >>> bits) & 31];
    }
  }
  if (bits) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}
function secret(v) {
  if (
    typeof v !== "string" ||
    v.length > 208 ||
    !/^[A-Za-z2-7]+={0,6}$/.test(v)
  )
    fail();
  const s = v.toUpperCase(),
    raw = s.replace(/=+$/u, "");
  let bits = 0,
    value = 0,
    out = [];
  for (const c of raw) {
    value = (value << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
    }
  }
  if (!out.length || out.length > LIMITS.secretBytes || encode32(out) !== raw)
    fail();
  if (
    s.includes("=") &&
    (s.length % 8 !== 0 || s !== raw + "=".repeat((8 - (raw.length % 8)) % 8))
  )
    fail();
  return raw;
}
function decode32(s) {
  const raw = secret(s);
  let bits = 0,
    value = 0,
    out = [];
  for (const c of raw) {
    value = (value << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(out);
}
function normalize(p, old = {}) {
  obj(p, INPUT_KEYS);
  const choose = (k, d) => (p[k] === undefined ? (old[k] ?? d) : p[k]);
  const type = choose("type", "totp"),
    algorithm = choose("algorithm", "SHA1"),
    digits = choose("digits", 6);
  if (
    !["totp", "hotp"].includes(type) ||
    !["SHA1", "SHA256", "SHA512"].includes(algorithm) ||
    ![6, 8].includes(digits)
  )
    fail();
  const period = integer(choose("period", 30), 15, 120),
    counter = integer(choose("counter", 0));
  if (type === "totp" && counter !== 0) fail();
  const folderId = choose("folderId", null);
  if (folderId !== null) id(folderId);
  return {
    issuer: str(choose("issuer", ""), 200),
    account: str(choose("account", ""), 320, false),
    secret: secret(choose("secret", undefined)),
    type,
    algorithm,
    digits,
    period,
    counter,
    folderId,
  };
}
function label(e) {
  return e.issuer ? `${e.issuer}: ${e.account}` : e.account;
}
function metadata(e) {
  const { secret: ignored, ...rest } = e;
  return { ...rest, hasSecret: true, label: label(e) };
}
function identity(e) {
  return JSON.stringify([e.issuer, e.account, e.type]);
}
function validate(s) {
  obj(s, ["version", "folders", "entries"]);
  if (
    s.version !== 1 ||
    !Array.isArray(s.folders) ||
    !Array.isArray(s.entries) ||
    s.folders.length > LIMITS.folders ||
    s.entries.length > LIMITS.entries
  )
    fail();
  const ids = new Set();
  for (const f of s.folders) {
    obj(f, ["id", "name", "createdAt", "updatedAt"]);
    id(f.id);
    if (ids.has(f.id)) fail();
    ids.add(f.id);
    if (str(f.name, 120, false) !== f.name) fail();
    for (const k of ["createdAt", "updatedAt"])
      if (typeof f[k] !== "string" || !Number.isFinite(Date.parse(f[k])))
        fail();
  }
  const entryIds = new Set();
  for (const e of s.entries) {
    obj(e, ENTRY_KEYS);
    id(e.id);
    integer(e.revision, 1);
    if (entryIds.has(e.id)) fail();
    entryIds.add(e.id);
    const p = Object.fromEntries(
      INPUT_KEYS.filter((k) => Object.hasOwn(e, k)).map((k) => [k, e[k]]),
    );
    const n = normalize(p);
    for (const k of Object.keys(n)) if (!isDeepStrictEqual(n[k], e[k])) fail();
    if (e.folderId !== null && !ids.has(e.folderId)) fail();
    for (const k of ["createdAt", "updatedAt"])
      if (typeof e[k] !== "string" || !Number.isFinite(Date.parse(e[k])))
        fail();
  }
  if (Buffer.byteLength(JSON.stringify(s)) > LIMITS.totalBytes) fail();
  return s;
}
function generateOtp(p, now = Date.now()) {
  const e = normalize(p);
  integer(now);
  const count =
      e.type === "hotp" ? e.counter : Math.floor(now / 1000 / e.period),
    buffer = Buffer.alloc(8),
    key = decode32(e.secret);
  buffer.writeBigUInt64BE(BigInt(count));
  try {
    const digest = crypto
        .createHmac(e.algorithm.toLowerCase(), key)
        .update(buffer)
        .digest(),
      offset = digest[digest.length - 1] & 15;
    return String(
      (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** e.digits,
    ).padStart(e.digits, "0");
  } finally {
    key.fill(0);
  }
}
function splitLabel(name, issuer = "") {
  const at = name.indexOf(":");
  if (at >= 0) {
    const prefix = name.slice(0, at).trim();
    if (issuer && prefix !== issuer) fail();
    issuer = issuer || prefix;
    name = name.slice(at + 1).trim();
  }
  return { issuer, account: name };
}
function uri(text) {
  let u;
  try {
    u = new URL(text);
  } catch {
    fail();
  }
  if (u.username || u.password || u.port || u.hash) fail();
  return u;
}
function params(u, allowed) {
  const out = {};
  for (const [k, v] of u.searchParams) {
    if (!allowed.includes(k) || Object.hasOwn(out, k)) fail();
    out[k] = v;
  }
  return out;
}
function parseUri(u) {
  if (!["totp", "hotp"].includes(u.hostname)) fail();
  const p = params(u, [
    "secret",
    "issuer",
    "algorithm",
    "digits",
    "period",
    "counter",
  ]);
  for (const key of ["digits", "period", "counter"])
    if (p[key] !== undefined && !/^[0-9]+$/.test(p[key])) fail();
  let name;
  try {
    name = decodeURIComponent(u.pathname.slice(1));
  } catch {
    fail();
  }
  if (!name || name.includes("/")) fail();
  if (u.hostname === "hotp" && p.counter === undefined) fail();
  if (u.hostname === "totp" && p.counter !== undefined) fail();
  return normalize({
    ...splitLabel(name, p.issuer || ""),
    secret: p.secret,
    type: u.hostname,
    algorithm: p.algorithm || "SHA1",
    digits: p.digits === undefined ? 6 : Number(p.digits),
    period: p.period === undefined ? 30 : Number(p.period),
    counter: p.counter === undefined ? 0 : Number(p.counter),
  });
}
// Bounded protobuf wire reader, implemented here from the documented wire format.
function protobuf(buffer, spec) {
  let pos = 0;
  const out = {};
  function vint(signed = false) {
    let n = 0n,
      shift = 0n;
    for (let i = 0; i < 10; i++) {
      if (pos >= buffer.length) fail();
      const b = buffer[pos++];
      n |= BigInt(b & 127) << shift;
      if (!(b & 128)) {
        if (n >= 1n << 64n) fail();
        if (signed === "skip") return 0;
        if (signed && n >= (1n << 64n) - (1n << 31n) && n < 1n << 64n)
          return Number(BigInt.asIntN(32, n));
        if (n > BigInt(Number.MAX_SAFE_INTEGER)) fail();
        return Number(n);
      }
      shift += 7n;
    }
    fail();
  }
  while (pos < buffer.length) {
    const tag = vint(),
      num = Math.floor(tag / 8),
      wire = tag % 8,
      expected = spec[num];
    if (!num || num > 0x1fffffff) fail();
    if (!expected) {
      // Forward-compatible metadata is ignored, never interpreted as OTP settings.
      if (wire === 0) vint("skip");
      else {
        const length =
          wire === 1 ? 8 : wire === 5 ? 4 : wire === 2 ? vint() : -1;
        if (length < 0 || length > buffer.length - pos) fail();
        pos += length;
      }
      continue;
    }
    if (wire !== expected.wire) fail();
    let v;
    if (wire === 0) v = vint(expected.signed);
    else {
      const len = vint();
      if (len > buffer.length - pos) fail();
      v = buffer.subarray(pos, pos + len);
      pos += len;
    }
    if (expected.repeat) {
      (out[num] ??= []).push(v);
      if (out[num].length > LIMITS.entries) fail();
    } else {
      if (Object.hasOwn(out, num)) fail();
      out[num] = v;
    }
  }
  return out;
}
function utf8(b) {
  if (!b) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    fail();
  }
}
function migration(u) {
  if (u.hostname !== "offline" || !["", "/"].includes(u.pathname)) fail();
  const p = params(u, ["data"]),
    b = p.data;
  if (typeof b !== "string" || !b.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(b))
    fail();
  const buffer = Buffer.from(b, "base64");
  if (buffer.toString("base64").replace(/=+$/, "") !== b.replace(/=+$/, ""))
    fail();
  const m = protobuf(buffer, {
    1: { wire: 2, repeat: true },
    2: { wire: 0 },
    3: { wire: 0 },
    4: { wire: 0 },
    5: { wire: 0, signed: true },
  });
  if (m[2] !== 1) fail();
  const size = integer(m[3] ?? 1, 1, LIMITS.parts),
    index = integer(m[4] ?? 0, 0, size - 1),
    batch = integer(m[5] ?? 0, -0x80000000, 0x7fffffff);
  if (size > 1 && !Object.hasOwn(m, 5)) fail();
  const entries = (m[1] || []).map((bytes) => {
    const e = protobuf(bytes, {
      1: { wire: 2 },
      2: { wire: 2 },
      3: { wire: 2 },
      4: { wire: 0 },
      5: { wire: 0 },
      6: { wire: 0 },
      7: { wire: 0 },
    });
    if (!e[1] || !e[1].length || e[1].length > LIMITS.secretBytes) fail();
    const algorithm = { 1: "SHA1", 2: "SHA256", 3: "SHA512" }[e[4]],
      digits = { 1: 6, 2: 8 }[e[5]],
      type = { 1: "hotp", 2: "totp" }[e[6]];
    if (!algorithm || !digits || !type) fail();
    return normalize({
      ...splitLabel(utf8(e[2]), utf8(e[3])),
      secret: encode32(e[1]),
      algorithm,
      digits,
      type,
      counter: e[7] ?? 0,
    });
  });
  if (!entries.length) fail();
  return { size, index, batch, entries };
}
function parseOtpImport(text) {
  const inputs = Array.isArray(text)
    ? text
    : typeof text === "string"
      ? [text]
      : null;
  if (
    !inputs ||
    !inputs.length ||
    inputs.length > LIMITS.entries ||
    inputs.some((v) => typeof v !== "string")
  )
    fail();
  let bytes = inputs.length - 1;
  for (const input of inputs) {
    bytes += Buffer.byteLength(input);
    if (bytes > LIMITS.inputBytes) fail();
  }
  const lines = inputs
    .flatMap((input) => input.split(/\r?\n/u))
    .filter((line) => line.trim());
  if (!lines.length || lines.length > LIMITS.entries) fail();
  const entries = [],
    batches = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const u = uri(line.trim());
    if (u.protocol === "otpauth:") entries.push(parseUri(u));
    else if (u.protocol === "otpauth-migration:") {
      const m = migration(u);
      const key = m.batch;
      let group = batches.get(key);
      if (!group) {
        group = new Map();
        batches.set(key, group);
      }
      if (group.size && group.values().next().value.size !== m.size) fail();
      if (group.has(m.index)) fail();
      group.set(m.index, m);
    } else fail();
  }
  for (const group of batches.values()) {
    const first = group.values().next().value;
    if (group.size !== first.size) fail(localeText.message_43f5d75);
    for (let i = 0; i < first.size; i++) {
      if (!group.has(i)) fail();
      entries.push(...group.get(i).entries);
    }
  }
  if (!entries.length || entries.length > LIMITS.entries) fail();
  const seen = new Set();
  for (const e of entries) {
    const key = identity(e);
    if (seen.has(key)) fail(localeText.message_a032ca6);
    seen.add(key);
  }
  return entries;
}
class AuthenticatorManager {
  constructor({ getData, persist, now = Date.now } = {}) {
    if (
      typeof getData !== "function" ||
      typeof persist !== "function" ||
      typeof now !== "function"
    )
      fail();
    this.getData = getData;
    this.persist = persist;
    this.now = now;
    this.pending = null;
    this.consumed = null;
  }
  _read(data = this.getData()) {
    return data.authenticatorManager === undefined
      ? { version: 1, folders: [], entries: [] }
      : validate(data.authenticatorManager);
  }
  _tx(fn) {
    const data = this.getData(),
      source = this._read(data),
      next = structuredClone(source),
      result = fn(next);
    validate(next);
    if (isDeepStrictEqual(source, next)) return result;
    const existed = Object.hasOwn(data, "authenticatorManager"),
      old = data.authenticatorManager;
    data.authenticatorManager = next;
    try {
      const saved = this.persist();
      if (saved && typeof saved.then === "function") fail();
    } catch (error) {
      let current;
      try {
        current = this.getData();
      } catch {}
      if (current === data) {
        if (existed) data.authenticatorManager = old;
        else delete data.authenticatorManager;
      }
      throw error;
    }
    return result;
  }
  _entry(s, p) {
    id(p.id);
    integer(p.revision, 1);
    const e = s.entries.find((e) => e.id === p.id);
    if (!e) fail(localeText.message_86040dc);
    if (e.revision !== p.revision) fail(localeText.message_79b93c1);
    return e;
  }
  _folder(s, folderId) {
    if (folderId !== null && !s.folders.some((f) => f.id === id(folderId)))
      fail(localeText.message_1c9977f);
  }
  snapshot() {
    const s = this._read();
    return {
      folders: structuredClone(s.folders),
      entries: s.entries.map(metadata),
    };
  }
  codes(p = {}) {
    obj(p, ["ids"]);
    const s = this._read();
    let entries = s.entries;
    if (p.ids !== undefined) {
      if (
        !Array.isArray(p.ids) ||
        p.ids.length > LIMITS.entries ||
        new Set(p.ids).size !== p.ids.length
      )
        fail();
      p.ids.forEach(id);
      entries = p.ids.map((id) => {
        const e = s.entries.find((e) => e.id === id);
        if (!e) fail();
        return e;
      });
    }
    const now = integer(this.now());
    return {
      codes: entries.map((e) => ({
        id: e.id,
        code: generateOtp(
          Object.fromEntries(
            INPUT_KEYS.filter((k) => Object.hasOwn(e, k)).map((k) => [k, e[k]]),
          ),
          now,
        ),
        remaining:
          e.type === "totp"
            ? e.period - (Math.floor(now / 1000) % e.period)
            : null,
        period: e.period,
        type: e.type,
        ...(e.type === "hotp" ? { counter: e.counter } : {}),
      })),
    };
  }
  saveFolder(p) {
    obj(p, ["id", "name"]);
    return this._tx((s) => {
      const name = str(p.name, 120, false),
        old =
          p.id === undefined ? null : s.folders.find((f) => f.id === id(p.id));
      if (p.id !== undefined && !old) fail();
      if (
        s.folders.some(
          (f) =>
            f.id !== old?.id && f.name.toLowerCase() === name.toLowerCase(),
        )
      )
        fail();
      if (old) {
        if (old.name === name) return { ...old };
        old.name = name;
        old.updatedAt = new Date(this.now()).toISOString();
        return { ...old };
      }
      if (s.folders.length >= LIMITS.folders) fail();
      const now = new Date(this.now()).toISOString(),
        f = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
      s.folders.push(f);
      return { ...f };
    });
  }
  deleteFolder(p) {
    obj(p, ["id"]);
    return this._tx((s) => {
      this._folder(s, id(p.id));
      s.folders = s.folders.filter((f) => f.id !== p.id);
      for (const e of s.entries)
        if (e.folderId === p.id) {
          e.folderId = null;
          e.revision++;
          e.updatedAt = new Date(this.now()).toISOString();
        }
      return { deleted: true };
    });
  }
  saveEntry(p) {
    obj(p, INPUT_KEYS);
    return this._tx((s) => {
      const old = p.id === undefined ? null : this._entry(s, p);
      if (!old && p.revision !== undefined) fail();
      const n = normalize(p, old || {});
      this._folder(s, n.folderId);
      if (old) {
        if (Object.keys(n).every((k) => isDeepStrictEqual(n[k], old[k])))
          return metadata(old);
        Object.assign(old, n, {
          revision: old.revision + 1,
          updatedAt: new Date(this.now()).toISOString(),
        });
        return metadata(old);
      }
      if (s.entries.length >= LIMITS.entries) fail();
      const now = new Date(this.now()).toISOString(),
        e = {
          id: crypto.randomUUID(),
          revision: 1,
          ...n,
          createdAt: now,
          updatedAt: now,
        };
      s.entries.push(e);
      return metadata(e);
    });
  }
  deleteEntry(p) {
    obj(p, ["id", "revision"]);
    return this._tx((s) => {
      const e = this._entry(s, p);
      s.entries = s.entries.filter((v) => v !== e);
      return { deleted: true };
    });
  }
  moveEntries(p) {
    obj(p, ["ids", "folderId"]);
    if (
      !Array.isArray(p.ids) ||
      !p.ids.length ||
      p.ids.length > LIMITS.entries ||
      new Set(p.ids).size !== p.ids.length
    )
      fail();
    p.ids.forEach(id);
    return this._tx((s) => {
      this._folder(s, p.folderId);
      const selected = p.ids.map((id) => {
        const e = s.entries.find((e) => e.id === id);
        if (!e) fail();
        return e;
      });
      for (const e of selected)
        if (e.folderId !== p.folderId) {
          e.folderId = p.folderId;
          e.revision++;
          e.updatedAt = new Date(this.now()).toISOString();
        }
      return { entries: selected.map(metadata) };
    });
  }
  advanceCounter(p) {
    obj(p, ["id", "revision"]);
    return this._tx((s) => {
      const e = this._entry(s, p);
      if (e.type !== "hotp") fail();
      integer(e.counter + 1);
      e.counter++;
      e.revision++;
      e.updatedAt = new Date(this.now()).toISOString();
      return metadata(e);
    });
  }
  clearPending(token) {
    if (token === undefined) {
      this.pending = null;
      this.consumed = null;
      return true;
    }
    id(token);
    let matched = false;
    if (this.pending?.token === token) {
      this.pending = null;
      matched = true;
    }
    if (this.consumed?.token === token) {
      this.consumed = null;
      matched = true;
    }
    return matched;
  }
  previewImport(p) {
    obj(p, ["text"]);
    this.clearPending();
    const entries = parseOtpImport(p.text),
      s = this._read(),
      token = crypto.randomUUID(),
      expiresAt = this.now() + 300000;
    this.pending = {
      token,
      entries,
      deadline: performance.now() + 300000,
      expiresAt,
    };
    return {
      token,
      expiresAt,
      entries: entries.map((e) => ({
        ...metadata(e),
        duplicate: s.entries.some((old) => identity(old) === identity(e)),
      })),
    };
  }
  commitImport(p) {
    obj(p, ["token", "folderId", "duplicates"]);
    id(p.token);
    this._read();
    if (this.consumed?.token === p.token)
      return structuredClone(this.consumed.result);
    const pending = this.pending;
    if (
      !pending ||
      pending.token !== p.token ||
      performance.now() >= pending.deadline ||
      this.now() >= pending.expiresAt
    ) {
      this.clearPending();
      fail(localeText.message_6a7ebe1);
    }
    const duplicates = p.duplicates ?? "skip";
    if (!["skip", "replace"].includes(duplicates)) fail();
    const result = this._tx((s) => {
      if (p.folderId !== undefined) this._folder(s, p.folderId);
      const result = { imported: 0, replaced: 0, skipped: 0, entries: [] };
      for (const item of pending.entries) {
        const old = s.entries.find((e) => identity(e) === identity(item));
        if (old && duplicates === "skip") {
          result.skipped++;
          continue;
        }
        const n = {
          ...item,
          folderId:
            p.folderId === undefined ? (old?.folderId ?? null) : p.folderId,
        };
        if (old) {
          if (!Object.keys(n).every((k) => isDeepStrictEqual(n[k], old[k])))
            Object.assign(old, n, {
              revision: old.revision + 1,
              updatedAt: new Date(this.now()).toISOString(),
            });
          result.replaced++;
          result.entries.push(metadata(old));
        } else {
          if (s.entries.length >= LIMITS.entries) fail();
          const now = new Date(this.now()).toISOString(),
            e = {
              id: crypto.randomUUID(),
              revision: 1,
              ...n,
              createdAt: now,
              updatedAt: now,
            };
          s.entries.push(e);
          result.imported++;
          result.entries.push(metadata(e));
        }
      }
      return result;
    });
    this.pending = null;
    this.consumed = { token: p.token, result: structuredClone(result) };
    return result;
  }
}
module.exports = { AuthenticatorManager, parseOtpImport, generateOtp, LIMITS };
