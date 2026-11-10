"use strict";
const localeText = require("../locales/application.json");
const { safeAvatarDataUrl } = require("./avatar.cjs");
const STEAM_ID_BASE = 76561197960265728n;
// Steam exposes trade partners as uint32 account IDs in the public individual
// universe. Never coerce numbers (17 decimal digits lose precision), trim text,
// or resolve profile names when deciding who may take this account's items.
function strictSteamId(value) {
  if (typeof value !== "string" || !/^765\d{14}$/.test(value)) return null;
  const id = BigInt(value);
  return id > STEAM_ID_BASE && id <= STEAM_ID_BASE + 4294967295n ? value : null;
}
function normalizeSteamAdmins(input) {
  if (!Array.isArray(input) || input.length > 10000)
    throw Error(localeText.message_7819c1f);
  const admins = new Map();
  for (const entry of input) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !Object.hasOwn(entry, "steamId") ||
      !strictSteamId(entry.steamId)
    )
      throw Error(localeText.message_4fd6170);
    const avatar = Object.hasOwn(entry, "avatar")
      ? safeAvatarDataUrl(entry.avatar)
      : null;
    admins.set(entry.steamId, {
      steamId: entry.steamId,
      ...(avatar ? { avatar } : {}),
    });
  }
  return [...admins.values()];
}
function isSteamAdmin(admins, steamId) {
  return (
    strictSteamId(steamId) !== null &&
    Array.isArray(admins) &&
    admins.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        Object.hasOwn(entry, "steamId") &&
        strictSteamId(entry.steamId) === steamId,
    )
  );
}
module.exports = { normalizeSteamAdmins, strictSteamId, isSteamAdmin };
