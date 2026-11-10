"use strict";
const localeText = require("../locales/application.json");
const crypto = require("node:crypto");
const { validateTradeJournal } = require("./trade-offers.cjs");
const { accountPolicy } = require("./account-policy.cjs");
const { normalizeBrowserProfile } = require("./browser-profile.cjs");
const { normalizeBrowserSession } = require("./browser-session-data.cjs");
const { parseMafile } = require("./steam.cjs");
const { validateProxy } = require("./transport.cjs");
const { safeCachedAvatar } = require("./avatar.cjs");
const { validateExternalSessions } = require("./external-sessions.cjs");
const MAX_PLAIN = 47 * 1024 * 1024,
  MAX_INPUT = 64 * 1024 * 1024;
const ACCOUNT_KEYS = [
  "id",
  "name",
  "steamId",
  "groupId",
  "proxyIds",
  "proxyListIds",
  "inheritProxy",
  "proxyAllocation",
  "deviceName",
  "browserProfile",
  "browserSession",
  "mafile",
  "note",
  "autoMarket",
  "autoTrades",
  "autoMarketPurchases",
  "checkConfirmations",
  "notifyConfirmations",
  "confirmationIntervalSeconds",
  "loginPassword",
  "avatar",
  "confirmationJournal",
  "tradeOfferJournal",
  "watchIncomingTrades",
  "autoAcceptGifts",
  "functionIntervalsSeconds",
];
const TOP_KEYS = [
  "format",
  "version",
  "exportedAt",
  "accounts",
  "groups",
  "proxies",
  "proxyLists",
  "includeProxies",
  "retiredConfirmationJournals",
  "retiredTradeOfferJournals",
];
const fail = () => Error(localeText.message_c409e4e);
function check(ok) {
  if (!ok) throw fail();
}
function own(o, keys) {
  check(o && typeof o === "object" && !Array.isArray(o));
  check(Object.keys(o).every((k) => keys.includes(k)));
}
function inspect(value, depth = 0, count = { n: 0 }) {
  check(depth <= 40 && ++count.n <= 1500000);
  if (value && typeof value === "object") {
    check(
      Array.isArray(value) ||
        Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null,
    );
    for (const k of Object.keys(value)) {
      check(!["__proto__", "prototype", "constructor"].includes(k));
      inspect(value[k], depth + 1, count);
    }
  } else
    check(
      value === null ||
        ["string", "boolean"].includes(typeof value) ||
        (typeof value === "number" && Number.isFinite(value)),
    );
}
function clone(v) {
  inspect(v);
  return JSON.parse(JSON.stringify(v));
}
function str(v, max = 128) {
  check(
    typeof v === "string" &&
      v.length > 0 &&
      v.length <= max &&
      !/[\x00-\x1f\x7f]/.test(v),
  );
  return v;
}
function sid(v) {
  check(typeof v === "string" && /^765\d{14}$/.test(v));
  return v;
}
function array(v, max) {
  check(Array.isArray(v) && v.length <= max);
  return v;
}
function ids(v = [], max = 2000) {
  array(v, max);
  v.forEach((x) => str(x));
  check(new Set(v).size === v.length);
  return [...v];
}
function unique(rows, key = "id") {
  const m = new Map();
  for (const row of rows) {
    const k = str(row[key]);
    check(!m.has(k));
    m.set(k, row);
  }
  return m;
}
function journal(v) {
  array(v, 10000);
  for (const row of v) {
    own(row, [
      "requestId",
      "confirmationId",
      "fingerprint",
      "decision",
      "state",
      "createdAt",
    ]);
    str(row.requestId);
    check(
      /^\d{1,32}$/.test(row.confirmationId) &&
        typeof row.confirmationId === "string",
    );
    check(
      typeof row.fingerprint === "string" &&
        /^[a-f0-9]{64}$/.test(row.fingerprint),
    );
    check(
      ["accept", "reject"].includes(row.decision) &&
        ["dispatching", "acknowledged"].includes(row.state),
    );
    check(
      typeof row.createdAt === "string" &&
        row.createdAt.length <= 40 &&
        Number.isFinite(Date.parse(row.createdAt)),
    );
  }
  return v;
}
function validMafile(a) {
  check(a.mafile && typeof a.mafile === "object" && !Array.isArray(a.mafile));
  const m = clone(a.mafile);
  const validation =
    m.identity_secret && !m.device_id
      ? { ...m, identity_secret: undefined }
      : m;
  const parsed = parseMafile(JSON.stringify(validation), {
    allowMissingAuthenticator: true,
  });
  check(parsed.steamId === a.steamId);
  for (const [alias, canonical] of [
    ["access_token", "AccessToken"],
    ["refresh_token", "RefreshToken"],
  ]) {
    if (m.Session?.[alias])
      parseMafile(
        JSON.stringify({
          ...validation,
          Session: { ...validation.Session, [canonical]: m.Session[alias] },
        }),
        { allowMissingAuthenticator: true },
      );
  }
  if (m.identity_secret && !m.device_id) {
    const { steamCode } = require("./steam.cjs");
    steamCode(m.identity_secret, 0);
  }
  if (m.ExternalSessions !== undefined) {
    const external = validateExternalSessions(m.ExternalSessions, a.steamId);
    if (external) m.ExternalSessions = external;
    else delete m.ExternalSessions;
  }
  return m;
}
function validatePortable(input) {
  inspect(input);
  own(input, TOP_KEYS);
  check(
    input.format === "smart-sda" &&
      input.version === 1 &&
      typeof input.includeProxies === "boolean",
  );
  check(
    typeof input.exportedAt === "string" &&
      input.exportedAt.length <= 40 &&
      Number.isFinite(Date.parse(input.exportedAt)),
  );
  const b = clone(input);
  array(b.accounts, 5000);
  array(b.groups, 5000);
  array(b.proxies, 10000);
  array(b.proxyLists, 5000);
  const accounts = unique(b.accounts),
    groups = unique(b.groups),
    proxies = unique(b.proxies),
    lists = unique(b.proxyLists);
  check(new Set(b.accounts.map((a) => a.steamId)).size === b.accounts.length);
  for (const p of b.proxies) {
    own(p, ["id", "name", "url"]);
    str(p.name, 120);
    p.url = validateProxy(p.url);
  }
  for (const list of b.proxyLists) {
    own(list, ["id", "name", "proxyIds"]);
    str(list.name, 120);
    list.proxyIds = ids(list.proxyIds);
    list.proxyIds.forEach((id) => check(proxies.has(id)));
  }
  const route = (o) => {
    o.proxyIds = ids(o.proxyIds);
    o.proxyListIds = ids(o.proxyListIds, 100);
    o.proxyIds.forEach((id) => check(proxies.has(id)));
    o.proxyListIds.forEach((id) => check(lists.has(id)));
  };
  for (const g of b.groups) {
    own(g, ["id", "name", "parentId", "proxyIds", "proxyListIds"]);
    str(g.name, 120);
    check(g.parentId === null || groups.has(g.parentId));
    route(g);
    const seen = new Set([g.id]);
    let id = g.parentId;
    while (id) {
      check(!seen.has(id));
      seen.add(id);
      id = groups.get(id).parentId;
    }
  }
  for (const a of accounts.values()) {
    own(a, ACCOUNT_KEYS);
    sid(a.steamId);
    str(a.name, 120);
    check(a.groupId === null || groups.has(a.groupId));
    route(a);
    for (const key of ["inheritProxy", "autoMarket", "autoTrades"])
      check(typeof a[key] === "boolean");
    if (a.proxyAllocation !== undefined) {
      own(a.proxyAllocation, [
        "groupId",
        "listIds",
        "proxyIds",
        "backupProxyIds",
      ]);
      const allocation = a.proxyAllocation;
      check(allocation.groupId === null || groups.has(allocation.groupId));
      allocation.listIds = ids(allocation.listIds, 100);
      array(allocation.proxyIds, 100);
      if (allocation.backupProxyIds !== undefined) {
        allocation.backupProxyIds = ids(allocation.backupProxyIds, 2000);
        allocation.backupProxyIds.forEach((id) =>
          check(
            proxies.has(id) &&
              a.proxyIds.includes(id) &&
              !allocation.proxyIds.includes(id) &&
              allocation.listIds.some((listId) =>
                lists.get(listId)?.proxyIds.includes(id),
              ),
          ),
        );
      }
      check(
        allocation.listIds.length === allocation.proxyIds.length &&
          !a.inheritProxy,
      );
      check(
        JSON.stringify(allocation.listIds) === JSON.stringify(a.proxyListIds),
      );
      allocation.listIds.forEach((id, i) =>
        check(
          lists.has(id) &&
            lists.get(id).proxyIds.includes(allocation.proxyIds[i]) &&
            a.proxyIds.includes(allocation.proxyIds[i]),
        ),
      );
    }
    if (a.deviceName !== undefined) str(a.deviceName, 128);
    if (a.browserProfile !== undefined)
      a.browserProfile = normalizeBrowserProfile(a.browserProfile);
    if (a.browserSession !== undefined)
      a.browserSession = normalizeBrowserSession(a.browserSession, a.steamId);
    if (a.note !== undefined)
      check(
        typeof a.note === "string" &&
          a.note.length <= 2000 &&
          !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(a.note),
      );
    if (a.loginPassword !== undefined)
      check(
        typeof a.loginPassword === "string" &&
          a.loginPassword.length > 0 &&
          a.loginPassword.length <= 16384 &&
          !/[\r\n\0]/.test(a.loginPassword),
      );
    Object.assign(a, accountPolicy(a));
    a.mafile = validMafile(a);
    if (a.avatar !== undefined) {
      own(a.avatar, ["dataUrl", "updatedAt"]);
      check(
        !!safeCachedAvatar(a.avatar) &&
          Number.isSafeInteger(a.avatar.updatedAt) &&
          a.avatar.updatedAt >= 0,
      );
    }
    if (a.confirmationJournal !== undefined) journal(a.confirmationJournal);
    if (a.tradeOfferJournal !== undefined)
      a.tradeOfferJournal = validateTradeJournal(a.tradeOfferJournal);
  }
  if (!b.includeProxies) {
    check(!b.proxies.length && !b.proxyLists.length);
    for (const a of b.accounts) check(!a.inheritProxy);
    for (const o of [...b.accounts, ...b.groups])
      check(!o.proxyIds.length && !o.proxyListIds.length);
  }
  b.retiredConfirmationJournals ??= {};
  check(
    b.retiredConfirmationJournals &&
      typeof b.retiredConfirmationJournals === "object" &&
      !Array.isArray(b.retiredConfirmationJournals),
  );
  const selected = new Set(b.accounts.map((a) => a.steamId));
  b.retiredTradeOfferJournals ??= {};
  check(
    b.retiredTradeOfferJournals &&
      typeof b.retiredTradeOfferJournals === "object" &&
      !Array.isArray(b.retiredTradeOfferJournals),
  );
  for (const [id, entries] of Object.entries(b.retiredTradeOfferJournals)) {
    check(selected.has(sid(id)));
    b.retiredTradeOfferJournals[id] = validateTradeJournal(entries);
  }
  for (const [id, entries] of Object.entries(b.retiredConfirmationJournals)) {
    check(selected.has(sid(id)));
    journal(entries);
  }
  check(Buffer.byteLength(JSON.stringify(b)) <= MAX_PLAIN);
  return b;
}
function buildPortable(data, selection, { includeProxies = false } = {}) {
  check(typeof includeProxies === "boolean");
  const wanted = ids(selection, 5000),
    source = new Map(data.accounts.map((a) => [a.id, a]));
  check(wanted.length > 0);
  const accounts = wanted.map((id) => {
    const a = source.get(id);
    check(!!a);
    const picked = {};
    for (const k of ACCOUNT_KEYS) if (a[k] !== undefined) picked[k] = a[k];
    const c = clone(picked);
    c.groupId ??= null;
    c.proxyIds ??= [];
    c.proxyListIds ??= [];
    c.inheritProxy ??= true;
    c.autoMarket ??= false;
    c.autoTrades ??= false;
    Object.assign(c, accountPolicy(c));
    const avatar = safeCachedAvatar(c.avatar);
    if (
      !avatar ||
      !Number.isSafeInteger(c.avatar.updatedAt) ||
      c.avatar.updatedAt < 0
    )
      delete c.avatar;
    if (!includeProxies) {
      c.proxyIds = [];
      c.proxyListIds = [];
      c.inheritProxy = false;
      delete c.proxyAllocation;
    }
    return c;
  });
  const groupMap = new Map(data.groups.map((g) => [g.id, g])),
    groupIds = new Set();
  for (const a of accounts.flatMap((account) =>
    account.proxyAllocation?.groupId
      ? [account, { groupId: account.proxyAllocation.groupId }]
      : [account],
  )) {
    let id = a.groupId;
    const seen = new Set();
    while (id) {
      check(!seen.has(id));
      seen.add(id);
      const g = groupMap.get(id);
      check(!!g);
      groupIds.add(id);
      id = g.parentId;
    }
  }
  const groups = data.groups
    .filter((g) => groupIds.has(g.id))
    .map((g) => ({
      id: g.id,
      name: g.name,
      parentId: g.parentId ?? null,
      proxyIds: includeProxies ? [...(g.proxyIds || [])] : [],
      proxyListIds: includeProxies ? [...(g.proxyListIds || [])] : [],
    }));
  const owners = [...accounts, ...groups],
    listIds = new Set(
      includeProxies ? owners.flatMap((o) => o.proxyListIds || []) : [],
    );
  const proxyLists = (data.proxyLists || [])
    .filter((l) => listIds.has(l.id))
    .map((l) => ({ id: l.id, name: l.name, proxyIds: [...l.proxyIds] }));
  const proxyIds = new Set(
    includeProxies
      ? [
          ...owners.flatMap((o) => o.proxyIds || []),
          ...proxyLists.flatMap((l) => l.proxyIds),
        ]
      : [],
  );
  const proxies = data.proxies
    .filter((p) => proxyIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, url: p.url }));
  const retiredConfirmationJournals = {};
  const retiredTradeOfferJournals = {};
  for (const a of accounts)
    if (data.retiredTradeOfferJournals?.[a.steamId])
      retiredTradeOfferJournals[a.steamId] = clone(
        data.retiredTradeOfferJournals[a.steamId],
      );
  for (const a of accounts)
    if (data.retiredConfirmationJournals?.[a.steamId])
      retiredConfirmationJournals[a.steamId] = clone(
        data.retiredConfirmationJournals[a.steamId],
      );
  return validatePortable({
    format: "smart-sda",
    version: 1,
    exportedAt: new Date().toISOString(),
    includeProxies,
    accounts,
    groups,
    proxies,
    proxyLists,
    retiredConfirmationJournals,
    retiredTradeOfferJournals,
  });
}
const LEGACY_KDF = { name: "scrypt", N: 32768, r: 8, p: 1, keyLength: 32 };
const KDF = { name: "scrypt", N: 262144, r: 8, p: 1, keyLength: 32 };
function profile(version) {
  check(version === 1 || version === 2);
  return version === 1 ? LEGACY_KDF : KDF;
}
function keyFor(key, salt, version) {
  const kdf = profile(version);
  check(
    typeof key === "string" &&
      (version === 1 ? key.length >= 10 : [...key].length >= 15) &&
      key.length <= 4096,
  );
  return crypto.scryptSync(key, salt, 32, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: (version === 1 ? 64 : 384) * 1024 * 1024,
  });
}
function bin(v, length, max = length) {
  check(typeof v === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(v));
  const b = Buffer.from(v, "base64");
  check(b.toString("base64") === v && b.length >= length && b.length <= max);
  return b;
}
function aad(e) {
  return Buffer.from(
    JSON.stringify({
      format: e.format,
      version: e.version,
      kdf: { ...profile(e.version) },
      cipher: e.cipher,
      salt: e.salt,
      iv: e.iv,
    }),
  );
}
function encodePortable(bundle, key = "") {
  const plain = Buffer.from(JSON.stringify(validatePortable(bundle)), "utf8");
  if (key === undefined || key === null || key === "") return plain;
  let derived;
  try {
    const salt = crypto.randomBytes(32),
      iv = crypto.randomBytes(12);
    derived = keyFor(key, salt, 2);
    const e = {
      format: "smart-sda-encrypted",
      version: 2,
      kdf: { ...KDF },
      cipher: "aes-256-gcm",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
    };
    const cipher = crypto.createCipheriv("aes-256-gcm", derived, iv);
    cipher.setAAD(aad(e));
    e.ciphertext = Buffer.concat([
      cipher.update(plain),
      cipher.final(),
    ]).toString("base64");
    e.tag = cipher.getAuthTag().toString("base64");
    return Buffer.from(JSON.stringify(e));
  } finally {
    plain.fill(0);
    derived?.fill(0);
  }
}
function decodePortable(raw, key = "") {
  let plain, derived;
  try {
    check(typeof raw === "string" || Buffer.isBuffer(raw));
    check(Buffer.byteLength(raw) <= MAX_INPUT);
    const e = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : raw);
    inspect(e);
    if (e.format === "smart-sda") return validatePortable(e);
    own(e, [
      "format",
      "version",
      "kdf",
      "cipher",
      "salt",
      "iv",
      "ciphertext",
      "tag",
    ]);
    check(
      e.format === "smart-sda-encrypted" &&
        (e.version === 1 || e.version === 2) &&
        e.cipher === "aes-256-gcm",
    );
    const expected = profile(e.version);
    own(e.kdf, Object.keys(expected));
    check(Object.keys(expected).every((k) => e.kdf[k] === expected[k]));
    check(Object.keys(e.kdf).length === Object.keys(expected).length);
    const salt = bin(e.salt, 32),
      iv = bin(e.iv, 12),
      tag = bin(e.tag, 16),
      ciphertext = bin(e.ciphertext, 1, MAX_PLAIN);
    derived = keyFor(key, salt, e.version);
    const cipher = crypto.createDecipheriv("aes-256-gcm", derived, iv);
    cipher.setAAD(aad(e));
    cipher.setAuthTag(tag);
    plain = Buffer.concat([cipher.update(ciphertext), cipher.final()]);
    check(plain.length <= MAX_PLAIN);
    return validatePortable(JSON.parse(plain.toString("utf8")));
  } catch {
    throw fail();
  } finally {
    plain?.fill(0);
    derived?.fill(0);
  }
}
function classicFiles(data, selection) {
  const b = buildPortable(data, selection);
  if (b.accounts.some((a) => !a.mafile.shared_secret))
    throw new Error(localeText.validationMessage_ff73111);
  const fields = [
    "shared_secret",
    "serial_number",
    "revocation_code",
    "uri",
    "server_time",
    "account_name",
    "token_gid",
    "identity_secret",
    "secret_1",
    "status",
    "device_id",
    "fully_enrolled",
    "steamid",
    "steam_id",
  ];
  const files = b.accounts.map((a) => {
    const m = {};
    for (const k of fields) if (a.mafile[k] !== undefined) m[k] = a.mafile[k];
    m.Session = {};
    for (const k of [
      "SteamID",
      "steamid",
      "AccessToken",
      "RefreshToken",
      "SessionID",
      "access_token",
      "refresh_token",
    ])
      if (a.mafile.Session?.[k] !== undefined)
        m.Session[k] = a.mafile.Session[k];
    m.Session.SteamID = a.steamId;
    return { name: a.steamId + ".maFile", content: JSON.stringify(m, null, 2) };
  });
  // SDA stores SteamID as ulong: emit validated decimal literal without Number precision loss.
  const entries = b.accounts
    .map(
      (a) =>
        `{"filename":${JSON.stringify(a.steamId + ".maFile")},"steamid":${a.steamId},"encryption_iv":null,"encryption_salt":null}`,
    )
    .join(",");
  files.push({
    name: "manifest.json",
    content: `{"encrypted":false,"first_run":false,"entries":[${entries}],"periodic_checking":false,"periodic_checking_interval":5,"periodic_checking_checkall":false,"auto_confirm_market_transactions":false,"auto_confirm_trades":false}`,
  });
  return files;
}
module.exports = {
  buildPortable,
  encodePortable,
  decodePortable,
  validatePortable,
  classicFiles,
  MAX_PLAIN,
  MAX_INPUT,
};
