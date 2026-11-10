"use strict";
const localeText = require("../locales/application.json");
const {
  lootWarehouseEntries,
  findLootScheme,
  ensureLootSchemes,
} = require("./loot-schemes.cjs");
const { normalizeLootSettings, lootCommunityBanned } = require("./loot.cjs");
const { normalizeSteamAdmins } = require("./steam-admins.cjs");
const { safeCachedAvatar, safeAvatarDataUrl } = require("./avatar.cjs");

function publicPeople(data, entries) {
  return entries.map((entry) => {
    const account = data.accounts.find((a) => a.steamId === entry.steamId);
    return {
      steamId: entry.steamId,
      avatar:
        safeCachedAvatar(account?.avatar) || safeAvatarDataUrl(entry.avatar),
      ...(account
        ? {
            accountId: account.id,
            name: account.name,
            autoAcceptGifts: account.autoAcceptGifts === true,
          }
        : {}),
    };
  });
}
function saveAdmins(data, entries) {
  const previous = new Map(
    (data.steamAdmins || []).map((entry) => [entry.steamId, entry]),
  );
  // The renderer chooses identities, never a remote avatar URL or a trusted name.
  data.steamAdmins = normalizeSteamAdmins(entries).map(({ steamId }) => {
    const account = data.accounts.find((a) => a.steamId === steamId);
    const avatar =
      safeCachedAvatar(account?.avatar) ||
      safeAvatarDataUrl(previous.get(steamId)?.avatar);
    return { steamId, ...(avatar ? { avatar } : {}) };
  });
}
function warehouseConflict(data, ids, payload) {
  if (payload.autoAcceptGifts !== false) return null;
  if (
    payload.warehouseAction !== undefined &&
    !["remove", "disable"].includes(payload.warehouseAction)
  )
    throw Error(localeText.message_e620d36);
  const warehouses = new Set(lootWarehouseEntries(data).map((w) => w.steamId));
  const selected = new Set(ids);
  const conflicts = data.accounts.filter(
    (a) => selected.has(a.id) && warehouses.has(a.steamId),
  );
  if (!conflicts.length || payload.warehouseAction) return null;
  return {
    warehouseConflict: conflicts.map(({ id, steamId, name }) => ({
      id,
      steamId,
      name,
    })),
  };
}
function applyWarehouseChoice(data, ids, payload) {
  if (
    payload.autoAcceptGifts !== false ||
    payload.warehouseAction !== "remove" ||
    !data.loot
  )
    return;
  const selected = new Set(ids);
  const steamIds = new Set(
    data.accounts.filter((a) => selected.has(a.id)).map((a) => a.steamId),
  );
  for (const scheme of ensureLootSchemes(data).schemes) {
    scheme.settings.warehouses = scheme.settings.warehouses.filter(
      (w) => !steamIds.has(w.steamId),
    );
    if (!scheme.settings.warehouses.length) scheme.settings.enabled = false;
  }
}
function planLootSettings(data, input, schemeId) {
  if (schemeId !== undefined) findLootScheme(data, schemeId);
  const settings = normalizeLootSettings(input);
  const explicitSources = [
    ...settings.sources.accountIds,
    ...settings.warehouses.flatMap((w) => w.allowedSenders.accountIds),
  ];
  if (
    explicitSources.some((id) => {
      const account = data.accounts.find((a) => a.id === id);
      return account && lootCommunityBanned(data, account.steamId);
    })
  )
    throw Error(localeText.message_c34acbc);
  if (settings.warehouses.some((w) => lootCommunityBanned(data, w.steamId)))
    throw Error(localeText.message_a62a600);
  if (
    settings.enabled &&
    (!settings.warehouses.length ||
      (!settings.sources.all &&
        !settings.sources.groupIds.length &&
        !settings.sources.accountIds.length))
  )
    throw Error(localeText.message_3aa0fdc);
  if (
    settings.sources.accountIds.some(
      (id) => !data.accounts.some((a) => a.id === id),
    ) ||
    settings.sources.groupIds.some(
      (id) => !data.groups.some((g) => g.id === id),
    )
  )
    throw Error(localeText.message_f72f5ca);
  for (const warehouse of settings.warehouses) {
    const allowed = warehouse.allowedSenders;
    if (
      allowed &&
      (allowed.accountIds.some(
        (id) => !data.accounts.some((a) => a.id === id),
      ) ||
        allowed.groupIds.some((id) => !data.groups.some((g) => g.id === id)))
    )
      throw Error(localeText.message_1bc46ff);
  }
  const previous = new Map();
  for (const warehouse of lootWarehouseEntries(data)) {
    if (!previous.has(warehouse.steamId) || safeAvatarDataUrl(warehouse.avatar))
      previous.set(warehouse.steamId, warehouse);
  }
  const enableIds = [];
  settings.warehouses = settings.warehouses.map((warehouse) => {
    const account = data.accounts.find((a) => a.steamId === warehouse.steamId);
    if (account && !previous.has(warehouse.steamId)) enableIds.push(account.id);
    const avatar =
      safeCachedAvatar(account?.avatar) ||
      safeAvatarDataUrl(previous.get(warehouse.steamId)?.avatar);
    const { avatar: _untrustedAvatar, ...safe } = warehouse;
    return { ...safe, ...(avatar ? { avatar } : {}) };
  });
  return { settings, enableIds };
}
module.exports = {
  publicPeople,
  saveAdmins,
  warehouseConflict,
  applyWarehouseChoice,
  planLootSettings,
};
