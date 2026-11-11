"use strict";
const { IDLE_LOCK_DEFAULTS, migrateIdleLockSettings } = require("./idle-lock-settings.cjs");
const { migrateAppearanceSettings } = require("./appearance-settings.cjs");
const localeText = require("../locales/application.json");
const { allocationRoute } = require("./proxy-allocation.cjs");
const { accountPolicy } = require("./account-policy.cjs");
const { mergeTradeJournals } = require("./trade-offers.cjs");
const { randomUUID } = require("node:crypto");
const { validateProxy, proxyEndpoint } = require("./transport.cjs");
const { safeCachedAvatar } = require("./avatar.cjs");
const {
  normalizeExtensions,
  DEFAULT_EXTENSION_ID,
} = require("./browser-extensions.cjs");

function label(value, fallback) {
  if (value === undefined && fallback !== undefined) value = fallback;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 120 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error(localeText.enterANameOf1120Characters);
  return value.trim();
}
function item(list, id, kind = localeText.record) {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`${kind}${localeText.templateText_52465e2}`);
  return found;
}
function routeIds(data, ids, limit = 2000, index) {
  if (
    !Array.isArray(ids) ||
    ids.length > limit ||
    ids.some((x) => typeof x !== "string") ||
    new Set(ids).size !== ids.length
  )
    throw new Error(localeText.invalidProxyList);
  ids.forEach((id) => {
    if (index ? !index.has(id) : !data.proxies.some((p) => p.id === id))
      throw new Error(localeText.proxyNotFound);
  });
  return [...ids];
}
function listIds(data, ids, index) {
  if (
    !Array.isArray(ids) ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== "string") ||
    new Set(ids).size !== ids.length
  )
    throw new Error(localeText.invalidProxyListSelection);
  ids.forEach((id) => {
    if (
      index
        ? !index.has(id)
        : !(data.proxyLists || []).some((list) => list.id === id)
    )
      throw new Error(localeText.proxyListNotFound);
  });
  return [...ids];
}
function routeContext(data) {
  return {
    proxies: new Map(data.proxies.map((p) => [p.id, p])),
    lists: new Map((data.proxyLists || []).map((list) => [list.id, list])),
    groups: new Map(data.groups.map((g) => [g.id, g])),
    expanded: new Map(),
    listRoutes: new Map(),
  };
}
function expandRoute(data, owner, context) {
  if (context.expanded.has(owner)) return context.expanded.get(owner);
  const ids = routeIds(data, owner.proxyIds || [], 2000, context.proxies);
  if (listIds(data, owner.proxyListIds || [], context.lists).length)
    throw new Error(
      localeText.thisProxyListNeedsIndividualAllocationAcrossAccounts,
    );
  const route = [...new Set(ids)].map((id) => context.proxies.get(id));
  context.expanded.set(owner, route);
  return route;
}
function resolveRoute(data, account, context = routeContext(data)) {
  if (account.proxyAllocation) return allocationRoute(data, account, context);
  if (!account.inheritProxy) return expandRoute(data, account, context);
  const visited = new Set();
  let groupId = account.groupId;
  while (groupId) {
    if (visited.has(groupId))
      throw new Error(localeText.cycleInFolderHierarchy);
    visited.add(groupId);
    const group = context.groups.get(groupId);
    if (!group) throw new Error(localeText.folderNotFound);
    const route = expandRoute(data, group, context);
    if (route.length) return route;
    groupId = group.parentId;
  }
  return [];
}
function saveGroup(data, p, isNew) {
  const group = isNew
    ? {
        id: randomUUID(),
        name: "",
        parentId: null,
        proxyIds: [],
        proxyListIds: [],
      }
    : item(data.groups, p.id, localeText.folder);
  const next = {
    ...group,
    name: label(p.name, group.name),
    parentId: p.parentId === undefined ? group.parentId : p.parentId || null,
    proxyIds: routeIds(data, p.proxyIds ?? group.proxyIds ?? []),
    proxyListIds: listIds(data, p.proxyListIds ?? group.proxyListIds ?? []),
  };
  let parent = next.parentId;
  const visited = new Set([group.id]);
  while (parent) {
    if (visited.has(parent))
      throw new Error(localeText.aFolderCannotContainItself);
    visited.add(parent);
    parent = item(data.groups, parent, localeText.folder).parentId;
  }
  if (
    data.groups.some(
      (x) =>
        x.id !== next.id &&
        x.parentId === next.parentId &&
        x.name.toLocaleLowerCase() === next.name.toLocaleLowerCase(),
    )
  )
    throw new Error(localeText.aFolderWithThisNameAlreadyExists);
  if (isNew) data.groups.push(next);
  else Object.assign(group, next);
  return next.id;
}
function saveProxyList(data, p, isNew) {
  const lists = data.proxyLists || [];
  if (isNew && lists.length >= 2000)
    throw new Error(localeText.tooManyProxyLists);
  const existing = isNew
    ? { id: randomUUID(), proxyIds: [] }
    : item(lists, p.id, localeText.proxyList);
  const next = {
    id: existing.id,
    name: label(p.name, existing.name),
    proxyIds: routeIds(data, p.proxyIds ?? existing.proxyIds),
  };
  if (
    lists.some(
      (x) =>
        x.id !== next.id &&
        x.name.toLocaleLowerCase() === next.name.toLocaleLowerCase(),
    )
  )
    throw new Error(localeText.thisProxyListAlreadyExists);
  if (isNew) {
    data.proxyLists ||= [];
    data.proxyLists.push(next);
  } else Object.assign(existing, next);
  return next.id;
}
function deleteProxyList(data, id) {
  item(data.proxyLists || [], id, localeText.proxyList);
  if (
    [...data.accounts, ...data.groups].some((owner) =>
      (owner.proxyListIds || []).includes(id),
    )
  )
    throw new Error(localeText.removeThisListFromAccountAndFolderRoutesFirst);
  data.proxyLists = data.proxyLists.filter((list) => list.id !== id);
}
const BROWSER_THEMES = Object.freeze(["system", "light", "dark"]);
const BROWSER_LANGUAGES = Object.freeze([
  "system",
  "en-US",
  "uk",
  "ru",
  "de",
  "fr",
  "es",
  "pl",
  "pt-BR",
  "tr",
  "zh-CN",
  "ja",
]);
const DEFAULT_BROWSER_BOOKMARKS = Object.freeze([
  Object.freeze({ title: "2ip.io", url: "https://2ip.io/" }),
]);
const DEFAULT_SETTINGS = Object.freeze({
  ...IDLE_LOCK_DEFAULTS,
  pollSeconds: 60,
  theme: "system",
  language: "en",
  followSystemLanguage: true,
  allowDirect: false,
  showProxyCredentials: false,
  hideSecurityNotice: false,
  trayEnabled: true,
  trayMinimizeToTray: false,
  trayCloseToTray: false,
  trayAccountIds: Object.freeze([]),
  notificationsEnabled: true,
  soundEnabled: true,
  soundVolume: 50,
  notifyErrors: true,
  accountsPerPage: 50,
  browserMaxAccounts: 10,
  browserSeparateSession: true,
  bulkConcurrency: 8,
  proxyCheckConcurrency: 8,
  browserLaunchConcurrency: 2,
  taskStartDelayMs: 100,
  browserLaunchDelayMs: 750,
  browserTheme: "system",
  browserLanguage: "system",
  browserShowBookmarksBar: true,
  browserBookmarks: DEFAULT_BROWSER_BOOKMARKS,
  browserSmartTraderEnabled: true,
  browserSmartTraderAutoCheck: false,
  browserExtensions: Object.freeze([]),
  browserLocalExtensions: Object.freeze([]),
});
function normalizeBrowserSettings(settings = {}) {
  const browserSeparateSession =
    settings.browserSeparateSession === undefined
      ? true
      : settings.browserSeparateSession;
  const browserTheme =
    settings.browserTheme === undefined ? "system" : settings.browserTheme;
  const browserLanguage =
    settings.browserLanguage === undefined
      ? "system"
      : settings.browserLanguage;
  const browserShowBookmarksBar =
    settings.browserShowBookmarksBar === undefined
      ? true
      : settings.browserShowBookmarksBar;
  const bookmarks =
    settings.browserBookmarks === undefined
      ? DEFAULT_BROWSER_BOOKMARKS
      : settings.browserBookmarks;
  if (
    typeof browserSeparateSession !== "boolean" ||
    !BROWSER_THEMES.includes(browserTheme) ||
    !BROWSER_LANGUAGES.includes(browserLanguage) ||
    typeof browserShowBookmarksBar !== "boolean" ||
    !Array.isArray(bookmarks) ||
    bookmarks.length > 100
  )
    throw new Error(localeText.invalidBrowserSettings);
  const browserBookmarks = Array.from(bookmarks, (bookmark) => {
    if (
      !bookmark ||
      typeof bookmark !== "object" ||
      Array.isArray(bookmark) ||
      typeof bookmark.title !== "string" ||
      !bookmark.title.trim() ||
      bookmark.title.trim().length > 120 ||
      /[\x00-\x1f\x7f]/.test(bookmark.title) ||
      typeof bookmark.url !== "string" ||
      bookmark.url.length > 2048 ||
      /[\x00-\x20\x7f]/.test(bookmark.url)
    )
      throw new Error(localeText.invalidBrowserBookmark);
    let url;
    try {
      url = new URL(bookmark.url);
    } catch {
      throw new Error(localeText.invalidBookmarkURL);
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.href.length > 2048
    )
      throw new Error(localeText.bookmarksSupportOnlyHTTPSWithoutCredentials);
    return { title: bookmark.title.trim(), url: url.href };
  });
  const entries = normalizeExtensions(
    settings.browserExtensions === undefined ? [] : settings.browserExtensions,
  );
  const browserSmartTraderEnabled =
    settings.browserSmartTraderEnabled === undefined
      ? settings.browserExtensions === undefined ||
        entries.some((entry) => entry.id === DEFAULT_EXTENSION_ID)
      : settings.browserSmartTraderEnabled;
  const browserSmartTraderAutoCheck =
    settings.browserSmartTraderAutoCheck === undefined
      ? false
      : settings.browserSmartTraderAutoCheck;
  if (
    typeof browserSmartTraderEnabled !== "boolean" ||
    typeof browserSmartTraderAutoCheck !== "boolean"
  )
    throw new Error(localeText.invalidSettings);
  const browserExtensions = entries
    .filter((entry) => entry.id !== DEFAULT_EXTENSION_ID)
    .map((entry) => entry.url);
  const local = settings.browserLocalExtensions === undefined ? [] : settings.browserLocalExtensions;
  if (!Array.isArray(local) || local.length > 20)
    throw new Error(localeText.invalidBrowserSettings);
  const reserved = new Set([DEFAULT_EXTENSION_ID, ...entries.map((entry) => entry.id)]);
  const browserLocalExtensions = Array.from(local, (entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).some((key) => !["id", "name", "version", "enabled"].includes(key)) ||
        typeof entry.id !== "string" || !/^[a-p]{32}$/.test(entry.id) || reserved.has(entry.id) ||
        typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 256 || /[\x00-\x1f\x7f]/.test(entry.name) ||
        typeof entry.version !== "string" || !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(entry.version) ||
        entry.version.split(".").some((part) => Number(part) > 65535) ||
        !entry.version.split(".").some((part) => Number(part) > 0) || typeof entry.enabled !== "boolean")
      throw new Error(localeText.invalidBrowserSettings);
    reserved.add(entry.id);
    return { id: entry.id, name: entry.name, version: entry.version, enabled: entry.enabled };
  });
  if (browserExtensions.length + browserLocalExtensions.length + Number(browserSmartTraderEnabled) > 20)
    throw new Error(localeText.upTo20ExtensionsAreAllowed);
  return {
    browserSeparateSession,
    browserTheme,
    browserLanguage,
    browserShowBookmarksBar,
    browserBookmarks,
    browserExtensions,
    browserLocalExtensions,
    browserSmartTraderEnabled,
    browserSmartTraderAutoCheck,
  };
}
function mergeSettings(data, p) {
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw new Error(localeText.invalidSettings);
  const appearance = { ...data.settings };
  migrateAppearanceSettings(appearance);
  migrateIdleLockSettings(appearance);
  const next = {
    ...DEFAULT_SETTINGS,
    ...data.settings,
    ...appearance,
    ...normalizeBrowserSettings(data.settings),
  };
  for (const key of Object.keys(p)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key) ||
        (key === "idleLockSettingsVersion" && p[key] !== IDLE_LOCK_DEFAULTS.idleLockSettingsVersion))
      throw new Error(localeText.unknownSetting);
    next[key] = p[key];
  }
  if (p.language !== undefined && p.followSystemLanguage !== true)
    next.followSystemLanguage = false;
  if (p.autoLockMinutes !== undefined && p.passwordLockMinutes === undefined)
    next.passwordLockMinutes = p.autoLockMinutes;
  if (p.passwordLockMinutes !== undefined)
    next.autoLockMinutes = p.passwordLockMinutes;
  if (
    !Number.isInteger(next.autoLockMinutes) ||
    next.autoLockMinutes < 0 ||
    next.autoLockMinutes > 1440 ||
    !Number.isInteger(next.pinLockMinutes) ||
    next.pinLockMinutes < 0 ||
    next.pinLockMinutes > 1440 ||
    !Number.isInteger(next.passwordLockMinutes) ||
    next.passwordLockMinutes < 0 ||
    next.passwordLockMinutes > 1440 ||
    !Number.isInteger(next.pollSeconds) ||
    next.pollSeconds < 15 ||
    next.pollSeconds > 3600 ||
    !["dark", "light", "system"].includes(next.theme) ||
    !["ua", "en", "ru"].includes(next.language) ||
    !Number.isInteger(next.soundVolume) ||
    next.soundVolume < 0 ||
    next.soundVolume > 100 ||
    ![10, 25, 50, 100, 200].includes(next.accountsPerPage) ||
    !Number.isInteger(next.browserMaxAccounts) ||
    next.browserMaxAccounts < 1 ||
    next.browserMaxAccounts > 100
  )
    throw new Error(localeText.invalidSettings);
  for (const [key, min, max] of [
    ["bulkConcurrency", 1, 16],
    ["proxyCheckConcurrency", 1, 16],
    ["browserLaunchConcurrency", 1, 3],
    ["taskStartDelayMs", 50, 2000],
    ["browserLaunchDelayMs", 250, 5000],
  ])
    if (!Number.isInteger(next[key]) || next[key] < min || next[key] > max)
      throw new Error(localeText.invalidSettings);
  for (const key of [
    "browserSeparateSession",
    "followSystemLanguage",
    "allowDirect",
    "showProxyCredentials",
    "hideSecurityNotice",
    "trayEnabled",
    "trayMinimizeToTray",
    "trayCloseToTray",
    "notificationsEnabled",
    "soundEnabled",
    "notifyErrors",
  ])
    if (typeof next[key] !== "boolean")
      throw new Error(localeText.invalidSettings);
  Object.assign(next, normalizeBrowserSettings(next));
  if (
    !Array.isArray(next.trayAccountIds) ||
    next.trayAccountIds.some((id) => typeof id !== "string")
  )
    throw new Error(localeText.invalidSettings);
  const validTrayIds = new Set(
    (data.accounts || []).map((account) => account.id),
  );
  if (
    Object.hasOwn(p, "trayAccountIds") &&
    p.trayAccountIds.some((id) => !validTrayIds.has(id))
  )
    throw new Error(localeText.invalidSettings);
  next.trayAccountIds = [...new Set(next.trayAccountIds)]
    .filter((id) => validTrayIds.has(id))
    .slice(0, 10);
  return next;
}
function saveProxy(data, p, isNew) {
  const proxy = isNew
    ? { id: randomUUID() }
    : item(data.proxies, p.id, localeText.proxies_f1fa83d);
  const next = {
    id: proxy.id,
    name: label(p.name, proxy.name),
    url: p.url ? validateProxy(p.url) : proxy.url,
  };
  if (!next.url) throw new Error(localeText.enterAProxyURL);
  if (isNew) data.proxies.push(next);
  else Object.assign(proxy, next);
  return next.id;
}
function saveAccount(data, p) {
  const account = item(data.accounts, p.id, localeText.account);
  if (
    p.note !== undefined &&
    (typeof p.note !== "string" ||
      p.note.length > 2000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(p.note))
  )
    throw new Error(localeText.validationMessage_8b2f374);
  const groupId = p.groupId === undefined ? account.groupId : p.groupId || null;
  if (groupId) item(data.groups, groupId, localeText.folder);
  for (const key of [
    "inheritProxy",
    "autoMarket",
    "autoTrades",
    "autoMarketPurchases",
    "checkConfirmations",
    "notifyConfirmations",
    "watchIncomingTrades",
    "autoAcceptGifts",
  ])
    if (p[key] !== undefined && typeof p[key] !== "boolean")
      throw new Error(localeText.invalidAccountSetting);
  const policy = accountPolicy(account);
  const selectedLists = listIds(
    data,
    p.proxyListIds ?? account.proxyListIds ?? [],
  );
  const suppliedProxies = routeIds(data, p.proxyIds ?? account.proxyIds ?? []);
  const retainedProxies =
    p.inheritProxy === true
      ? []
      : (account.proxyAllocation?.listIds || []).flatMap((id, index) => {
          const proxyId = account.proxyAllocation.proxyIds[index];
          return selectedLists.includes(id) &&
            data.proxyLists
              .find((list) => list.id === id)
              ?.proxyIds.includes(proxyId)
            ? [proxyId]
            : [];
        });
  if (p.inheritProxy !== true)
    for (const id of account.proxyAllocation?.backupProxyIds || []) {
      if (
        selectedLists.some((listId) =>
          data.proxyLists
            .find((list) => list.id === listId)
            ?.proxyIds.includes(id),
        )
      )
        retainedProxies.push(id);
    }
  const allocatedIds = [
    ...(account.proxyAllocation?.proxyIds || []),
    ...(account.proxyAllocation?.backupProxyIds || []),
  ];
  const allocationSourceChanged =
    account.proxyAllocation &&
    (JSON.stringify(selectedLists) !== JSON.stringify(account.proxyListIds) ||
      (p.proxyIds !== undefined &&
        JSON.stringify(
          suppliedProxies.filter((id) => !allocatedIds.includes(id)),
        ) !==
          JSON.stringify(
            (account.proxyIds || []).filter((id) => !allocatedIds.includes(id)),
          )));
  const update = {
    name: label(p.name, account.name),
    groupId,
    proxyIds: [...new Set([...retainedProxies, ...suppliedProxies])],
    proxyListIds: selectedLists,
    note: p.note ?? account.note ?? "",
  };
  for (const key of [
    "inheritProxy",
    "autoMarket",
    "autoTrades",
    "autoMarketPurchases",
    "checkConfirmations",
    "notifyConfirmations",
    "watchIncomingTrades",
    "autoAcceptGifts",
  ])
    update[key] =
      p[key] ?? (key === "inheritProxy" ? account[key] : policy[key]);
  update.confirmationIntervalSeconds =
    p.confirmationIntervalSeconds ?? policy.confirmationIntervalSeconds;
  update.functionIntervalsSeconds =
    p.functionIntervalsSeconds === undefined
      ? p.confirmationIntervalSeconds === undefined
        ? { ...policy.functionIntervalsSeconds }
        : Object.fromEntries(
            Object.keys(policy.functionIntervalsSeconds).map((key) => [
              key,
              p.confirmationIntervalSeconds,
            ]),
          )
      : { ...policy.functionIntervalsSeconds, ...p.functionIntervalsSeconds };
  if (
    p.functionIntervalsSeconds !== undefined &&
    (!p.functionIntervalsSeconds ||
      typeof p.functionIntervalsSeconds !== "object" ||
      Array.isArray(p.functionIntervalsSeconds))
  )
    throw new Error(localeText.invalidAccountSetting);
  if (
    p.checkConfirmations === undefined &&
    ["autoMarket", "autoTrades", "autoMarketPurchases"].some(
      (key) => p[key] === true,
    )
  )
    update.checkConfirmations = true;
  accountPolicy(update);
  if (
    (update.autoMarket || update.autoTrades || update.autoMarketPurchases) &&
    (!account.mafile?.identity_secret || !account.mafile?.device_id)
  )
    throw new Error(
      localeText.confirmationsRequireIdentitySecretAndDeviceIdInTheMaFile,
    );
  Object.assign(account, update);
  if (
    account.proxyAllocation &&
    !account.inheritProxy &&
    allocationSourceChanged
  )
    account.proxyAllocation.groupId = null;
  if (
    p.inheritProxy === true ||
    (allocationSourceChanged && !account.proxyListIds.length)
  )
    delete account.proxyAllocation;
}
function publicSnapshot(data, security, statuses) {
  const context = routeContext(data);
  return {
    accounts: data.accounts.map((a) => {
      let route = [],
        routeValid = true;
      try {
        route = resolveRoute(data, a, context);
      } catch {
        routeValid = false;
      }
      const direct =
        routeValid && !route.length && data.settings.allowDirect === true;
      const session = a.mafile.Session || a.mafile.session || {};
      return {
        id: a.id,
        name: a.name,
        note: typeof a.note === "string" ? a.note.slice(0, 2000) : "",
        avatar: safeCachedAvatar(a.avatar),
        hasSharedSecret: Boolean(a.mafile?.shared_secret),
        hasPassword:
          typeof a.loginPassword === "string" && a.loginPassword.length > 0,
        steamId: a.steamId,
        bans: require("./account-bans.cjs").normalizeAccountBans(a.bans),
        groupId: a.groupId,
        proxyIds: [...(a.proxyIds || [])],
        proxyListIds: [...(a.proxyListIds || [])],
        inheritProxy: a.inheritProxy,
        ...(a.proxyAllocation
          ? { proxyAllocation: structuredClone(a.proxyAllocation) }
          : {}),
        deviceName: a.deviceName,
        ...accountPolicy(a),
        hasIdentitySecret: Boolean(
          a.mafile.identity_secret && a.mafile.device_id,
        ),
        sessionReady: Boolean(
          session.AccessToken ||
            session.access_token ||
            session.RefreshToken ||
            session.refresh_token,
        ),
        routeLabel: route.length
          ? `${route[0].name}${route.length > 1 ? ` + ${route.length - 1}${localeText.templateText_1db3b57}` : ""}`
          : direct
            ? localeText.directConnectionNoProxy
            : localeText.noProxyAssigned,
        status: statuses.get(a.id) || {
          state: direct ? "direct" : route.length ? "unchecked" : "blocked",
          message: route.length
            ? localeText.notCheckedYet
            : direct
              ? localeText.directConnectionAllowed
              : localeText.networkRequestsBlocked,
        },
      };
    }),
    groups: data.groups.map((g) => ({
      id: g.id,
      name: g.name,
      parentId: g.parentId,
      proxyIds: [...(g.proxyIds || [])],
      proxyListIds: [...(g.proxyListIds || [])],
    })),
    proxyLists: (data.proxyLists || []).map((list) => ({
      id: list.id,
      name: list.name,
      proxyIds: [...list.proxyIds],
    })),
    proxies: data.proxies.map((p) => ({
      id: p.id,
      name: p.name,
      endpoint: proxyEndpoint(p.url),
    })),
    settings: { ...data.settings },
    steamAdmins: require("./loot-settings.cjs").publicPeople(
      data,
      data.steamAdmins || [],
    ),
    loot: {
      version: 2,
      schemes: require("./loot-schemes.cjs")
        .ensureLootSchemes(data)
        .schemes.map((scheme) => ({
          id: scheme.id,
          name: scheme.name,
          lastRunAt: scheme.lastRunAt,
          settings: {
            ...scheme.settings,
            warehouses: require("./loot-settings.cjs")
              .publicPeople(data, scheme.settings.warehouses)
              .map((person, index) => ({
                ...person,
                allowedSenders: structuredClone(
                  scheme.settings.warehouses[index].allowedSenders || {
                    all: true,
                    groupIds: [],
                    accountIds: [],
                  },
                ),
              })),
          },
        })),
    },
    audit: data.audit.slice(-200).map((x) => ({ ...x })),
    security: {
      passwordEnabled: security.passwordEnabled,
      totpEnabled: security.totpEnabled,
      pinEnabled: security.pinEnabled === true,
      vaultVersion: security.vaultVersion,
      kdf: security.kdf
        ? {
            name: security.kdf.name,
            N: security.kdf.N,
            r: security.kdf.r,
            p: security.kdf.p,
          }
        : null,
      passwordNeedsUpgrade: security.passwordNeedsUpgrade === true,
    },
  };
}
function retainConfirmationHistory(data, account) {
  if (account.tradeOfferJournal?.length) {
    data.retiredTradeOfferJournals ||= {};
    data.retiredTradeOfferJournals[account.steamId] = mergeTradeJournals(
      data.retiredTradeOfferJournals[account.steamId],
      account.tradeOfferJournal,
    );
  }
  if (!account.confirmationJournal?.length) return;
  data.retiredConfirmationJournals ||= {};
  data.retiredConfirmationJournals[account.steamId] = structuredClone(
    account.confirmationJournal,
  );
}
function restoreConfirmationHistory(data, account) {
  const trades = data.retiredTradeOfferJournals?.[account.steamId];
  if (trades?.length)
    account.tradeOfferJournal = mergeTradeJournals(
      trades,
      account.tradeOfferJournal,
    );
  const retained = data.retiredConfirmationJournals?.[account.steamId];
  if (retained) account.confirmationJournal = structuredClone(retained);
}
module.exports = {
  retainConfirmationHistory,
  restoreConfirmationHistory,
  label,
  item,
  routeIds,
  listIds,
  saveProxyList,
  deleteProxyList,
  mergeSettings,
  DEFAULT_SETTINGS,
  normalizeBrowserSettings,
  BROWSER_THEMES,
  BROWSER_LANGUAGES,
  DEFAULT_BROWSER_BOOKMARKS,
  resolveRoute,
  saveGroup,
  saveProxy,
  saveAccount,
  publicSnapshot,
};
