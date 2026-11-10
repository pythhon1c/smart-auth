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
const actions = new Set([
  "status",
  "showUnlock",
  "lockedReady",
  "snapshot",
  "saveLootSettings",
  "prepareLoot",
  "startLoot",
  "cancelLoot",
  "lootStatus",
  "refreshLootJournal",
  "openLootAccount",
  "saveSteamAdmins",
  "refreshSteamAdminAvatars",
  "lock",
  "touch",
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
ipcRenderer.on("smart-sda-loot-changed", (_event, payload) => {
  const state = lockState(payload);
  for (const callback of [...subscribers]) {
    try {
      callback(state);
    } catch {}
  }
});
contextBridge.exposeInMainWorld(
  "lootApi",
  Object.freeze({
    call: async (action, payload = {}) => {
      if (!actions.has(action)) throw Error(localeText.unknownAction);
      const generation = uiGeneration;
      if (uiLocked && !safeActions.has(action))
        throw Error(localeText.vaultLocked);
      const result = await ipcRenderer.invoke(
        "smart-sda-loot",
        action,
        payload,
      );
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
      if (!result.ok) throw Error(result.error);
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
  }),
);
