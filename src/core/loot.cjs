"use strict";
const localeText = require("../locales/application.json");
// Production loot uses SteamService's authenticated, policy-routed transport only.
// There is no retry path for a send. Durable intents reserve exact assets even
// when the process exits between dispatch and acknowledgment.
const crypto = require("node:crypto");
const { OfferRecord } = require("./trade-offer-record.cjs");
const { tradePagePermissions } = require("./loot-trade-permissions.cjs");
const { createLootCommunitySession } = require("./loot-community-session.cjs");
const { normalizeAccountBans } = require("./account-bans.cjs");
const {
  planOfferAssets,
  isTradeProtectedApp,
} = require("./loot-protection.cjs");
const {
  classifyOffer,
  findRecoveryCandidates,
  classifyExchange,
  boundOfferHeader,
  canResolveMissingOffer,
} = require("./loot-recovery.cjs");
const ORIGIN = "https://steamcommunity.com";
const BASE = 76561197960265728n;
const DEFAULT_APPS = [730, 570, 440, 753];
const MAX_JOURNAL = 10000;
const MAX_JOB_EVENTS = 1000;
const EVENT_MESSAGES = {
  "job-start": localeText.message_ef1ee04,
  "source-start": localeText.processingSource,
  "phase-change": localeText.message_c870063,
  "source-completed": localeText.message_d7d3d5a,
  "cancel-requested": localeText.message_e8a28b2,
  "inventory-start": localeText.readingInventory,
  "inventory-page": localeText.message_ba790f7,
  "inventory-read": localeText.message_95c0e06,
  "source-skipped": localeText.sourceSkipped,
  "send-preflight": localeText.message_75eb93e,
  "send-start": localeText.message_a12a7c7,
  "confirmation-start": localeText.confirmingOffer,
  "offer-sent": localeText.message_d026faa,
  "offer-accepted": localeText.message_f1434ca,
  "offer-delivered": localeText.message_83de859,
  "send-error": localeText.message_4add0fd,
  "retry-queued": localeText.message_d20d6a8,
  "retry-due": localeText.retryingSource,
  "job-completed": localeText.message_a455478,
  "job-cancelled": localeText.message_e3897fe,
  "job-failed": localeText.message_1fbce32,
  "route-start": localeText.checkingProxy,
  "route-failure": localeText.message_597a9ff,
  "route-ready": localeText.message_7733e37,
  "route-cache-hit": localeText.message_7ab38e6,
  "session-ready": localeText.message_9a87428,
  "session-refreshed": localeText.sessionRefreshed,
  "session-refresh-start": localeText.refreshingSession,
  "auth-start": localeText.signingInToSteam,
  "auth-success": localeText.loginComplete,
};
const EVENT_PHASES = new Set([
  "preparing",
  "proxy",
  "session",
  "auth",
  "inventory",
  "sending",
  "confirming",
  "retry-wait",
  "retry-preparing",
  "completed",
  "cancelled",
  "failed",
  "skipped",
  "pending",
]);
const EVENT_REASONS = new Set([
  "persistence",
  "permission",
  "authentication",
  "proxy",
  "empty",
  "rate-limit",
  "unknown-send",
  "temporary",
  "unknown",
]);
function eventReason(error) {
  if (error?.lootFatal) return "persistence";
  const text = [
    error?.code,
    error?.message,
    error?.cause?.code,
    error?.cause?.message,
  ]
    .filter(Boolean)
    .join(" ");
  if (error?.lootUncertainSend) return "unknown-send";
  if (/429|STEAM_RATE_LIMIT/.test(text)) return "rate-limit";
  if (new RegExp(localeText.pattern, "i").test(text)) return "proxy";
  if (new RegExp(localeText.pattern_a383891, "i").test(text))
    return "permission";
  if (
    [5, 15, 65, 85, 88].includes(error?.eresult) ||
    new RegExp(localeText.pattern_68ec09e, "i").test(text)
  )
    return "authentication";
  return sourceRetryKind(error) ? "temporary" : "unknown";
}
function eventErrorDetails(error) {
  const causes = [error, error?.cause, error?.cause?.cause].filter(Boolean),
    result = { reason: eventReason(error) };
  const status = causes
    .map((e) => e.statusCode ?? e.status)
    .find((x) => Number.isInteger(x) && x >= 100 && x <= 599);
  const steamResult = causes
    .map((e) => e.eresult)
    .find((x) => Number.isInteger(x) && x >= 0 && x <= 1000000);
  if (status !== undefined) result.httpStatus = status;
  if (steamResult !== undefined) result.steamResult = steamResult;
  return result;
}
const HOLD_STATES = new Set([
  "dispatching",
  "unknown",
  "sent",
  "mobile-confirmation",
  "email-confirmation",
  "accepted",
  "accepted-awaiting-proof",
  "escrow",
  "review",
  "rollback-review",
]);
function lootPendingCount(data, schemeId) {
  return (data?.loot?.journal || []).filter(
    (entry) =>
      HOLD_STATES.has(entry.state) &&
      (schemeId === undefined || (entry.schemeId ?? "legacy") === schemeId),
  ).length;
}
function check(ok, message = localeText.message_6d72654) {
  if (!ok) throw Error(message);
}
function steamId(value) {
  return (
    typeof value === "string" &&
    /^765\d{14}$/.test(value) &&
    BigInt(value) > BASE &&
    BigInt(value) <= BASE + 4294967295n
  );
}
function integer(value, fallback, min, max) {
  const n = value === undefined ? fallback : Number(value);
  check(Number.isSafeInteger(n) && n >= min && n <= max);
  return n;
}
function decimal(value, positive = false) {
  const s =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value;
  check(
    typeof s === "string" &&
      /^\d{1,20}$/.test(s) &&
      (!positive || BigInt(s) > 0n),
  );
  return BigInt(s).toString();
}
function stringIds(value) {
  check(Array.isArray(value) && value.length <= 10000);
  return [
    ...new Set(
      value.map((x) => {
        check(typeof x === "string" && x.length > 0 && x.length <= 200);
        return x;
      }),
    ),
  ];
}
function tradeAccess(warehouse) {
  check(warehouse && steamId(warehouse.steamId));
  check(warehouse.bans?.community !== true, localeText.message_a62a600);
  let token = warehouse.tradeToken;
  if (warehouse.tradeUrl) {
    const u = new URL(warehouse.tradeUrl);
    check(
      u.origin === ORIGIN &&
        u.pathname === "/tradeoffer/new/" &&
        !u.username &&
        !u.password &&
        !u.hash,
    );
    check(
      [...u.searchParams.keys()].every((k) =>
        ["partner", "token"].includes(k),
      ) &&
        u.searchParams.getAll("partner").length === 1 &&
        u.searchParams.getAll("token").length === 1,
    );
    check(
      decimal(u.searchParams.get("partner"), true) ===
        (BigInt(warehouse.steamId) - BASE).toString(),
      localeText.message_d77e7c2,
    );
    check(token === undefined || token === u.searchParams.get("token"));
    token = u.searchParams.get("token");
  }
  check(
    token === undefined ||
      (typeof token === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(token)),
  );
  return {
    steamId: warehouse.steamId,
    allowedSenders: normalizeSelection(warehouse.allowedSenders),
    ...(token ? { tradeToken: token } : {}),
    ...(typeof warehouse.avatar === "string" &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
      warehouse.avatar,
    ) &&
    warehouse.avatar.length < 524288
      ? { avatar: warehouse.avatar }
      : {}),
  };
}
function normalizeSelection(raw = {}) {
  check(raw && typeof raw === "object" && !Array.isArray(raw));
  check(raw.all === undefined || typeof raw.all === "boolean");
  return {
    all: raw.all !== false,
    groupIds: stringIds(raw.groupIds ?? []),
    accountIds: stringIds(raw.accountIds ?? []),
  };
}
function selected(data, account, selection) {
  if (selection.all || selection.accountIds.includes(account.id)) return true;
  const seen = new Set();
  let id = account.groupId;
  while (id && !seen.has(id)) {
    if (selection.groupIds.includes(id)) return true;
    seen.add(id);
    id = (data.groups || []).find((g) => g.id === id)?.parentId;
  }
  return false;
}
function lootCommunityBanned(data, identity) {
  return data.accounts.some(
    (account) =>
      account.steamId === identity && account.bans?.community === true,
  );
}
function assertLootBan(data, identity, source = true) {
  if (!lootCommunityBanned(data, identity)) return;
  const error = Error(
    source ? localeText.message_c34acbc : localeText.message_a62a600,
  );
  error.lootSafeMessage = error.message;
  error.lootSkipSource = source;
  throw error;
}
function lootCoverage(data, rawSettings) {
  const settings = normalizeLootSettings(rawSettings);
  const banned = new Set(
    data.accounts
      .filter((a) => a.bans?.community === true)
      .map((a) => a.steamId),
  );
  const warehouses = new Set(settings.warehouses.map((w) => w.steamId));
  const sources = data.accounts
    .filter(
      (a) =>
        steamId(a.steamId) &&
        !banned.has(a.steamId) &&
        !warehouses.has(a.steamId) &&
        selected(data, a, settings.sources),
    )
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const eligibleWarehouses = Object.fromEntries(
    sources.map((a) => [
      a.id,
      settings.warehouses
        .filter(
          (w) => !banned.has(w.steamId) && selected(data, a, w.allowedSenders),
        )
        .map((w) => w.steamId),
    ]),
  );
  return {
    sourceIds: sources.map((a) => a.id),
    unassignedAccounts: sources
      .filter((a) => !eligibleWarehouses[a.id].length)
      .map((a) => ({
        id: a.id,
        steamId: a.steamId,
        name: a.name || a.login || a.steamId,
        login: a.login,
      })),
    eligibleWarehouses,
  };
}
function normalizeLootSettings(raw = {}) {
  check(raw && typeof raw === "object" && !Array.isArray(raw));
  const sources = raw.sources ?? {};
  check(sources && typeof sources === "object" && !Array.isArray(sources));
  check(raw.enabled === undefined || typeof raw.enabled === "boolean");
  check(sources.all === undefined || typeof sources.all === "boolean");
  const appIds = raw.appIds ?? DEFAULT_APPS;
  check(Array.isArray(appIds) && appIds.length > 0 && appIds.length <= 100);
  const warehouses = (raw.warehouses ?? []).map(tradeAccess);
  check(
    warehouses.length <= 100 &&
      new Set(warehouses.map((w) => w.steamId)).size === warehouses.length &&
      (raw.enabled !== true || warehouses.length > 0),
  );
  return {
    enabled: raw.enabled === true,
    intervalHours: integer(raw.intervalHours, 4, 1, 8760),
    delaySeconds: integer(raw.delaySeconds, 30, 0, 86400),
    retryDelaySeconds: integer(raw.retryDelaySeconds, 60, 30, 86400),
    maxRetryAttempts: integer(raw.maxRetryAttempts, 2, 0, 10),
    concurrency: integer(raw.concurrency, 3, 1, 8),
    maxItemsPerRun: integer(raw.maxItemsPerRun, 8192, 1, 1000000),
    appIds: [
      ...new Set(appIds.map((id) => integer(id, undefined, 1, 2147483647))),
    ],
    warehouses,
    sources: {
      all: sources.all !== false,
      groupIds: stringIds(sources.groupIds ?? []),
      accountIds: stringIds(sources.accountIds ?? []),
    },
  };
}
function sourceRetryKind(error) {
  if (error?.lootSkipSource) return null;
  if (error?.lootUncertainSend) return "unknown";
  const causes = [error, error?.cause, error?.cause?.cause].filter(Boolean);
  if (
    causes.some(
      (e) =>
        e.code === "STEAM_RATE_LIMIT" ||
        e.code === "LOOT_LOGIN_PENDING" ||
        e.statusCode === 429 ||
        e.status === 429,
    )
  )
    return "temporary";
  if (
    causes.some(
      (e) =>
        [
          "ETIMEDOUT",
          "ECONNRESET",
          "ECONNREFUSED",
          "EHOSTUNREACH",
          "ENETUNREACH",
          "EPIPE",
        ].includes(e.code) ||
        /^Steam HTTP (500|502|503|504)$/.test(e.message || "") ||
        new RegExp(localeText.pattern_afd5768, "i").test(e.message || ""),
    )
  )
    return "temporary";
  return null;
}
const assetKey = (a) => `${a.appid}:${a.contextid}:${a.assetid}`;
const unitCount = (assets) =>
  assets.reduce((total, asset) => total + BigInt(asset.amount), 0n).toString();
const tuples = (assets) =>
  assets
    .map((a) => [a.appid, a.contextid, a.assetid, a.amount].join(":"))
    .sort();
const digest = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const settingsDigest = (settings) =>
  digest({
    ...settings,
    warehouses: settings.warehouses.map(
      ({ avatar, ...warehouse }) => warehouse,
    ),
  });
function pageIdentity(html, name, expected) {
  const matches = OfferRecord.find(
    html,
    new RegExp("\\b" + name + "\\s*=", "g"),
  );
  check(
    matches.length === 1 &&
      new RegExp("^\\s*(['\"])" + expected + "\\1").test(
        html.slice(matches[0].index + matches[0][0].length),
      ) &&
      OfferRecord.inScript(html, matches[0].index),
    localeText.message_b4f231d,
  );
}
function validateLootJournal(raw = []) {
  check(
    Array.isArray(raw) && raw.length <= MAX_JOURNAL,
    localeText.message_d922ba7,
  );
  const ids = new Set();
  return raw.map((e) => {
    check(
      e &&
        typeof e.requestId === "string" &&
        /^[a-f0-9-]{36}$/.test(e.requestId) &&
        !ids.has(e.requestId),
    );
    ids.add(e.requestId);
    check(
      e.schemeId === undefined ||
        (typeof e.schemeId === "string" &&
          e.schemeId.length > 0 &&
          e.schemeId.length <= 200),
    );
    check(
      typeof e.accountId === "string" &&
        e.accountId.length <= 200 &&
        steamId(e.sourceSteamId) &&
        steamId(e.partnerSteamId),
    );
    check(
      [
        ...HOLD_STATES,
        "accepted",
        "cancelled",
        "declined",
        "expired",
        "invalid",
        "escrow",
        "not-dispatched",
        "not-found",
        "delivered",
      ].includes(e.state),
    );
    check(
      typeof e.createdAt === "string" &&
        Number.isFinite(Date.parse(e.createdAt)) &&
        Array.isArray(e.assets) &&
        e.assets.length > 0 &&
        e.assets.length <= 8192,
    );
    const assets = e.assets.map((a) => ({
      appid: integer(a.appid, undefined, 1, 2147483647),
      contextid: decimal(a.contextid),
      assetid: decimal(a.assetid, true),
      amount: decimal(a.amount, true),
    }));
    check(new Set(assets.map(assetKey)).size === assets.length);
    check(
      e.fingerprint ===
        digest([e.sourceSteamId, e.partnerSteamId, tuples(assets)]),
    );
    check(
      e.offerId === undefined ||
        (typeof e.offerId === "string" && /^[1-9]\d{0,31}$/.test(e.offerId)),
    );
    check(
      e.checkedAt === undefined ||
        (typeof e.checkedAt === "string" &&
          Number.isFinite(Date.parse(e.checkedAt))),
    );
    for (const field of [
      "nextCheckAt",
      "deliveredAt",
      "monitorUntil",
      "attemptedAt",
    ])
      check(
        e[field] === undefined ||
          (typeof e[field] === "string" &&
            Number.isFinite(Date.parse(e[field]))),
      );
    check(
      e.tradeId === undefined ||
        (typeof e.tradeId === "string" && /^[1-9]\d{0,31}$/.test(e.tradeId)),
    );
    check(
      e.exchangeStatus === undefined ||
        (Number.isInteger(e.exchangeStatus) &&
          e.exchangeStatus >= 0 &&
          e.exchangeStatus <= 11),
    );
    if (e.delivery !== undefined) {
      check(Array.isArray(e.delivery) && e.delivery.length === assets.length);
      const keys = e.delivery.map((a) => {
        integer(a.appid, undefined, 1, 2147483647);
        decimal(a.contextid);
        decimal(a.assetid, true);
        decimal(a.amount, true);
        return assetKey(a);
      });
      check(new Set(keys).size === keys.length);
      const quantities = (list) =>
        list
          .map(
            (a) =>
              `${integer(a.appid, undefined, 1, 2147483647)}:${decimal(a.amount, true)}`,
          )
          .sort();
      check(
        JSON.stringify(quantities(e.delivery)) ===
          JSON.stringify(quantities(assets)),
      );
    }
    if (e.state === "delivered")
      check(
        e.offerId !== undefined &&
          e.tradeId !== undefined &&
          e.exchangeStatus === 3 &&
          e.delivery !== undefined &&
          e.deliveredAt !== undefined,
      );
    return {
      requestId: e.requestId,
      schemeId: e.schemeId ?? "legacy",
      accountId: e.accountId,
      sourceSteamId: e.sourceSteamId,
      partnerSteamId: e.partnerSteamId,
      state: e.state,
      createdAt: e.createdAt,
      assets,
      fingerprint: e.fingerprint,
      ...(e.offerId ? { offerId: e.offerId } : {}),
      ...(e.checkedAt ? { checkedAt: e.checkedAt } : {}),
      ...Object.fromEntries(
        [
          "nextCheckAt",
          "deliveredAt",
          "monitorUntil",
          "attemptedAt",
          "tradeId",
          "exchangeStatus",
          "delivery",
        ]
          .filter((k) => e[k] !== undefined)
          .map((k) => [k, structuredClone(e[k])]),
      ),
    };
  });
}
class LootService {
  constructor({
    steam,
    getData,
    onChange,
    isCurrent = () => true,
    onEvent = () => {},
    accountWork,
    now = Date.now,
    maxPages = 1000,
    schemeId = "legacy",
    inventoryReadAt,
    rateLimitedUntil,
  } = {}) {
    check(
      steam && typeof getData === "function" && typeof onChange === "function",
      localeText.message_b8935da,
    );
    Object.assign(this, {
      schemeId,
      steam,
      getData,
      onChange,
      isCurrent,
      onEvent,
      now,
      maxPages,
    });
    check(Number.isSafeInteger(maxPages) && maxPages > 0 && maxPages <= 10000);
    const workAdapter =
      accountWork ||
      (async (id, action) =>
        action(this.getData().accounts.find((a) => a.id === id)));
    this.accountWork = (id, action) => {
      const run = this._run();
      const identity = run.data.accounts.find(
        (account) => account.id === id,
      )?.steamId;
      this._assertCooldown(identity);
      return workAdapter(
        id,
        async (account) => {
          this._guard(run);
          return action(account);
        },
        { assertCurrent: () => this._guard(run) },
      );
    };
    this.epoch = 0;
    this.job = null;
    this.jobData = null;
    this.preview = null;
    this.task = null;
    this.preparing = false;
    this.pendingDelays = new Set();
    this.inventoryReadAt = inventoryReadAt || new Map();
    this.rateLimitedUntil = rateLimitedUntil || new Map();
    this.sendTail = null;
    this.lastSendAt = null;
    this.recoveryTask = null;
  }
  _assertCooldown(id) {
    const account = this.getData()?.accounts?.find(
      (account) => account.steamId === id,
    );
    const transportWait =
      account && this.steam.transport?.rateLimitStatus?.(account)?.retryAfterMs;
    if (Number.isFinite(transportWait) && transportWait > 0)
      this.rateLimitedUntil.set(
        id,
        Math.max(
          this.rateLimitedUntil.get(id) || 0,
          Math.min(8640000000000000, this.now() + transportWait),
        ),
      );
    const until = this.rateLimitedUntil.get(id) || 0;
    if (until <= this.now()) {
      this.rateLimitedUntil.delete(id);
      return;
    }
    const safeMessage =
      localeText.message_f9e4eeb +
      Math.ceil((until - this.now()) / 1000) +
      localeText.message_d0b39ec;
    const error = Error(
      localeText.steamTemporarilyLimitedRequestsHTTP429TryAgainLater,
    );
    error.lootSafeMessage = safeMessage;
    error.statusCode = 429;
    error.noRetry = true;
    error.retryAt = new Date(until).toISOString();
    throw error;
  }
  _rateLimit(id, response) {
    if (
      response?.code !== "STEAM_RATE_LIMIT" &&
      Number(
        response?.statusCode ??
          response?.status ??
          response?.response?.statusCode,
      ) !== 429 &&
      !/^Steam HTTP 429$/.test(response?.message || "")
    )
      return;
    const headers = response.headers || response.response?.headers || {};
    const raw =
      headers["retry-after"] ?? headers["Retry-After"] ?? response.retryAfter;
    const seconds =
      typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
    let delay =
      Number.isFinite(response.retryAfterMs) && response.retryAfterMs > 0
        ? response.retryAfterMs
        : Number.isFinite(seconds) && seconds >= 0
          ? seconds * 1000
          : Date.parse(raw) - this.now();
    if (
      delay === Infinity ||
      (typeof raw === "string" &&
        /^\d+(?:\.\d+)?$/.test(raw.trim()) &&
        seconds === Infinity)
    )
      delay = 8640000000000000 - this.now();
    if (!Number.isFinite(delay) || delay <= 0) delay = 60000;
    delay = Math.min(8640000000000000 - this.now(), Math.max(1000, delay));
    this.rateLimitedUntil.set(
      id,
      Math.max(this.rateLimitedUntil.get(id) || 0, this.now() + delay),
    );
  }
  _record(data) {
    if (!Array.isArray(data.loot?.schemes)) return data.loot;
    const record = data.loot.schemes.find((s) => s.id === this.schemeId);
    check(record, localeText.message_7e86bb7);
    return record;
  }
  _coverage(run) {
    return lootCoverage(run.data, run.settings);
  }
  _checkCoverage(run) {
    const coverage = this._coverage(run);
    if (coverage.unassignedAccounts.length) {
      const error = Error(localeText.message_0a4af2e);
      error.lootSafeMessage = error.message;
      error.coverage = coverage;
      throw error;
    }
    return coverage;
  }
  _allowed(run, accountId, partnerSteamId) {
    const source = run.data.accounts.find(
      (account) => account.id === accountId,
    );
    assertLootBan(run.data, source?.steamId);
    assertLootBan(run.data, partnerSteamId, false);
    if (run.warehouseBans?.get(partnerSteamId)?.bans.community === true) {
      const error = Error(localeText.message_a62a600);
      error.lootSafeMessage = error.message;
      throw error;
    }
    check(
      this._coverage(run).eligibleWarehouses[accountId]?.includes(
        partnerSteamId,
      ),
      localeText.message_ffb14ea,
    );
  }
  _data() {
    const data = this.getData();
    check(data && Array.isArray(data.accounts), localeText.message_c9a0aed);
    data.loot ||= {
      settings: normalizeLootSettings(),
      journal: [],
      lastRunAt: null,
    };
    this._record(data).settings = normalizeLootSettings(
      this._record(data).settings,
    );
    validateLootJournal(data.loot.journal);
    check(
      this._record(data).lastRunAt === null ||
        (typeof this._record(data).lastRunAt === "string" &&
          Number.isFinite(Date.parse(this._record(data).lastRunAt))),
    );
    return data;
  }
  status() {
    const current = this.getData();
    if (
      Array.isArray(current?.loot?.schemes) &&
      !current.loot.schemes.some((s) => s.id === this.schemeId)
    )
      return {
        running: false,
        preparing: false,
        job: null,
        lastRunAt: null,
        nextRunAt: null,
        preview: null,
      };
    const data = this._data(),
      loot = this._record(data),
      interval = loot.settings.intervalHours * 3600000;
    const delivered = data.loot.journal.filter(
      (e) =>
        (e.schemeId ?? "legacy") === this.schemeId && e.state === "delivered",
    );
    return {
      running: !!this.task && this.jobData === data,
      preparing: this.preparing,
      job: this.job && this.jobData === data ? structuredClone(this.job) : null,
      lastRunAt: loot.lastRunAt,
      nextRunAt: loot.settings.enabled
        ? loot.lastRunAt
          ? new Date(Date.parse(loot.lastRunAt) + interval).toISOString()
          : new Date(this.now()).toISOString()
        : null,
      preview: this.preview?.data === data ? this._summary(this.preview) : null,
      deliveredOffers: delivered.length,
      deliveredItems: delivered.reduce((n, e) => n + e.assets.length, 0),
      deliveredUnits: delivered
        .reduce((n, e) => n + BigInt(unitCount(e.assets)), 0n)
        .toString(),
    };
  }
  _summary(p) {
    return {
      id: p.id,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      sourceCount: new Set(p.offers.map((o) => o.accountId)).size,
      itemCount: p.offers.reduce((n, o) => n + o.assets.length, 0),
      assetCount: p.offers.reduce((n, o) => n + o.assets.length, 0),
      unitCount: p.offers
        .reduce((total, offer) => total + BigInt(unitCount(offer.assets)), 0n)
        .toString(),
      offerCount: p.offers.length,
      warehouses: p.settings.warehouses.map((w) => ({ steamId: w.steamId })),
      offers: p.offers.map((o) => ({
        accountId: o.accountId,
        partnerSteamId: o.partnerSteamId,
        itemCount: o.assets.length,
        assetCount: o.assets.length,
        unitCount: unitCount(o.assets),
      })),
      skipped: structuredClone(p.skipped || []),
    };
  }
  _guard(run) {
    check(
      this.epoch === run.epoch &&
        this.steam.epoch === run.steamEpoch &&
        this.getData() === run.data,
      localeText.message_e6208f6,
    );
    if (run.scheduled)
      check(
        this._record(run.data).settings.enabled,
        localeText.message_484c16f,
      );
    check(
      settingsDigest(normalizeLootSettings(this._record(run.data).settings)) ===
        run.settingsHash,
      localeText.message_26b16d2,
    );
  }
  _run(scheduled = false) {
    const data = this._data();
    return {
      epoch: this.epoch,
      steamEpoch: this.steam.epoch,
      data,
      settings: structuredClone(this._record(data).settings),
      settingsHash: settingsDigest(this._record(data).settings),
      scheduled,
      warehouseBans: new Map(),
    };
  }
  _sources(run) {
    const ids = new Set(this._coverage(run).sourceIds);
    return run.data.accounts
      .filter((a) => ids.has(a.id))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  async _ready(account, run, onPhase = () => {}) {
    this._guard(run);
    check(
      account && this.isCurrent(account) && run.data.accounts.includes(account),
      localeText.message_0e6c43c,
    );
    this._assertCooldown(account.steamId);
    assertLootBan(run.data, account.steamId);
    if (typeof this.steam.ensureLootSession === "function")
      await this.steam.ensureLootSession(account, {
        assertCurrent: () => this._guard(run),
        onPhase,
        onDetail: (detail) => {
          const phase = detail.type?.startsWith("route-")
            ? "proxy"
            : detail.type?.startsWith("auth-")
              ? "auth"
              : "session";
          const reason =
            detail.reason === "rate-limit"
              ? "rate-limit"
              : detail.reason
                ? "proxy"
                : undefined;
          if (
            this._recordEvent(detail.type, {
              run,
              accountId: account.id,
              phase,
              level: detail.type === "route-failure" ? "warning" : "info",
              details: {
                routeAttempt: detail.attempt,
                routeCount: detail.total,
                backup: detail.fallback,
                reason,
              },
            })
          )
            this._notifyLog();
        },
      });
    else await this.steam._refresh(account);
    this._guard(run);
    if (typeof this.steam.refreshBans === "function")
      await this.steam.refreshBans(account);
    this._guard(run);
    assertLootBan(run.data, account.steamId);
    const session = account.mafile?.Session,
      token = session?.AccessToken;
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
    } catch {}
    check(
      decoded?.sub === account.steamId &&
        Number.isSafeInteger(decoded.exp) &&
        decoded.exp > this.now() / 1000 &&
        /^[a-fA-F0-9]{16,64}$/.test(session?.SessionID),
      localeText.message_b74f122,
    );
    const routeSnapshot =
      typeof this.steam.transport?.routes === "function"
        ? digest(this.steam.transport.routes(account))
        : null;
    return {
      account,
      session,
      token,
      expiresAt: decoded.exp * 1000,
      sessionid: session.SessionID,
      steamId: account.steamId,
      routeSnapshot,
      transportGeneration: this.steam.transport?.generation,
      deadline: Date.now() + 120000,
      bytes: 0,
    };
  }
  _current(ctx, run) {
    this._guard(run);
    const a = ctx.account;
    check(
      this.isCurrent(a) &&
        run.data.accounts.includes(a) &&
        a.steamId === ctx.steamId &&
        a.mafile?.Session === ctx.session &&
        ctx.session.AccessToken === ctx.token &&
        ctx.session.SessionID === ctx.sessionid &&
        this.now() < ctx.expiresAt &&
        Date.now() < ctx.deadline &&
        ctx.transportGeneration === this.steam.transport?.generation &&
        (ctx.routeSnapshot === null ||
          ctx.routeSnapshot === digest(this.steam.transport.routes(a))),
      localeText.message_661c635,
    );
  }
  async _request(ctx, run, url, options = {}) {
    this._current(ctx, run);
    this._assertCooldown(ctx.steamId);
    let result;
    try {
      result = await this.steam._request(
        ctx.account,
        url,
        {
          ...options,
          deadline: ctx.deadline,
          maxBodyBytes: 16 * 1024 * 1024,
          beforeDispatch: () => {
            this._current(ctx, run);
            this._assertCooldown(ctx.steamId);
            options.beforeDispatch?.();
          },
          headers: {
            ...options.headers,
            cookie: this.steam._cookie(ctx.account),
          },
        },
        run.steamEpoch,
      );
    } catch (error) {
      this._rateLimit(ctx.steamId, error);
      this._assertCooldown(ctx.steamId);
      throw error;
    }
    this._rateLimit(ctx.steamId, result);
    if (result.statusCode === 429) this._assertCooldown(ctx.steamId);
    this._current(ctx, run);
    ctx.bytes += Buffer.byteLength(String(result.body));
    check(ctx.bytes <= 128 * 1024 * 1024, localeText.message_27dd633);
    return result;
  }
  _community(ctx, run, options) {
    if (
      typeof this.steam.transport?.requestVia !== "function" ||
      typeof this.steam.transport?.routes !== "function"
    )
      return null;
    const session = createLootCommunitySession({
      steam: this.steam,
      account: ctx.account,
      deadline: ctx.deadline,
      assertCurrent: () => this._current(ctx, run),
      onResponse: (result) => {
        this._current(ctx, run);
        this._rateLimit(ctx.steamId, result);
        if (result.statusCode === 429) this._assertCooldown(ctx.steamId);
        ctx.bytes += Buffer.byteLength(String(result.body));
        check(ctx.bytes <= 128 * 1024 * 1024, localeText.message_27dd633);
      },
      ...options,
    });
    const read = async (method, args) => {
      this._assertCooldown(ctx.steamId);
      try {
        return await session[method](...args);
      } catch (error) {
        this._rateLimit(ctx.steamId, error);
        this._assertCooldown(ctx.steamId);
        throw error;
      }
    };
    return {
      ...session,
      page: (...args) => read("page", args),
      send: (...args) => read("send", args),
    };
  }
  async _inventory(ctx, run, appid, { revalidate = false } = {}) {
    const readKey = `${ctx.steamId}:inventory`;
    const pace = async () => {
      const previous = this.inventoryReadAt.get(readKey);
      if (previous !== undefined) {
        const wait = 1500 - (Date.now() - previous);
        if (wait > 0) await this._delay(wait, run);
      }
      this._current(ctx, run);
      this._assertCooldown(ctx.steamId);
    };
    const contextid = appid === 753 ? "6" : "2",
      seen = new Set(),
      cursors = new Set(),
      result = [];
    let cursor = "0",
      total,
      retries = 0;
    for (let page = 0; page < this.maxPages; page++) {
      check(!cursors.has(cursor), localeText.message_77d587c);
      cursors.add(cursor);
      const query = new URLSearchParams({
        l: "english",
        count: "2000",
        ...(cursor === "0" ? {} : { start_assetid: cursor }),
      });
      let response;
      await pace();
      for (;;) {
        try {
          response = await this._request(
            ctx,
            run,
            `${ORIGIN}/inventory/${ctx.steamId}/${appid}/${contextid}?${query}`,
            { retrySafe: true },
          );
          break;
        } catch (error) {
          this._current(ctx, run);
          // Only explicit transient HTTP failures while proving inventory may
          // repeat. Invalid/partial data, rate limits and mutations never do.
          if (
            !revalidate ||
            retries >= 2 ||
            error?.noRetry ||
            !/^Steam HTTP (500|502|503|504)$/.test(error?.message || "")
          )
            throw error;
          await this._delay(retries++ === 0 ? 1500 : 3000, run);
        } finally {
          if (run.epoch === this.epoch) {
            this.inventoryReadAt.delete(readKey);
            this.inventoryReadAt.set(readKey, Date.now());
            if (this.inventoryReadAt.size > 10000)
              this.inventoryReadAt.delete(
                this.inventoryReadAt.keys().next().value,
              );
          }
        }
      }
      const data = JSON.parse(String(response.body));
      check(
        (data.success === 1 || data.success === true) &&
          Number.isSafeInteger(data.total_inventory_count) &&
          data.total_inventory_count >= 0 &&
          data.total_inventory_count <= 1000000,
        localeText.message_7d3f038,
      );
      total ??= data.total_inventory_count;
      check(
        total === data.total_inventory_count &&
          Array.isArray(data.assets ?? (total === 0 ? [] : null)) &&
          Array.isArray(data.descriptions ?? (total === 0 ? [] : null)),
        localeText.message_eab90cf,
      );
      const descriptions = new Map();
      for (const d of data.descriptions || []) {
        check(d && Number(d.appid) === appid);
        const k = decimal(d.classid) + ":" + decimal(d.instanceid ?? "0");
        check(!descriptions.has(k));
        descriptions.set(k, d);
      }
      for (const a of data.assets || []) {
        check(
          a && Number(a.appid) === appid && decimal(a.contextid) === contextid,
        );
        const asset = {
            appid,
            contextid,
            assetid: decimal(a.assetid, true),
            amount: decimal(a.amount, true),
          },
          k = assetKey(asset);
        check(!seen.has(k), localeText.message_61dd7c7);
        seen.add(k);
        const d = descriptions.get(
          decimal(a.classid) + ":" + decimal(a.instanceid ?? "0"),
        );
        check(d && [0, 1].includes(d.tradable), localeText.message_e1d9dc5);
        if (d.tradable === 1) result.push(asset);
      }
      check(
        data.more_items === undefined ||
          [0, 1, false, true].includes(data.more_items),
      );
      this._recordEvent("inventory-page", {
        run,
        accountId: ctx.account.id,
        phase: "inventory",
        details: {
          appId: appid,
          page: page + 1,
          positions: (data.assets || []).length,
          totalPositions: total,
          tradablePositions: result.length,
          revalidate,
        },
      });
      this._notifyLog();
      if (!data.more_items) {
        check(seen.size === total, localeText.message_04e598c);
        return result;
      }
      check((data.assets || []).length > 0 && seen.size < total);
      cursor = decimal(data.last_assetid, true);
    }
    throw Error(localeText.message_127ef73);
  }
  async _warehouseToken(warehouse, run) {
    await this._externalWarehouseBan(run, warehouse.steamId);
    if (warehouse.tradeToken) return warehouse.tradeToken;
    const account = run.data.accounts.find(
      (a) => a.steamId === warehouse.steamId,
    );
    if (!account) return undefined; // Steam itself enforces the friend relationship.
    return this.accountWork(account.id, async (a) => {
      const ctx = await this._ready(a, run);
      const community = this._community(ctx, run, { kind: "privacy" });
      const response = community
        ? await community.page()
        : await this._request(
            ctx,
            run,
            `${ORIGIN}/profiles/${a.steamId}/tradeoffers/privacy?l=english`,
            { retrySafe: true },
          );
      const html = String(response.body).replaceAll("&amp;", "&");
      pageIdentity(html, "g_steamID", a.steamId);
      const urls = [
        ...html.matchAll(
          /https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[A-Za-z0-9_-]{1,128}/g,
        ),
      ].map(
        (m) => tradeAccess({ steamId: a.steamId, tradeUrl: m[0] }).tradeToken,
      );
      check(
        urls.length > 0 && new Set(urls).size === 1,
        localeText.message_55c3e36,
      );
      return urls[0];
    });
  }
  async _externalWarehouseBan(run, identity, routingAccount) {
    assertLootBan(run.data, identity, false);
    if (
      run.data.accounts.some((account) => account.steamId === identity) ||
      typeof this.steam.lookupBans !== "function"
    )
      return;
    run.warehouseBans ||= new Map();
    const cached = run.warehouseBans.get(identity);
    if (
      cached &&
      (cached.bans.community === true || this.now() - cached.readAt < 5 * 60000)
    ) {
      if (cached.bans.community === true) {
        const error = Error(localeText.message_a62a600);
        error.lootSafeMessage = error.message;
        throw error;
      }
      return;
    }
    const read = async (account) => {
      this._guard(run);
      const bans = normalizeAccountBans(
        await this.steam.lookupBans(account, identity),
      );
      this._guard(run);
      run.warehouseBans.set(identity, { bans, readAt: this.now() });
      if (bans.community === true) {
        const error = Error(localeText.message_a62a600);
        error.lootSafeMessage = error.message;
        throw error;
      }
    };
    if (routingAccount) await read(routingAccount);
    else {
      const sources = this._sources(run);
      const source =
        sources.find((account) => {
          try {
            return this.steam.transport?.routes?.(account)?.length;
          } catch {
            return false;
          }
        }) ||
        (typeof this.steam.transport?.routes !== "function"
          ? sources[0]
          : null);
      if (source) await this.accountWork(source.id, read);
    }
  }
  async _prepare(
    run,
    {
      sourceIds,
      excludeAssets = new Set(),
      skipReconcile = false,
      limit = run.settings.maxItemsPerRun,
      allocation,
      warehouseTokens,
      onSourcePhase = () => {},
    } = {},
  ) {
    check(run.settings.warehouses.length > 0, localeText.message_11fd7c0);
    this._checkCoverage(run);
    if (!skipReconcile) await this._reconcile(run);
    const tokens = warehouseTokens || new Map();
    if (!warehouseTokens)
      for (const w of run.settings.warehouses.filter(
        (w) => !lootCommunityBanned(run.data, w.steamId),
      ))
        tokens.set(w.steamId, await this._warehouseToken(w, run));
    const offers = [],
      skipped = [],
      reserved = new Set(
        run.data.loot.journal
          .filter((e) => HOLD_STATES.has(e.state))
          .flatMap((e) =>
            e.assets.map((a) => e.sourceSteamId + ":" + assetKey(a)),
          ),
      );
    const budget = allocation || {
      remaining: limit,
      rotation: run.data.loot.journal.length,
    };
    for (const source of this._sources(run)) {
      if (sourceIds && !sourceIds.has(source.id)) continue;
      if (!budget.remaining) break;
      try {
        await this.accountWork(source.id, async (account) => {
          onSourcePhase(source.id, "session");
          const ctx = await this._ready(account, run, (phase) =>
              onSourcePhase(source.id, phase),
            ),
            assets = [];
          onSourcePhase(source.id, "inventory");
          for (const appid of run.settings.appIds)
            assets.push(...(await this._inventory(ctx, run, appid)));
          this._recordEvent("inventory-read", {
            run,
            accountId: account.id,
            phase: "inventory",
            details: { positions: assets.length, units: unitCount(assets) },
          });
          // Limits count inventory positions. A stack is one position and its
          // exact complete decimal amount is never split by the collection cap.
          const chosen = assets
            .filter(
              (asset) =>
                !reserved.has(account.steamId + ":" + assetKey(asset)) &&
                !excludeAssets.has(account.steamId + ":" + assetKey(asset)),
            )
            .slice(0, budget.remaining);
          budget.remaining -= chosen.length;
          // Refresh after inventory awaits; reuse only within this synchronous batch.
          const eligibleIds = chosen.length
            ? this._coverage(run).eligibleWarehouses[account.id]
            : [];
          const warehouses = run.settings.warehouses.filter((w) =>
            eligibleIds?.includes(w.steamId),
          );
          for (const batch of planOfferAssets(chosen)) {
            const warehouse = warehouses[budget.rotation++ % warehouses.length];
            offers.push({
              accountId: account.id,
              sourceSteamId: account.steamId,
              partnerSteamId: warehouse.steamId,
              tradeToken: tokens.get(warehouse.steamId),
              assets: batch,
            });
          }
        });
      } catch (error) {
        this._guard(run);
        if (error?.lootFatal) throw error;
        this._recordEvent("source-skipped", {
          run,
          accountId: source.id,
          phase: "failed",
          level: "warning",
          details: eventErrorDetails(error),
        });
        skipped.push({
          accountId: source.id,
          reason: error?.lootSafeMessage || localeText.message_8ce6ecd,
          ...(error?.retryAt ? { retryAt: error.retryAt } : {}),
          ...(sourceRetryKind(error) ? { retryable: true } : {}),
        });
      }
    }
    this._guard(run);
    return {
      id: crypto.randomUUID(),
      createdAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + 5 * 60000).toISOString(),
      settings: run.settings,
      settingsHash: run.settingsHash,
      data: run.data,
      epoch: run.epoch,
      steamEpoch: run.steamEpoch,
      offers,
      skipped,
      warehouseBans: run.warehouseBans,
    };
  }
  async prepare() {
    check(!this.task && !this.preparing, localeText.message_0ffbec2);
    this.preparing = true;
    this.preview = null;
    try {
      this.preview = await this._prepare(this._run());
      return this._summary(this.preview);
    } finally {
      this.preparing = false;
    }
  }
  start({ previewId, scheduled = false } = {}) {
    check(!this.task && !this.preparing, localeText.message_0ffbec2);
    const run = this._run(scheduled);
    this._checkCoverage(run);
    if (scheduled) check(run.settings.enabled, localeText.message_484c16f);
    else if (previewId !== undefined)
      check(
        this.preview &&
          this.preview.id === previewId &&
          this.preview.data === run.data &&
          this.preview.epoch === run.epoch &&
          this.preview.steamEpoch === run.steamEpoch &&
          this.preview.settingsHash === run.settingsHash &&
          Date.parse(this.preview.expiresAt) > this.now(),
        localeText.message_3413383,
      );
    const preview = !scheduled && previewId !== undefined ? this.preview : null;
    const streaming = !preview;
    if (!scheduled && preview?.warehouseBans)
      run.warehouseBans = preview.warehouseBans;
    this.preview = null;
    const job = (this.job = {
      id: crypto.randomUUID(),
      state: "running",
      scheduled,
      streaming,
      totalsKnown: !streaming,
      attemptedSources: 0,
      totalSources: streaming
        ? this._sources(run).length
        : new Set(preview.offers.map((offer) => offer.accountId)).size,
      startedAt: new Date(this.now()).toISOString(),
      completedOffers: 0,
      completedItems: 0,
      completedUnits: "0",
      totalOffers: preview?.offers.length ?? 0,
      totalItems: preview ? this._summary(preview).itemCount : 0,
      totalUnits: preview ? this._summary(preview).unitCount : "0",
      phase: streaming ? "preparing" : "sending",
      accounts: [],
      retryAttempt: 0,
      maxRetryAttempts: run.settings.maxRetryAttempts,
      retryPendingSources: 0,
      events: [],
      eventSequence: 0,
      eventsTruncated: 0,
      progressSummary: {
        totalSources: 0,
        attemptedSources: 0,
        activeSources: 0,
        completedSources: 0,
        failedSources: 0,
        skippedSources: 0,
        retryingSources: 0,
        pendingSources: 0,
        completedOffers: 0,
        completedItems: 0,
      },
    });
    this.jobData = run.data;
    let terminalErrorDetails = {};
    this.jobRun = run;
    this.jobProgressTracked = new WeakSet();
    this._recordEvent("job-start", {
      run,
      phase: job.phase,
      details: { sourceCount: job.totalSources },
    });
    this._event();
    // Promise defers all I/O until after the IPC response can be delivered.
    this.task = Promise.resolve()
      .then(async () => {
        this._record(run.data).lastRunAt = new Date(this.now()).toISOString();
        await this.onChange(run.data);
        this._guard(run);
        const plan = streaming
          ? { offers: [], skipped: [], settings: run.settings }
          : preview;
        job.totalOffers = plan.offers.length;
        job.totalItems = this._summary(plan).itemCount;
        job.totalUnits = this._summary(plan).unitCount;
        job.skipped = structuredClone(plan.skipped || []);
        job.phase = "sending";
        const failedAccounts = new Set();
        const attemptedSources = new Set();
        const retryAttempts = new Map(),
          retryPending = new Map(),
          unknownRequests = new Map(),
          sentAssets = new Set();
        const originalRequests = new Set(
          run.data.loot.journal.map((e) => e.requestId),
        );
        const progressFor = (id) => {
          let progress = job.accounts.find((a) => a.accountId === id);
          if (!progress) {
            progress = {
              accountId: id,
              state: "failed",
              completedOffers: 0,
              completedItems: 0,
              completedUnits: "0",
              retryAttempt: 0,
            };
            job.accounts.push(progress);
            this._trackProgress(progress);
          }
          return progress;
        };
        const enqueue = (id, kind, retryAt) => {
          if (
            !run.settings.maxRetryAttempts ||
            (retryAttempts.get(id) || 0) >= run.settings.maxRetryAttempts
          )
            return;
          const readyAt = Math.max(
            this.now() + run.settings.retryDelaySeconds * 1000,
            kind === "unknown" ? this.now() + 60000 : 0,
            Number.isFinite(Date.parse(retryAt)) ? Date.parse(retryAt) : 0,
          );
          retryPending.set(id, { kind, readyAt });
          job.totalsKnown = false;
          const progress = progressFor(id);
          progress.state = "retry-wait";
          progress.phase = "retry-wait";
          progress.retryAt = new Date(readyAt).toISOString();
          this._recordEvent("retry-queued", {
            run,
            accountId: id,
            phase: "retry-wait",
            level: "warning",
            details: {
              delayMs: Math.max(0, readyAt - this.now()),
              retryAttempt: retryAttempts.get(id) || 0,
              reason: kind === "unknown" ? "unknown-send" : "temporary",
            },
          });
        };
        const recordSkips = (plan) => {
          for (const skip of plan.skipped || []) {
            failedAccounts.add(skip.accountId);
            const progress = progressFor(skip.accountId);
            progress.state = "failed";
            progress.phase = "failed";
            progress.reason = skip.reason;
            progress.retryAt = skip.retryAt;
            if (!streaming)
              this._recordEvent("source-skipped", {
                run,
                accountId: skip.accountId,
                phase: "failed",
                level: "warning",
                details: { reason: eventReason({ message: skip.reason }) },
              });
            if (skip.retryable)
              enqueue(skip.accountId, "temporary", skip.retryAt);
          }
        };
        const warehouseTokens = new Map();
        if (streaming) {
          await this._reconcile(run);
          for (const warehouse of run.settings.warehouses.filter(
            (w) => !lootCommunityBanned(run.data, w.steamId),
          ))
            warehouseTokens.set(
              warehouse.steamId,
              await this._warehouseToken(warehouse, run),
            );
        }
        const sendPlan = async (
          plan,
          sourceIds,
          limit = run.settings.maxItemsPerRun,
        ) => {
          recordSkips(plan);
          const groups = [...new Set(plan.offers.map((o) => o.accountId))].map(
            (id) => plan.offers.filter((o) => o.accountId === id),
          );
          const sources = sourceIds
            ? this._sources(run).filter((source) => sourceIds.has(source.id))
            : null;
          const allocation = {
            remaining: limit,
            rotation: run.data.loot.journal.length,
          };
          let next = 0,
            fatal = null;
          const claim = () => {
            this._guard(run);
            if (fatal) return null;
            if (sources)
              return !allocation.remaining || next >= sources.length
                ? null
                : sources[next++];
            return next >= groups.length ? null : groups[next++];
          };
          const worker = async () => {
            try {
              for (;;) {
                const claimed = await claim();
                if (!claimed) return;
                let offers = claimed;
                if (sources) {
                  attemptedSources.add(claimed.id);
                  job.attemptedSources = attemptedSources.size;
                  progressFor(claimed.id).state = "preparing";
                  progressFor(claimed.id).phase = "preparing";
                  this._recordEvent("source-start", {
                    run,
                    accountId: claimed.id,
                    phase: "preparing",
                  });
                  this._event();
                  const sourcePlan = await this._prepare(run, {
                    sourceIds: new Set([claimed.id]),
                    excludeAssets: sentAssets,
                    skipReconcile: true,
                    allocation,
                    warehouseTokens,
                    onSourcePhase: (id, phase) => {
                      const progress = progressFor(id);
                      if (progress.phase !== phase) {
                        progress.phase = phase;
                        this._recordEvent(
                          phase === "inventory"
                            ? "inventory-start"
                            : "phase-change",
                          { run, accountId: id, phase },
                        );
                        this._event();
                      }
                    },
                  });
                  this._guard(run);
                  if (fatal) return;
                  recordSkips(sourcePlan);
                  job.skipped.push(...structuredClone(sourcePlan.skipped));
                  job.totalOffers += sourcePlan.offers.length;
                  const summary = this._summary(sourcePlan);
                  job.totalItems += summary.itemCount;
                  job.totalUnits = (
                    BigInt(job.totalUnits) + BigInt(summary.unitCount)
                  ).toString();
                  offers = sourcePlan.offers;
                  if (!offers.length && !sourcePlan.skipped.length) {
                    progressFor(claimed.id).state = "skipped";
                    progressFor(claimed.id).phase = "skipped";
                    progressFor(claimed.id).reason = localeText.message_9251763;
                    this._recordEvent("source-skipped", {
                      run,
                      accountId: claimed.id,
                      phase: "skipped",
                      details: { reason: "empty" },
                    });
                  }
                  job.phase = "sending";
                  this._event();
                }
                for (const offer of offers) {
                  this._guard(run);
                  if (failedAccounts.has(offer.accountId)) continue;
                  attemptedSources.add(offer.accountId);
                  job.attemptedSources = attemptedSources.size;
                  job.currentAccountId = offer.accountId;
                  job.currentPartnerSteamId = offer.partnerSteamId;
                  let progress = job.accounts.find(
                    (a) => a.accountId === offer.accountId,
                  );
                  if (!progress) {
                    progress = {
                      accountId: offer.accountId,
                      state: "sending",
                      completedOffers: 0,
                      completedItems: 0,
                      completedUnits: "0",
                    };
                    job.accounts.push(progress);
                    this._trackProgress(progress);
                  }
                  progress.state = "sending";
                  progress.phase = "sending";
                  this._event();
                  const journalBefore = run.data.loot.journal.length;
                  try {
                    this._recordEvent("send-preflight", {
                      run,
                      accountId: offer.accountId,
                      phase: "sending",
                      details: {
                        positions: offer.assets.length,
                        units: unitCount(offer.assets),
                      },
                    });
                    const prepared = await this.accountWork(
                      offer.accountId,
                      (account) =>
                        this._dispatch(account, offer, run, {
                          preflightOnly: true,
                        }),
                    );
                    await this._withSendPermit(
                      run,
                      (refresh) =>
                        this.accountWork(offer.accountId, (account) => {
                          if (fatal) throw fatal;
                          return this._dispatch(account, offer, run, {
                            sendPermit: true,
                            prepared: refresh ? null : prepared,
                          });
                        }),
                      () => {
                        if (fatal) throw fatal;
                      },
                      (error) => {
                        if (
                          !error?.lootUncertainSend &&
                          run.data.loot.journal
                            .slice(journalBefore)
                            .some(
                              (e) =>
                                HOLD_STATES.has(e.state) &&
                                (e.schemeId ?? "legacy") === this.schemeId &&
                                e.accountId === offer.accountId &&
                                e.sourceSteamId === offer.sourceSteamId,
                            )
                        )
                          fatal ||= error;
                      },
                    );
                  } catch (error) {
                    this._guard(run);
                    this._recordEvent("send-error", {
                      run,
                      accountId: offer.accountId,
                      phase: "failed",
                      level: "error",
                      details: eventErrorDetails(error),
                    });
                    if (error?.lootFatal) throw error;
                    progress.state = error?.lootSkipSource
                      ? "skipped"
                      : "failed";
                    progress.phase = progress.state;
                    progress.reason =
                      error?.lootSafeMessage || localeText.message_cd0ff01;
                    if (error?.retryAt) {
                      progress.retryAt = error.retryAt;
                      if (
                        !job.retryAt ||
                        Date.parse(error.retryAt) > Date.parse(job.retryAt)
                      ) {
                        job.retryAt = error.retryAt;
                        job.message = progress.reason;
                      }
                    }
                    failedAccounts.add(offer.accountId);
                    const retryKind = sourceRetryKind(error);
                    if (retryKind) {
                      if (retryKind === "unknown")
                        unknownRequests.set(
                          offer.accountId,
                          run.data.loot.journal
                            .filter(
                              (e) =>
                                !originalRequests.has(e.requestId) &&
                                (e.schemeId ?? "legacy") === this.schemeId &&
                                e.accountId === offer.accountId &&
                                e.state === "unknown",
                            )
                            .map((e) => e.requestId),
                        );
                      enqueue(offer.accountId, retryKind, error.retryAt);
                    }
                    if (
                      !error?.lootUncertainSend &&
                      run.data.loot.journal
                        .slice(journalBefore)
                        .some(
                          (e) =>
                            HOLD_STATES.has(e.state) &&
                            (e.schemeId ?? "legacy") === this.schemeId &&
                            e.accountId === offer.accountId &&
                            e.sourceSteamId === offer.sourceSteamId,
                        )
                    )
                      throw error;
                    this._event();
                    continue;
                  }
                  job.completedOffers++;
                  for (const asset of offer.assets)
                    sentAssets.add(offer.sourceSteamId + ":" + assetKey(asset));
                  const itemCount = offer.assets.length;
                  job.completedItems += itemCount;
                  job.completedUnits = (
                    BigInt(job.completedUnits) + BigInt(unitCount(offer.assets))
                  ).toString();
                  progress.completedOffers++;
                  progress.completedItems += itemCount;
                  progress.completedUnits = (
                    BigInt(progress.completedUnits) +
                    BigInt(unitCount(offer.assets))
                  ).toString();
                  progress.state = "completed";
                  progress.phase = "completed";
                  const sentEntry = run.data.loot.journal.findLast(
                    (e) =>
                      e.schemeId === this.schemeId &&
                      e.accountId === offer.accountId,
                  );
                  this._recordEvent("offer-sent", {
                    run,
                    accountId: offer.accountId,
                    phase: "completed",
                    details: {
                      positions: itemCount,
                      units: unitCount(offer.assets),
                      offers: progress.completedOffers,
                      appId: offer.assets[0]?.appid,
                      offerId: sentEntry?.offerId,
                    },
                  });
                  delete progress.reason;
                  delete progress.retryAt;
                  this._event();
                }
                const completedId = sources ? claimed.id : offers[0]?.accountId;
                if (
                  completedId &&
                  offers.length &&
                  !failedAccounts.has(completedId)
                ) {
                  const progress = progressFor(completedId);
                  this._recordEvent("source-completed", {
                    run,
                    accountId: completedId,
                    phase: "completed",
                    details: {
                      positions: progress.completedItems,
                      offers: progress.completedOffers,
                      units: progress.completedUnits,
                    },
                  });
                  this._event();
                }
              }
            } catch (error) {
              fatal ||= error;
            }
          };
          await Promise.all(
            Array.from(
              {
                length: Math.min(
                  run.settings.concurrency,
                  sources ? sources.length : groups.length,
                ),
              },
              worker,
            ),
          );
          if (fatal) throw fatal;
        };
        await sendPlan(
          plan,
          streaming
            ? new Set(this._sources(run).map((source) => source.id))
            : null,
        );
        while (retryPending.size) {
          this._guard(run);
          job.retryPendingSources = retryPending.size;
          const earliest = Math.min(
            ...[...retryPending.values()].map((p) => p.readyAt),
          );
          job.nextRetryAt = new Date(earliest).toISOString();
          if (earliest > this.now()) {
            job.phase = "retry-wait";
            this._event();
            await this._delay(Math.min(60000, earliest - this.now()), run);
            continue;
          }
          const due = [...retryPending].filter(
            ([, p]) => p.readyAt <= this.now(),
          );
          const readyIds = new Set();
          for (const [id, pending] of due) {
            retryPending.delete(id);
            const attempt = (retryAttempts.get(id) || 0) + 1;
            retryAttempts.set(id, attempt);
            const progress = progressFor(id);
            progress.retryAttempt = attempt;
            this._recordEvent("retry-due", {
              run,
              accountId: id,
              phase: "retry-preparing",
              details: { retryAttempt: attempt },
            });
            job.retryAttempt = Math.max(job.retryAttempt, attempt);
            if (pending.kind === "unknown") {
              await this._reconcile(run, { force: true });
              const requests = (unknownRequests.get(id) || []).map(
                (requestId) =>
                  run.data.loot.journal.find((e) => e.requestId === requestId),
              );
              if (
                !requests.length ||
                requests.some((e) => !e || e.state !== "not-found")
              ) {
                progress.state = "failed";
                progress.phase = "failed";
                if (
                  requests.length &&
                  requests.every(
                    (e) =>
                      e &&
                      [
                        "sent",
                        "mobile-confirmation",
                        "email-confirmation",
                        "accepted",
                        "accepted-awaiting-proof",
                        "escrow",
                        "delivered",
                      ].includes(e.state),
                  )
                ) {
                  progress.state = requests.every(
                    (e) => e.state === "delivered",
                  )
                    ? "completed"
                    : "pending";
                  progress.phase = progress.state;
                  progress.reason = localeText.message_1da6628;
                  failedAccounts.delete(id);
                  for (const entry of requests)
                    for (const asset of entry.assets)
                      sentAssets.add(
                        entry.sourceSteamId + ":" + assetKey(asset),
                      );
                }
                if (
                  requests.some(
                    (e) => e && ["unknown", "dispatching"].includes(e.state),
                  )
                )
                  enqueue(id, "unknown", progress.retryAt);
                continue;
              }
            }
            readyIds.add(id);
            failedAccounts.delete(id);
            progress.state = "sending";
            progress.phase = "sending";
          }
          job.retryPendingSources = retryPending.size;
          if (!readyIds.size) continue;
          const occupied = new Set(sentAssets);
          for (const entry of run.data.loot.journal)
            if (
              !originalRequests.has(entry.requestId) &&
              (entry.schemeId ?? "legacy") === this.schemeId &&
              HOLD_STATES.has(entry.state)
            )
              for (const asset of entry.assets)
                occupied.add(entry.sourceSteamId + ":" + assetKey(asset));
          const remaining = Math.max(
            0,
            run.settings.maxItemsPerRun - occupied.size,
          );
          if (!remaining) {
            for (const id of readyIds) {
              failedAccounts.add(id);
              progressFor(id).state = "failed";
              progressFor(id).phase = "failed";
            }
            continue;
          }
          job.phase = "retry-preparing";
          this._event();
          if (streaming) {
            await sendPlan({ offers: [], skipped: [] }, readyIds, remaining);
            continue;
          }
          const retryPlan = await this._prepare(run, {
            sourceIds: readyIds,
            excludeAssets: sentAssets,
            skipReconcile: true,
            limit: remaining,
          });
          job.totalOffers += retryPlan.offers.length;
          job.totalItems += this._summary(retryPlan).itemCount;
          job.totalUnits = (
            BigInt(job.totalUnits) + BigInt(this._summary(retryPlan).unitCount)
          ).toString();
          for (const id of readyIds)
            if (
              !retryPlan.offers.some((o) => o.accountId === id) &&
              !retryPlan.skipped.some((s) => s.accountId === id)
            ) {
              progressFor(id).state = "skipped";
              progressFor(id).phase = "skipped";
              progressFor(id).reason = localeText.message_9251763;
            }
          job.phase = "sending";
          await sendPlan(retryPlan);
        }
        this._guard(run);
        job.retryPendingSources = 0;
        delete job.nextRetryAt;
        job.failedAccounts = failedAccounts.size;
        if (!job.failedAccounts) {
          delete job.message;
          delete job.retryAt;
        }
        job.state =
          job.failedAccounts && !job.completedOffers ? "failed" : "completed";
        job.totalsKnown = true;
        job.phase = "completed";
      })
      .catch((error) => {
        terminalErrorDetails = eventErrorDetails(error);
        job.state = this.epoch !== run.epoch ? "cancelled" : "failed";
        job.message = error?.lootSafeMessage || localeText.message_04bcf13;
        if (error?.retryAt) job.retryAt = error.retryAt;
      })
      .finally(() => {
        job.finishedAt = new Date(this.now()).toISOString();
        if (job.state === "cancelled" || job.state === "failed") {
          job.phase = job.state;
          for (const progress of job.accounts)
            if (
              ["preparing", "sending", "retry-wait"].includes(progress.state)
            ) {
              progress.state = job.state;
              progress.phase = job.state;
            }
        }
        this._recordEvent(
          job.state === "cancelled"
            ? "job-cancelled"
            : job.state === "failed"
              ? "job-failed"
              : "job-completed",
          {
            run,
            phase: job.state,
            level: job.state === "failed" ? "error" : "info",
            details: {
              ...terminalErrorDetails,
              positions: job.completedItems,
              offers: job.completedOffers,
              units: job.completedUnits,
            },
          },
        );
        this.task = null;
        this._event();
      });
    return this.status();
  }
  _trackProgress(progress) {
    if (this.jobProgressTracked.has(progress)) return;
    this.jobProgressTracked.add(progress);
    const summary = this.job.progressSummary;
    const buckets = {
      preparing: "activeSources",
      sending: "activeSources",
      completed: "completedSources",
      failed: "failedSources",
      skipped: "skippedSources",
      "retry-wait": "retryingSources",
      pending: "heldSources",
    };
    let state = progress.state;
    const adjust = (value, delta) => {
      const key = buckets[value];
      if (key) summary[key] = (summary[key] || 0) + delta;
    };
    adjust(state, 1);
    Object.defineProperty(progress, "state", {
      enumerable: true,
      configurable: true,
      get: () => state,
      set: (value) => {
        if (state === value) return;
        adjust(state, -1);
        state = value;
        adjust(state, 1);
      },
    });
  }
  _recordEvent(
    code,
    { run = this.jobRun, accountId, phase, level = "info", details = {} } = {},
  ) {
    // Fixed templates and allowlisted structured values only: never forward a
    // transport URL, credential, token, arbitrary message or raw error.
    try {
      const receiptEvent = ["offer-accepted", "offer-delivered"].includes(code);
      const sameReceiptRun =
        receiptEvent &&
        run &&
        this.jobRun &&
        run.data === this.jobRun.data &&
        run.epoch === this.jobRun.epoch &&
        run.steamEpoch === this.jobRun.steamEpoch &&
        run.settingsHash === this.jobRun.settingsHash;
      if (
        !Object.hasOwn(EVENT_MESSAGES, code) ||
        !this.job ||
        (run !== this.jobRun && !sameReceiptRun) ||
        this.getData() !== this.jobData
      )
        return false;
      const safe = {};
      for (const key of [
        "routeAttempt",
        "routeCount",
        "positions",
        "totalPositions",
        "tradablePositions",
        "page",
        "appId",
        "offers",
        "retryAttempt",
        "delayMs",
        "sourceCount",
        "httpStatus",
        "steamResult",
      ])
        if (Number.isSafeInteger(details[key]) && details[key] >= 0)
          safe[key] = details[key];
      for (const key of ["backup", "revalidate"])
        if (typeof details[key] === "boolean") safe[key] = details[key];
      if (
        typeof details.units === "string" &&
        /^\d{1,120}$/.test(details.units)
      )
        safe.units = details.units;
      if (
        typeof details.offerId === "string" &&
        /^[1-9]\d{0,31}$/.test(details.offerId)
      )
        safe.offerId = details.offerId;
      if (EVENT_REASONS.has(details.reason)) safe.reason = details.reason;
      const job = this.job;
      job.events.push({
        seq: ++job.eventSequence,
        at: new Date(this.now()).toISOString(),
        ...(typeof accountId === "string" ? { accountId } : {}),
        phase: EVENT_PHASES.has(phase) ? phase : "preparing",
        level: ["info", "warning", "error"].includes(level) ? level : "info",
        code,
        message: EVENT_MESSAGES[code],
        details: safe,
      });
      if (job.events.length > MAX_JOB_EVENTS)
        job.eventsTruncated += job.events.splice(
          0,
          job.events.length - MAX_JOB_EVENTS,
        ).length;
      return true;
    } catch {
      return false;
    }
  }
  _notifyLog() {
    try {
      if (!this.job || this.getData() !== this.jobData) return;
      this.onEvent({
        type: "loot-status",
        job: {
          id: this.job.id,
          eventSequence: this.job.eventSequence,
          eventsTruncated: this.job.eventsTruncated,
          progressSummary: { ...this.job.progressSummary },
        },
      });
    } catch {}
  }
  _event() {
    try {
      if (!this.job || this.getData() !== this.jobData) return;
      const summary = this.job.progressSummary;
      if (summary)
        Object.assign(summary, {
          totalSources: this.job.totalSources,
          attemptedSources: this.job.attemptedSources,
          pendingSources:
            Math.max(0, this.job.totalSources - this.job.attemptedSources) +
            (summary.heldSources || 0),
          completedOffers: this.job.completedOffers,
          completedItems: this.job.completedItems,
        });
      // Notifications invalidate the UI's status snapshot. Keep counters and
      // existing job fields, but do not clone the bounded log on every phase.
      const { events, ...notificationJob } = this.job;
      this.onEvent({
        type: "loot-status",
        job: structuredClone(notificationJob),
      });
    } catch {}
  }
  async _delay(ms, run) {
    if (!ms) return;
    await new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        this.pendingDelays.delete(cancel);
        reject(Error(localeText.message_e3897fe));
      };
      const timer = setTimeout(() => {
        this.pendingDelays.delete(cancel);
        try {
          this._guard(run);
          resolve();
        } catch (e) {
          reject(e);
        }
      }, ms);
      timer.unref?.();
      this.pendingDelays.add(cancel);
    });
    this._guard(run);
  }
  cancel() {
    if (this.job?.state === "running") {
      this._recordEvent("cancel-requested", {
        phase: "cancelled",
        level: "warning",
      });
      this._event();
    }
    this.epoch++;
    this.preview = null;
    for (const cancel of this.pendingDelays) cancel();
    if (this.job?.state === "running") this.job.state = "cancelling";
    return { cancelled: true };
  }
  cancelAll() {
    const result = this.cancel();
    this.job = null;
    this.jobData = null;
    this.inventoryReadAt.clear();
    return result;
  }
  maybeRun() {
    const data = this._data();
    // Recovery runs even with scheduling disabled. No financial POST is issued
    // here and no busy/worker slot is held between checks.
    if (!this.task && !this.preparing && !this.recoveryTask) {
      const due = data.loot.journal.some(
        (e) =>
          (e.schemeId ?? "legacy") === this.schemeId &&
          (HOLD_STATES.has(e.state) ||
            (e.state === "delivered" &&
              Date.parse(e.monitorUntil) > this.now())) &&
          (!e.nextCheckAt || Date.parse(e.nextCheckAt) <= this.now()),
      );
      if (due) {
        const recoveryRun = this._run();
        this.preparing = true;
        this.recoveryTask = Promise.resolve()
          .then(() => this._reconcile(recoveryRun))
          .catch(() => {})
          .finally(() => {
            this.recoveryTask = null;
            this.preparing = false;
            this._event();
          });
      }
    }
    if (
      !this.task &&
      !this.preparing &&
      this._record(data).settings.enabled &&
      (!this._record(data).lastRunAt ||
        this.now() - Date.parse(this._record(data).lastRunAt) >=
          this._record(data).settings.intervalHours * 3600000)
    )
      return this.start({ scheduled: true });
    return this.status();
  }
  async wait() {
    await this.task;
    await this.recoveryTask;
    return this.status();
  }
  async reconcile() {
    check(!this.task && !this.preparing, localeText.message_0ffbec2);
    this.preparing = true;
    try {
      await this._reconcile(this._run(), { force: true });
    } finally {
      this.preparing = false;
    }
    return this.status();
  }
  async _api(ctx, run, method, params) {
    const query = new URLSearchParams({ access_token: ctx.token, ...params });
    const response = await this._request(
      ctx,
      run,
      `https://api.steampowered.com/IEconService/${method}/v1/?${query}`,
      { retrySafe: true },
    );
    check(response.statusCode === 200);
    const body = JSON.parse(String(response.body));
    check(body?.response && typeof body.response === "object");
    return body.response;
  }
  async _recoverOffer(ctx, run, entry) {
    const rows = [],
      seen = new Set(),
      cursors = new Set();
    let cursor = "0",
      complete = false;
    // A bounded discovery is allowed to remain incomplete, never to authorize
    // a resend. History and active offers are requested together.
    for (let page = 0; page < 20; page++) {
      check(!cursors.has(cursor));
      cursors.add(cursor);
      const data = await this._api(ctx, run, "GetTradeOffers", {
        get_sent_offers: "1",
        get_received_offers: "0",
        active_only: "0",
        historical_only: "0",
        get_descriptions: "0",
        cursor,
        time_historical_cutoff: String(
          Math.max(0, Math.floor(Date.parse(entry.createdAt) / 1000) - 300),
        ),
      });
      check(
        Array.isArray(data.trade_offers_sent) ||
          (data.trade_offers_sent === undefined &&
            String(data.next_cursor) === "0"),
      );
      for (const offer of data.trade_offers_sent || []) {
        check(
          typeof offer?.tradeofferid === "string" &&
            !seen.has(offer.tradeofferid),
        );
        seen.add(offer.tradeofferid);
        rows.push(offer);
        check(rows.length <= 10000);
      }
      if (data.next_cursor === undefined || String(data.next_cursor) === "0") {
        complete = true;
        break;
      }
      cursor = decimal(data.next_cursor, true);
    }
    return {
      ...findRecoveryCandidates(entry, rows, { complete }),
      offers: rows,
    };
  }
  async _saveEvidence(run, entry, patch) {
    this._guard(run);
    check(run.data.loot.journal.includes(entry));
    const prior = structuredClone(entry);
    Object.assign(entry, patch);
    try {
      validateLootJournal(run.data.loot.journal);
      await this.onChange(run.data);
    } catch (error) {
      // Failed persistence must not release a reservation in the live process.
      for (const key of Object.keys(entry)) delete entry[key];
      Object.assign(entry, prior);
      throw error;
    }
    this._guard(run);
    if (
      prior.state !== entry.state &&
      ["accepted", "accepted-awaiting-proof", "delivered"].includes(entry.state)
    ) {
      this._recordEvent(
        entry.state === "delivered" ? "offer-delivered" : "offer-accepted",
        {
          run,
          accountId: entry.accountId,
          phase: "completed",
          details: {
            positions: entry.assets.length,
            units: unitCount(entry.assets),
            offerId: entry.offerId,
          },
        },
      );
      this._event();
    }
  }
  async _reconcile(run, { force = false } = {}) {
    const candidates = run.data.loot.journal
      .filter((e) => (e.schemeId ?? "legacy") === this.schemeId)
      .filter(
        (e) =>
          HOLD_STATES.has(e.state) ||
          (e.state === "delivered" && Date.parse(e.monitorUntil) > this.now()),
      )
      .filter(
        (e) =>
          force || !e.nextCheckAt || Date.parse(e.nextCheckAt) <= this.now(),
      )
      .sort(
        (a, b) =>
          Date.parse(a.checkedAt || a.createdAt) -
          Date.parse(b.checkedAt || b.createdAt),
      )
      .slice(0, 200);
    for (const entry of candidates) {
      this._guard(run);
      try {
        await this.accountWork(entry.accountId, async (account) => {
          check(account?.steamId === entry.sourceSteamId);
          const ctx = await this._ready(account, run);
          if (!entry.offerId) {
            const found = await this._recoverOffer(ctx, run, entry);
            this._current(ctx, run);
            if (found.state !== "recovered") {
              let state = found.state === "review" ? "review" : entry.state;
              if (
                found.complete &&
                found.candidateIds.length === 0 &&
                ["unknown", "dispatching"].includes(entry.state) &&
                this.now() - Date.parse(entry.attemptedAt || entry.createdAt) >=
                  60000
              ) {
                const inventory = [];
                for (const appid of new Set(entry.assets.map((a) => a.appid)))
                  inventory.push(...(await this._inventory(ctx, run, appid)));
                this._current(ctx, run);
                const inventoryReadAt = this.now();
                if (
                  canResolveMissingOffer(entry, {
                    offers: found.offers,
                    complete: found.complete,
                    inventory,
                    inventoryReadAt,
                    now: this.now(),
                  })
                )
                  state = "not-found";
              }
              await this._saveEvidence(run, entry, {
                state,
                checkedAt: new Date(this.now()).toISOString(),
                nextCheckAt: new Date(this.now() + 60000).toISOString(),
              });
              return;
            }
            await this._saveEvidence(run, entry, { offerId: found.offerId });
          }
          const { offer } = await this._api(ctx, run, "GetTradeOffer", {
            tradeofferid: entry.offerId,
            get_descriptions: "0",
          });
          let proof = classifyOffer(entry, offer);
          if (proof.state === "review") proof = boundOfferHeader(entry, offer);
          check(proof.state !== "review");
          const patch = {
            state: proof.state,
            checkedAt: new Date(this.now()).toISOString(),
            nextCheckAt: new Date(this.now() + 30000).toISOString(),
          };
          if (["accepted", "escrow"].includes(proof.state)) {
            if (proof.state === "accepted")
              patch.state = "accepted-awaiting-proof";
            if (proof.tradeId) {
              patch.tradeId = proof.tradeId;
              const status = await this._api(ctx, run, "GetTradeStatus", {
                tradeid: proof.tradeId,
                get_descriptions: "0",
                get_details_if_failed: "1",
              });
              check(Array.isArray(status.trades) && status.trades.length === 1);
              const exchange = classifyExchange(entry, status.trades[0], {
                tradeId: proof.tradeId,
              });
              check(exchange.state !== "review");
              patch.exchangeStatus = exchange.exchangeStatus;
              patch.state =
                exchange.state === "rollback"
                  ? "rollback-review"
                  : exchange.state === "accepted"
                    ? "accepted-awaiting-proof"
                    : exchange.state;
              if (exchange.delivered) {
                patch.delivery = exchange.delivery;
                patch.deliveredAt =
                  entry.deliveredAt || new Date(this.now()).toISOString();
                // Protected delivery can later be reversed. Re-read the bound
                // exchange periodically, without keeping a worker or browser busy.
                if (entry.assets.some((a) => isTradeProtectedApp(a.appid))) {
                  patch.monitorUntil =
                    entry.monitorUntil ||
                    new Date(this.now() + 8 * 86400000).toISOString();
                  patch.nextCheckAt = new Date(
                    this.now() + 3600000,
                  ).toISOString();
                }
              }
            }
          }
          this._current(ctx, run);
          // An old/stale offer response cannot erase proven delivery. Only the
          // exact exchange can establish a later rollback.
          if (
            entry.state === "delivered" &&
            !["delivered", "rollback-review"].includes(patch.state)
          )
            return;
          await this._saveEvidence(run, entry, patch);
          this._current(ctx, run);
        });
      } catch (error) {
        this._guard(run);
        await this._saveEvidence(run, entry, {
          nextCheckAt:
            error?.retryAt || new Date(this.now() + 60000).toISOString(),
        });
      }
    }
  }
  async _withSendPermit(
    run,
    action,
    assertAllowed = () => {},
    onFailure = () => {},
  ) {
    const previous = this.sendTail;
    let release;
    const tail = new Promise((resolve) => {
      release = resolve;
    });
    this.sendTail = tail;
    try {
      if (previous) await previous;
      this._guard(run);
      assertAllowed();
      let waited = false;
      if (this.lastSendAt !== null) {
        const wait = Math.max(
          0,
          this.lastSendAt + run.settings.delaySeconds * 1000 - this.now(),
        );
        if (wait) {
          waited = true;
          await this._delay(wait, run);
        }
      }
      this._guard(run);
      assertAllowed();
      return await action(Boolean(previous) || waited);
    } catch (error) {
      onFailure(error);
      throw error;
    } finally {
      release();
      if (this.sendTail === tail) this.sendTail = null;
    }
  }
  async _dispatchProof(account, offer, run) {
    check(
      offer.assets.length > 0 && planOfferAssets(offer.assets).length === 1,
      localeText.message_ab1157c,
    );
    this._allowed(run, offer.accountId, offer.partnerSteamId);
    await this._externalWarehouseBan(run, offer.partnerSteamId, account);
    check(
      account?.steamId === offer.sourceSteamId &&
        account.steamId !== offer.partnerSteamId,
    );
    const ctx = await this._ready(account, run),
      current = new Map();
    for (const appid of new Set(offer.assets.map((a) => a.appid)))
      for (const a of await this._inventory(ctx, run, appid, {
        revalidate: true,
      }))
        current.set(assetKey(a), a);
    for (const a of offer.assets) {
      check(
        current.get(assetKey(a))?.amount === a.amount,
        localeText.message_525ed7c,
      );
      check(
        !run.data.loot.journal.some(
          (e) =>
            HOLD_STATES.has(e.state) &&
            e.sourceSteamId === account.steamId &&
            e.assets.some((b) => assetKey(a) === assetKey(b)),
        ),
        localeText.message_20a35bd,
      );
    }
    const partner = (BigInt(offer.partnerSteamId) - BASE).toString(),
      referer =
        `${ORIGIN}/tradeoffer/new/?partner=${partner}` +
        (offer.tradeToken ? `&token=${offer.tradeToken}` : "");
    const community = this._community(ctx, run, {
      kind: "newtrade",
      partnerSteamId: offer.partnerSteamId,
      tradeToken: offer.tradeToken,
    });
    const page = community
      ? await community.page()
      : await this._request(ctx, run, referer, { retrySafe: true });
    const html = String(page.body);
    pageIdentity(html, "g_steamID", account.steamId);
    pageIdentity(html, "g_ulTradePartnerSteamID", offer.partnerSteamId);
    const permissions = tradePagePermissions(
      html,
      offer.assets.map((asset) => asset.appid),
    );
    if (!permissions.ok) {
      const message =
        permissions.reason === "source"
          ? `${localeText.templateText_d5f1125}${permissions.appid}.`
          : permissions.reason === "partner"
            ? `${localeText.templateText_8a4db1c}${permissions.appid}.`
            : localeText.message_5137be9;
      throw Object.assign(new Error(message), {
        lootSafeMessage: message,
        lootSkipSource: true,
      });
    }
    return { ctx, community, referer, provedAt: this.now() };
  }
  async _dispatch(
    account,
    offer,
    run,
    { preflightOnly = false, sendPermit = false, prepared = null } = {},
  ) {
    const proof =
      prepared && this.now() - prepared.provedAt < 1000
        ? prepared
        : await this._dispatchProof(account, offer, run);
    const { ctx, community, referer } = proof;
    this._current(ctx, run);
    this._allowed(run, offer.accountId, offer.partnerSteamId);
    if (preflightOnly) return proof;
    if (!sendPermit)
      return this._withSendPermit(run, (refresh) =>
        this._dispatch(account, offer, run, {
          sendPermit: true,
          prepared: refresh ? null : proof,
        }),
      );
    check(
      run.data.loot.journal.length < MAX_JOURNAL,
      localeText.message_75d1df1,
    );
    const intent = {
      schemeId: this.schemeId,
      requestId: crypto.randomUUID(),
      accountId: account.id,
      sourceSteamId: account.steamId,
      partnerSteamId: offer.partnerSteamId,
      state: "dispatching",
      createdAt: new Date(this.now()).toISOString(),
      assets: structuredClone(offer.assets),
      fingerprint: digest([
        account.steamId,
        offer.partnerSteamId,
        tuples(offer.assets),
      ]),
    };
    const journal = run.data.loot.journal;
    journal.push(intent);
    const immutableIntent = digest(intent);
    // Do not catch persistence failure: no socket may be created without fsync.
    try {
      await this.onChange(run.data);
    } catch (error) {
      // No send has been attempted. A failed preflight append must not poison
      // every later vault save; retain all earlier financial reservations.
      const index = journal.indexOf(intent);
      if (index >= 0) journal.splice(index, 1);
      error.lootFatal = true;
      throw error;
    }
    this._current(ctx, run);
    let dispatched = false,
      dispatchError;
    try {
      const jsonOffer = {
        newversion: true,
        version: offer.assets.length + 1,
        me: { assets: offer.assets, currency: [], ready: false },
        them: { assets: [], currency: [], ready: false },
      };
      const form = {
        sessionid: community ? community.sessionId() : ctx.sessionid,
        serverid: "1",
        partner: offer.partnerSteamId,
        tradeoffermessage: "smart-auth loot " + intent.requestId,
        json_tradeoffer: JSON.stringify(jsonOffer),
        captcha: "",
        trade_offer_create_params: JSON.stringify(
          offer.tradeToken
            ? { trade_offer_access_token: offer.tradeToken }
            : {},
        ),
      };
      const beforeDispatch = () => {
        this._assertCooldown(ctx.steamId);
        this._allowed(run, offer.accountId, offer.partnerSteamId);
        this._current(ctx, run);
        validateLootJournal(run.data.loot.journal);
        check(
          intent.state === "dispatching" &&
            run.data.loot.journal.includes(intent) &&
            digest(intent) === immutableIntent,
        );
        check(
          !run.data.loot.journal.some(
            (e) =>
              e !== intent &&
              HOLD_STATES.has(e.state) &&
              e.sourceSteamId === intent.sourceSteamId &&
              e.assets.some((a) =>
                intent.assets.some((b) => assetKey(a) === assetKey(b)),
              ),
          ),
        );
        intent.attemptedAt = new Date(this.now()).toISOString();
        dispatched = true;
        this.lastSendAt = this.now();
        this._recordEvent("send-start", {
          run,
          accountId: account.id,
          phase: "sending",
          details: {
            positions: offer.assets.length,
            units: unitCount(offer.assets),
          },
        });
      };
      const response = community
        ? await community.send(form, { beforeDispatch })
        : await this._request(ctx, run, ORIGIN + "/tradeoffer/new/send", {
            method: "POST",
            retrySafe: false,
            beforeDispatch,
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              referer,
            },
            body: new URLSearchParams(form).toString(),
          });
      const ack = JSON.parse(String(response.body));
      check(
        typeof ack.tradeofferid === "string" &&
          /^[1-9]\d{0,31}$/.test(ack.tradeofferid),
      );
      intent.offerId = ack.tradeofferid;
      intent.state = ack.needs_mobile_confirmation
        ? "mobile-confirmation"
        : ack.needs_email_confirmation
          ? "email-confirmation"
          : "sent";
    } catch (error) {
      dispatchError = error;
      intent.state = dispatched ? "unknown" : "not-dispatched";
    }
    // Persist even if cancellation/session replacement happened while awaiting
    // the response; the captured vault callback must reject an obsolete vault.
    await this.onChange(run.data);
    this._current(ctx, run);
    if (intent.state === "unknown" || intent.state === "not-dispatched") {
      const error = dispatchError?.lootSafeMessage
        ? dispatchError
        : Error(localeText.message_cac05fc);
      // Only a durably saved local uncertain send is isolated to this source.
      // Cancellation, session replacement and persistence failure stay fatal.
      if (intent.state === "unknown") error.lootUncertainSend = true;
      throw error;
    }
    if (intent.state === "mobile-confirmation") {
      if (this.job) this.job.phase = "confirming";
      this._recordEvent("confirmation-start", {
        run,
        accountId: account.id,
        phase: "confirming",
        details: { offerId: intent.offerId, appId: offer.assets[0]?.appid },
      });
      this._event();
      await this._confirmCreatedOffer(ctx, run, intent);
      if (this.job) this.job.phase = "sending";
    }
  }
  async _confirmCreatedOffer(ctx, run, intent) {
    const account = ctx.account;
    if (
      !account.mafile?.identity_secret ||
      !account.mafile?.device_id ||
      typeof this.steam.listConfirmations !== "function" ||
      typeof this.steam.respond !== "function"
    )
      return;
    try {
      this._current(ctx, run);
      const confirmationDeadline = Math.min(ctx.deadline, Date.now() + 5000);
      let bound = [];
      // Steam can publish a newly created offer's confirmation a moment after
      // its ACK. Only these bounded reads repeat; the decision never does.
      for (let read = 0; read < 3; read++) {
        this._current(ctx, run);
        if (Date.now() >= confirmationDeadline) break;
        const confirmations = await this.steam.listConfirmations(account);
        this._current(ctx, run);
        bound = confirmations.filter(
          (c) => c.type === 2 && c.creatorId === intent.offerId,
        );
        if (
          bound.length ||
          read === 2 ||
          Date.now() + 750 >= confirmationDeadline
        )
          break;
        await this._delay(750, run);
      }
      if (
        bound.length !== 1 ||
        bound[0].held ||
        (account.confirmationJournal || []).some(
          (j) => j.confirmationId === bound[0].id,
        )
      )
        return;
      const query = new URLSearchParams({
        access_token: ctx.token,
        tradeofferid: intent.offerId,
        get_descriptions: "0",
      });
      const response = await this._request(
        ctx,
        run,
        `https://api.steampowered.com/IEconService/GetTradeOffer/v1/?${query}`,
        { retrySafe: true },
      );
      const offer = JSON.parse(String(response.body))?.response?.offer;
      check(
        offer?.tradeofferid === intent.offerId &&
          offer.is_our_offer === true &&
          offer.trade_offer_state === 9 &&
          Number.isSafeInteger(offer.accountid_other) &&
          offer.accountid_other > 0 &&
          offer.accountid_other <= 4294967295 &&
          (BASE + BigInt(offer.accountid_other)).toString() ===
            intent.partnerSteamId,
      );
      check(
        Array.isArray(offer.items_to_give) &&
          (offer.items_to_receive === undefined ||
            (Array.isArray(offer.items_to_receive) &&
              offer.items_to_receive.length === 0)),
      );
      const assets = offer.items_to_give.map((a) => {
        check(a && !a.missing);
        return {
          appid: integer(a.appid, undefined, 1, 2147483647),
          contextid: decimal(a.contextid),
          assetid: decimal(a.assetid, true),
          amount: decimal(a.amount, true),
        };
      });
      check(
        new Set(assets.map(assetKey)).size === assets.length &&
          digest(tuples(assets)) === digest(tuples(intent.assets)),
      );
      this._current(ctx, run);
      const confirmationIntent = digest(intent);
      await this.steam.respond(account, bound[0].id, true, {
        assertCurrent: () => {
          this._current(ctx, run);
          check(
            run.data.loot.journal.includes(intent) &&
              intent.state === "mobile-confirmation" &&
              digest(intent) === confirmationIntent,
          );
        },
      });
      this._current(ctx, run);
      intent.state = "sent";
      await this.onChange(run.data);
      this._current(ctx, run);
    } catch {
      // Production respond durably journals its own mutation and never retries.
      // If unavailable or ambiguous, retain the exact offer for manual review.
      this._current(ctx, run);
    }
  }
}
module.exports = {
  lootCommunityBanned,
  lootPendingCount,
  normalizeLootSettings,
  validateLootJournal,
  lootCoverage,
  LootService,
};
