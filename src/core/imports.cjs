"use strict";
const localeText = require("../locales/application.json");
const fs = require("node:fs");
const path = require("node:path");
const { parseMafile, steamCode } = require("./steam.cjs");
const { validateProxy } = require("./transport.cjs");
const {
  loginKey,
  credential,
  textCredentials,
} = require("./import-credentials.cjs");
const {
  validateExternalSessions,
  mergeExternalSessions,
} = require("./external-sessions.cjs");
const LIMIT = {
  files: 10000,
  entries: 25000,
  depth: 12,
  total: 64 * 1024 * 1024,
  file: 2 * 1024 * 1024,
  records: 10000,
};
const FORMATS = new Set(["auto", "sda", "sih", "nebula", "deps", "nan"]);
const ALLOWED_KINDS = {
  auto: new Set(["mafile", "deps", "nan", "session"]),
  sda: new Set(["mafile"]),
  sih: new Set(["mafile"]),
  nebula: new Set(["mafile"]),
  deps: new Set(["mafile", "deps", "session"]),
  nan: new Set(["mafile", "nan", "session"]),
};
function safeLabel(value) {
  return String(value || "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 240);
}
function humanName(value) {
  return (
    safeLabel(value).replace(/\s+/g, " ").trim().slice(0, 120).trim() ||
    localeText.import
  );
}
function clean(value, depth = 0, count = { n: 0 }) {
  if (depth > 32 || ++count.n > 50000) throw Error("structure");
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1, count));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, v] of Object.entries(value)) {
      const k = key.toLowerCase().replace(/[_\s-]/g, "");
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw Error("structure");
      if (
        /password|passwd/.test(k) ||
        [
          "pwd",
          "pass",
          "email",
          "emaillogin",
          "emaildata",
          "emailpassword",
          "desktoprefreshtoken",
          "webrefreshtoken",
        ].includes(k)
      )
        continue;
      result[key] = clean(v, depth + 1, count);
    }
    return result;
  }
  return value;
}
function readJson(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ""), (key, value, context) => {
    if (typeof value === "number" && /^(steam_?id|steamid64)$/i.test(key)) {
      if (!context || !/^\d+$/.test(context.source)) throw Error("id");
      return context.source;
    }
    return value;
  });
}
function collect(paths, text, extensions, filesOnly = false) {
  const files = [],
    errors = [];
  let total = 0,
    entries = 0;
  let rootName;
  function reject(source, reason) {
    if (errors.length < 1000)
      errors.push({ source: safeLabel(source), reason });
  }
  function visit(target, root, depth, folderName) {
    const source = root ? path.relative(root, target) : path.basename(target);
    if (depth > LIMIT.depth) {
      reject(source, localeText.folderDepthLimitExceeded);
      return;
    }
    let st;
    try {
      st = fs.lstatSync(target, { bigint: true });
    } catch {
      reject(source, localeText.fileUnavailable);
      return;
    }
    if (st.isSymbolicLink() || (st.isFile() && st.nlink !== 1n)) {
      reject(source, localeText.symbolicLinksAndJunctionsAreNotImported);
      return;
    }
    if (st.isDirectory()) {
      if (filesOnly) {
        reject(source, localeText.singleMafileRequired);
        return;
      }
      let children;
      try {
        children = fs
          .readdirSync(target, { withFileTypes: true })
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        reject(source, localeText.folderUnavailable);
        return;
      }
      for (const child of children) {
        if (++entries > LIMIT.entries) {
          reject(source, localeText.fileLimitExceeded);
          return;
        }
        visit(
          path.join(target, child.name),
          root || target,
          depth + 1,
          folderName || path.basename(target),
        );
      }
    } else if (st.isFile()) {
      if (!extensions.has(path.extname(target).toLowerCase())) return;
      if (
        files.length >= LIMIT.files ||
        st.size > BigInt(LIMIT.file) ||
        BigInt(total) + st.size > BigInt(LIMIT.total)
      ) {
        reject(source, localeText.importSizeLimitExceeded);
        return;
      }
      let fd;
      try {
        fd = fs.openSync(
          target,
          fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
        );
        const opened = fs.fstatSync(fd, { bigint: true });
        const same = (a, b) =>
          b.isFile() &&
          b.nlink === 1n &&
          a.dev === b.dev &&
          a.ino === b.ino &&
          a.size === b.size &&
          a.mtimeNs === b.mtimeNs &&
          a.ctimeNs === b.ctimeNs;
        if (
          !same(st, opened) ||
          opened.size > BigInt(LIMIT.file) ||
          BigInt(total) + opened.size > BigInt(LIMIT.total)
        )
          throw Error("changed");
        // Bound allocation before converting bigint metadata. Windows inode
        // identities may exceed Number.MAX_SAFE_INTEGER.
        const size = Number(opened.size);
        const buffer = Buffer.alloc(size + 1);
        let bytes = 0;
        while (bytes < buffer.length) {
          const n = fs.readSync(fd, buffer, bytes, buffer.length - bytes, null);
          if (!n) break;
          bytes += n;
        }
        if (
          bytes !== size ||
          !same(opened, fs.fstatSync(fd, { bigint: true })) ||
          !same(opened, fs.lstatSync(target, { bigint: true }))
        )
          throw Error("changed");
        const data = buffer.subarray(0, bytes).toString("utf8");
        total += bytes;
        files.push({
          text: data,
          source: safeLabel(source),
          groupName: folderName,
        });
      } catch {
        reject(source, localeText.couldNotReadFile);
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
  }
  if (paths !== undefined && (!Array.isArray(paths) || paths.length > 5000))
    throw Error(localeText.invalidPathList);
  for (const p of paths || []) {
    if (typeof p !== "string") {
      reject(localeText.file, localeText.invalidPath);
      continue;
    }
    if ((paths || []).length === 1) {
      try {
        if (fs.lstatSync(p).isDirectory())
          rootName = humanName(path.basename(p));
      } catch {}
    }
    visit(path.resolve(p), null, 0, null);
  }
  if (text !== undefined) {
    if (typeof text !== "string" || Buffer.byteLength(text) > LIMIT.file)
      reject(localeText.pastedText, localeText.textSizeLimitExceeded);
    else files.push({ text, source: localeText.pastedText });
  }
  return { files, errors, rootName };
}
function recordKind(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.shared_secret === "string") return "mafile";
    if (value.AccountData && typeof value.AccountData === "object")
      return "nan";
    if (typeof value.Steam2faSharedSecret === "string") return "deps";
    if (
      typeof value.SharedSecret === "string" &&
      typeof value.Username === "string"
    )
      return "session";
  }
  return null;
}
function records(value) {
  if (Array.isArray(value)) return value;
  if (recordKind(value)) return [value];
  if (value && typeof value === "object") {
    for (const key of ["accounts", "Accounts", "mafiles", "maFiles"])
      if (Array.isArray(value[key])) return value[key];
  }
  throw Error("schema");
}
function descriptor(value, kind) {
  if (kind === "mafile")
    return {
      name: value.account_name,
      id: value.Session?.SteamID || value.steamid || value.steam_id,
      secret: value.shared_secret,
      identity: value.identity_secret,
      device: value.device_id,
    };
  if (kind === "deps")
    return {
      name: value.SteamLogin,
      id: value.Steamid,
      secret: value.Steam2faSharedSecret,
      identity: value.IdentitySecret,
      rcode: value.Steam2faRevocationCode,
      extra: value.Secret_1,
    };
  const v = kind === "nan" ? value.AccountData : value;
  return {
    name: v.Username,
    id: v.SteamID || v.SteamId,
    secret: v.SharedSecret,
    identity: v.IdentitySecret,
    rcode: v.Rcode,
  };
}
function normalize(record, associated) {
  const d = descriptor(record.value, record.kind);
  const auxiliary = {};
  for (const key of ["DesktopRefreshToken", "WebRefreshToken"])
    if (record.value[key] !== undefined) auxiliary[key] = record.value[key];
  const external = mergeExternalSessions(
    validateExternalSessions(associated?.value.ExternalSessions, d.id),
    validateExternalSessions(record.value.ExternalSessions, d.id),
    validateExternalSessions(auxiliary, d.id),
  );
  let mafile;
  if (record.kind === "mafile") mafile = clean(record.value);
  else {
    mafile = {
      ...(associated ? clean(associated.value) : {}),
      account_name: d.name,
      shared_secret: d.secret,
      identity_secret: d.identity || associated?.value.identity_secret,
      Session: { ...clean(associated?.value.Session || {}), SteamID: d.id },
    };
    if (d.rcode) mafile.revocation_code = d.rcode;
    if (d.extra) mafile.secret_1 = d.extra;
  }
  if (associated) {
    const original = descriptor(associated.value, "mafile");
    if (
      original.id !== d.id ||
      original.name.toLowerCase() !== String(d.name).toLowerCase() ||
      original.secret !== d.secret ||
      (original.identity && d.identity && original.identity !== d.identity)
    )
      throw Error("association");
  }
  // Flat account exports do not carry an enrolled device ID. Keep their identity
  // secret, but validate as code-only and never invent an enrolled authenticator.
  const identity = mafile.identity_secret;
  if (identity) steamCode(identity, 0);
  const codeOnly = !!identity && !mafile.device_id;
  const validation = codeOnly
    ? { ...mafile, identity_secret: undefined }
    : mafile;
  const account = parseMafile(JSON.stringify(validation));
  if (codeOnly) account.mafile.identity_secret = identity;
  if (external) account.mafile.ExternalSessions = external;
  account.canConfirm =
    !!account.mafile.identity_secret && !!account.mafile.device_id;
  return account;
}
function prepareAccounts({
  paths,
  text,
  format = "auto",
  mode = "auto",
  singleMafile = false,
} = {}) {
  if (
    singleMafile &&
    (!Array.isArray(paths) ||
      paths.length !== 1 ||
      typeof paths[0] !== "string" ||
      path.extname(paths[0]).toLowerCase() !== ".mafile" ||
      text !== undefined)
  )
    throw Error(localeText.singleMafileRequired);
  format = String(format).toLowerCase();
  if (!FORMATS.has(format)) throw Error(localeText.unsupportedImportFormat);
  if (
    !["auto", "file", "files", "folder", "text", "paste", "single"].includes(
      mode,
    )
  )
    throw Error(localeText.unsupportedImportMode);
  const input = collect(
    paths,
    text,
    new Set([".json", ".mafile", ".txt", ".info", ".steamsession"]),
    singleMafile,
  );
  const all = [];
  const candidates = [];
  const errors = [...input.errors];
  for (const file of input.files) {
    try {
      const parsed = readJson(file.text);
      if (singleMafile && recordKind(parsed) !== "mafile")
        throw Error("single");
      let values;
      try {
        values = records(parsed);
      } catch (error) {
        const found = credential(parsed);
        if (!found.length) throw error;
        candidates.push(...found);
        continue;
      }
      if (
        values.length > LIMIT.records ||
        all.length + values.length > LIMIT.files
      )
        throw Error("limit");
      values.forEach((value, index) => {
        const source =
          file.source + (values.length > 1 ? ` [${index + 1}]` : "");
        const kind = recordKind(value);
        const found = credential(value);
        if (!kind && found.length) {
          if (candidates.length + found.length > 50000) throw Error("limit");
          candidates.push(...found);
          return;
        }
        if (!kind || !ALLOWED_KINDS[format].has(kind)) {
          if (errors.length < 1000)
            errors.push({
              source,
              reason: localeText.jsonRecordDoesNotMatchTheSelectedFormat,
            });
          return;
        }
        if (candidates.length + found.length > 50000) throw Error("limit");
        candidates.push(...found);
        all.push({ value, kind, source, groupName: file.groupName });
      });
    } catch {
      try {
        if (/^[\s]*[\[{]/.test(file.text)) throw Error("json");
        const found = textCredentials(file.text);
        if (candidates.length + found.length > LIMIT.records)
          throw Error("limit");
        candidates.push(...found);
        continue;
      } catch {}
      if (errors.length < 1000)
        errors.push({
          source: file.source,
          reason:
            localeText.unsupportedJSONOrFormatAnUnencryptedAuthenticatorRecordIsRequired,
        });
    }
  }
  const originalById = new Map();
  for (const record of all)
    if (record.kind === "mafile") {
      const d = descriptor(record.value, record.kind);
      if (!originalById.has(d.id)) originalById.set(d.id, record);
    }
  const result = new Map();
  const conflicted = new Set();
  // Canonical authenticators win over ancillary records and session snapshots.
  for (const record of [...all].sort(
    (a, b) => (a.kind === "mafile" ? 0 : 1) - (b.kind === "mafile" ? 0 : 1),
  )) {
    let recordId;
    try {
      const d = descriptor(record.value, record.kind);
      const associated =
        record.kind === "mafile" ? null : originalById.get(d.id);
      recordId = d.id;
      if (conflicted.has(recordId)) continue;
      const existing = result.get(recordId)?.account;
      if (
        existing &&
        ((d.secret !== undefined &&
          d.secret !== existing.mafile.shared_secret) ||
          (d.identity &&
            existing.mafile.identity_secret &&
            d.identity !== existing.mafile.identity_secret) ||
          (d.name !== undefined &&
            String(d.name).toLowerCase() !== existing.name.toLowerCase()) ||
          (d.device &&
            existing.mafile.device_id &&
            d.device !== existing.mafile.device_id))
      )
        throw Error("association");
      const account = normalize(record, associated);
      if (result.has(account.steamId)) {
        const prior = result.get(account.steamId).account;
        if (
          prior.mafile.shared_secret !== account.mafile.shared_secret ||
          prior.name.toLowerCase() !== account.name.toLowerCase() ||
          (prior.mafile.identity_secret &&
            account.mafile.identity_secret &&
            prior.mafile.identity_secret !== account.mafile.identity_secret) ||
          (prior.mafile.device_id &&
            account.mafile.device_id &&
            prior.mafile.device_id !== account.mafile.device_id)
        )
          throw Error("association");
        const merged = mergeExternalSessions(
          prior.mafile.ExternalSessions,
          account.mafile.ExternalSessions,
        );
        if (merged) prior.mafile.ExternalSessions = merged;
        continue;
      }
      if (result.size >= 5000) throw Error("limit");
      const rawGroup =
        record.groupName ||
        (format === "nebula" && typeof record.value.Group === "string"
          ? record.value.Group
          : undefined);
      const groupName = rawGroup ? humanName(rawGroup) : undefined;
      result.set(account.steamId, {
        account,
        source: record.source,
        ...(groupName ? { groupName } : {}),
        ...(!account.canConfirm
          ? {
              warnings: [
                localeText.localCodesOnlyOriginalDeviceIdOrIdentitySecretMissing,
              ],
            }
          : {}),
      });
    } catch (error) {
      if (error.message === "association" && recordId) {
        conflicted.add(recordId);
        result.delete(recordId);
      }
      if (errors.length < 1000)
        errors.push({
          source: record.source,
          reason:
            localeText.recordIsDamagedConflictingOrMissingTheRequiredSteamIDSecret,
        });
    }
  }
  const rejectedLogins = new Set(
    all
      .filter((r) => conflicted.has(descriptor(r.value, r.kind).id))
      .map((r) => loginKey(descriptor(r.value, r.kind).name)),
  );
  const byLogin = new Map();
  for (const item of result.values()) {
    const key = loginKey(item.account.name);
    if (key) {
      const ids = byLogin.get(key) || new Set();
      ids.add(item.account.steamId);
      byLogin.set(key, ids);
    }
  }
  const grouped = new Map();
  for (const c of candidates) {
    const key = loginKey(c.login);
    if (!key) continue;
    const entry = grouped.get(key) || {
      login: c.login,
      passwords: new Set(),
      ids: new Set(),
    };
    if (c.steamId) entry.ids.add(c.steamId);
    entry.passwords.add(c.loginPassword);
    grouped.set(key, entry);
  }
  const credentials = [];
  let passwordConflicts = 0;
  for (const [key, entry] of grouped) {
    if (rejectedLogins.has(key)) continue;
    const ids = byLogin.get(key);
    if (
      entry.passwords.size !== 1 ||
      entry.ids.size > 1 ||
      (ids &&
        (ids.size !== 1 ||
          (entry.ids.size && !entry.ids.has(ids.values().next().value))))
    ) {
      passwordConflicts++;
      if (errors.length < 1000)
        errors.push({
          source: localeText.sourceText,
          reason: localeText.reasonText,
        });
      continue;
    }
    const loginPassword = entry.passwords.values().next().value;
    const steamId =
      ids?.values().next().value || entry.ids.values().next().value;
    if (steamId && result.has(steamId) && !conflicted.has(steamId))
      result.get(steamId).account.loginPassword = loginPassword;
    credentials.push({
      login: entry.login,
      loginPassword,
      ...(steamId ? { steamId } : {}),
    });
  }
  return {
    credentials,
    passwordConflicts,
    accounts: [...result.values()],
    errors,
    ...(input.rootName ? { rootName: input.rootName } : {}),
  };
}
function proxyLine(raw, protocol) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) return null;
  if (line.length > 2048) throw Error("length");
  const scheme = protocol === "socks5" ? "socks5h" : protocol;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) return validateProxy(line);
  const m = /^(\[[0-9a-f:]+\]|[^:\s]+):(\d{1,5})(?::([^:]*):(.*))?$/i.exec(
    line,
  );
  if (!m && line.includes("@")) return validateProxy(`${scheme}://${line}`);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 65535) throw Error("format");
  const auth =
    m[3] !== undefined
      ? `${encodeURIComponent(m[3])}:${encodeURIComponent(m[4])}@`
      : "";
  return validateProxy(`${scheme}://${auth}${m[1]}:${m[2]}`);
}
function prepareProxies({ paths, text, name, protocol = "http" } = {}) {
  if (!["http", "https", "socks5"].includes(protocol))
    throw Error(localeText.unsupportedProxyProtocol);
  const input = collect(
    paths,
    text,
    new Set([".txt", ".json", ".csv", ".list"]),
  );
  const lists = [],
    errors = [...input.errors];
  for (const file of input.files) {
    const listName = humanName(
      name ||
        (file.source === localeText.pastedText
          ? localeText.proxyList
          : path.basename(file.source, path.extname(file.source))),
    );
    const proxies = [];
    const seen = new Set();
    let lines = file.text.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (lines.length > 10000) {
      errors.push({ source: file.source, reason: localeText.tooManyProxyRows });
      continue;
    }
    if (file.text.trim().startsWith("[") || file.text.trim().startsWith("{")) {
      try {
        const value = readJson(file.text);
        const arr = Array.isArray(value) ? value : value.proxies;
        if (!Array.isArray(arr) || arr.length > 10000) throw Error();
        lines = arr.map((p) =>
          typeof p === "string"
            ? p
            : typeof p?.url === "string"
              ? p.url
              : (() => {
                  throw Error();
                })(),
        );
      } catch {
        errors.push({
          source: file.source,
          reason: localeText.unsupportedProxyListJSON,
        });
        continue;
      }
    }
    lines.forEach((line, index) => {
      try {
        const url = proxyLine(line, protocol);
        if (url && !seen.has(url)) {
          seen.add(url);
          proxies.push({
            url,
            name: `${localeText.proxies}${proxies.length + 1}`,
          });
        }
      } catch {
        if (errors.length < 1000)
          errors.push({
            source: file.source,
            reason: `${localeText.templateText_5b7d727}${index + 1}`,
          });
      }
    });
    if (proxies.length > 2000) {
      errors.push({
        source: file.source,
        reason: localeText.listExceedsThe2000ProxyLimit,
      });
      continue;
    }
    if (proxies.length) lists.push({ name: listName, proxies });
  }
  return { lists, errors };
}
module.exports = { prepareAccounts, prepareProxies };
