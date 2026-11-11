"use strict";
const preloadLocalePrefix = "--smart-sda-preload-locale=";
const localeText = JSON.parse(
  decodeURIComponent(
    process.argv
      .find((argument) => argument.startsWith(preloadLocalePrefix))
      .slice(preloadLocalePrefix.length),
  ),
);
const { contextBridge, ipcRenderer } = require("electron");
function notificationPayload(value) {
  const result = {
    kind: ["pending", "incoming", "error", "test"].includes(value?.kind)
      ? value.kind
      : "info",
  };
  const count = (number) =>
    Number.isSafeInteger(number) && number >= 0 && number <= 1000000000;
  if (count(value?.count)) result.count = value.count;
  const stacks = value?.stacks;
  if (!Array.isArray(stacks?.items)) return result;
  const items = [];
  let incomplete = stacks.incomplete === true || stacks.items.length > 4;
  for (const item of stacks.items.slice(0, 4)) {
    const name =
      typeof item?.name === "string"
        ? item.name
            .replace(/[\p{Cc}\p{Cf}]/gu, " ")
            .trim()
            .slice(0, 120)
        : "";
    const raw = item?.exactQuantity ?? item?.quantity;
    const quantity =
      typeof raw === "string"
        ? raw
        : Number.isSafeInteger(raw) && raw > 0
          ? String(raw)
          : "";
    if (!name || !/^[1-9]\d{0,40}$/.test(quantity)) {
      incomplete = true;
      continue;
    }
    items.push({
      name,
      quantity,
      direction: ["incoming", "outgoing"].includes(item.direction)
        ? item.direction
        : "unknown",
    });
  }
  result.stacks = {
    items,
    omitted: Math.min(
      1000000000,
      (count(stacks.omitted) ? stacks.omitted : 0) +
        Math.max(0, stacks.items.length - 4),
    ),
    ...(incomplete ? { incomplete: true } : {}),
  };
  return result;
}
const actions = new Set([
  "checkAppUpdate",
  "downloadAppUpdate",
  "restartForAppUpdate",
  "status",
  "showUnlock",
  "lockedReady",
  "status",
  "createVault",
  "unlock",
  "lock",
  "pinLock",
  "unlockPin",
  "enablePin",
  "disablePin",
  "touch",
  "snapshot",
  "openPasswordManager",
  "openAuthenticator",
  "openLoot",
  "deleteLootScheme",
  "cancelLootScheme",
  "saveSteamAdmins",
  "refreshSteamAdminAvatars",
  "proxyDetails",
  "accountProxyOptions",
  "assignAccountProxy",
  "startProxyCheck",
  "proxyCheckStatus",
  "cancelProxyCheck",
  "codes",
  "copyCode",
  "bulkAccountPolicy",
  "prepareBulkConfirmations",
  "startBulkConfirmationPrepare",
  "bulkConfirmationStatus",
  "startBulkConfirmationCommit",
  "commitBulkConfirmations",
  "cancelBulkConfirmations",
  "startBulkLogin",
  "bulkLoginStatus",
  "cancelBulkLogin",
  "refreshAccountBans",
  "saveBanApiKey",
  "startBulkBanCheck",
  "bulkBanCheckStatus",
  "cancelBulkBanCheck",
  "startBrowserOpen",
  "browserRuntimeStatus",
  "startBrowserRuntimeDownload",
  "cancelBrowserRuntimeDownload",
  "openBrowserRuntimeTerms",
  "getBrowserProfiles",
  "saveBrowserProfiles",
  "randomizeBrowserProfiles",
  "browserOpenStatus",
  "browserOpenAction",
  "cancelBrowserOpen",
  "closeBrowsers",
  "exportAccounts",
  "preparePortableImport",
  "commitPortableImport",
  "cancelPortableImport",
  "activity",
  "importAccounts",
  "prepareAccountImport",
  "commitAccountImport",
  "cancelAccountImport",
  "moveAccounts",
  "prepareProxyAllocation",
  "commitProxyAllocation",
  "cancelProxyAllocation",
  "addGroup",
  "updateGroup",
  "deleteGroup",
  "addProxy",
  "updateProxy",
  "deleteProxy",
  "addProxyList",
  "updateProxyList",
  "deleteProxyList",
  "importProxies",
  "proxyListText",
  "updateAccount",
  "deleteAccount",
  "checkProxy",
  "confirmations",
  "confirmationDetails",
  "confirmationImage",
  "takeTrayReview",
  "respond",
  "login",
  "accountPassword",
  "copyAccountPassword",
  "updateAccountPassword",
  "submitGuard",
  "syncTime",
  "beginTotp",
  "cancelTotpEnrollment",
  "enableTotp",
  "disableTotp",
  "changePassword",
  "settings",
  "backup",
  "testNotification",
]);
let uiGeneration = -1,
  uiLocked = false;
const safeActions = new Set([
  "status",
  "snapshot",
  "lock",
  "pinLock",
  "showUnlock",
  "lockedReady",
  "createVault",
  "unlock",
  "unlockPin",
]);
const subscribers = new Set();
function lockState(value) {
  if (
    !value ||
    typeof value.locked !== "boolean" ||
    !Number.isSafeInteger(value.uiGeneration)
  )
    return undefined;
  if (value.uiGeneration < uiGeneration) return undefined;
  uiGeneration = value.uiGeneration;
  uiLocked = value.locked;
  return {
    locked: uiLocked,
    uiGeneration,
    lockMode: value.lockMode,
    pinEnabled: value.pinEnabled,
    passwordEnabled: value.passwordEnabled,
    totpEnabled: value.totpEnabled,
    exists: value.exists,
    retryAfterMs: value.retryAfterMs,
    authPending: value.authPending,
    backgroundRunning: value.backgroundRunning,
  };
}
ipcRenderer.on("smart-sda-changed", (_event, payload) => {
  const state = lockState(payload);
  for (const callback of [...subscribers]) {
    try {
      callback(state);
    } catch {}
  }
});
contextBridge.exposeInMainWorld(
  "smartSda",
  Object.freeze({
    call: async (action, payload = {}) => {
      if (!actions.has(action)) throw new Error(localeText.unknownAction);
      const generation = uiGeneration;
      if (uiLocked && !safeActions.has(action))
        throw Error(localeText.vaultLocked);
      const result = await ipcRenderer.invoke("smart-sda", action, payload);
      if (
        !safeActions.has(action) &&
        (uiLocked || (generation >= 0 && generation !== uiGeneration))
      )
        throw Error(localeText.vaultLocked);
      if (
        action === "snapshot" &&
        result.value?.locked !== true &&
        (uiLocked || (generation >= 0 && generation !== uiGeneration))
      )
        throw Error(localeText.vaultLocked);
      if (
        Number.isSafeInteger(result.value?.uiGeneration) &&
        result.value.uiGeneration < uiGeneration
      )
        throw Error(localeText.vaultLocked);
      if (!result.ok) throw new Error(result.error);
      if (
        [
          "status",
          "snapshot",
          "lock",
          "pinLock",
          "unlock",
          "unlockPin",
          "createVault",
        ].includes(action)
      )
        lockState(
          result.value?.security?.uiGeneration !== undefined
            ? result.value.security
            : result.value,
        );
      return result.value;
    },
    onChanged: (callback) => {
      if (typeof callback !== "function") throw TypeError("Expected callback");
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    onAccountNavigation: (callback) => {
      if (typeof callback !== "function") throw TypeError("Expected callback");
      const handler = (_event, value) => {
        if (uiLocked) return;
        if (
          typeof value?.accountId === "string" &&
          value.accountId.length <= 200
        )
          callback({ accountId: value.accountId });
      };
      ipcRenderer.on("smart-sda-account-navigation", handler);
      return () =>
        ipcRenderer.removeListener("smart-sda-account-navigation", handler);
    },
    onTrayAction: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("Expected callback");
      const handler = () => {
        if (!uiLocked) callback();
      };
      ipcRenderer.on("smart-sda-tray-action", handler);
      return () => ipcRenderer.removeListener("smart-sda-tray-action", handler);
    },
    onNotification: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("Expected callback");
      const handler = (_event, value) => {
        if (!uiLocked) callback(notificationPayload(value));
      };
      ipcRenderer.on("smart-sda-notification", handler);
      return () =>
        ipcRenderer.removeListener("smart-sda-notification", handler);
    },
  }),
);
