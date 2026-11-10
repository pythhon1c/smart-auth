"use strict";
const localeText = require("../locales/application.json");
// Canonical Trade Bots System v1 only. Pure local parsing, no Steam calls.
const fs = require("node:fs"),
  path = require("node:path"),
  net = require("node:net"),
  crypto = require("node:crypto");
const { TextDecoder } = require("node:util");
const MiB = 1024 * 1024;
const LIMITS = Object.freeze({
  accounts: 10000,
  accountBytes: 4 * MiB,
  accountTotal: 64 * MiB,
  proxyText: 16 * MiB,
  proxyJson: 128 * MiB,
  manifest: 8 * MiB,
  mapping: 4 * MiB,
  total: 256 * MiB,
  depth: 16,
  proxies: 100000,
});
const ACCOUNT_KEYS = [
  "accountName",
  "steamId",
  "password",
  "refreshToken",
  "sharedSecret",
  "identitySecret",
  "deviceId",
];
const PROTOCOLS = ["http", "https", "socks5h"];
const fail = () =>
  Error(
    localeText.invalidTradeBotsSystemV1PackageCheckItsSchemaIntegrityAndAssignments,
  );
function check(ok) {
  if (!ok) throw fail();
}
function object(v, keys, required = keys) {
  check(v && typeof v === "object" && !Array.isArray(v));
  check(
    Object.keys(v).every((k) => keys.includes(k)) &&
      required.every((k) => Object.hasOwn(v, k)),
  );
}
function arr(v, min, max) {
  check(Array.isArray(v) && v.length >= min && v.length <= max);
  return v;
}
function sid(v) {
  check(typeof v === "string" && /^\d{17}$/.test(v));
  return v;
}
function credential(v) {
  check(
    typeof v === "string" &&
      v.length >= 1 &&
      v.length <= 16384 &&
      !/[\0\r\n]/.test(v),
  );
  return v;
}
function decode(bytes) {
  check(
    bytes.length > 0 &&
      !bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])),
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  check(!text.includes("\r"));
  return text;
}
function json(text) {
  check(
    typeof text === "string" &&
      text.charCodeAt(0) !== 0xfeff &&
      !text.includes("\r"),
  );
  const value = JSON.parse(text);
  let i = 0,
    count = 0;
  const ws = () => {
    while (/[\t\n ]/.test(text[i] || "x")) i++;
  };
  const string = () => {
    const start = i++;
    let escape = false;
    while (i < text.length) {
      const c = text[i++];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') return JSON.parse(text.slice(start, i));
    }
    throw fail();
  };
  function walk(depth) {
    check(depth <= LIMITS.depth && ++count <= 3000000);
    ws();
    if (text[i] === "{") {
      i++;
      ws();
      const seen = new Set();
      if (text[i] === "}") {
        i++;
        return;
      }
      while (true) {
        ws();
        check(text[i] === '"');
        const key = string();
        check(
          !seen.has(key) &&
            !["__proto__", "constructor", "prototype"].includes(key),
        );
        seen.add(key);
        ws();
        check(text[i++] === ":");
        walk(depth + 1);
        ws();
        if (text[i++] === "}") break;
        check(text[i - 1] === ",");
      }
    } else if (text[i] === "[") {
      i++;
      ws();
      if (text[i] === "]") {
        i++;
        return;
      }
      while (true) {
        walk(depth + 1);
        ws();
        const end = text[i++];
        if (end === "]") break;
        check(end === ",");
      }
    } else if (text[i] === '"') {
      string();
    } else {
      const start = i;
      while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
      check(i > start);
    }
  }
  walk(0);
  ws();
  check(i === text.length);
  return value;
}
function account(v) {
  object(v, ACCOUNT_KEYS, ["accountName", "steamId"]);
  check(
    typeof v.accountName === "string" &&
      /^[a-z0-9_]{1,128}$/.test(v.accountName),
  );
  sid(v.steamId);
  check(Object.hasOwn(v, "password") || Object.hasOwn(v, "refreshToken"));
  for (const key of ["password", "refreshToken"])
    if (Object.hasOwn(v, key)) credential(v[key]);
  const sda = ["sharedSecret", "identitySecret", "deviceId"],
    present = sda.filter((k) => Object.hasOwn(v, k));
  check(present.length === 0 || present.length === 3);
  if (present.length) {
    for (const key of ["sharedSecret", "identitySecret"]) {
      check(typeof v[key] === "string" && /^[A-Za-z0-9+/]{27}=$/.test(v[key]));
      const b = Buffer.from(v[key], "base64");
      check(b.length === 20 && b.toString("base64") === v[key]);
    }
    check(
      typeof v.deviceId === "string" &&
        /^android:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
          v.deviceId,
        ),
    );
  }
  return { ...v };
}
function host(v) {
  check(
    typeof v === "string" &&
      v.length >= 1 &&
      v.length <= 253 &&
      v === v.toLowerCase() &&
      !v.endsWith("."),
  );
  if (net.isIP(v)) {
    if (net.isIP(v) === 6)
      check(new URL("http://[" + v + "]").hostname === "[" + v + "]");
    return v;
  }
  check(!/^[\d.]+$/.test(v) && !/[\s:/@\[\]?#%]/.test(v));
  check(
    v
      .split(".")
      .every(
        (label) =>
          label.length >= 1 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      ),
  );
  // Reject WHATWG numeric aliases, e.g. 127.1 and hexadecimal/octal IPv4.
  const u = new URL("http://" + v);
  check(u.hostname === v && !net.isIP(u.hostname));
  return v;
}
function proxySet(value, text, protocol) {
  object(value, ["format", "version", "protocol", "proxies"]);
  check(
    value.format === "trade-bots-system-proxies" &&
      value.version === 1 &&
      PROTOCOLS.includes(value.protocol) &&
      value.protocol === protocol,
  );
  arr(value.proxies, 1, LIMITS.proxies);
  const seen = new Set(),
    lines = [],
    proxies = [];
  for (const p of value.proxies) {
    object(p, ["host", "port", "username", "password"], ["host", "port"]);
    host(p.host);
    check(Number.isInteger(p.port) && p.port >= 1 && p.port <= 65535);
    const has = Object.hasOwn(p, "username");
    check(has === Object.hasOwn(p, "password"));
    if (has) {
      credential(p.username);
      credential(p.password);
      check(!/[:@\s\0]/.test(p.username) && !/[@\s\0]/.test(p.password));
    }
    const endpoint =
      (net.isIP(p.host) === 6 ? "[" + p.host + "]" : p.host) + ":" + p.port;
    const line = (has ? p.username + ":" + p.password + "@" : "") + endpoint;
    check(line.length <= 16384 && !seen.has(line));
    seen.add(line);
    lines.push(line);
    // Percent sequences in the TBS TXT are literal credentials, so '%' itself
    // must be encoded when producing a URL for smart-auth's proxy transport.
    const url =
      value.protocol +
      "://" +
      (has
        ? encodeURIComponent(p.username) +
          ":" +
          encodeURIComponent(p.password) +
          "@"
        : "") +
      endpoint;
    proxies.push({ url });
  }
  const actual = text.endsWith("\n") ? text.slice(0, -1) : text;
  check(actual === lines.join("\n"));
  return proxies;
}
function directoryEntries(folder, max = 10006) {
  const directory = fs.opendirSync(folder),
    rows = [];
  try {
    let entry;
    while ((entry = directory.readSync())) {
      check(rows.length < max);
      rows.push(entry);
    }
  } finally {
    directory.closeSync();
  }
  return rows;
}
function prepareTradeBots({ paths, text } = {}) {
  try {
    check(
      paths === undefined ||
        (Array.isArray(paths) &&
          paths.length <= 10000 &&
          paths.every((p) => typeof p === "string" && p.length > 0)),
    );
    check(text === undefined || typeof text === "string");
    check((paths?.length || 0) > 0 || text !== undefined);
    const state = {
        total: 0,
        accountTotal: 0,
        files: 0,
        entries: 0,
        identities: new Set(),
      },
      accounts = [],
      proxies = [];
    let rootName;
    function read(file, max, isAccount = false) {
      const st = fs.lstatSync(file, { bigint: true });
      check(
        st.isFile() &&
          !st.isSymbolicLink() &&
          st.nlink === 1n &&
          st.size > 0n &&
          st.size <= BigInt(max),
      );
      const fd = fs.openSync(
        file,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
      );
      let bytes;
      try {
        const opened = fs.fstatSync(fd, { bigint: true });
        check(
          opened.isFile() &&
            opened.nlink === 1n &&
            opened.dev === st.dev &&
            opened.ino === st.ino &&
            opened.size <= BigInt(max),
        );
        const identity = opened.dev + ":" + opened.ino;
        check(!state.identities.has(identity));
        state.identities.add(identity);
        // File identities must remain exact on Windows, where inode values can
        // exceed Number.MAX_SAFE_INTEGER. Convert size only after its bound check.
        const size = Number(opened.size);
        bytes = Buffer.alloc(size + 1);
        let n = 0;
        while (n < bytes.length) {
          const got = fs.readSync(fd, bytes, n, bytes.length - n, null);
          if (!got) break;
          n += got;
        }
        check(n === size && n <= max);
        bytes = bytes.subarray(0, n);
        state.total += n;
        state.files++;
        check(state.total <= LIMITS.total && state.files <= 20000);
        if (isAccount) {
          state.accountTotal += n;
          check(state.accountTotal <= LIMITS.accountTotal);
        }
      } finally {
        fs.closeSync(fd);
      }
      return bytes;
    }
    function addStandalone(file) {
      const b = read(file, LIMITS.accountBytes, true);
      const value = json(decode(b));
      check(!Array.isArray(value));
      accounts.push(account(value));
      check(accounts.length <= LIMITS.accounts);
    }
    function packageFolder(root) {
      const top = directoryEntries(root);
      check(
        top.every((e) =>
          [
            "manifest.json",
            "proxies.json",
            "proxies.txt",
            "mapping.json",
            "accounts",
            "README.txt",
          ].includes(e.name),
        ),
      );
      check(new Set(top.map((e) => e.name.toLowerCase())).size === top.length);
      for (const e of top) {
        const st = fs.lstatSync(path.join(root, e.name));
        check(!st.isSymbolicLink());
        if (e.name === "accounts") check(st.isDirectory());
        else check(st.isFile() && st.nlink === 1);
      }
      const manifest = json(
        decode(read(path.join(root, "manifest.json"), LIMITS.manifest)),
      );
      object(manifest, [
        "format",
        "version",
        "createdAt",
        "protocol",
        "accountCount",
        "accounts",
        "files",
      ]);
      check(
        manifest.format === "trade-bots-system-account-export" &&
          manifest.version === 1 &&
          PROTOCOLS.includes(manifest.protocol),
      );
      check(
        typeof manifest.createdAt === "string" &&
          manifest.createdAt.length <= 16384 &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
            manifest.createdAt,
          ) &&
          Number.isFinite(Date.parse(manifest.createdAt)) &&
          new Date(manifest.createdAt).toISOString().slice(0, 19) ===
            manifest.createdAt.slice(0, 19),
      );
      check(
        Number.isInteger(manifest.accountCount) &&
          manifest.accountCount >= 1 &&
          manifest.accountCount <= LIMITS.accounts,
      );
      arr(manifest.accounts, manifest.accountCount, manifest.accountCount);
      arr(manifest.files, manifest.accountCount + 3, manifest.accountCount + 3);
      const expected = new Set(["proxies.json", "proxies.txt", "mapping.json"]),
        orders = [];
      for (let i = 0; i < manifest.accounts.length; i++) {
        const row = manifest.accounts[i];
        object(row, ["sourceOrdinal", "file", "steamId"]);
        const file = "accounts/" + String(i + 1).padStart(6, "0") + ".json";
        check(row.sourceOrdinal === i + 1 && row.file === file);
        sid(row.steamId);
        expected.add(file);
        orders.push(row);
      }
      const members = directoryEntries(path.join(root, "accounts"));
      check(
        members.length === orders.length &&
          members.every(
            (e) => e.isFile() && expected.has("accounts/" + e.name),
          ),
      );
      const payload = new Map(),
        seen = new Set();
      for (const f of manifest.files) {
        object(f, ["path", "bytes", "sha256"]);
        check(
          typeof f.path === "string" &&
            expected.has(f.path) &&
            !seen.has(f.path),
        );
        seen.add(f.path);
        check(
          Number.isSafeInteger(f.bytes) &&
            f.bytes > 0 &&
            typeof f.sha256 === "string" &&
            /^[a-f0-9]{64}$/.test(f.sha256),
        );
        const isAccount = f.path.startsWith("accounts/");
        const max = isAccount
          ? LIMITS.accountBytes
          : f.path === "proxies.txt"
            ? LIMITS.proxyText
            : f.path === "proxies.json"
              ? LIMITS.proxyJson
              : LIMITS.mapping;
        const b = read(path.join(root, ...f.path.split("/")), max, isAccount);
        check(
          b.length === f.bytes &&
            crypto.createHash("sha256").update(b).digest("hex") === f.sha256,
        );
        payload.set(f.path, b);
      }
      check(seen.size === expected.size);
      const packageAccounts = orders.map((row) => {
        const a = account(json(decode(payload.get(row.file))));
        check(a.steamId === row.steamId);
        return a;
      });
      const packageProxies = proxySet(
        json(decode(payload.get("proxies.json"))),
        decode(payload.get("proxies.txt")),
        manifest.protocol,
      );
      const mapping = json(decode(payload.get("mapping.json")));
      arr(mapping, packageAccounts.length, packageAccounts.length);
      const byId = new Map(),
        used = new Set();
      for (const row of mapping) {
        object(row, ["steamId", "proxyIndex"]);
        sid(row.steamId);
        check(
          !byId.has(row.steamId) &&
            Number.isInteger(row.proxyIndex) &&
            row.proxyIndex >= 0 &&
            row.proxyIndex < packageProxies.length,
        );
        byId.set(row.steamId, row.proxyIndex);
        used.add(row.proxyIndex);
      }
      check(used.size === packageProxies.length);
      const offset = proxies.length;
      for (const a of packageAccounts) {
        check(byId.has(a.steamId));
        a.proxyIndex = offset + byId.get(a.steamId);
        accounts.push(a);
      }
      proxies.push(...packageProxies);
      check(
        accounts.length <= LIMITS.accounts && proxies.length <= LIMITS.proxies,
      );
      if (top.some((e) => e.name === "README.txt"))
        decode(read(path.join(root, "README.txt"), MiB));
    }
    function visit(target, depth = 0) {
      check(depth <= LIMITS.depth && ++state.entries <= 25000);
      const st = fs.lstatSync(target);
      check(!st.isSymbolicLink());
      if (st.isFile()) {
        check([".json", ".txt"].includes(path.extname(target).toLowerCase()));
        addStandalone(target);
        return;
      }
      check(st.isDirectory());
      const names = directoryEntries(target).map((entry) => entry.name);
      check(
        names.length <= 10006 &&
          new Set(names.map((s) => s.toLowerCase())).size === names.length,
      );
      if (names.includes("manifest.json")) {
        packageFolder(target);
        return;
      }
      check(
        !names.some((n) =>
          ["proxies.json", "mapping.json", "proxies.txt"].includes(n),
        ),
      );
      for (const name of names.sort())
        visit(path.join(target, name), depth + 1);
    }
    for (const p of paths || []) {
      const target = path.resolve(p);
      if (paths.length === 1 && fs.lstatSync(target).isDirectory())
        rootName = path
          .basename(target)
          .replace(/[\x00-\x1f\x7f]/g, "")
          .slice(0, 120);
      visit(target);
    }
    if (text !== undefined) {
      const size = Buffer.byteLength(text);
      check(
        size <= LIMITS.accountTotal &&
          state.accountTotal + size <= LIMITS.accountTotal,
      );
      const value = json(text);
      const values = Array.isArray(value)
        ? arr(value, 1, LIMITS.accounts)
        : [value];
      for (const v of values) {
        check(Buffer.byteLength(JSON.stringify(v)) <= LIMITS.accountBytes);
        accounts.push(account(v));
      }
    }
    check(accounts.length > 0 && accounts.length <= LIMITS.accounts);
    const names = new Set(),
      ids = new Set();
    for (const a of accounts) {
      check(!names.has(a.accountName) && !ids.has(a.steamId));
      names.add(a.accountName);
      ids.add(a.steamId);
    }
    return { accounts, proxies, ...(rootName ? { rootName } : {}), errors: [] };
  } catch {
    throw fail();
  }
}
module.exports = {
  prepareTradeBots,
  parseTradeBotsImport: prepareTradeBots,
  LIMITS,
};
