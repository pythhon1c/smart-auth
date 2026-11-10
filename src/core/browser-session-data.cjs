"use strict";
const localeText = require("../locales/application.json");
const { validRefresh, parseCookies } = require("./browser-auth.cjs");
// Storage validation deliberately ignores expiry. Expired sessions remain
// exportable and can be renewed by the authentication service on next use.
function normalizeBrowserSession(value, steamId) {
  const fail = () => {
    throw new Error(localeText.validationMessage_8097c2a);
  };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "version",
          "steamId",
          "platform",
          "refreshToken",
          "cookies",
          "updatedAt",
        ].includes(key),
    ) ||
    !/^765\d{14}$/.test(steamId) ||
    value.steamId !== steamId ||
    value.version !== 1 ||
    value.platform !== "WebBrowser" ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < 0 ||
    !validRefresh(value.refreshToken, steamId, -Infinity) ||
    !Array.isArray(value.cookies) ||
    !value.cookies.length ||
    value.cookies.length > 100 ||
    value.cookies.some(
      (cookie) =>
        typeof cookie !== "string" ||
        cookie.length > 65536 ||
        /[\r\n\0]/.test(cookie),
    ) ||
    value.cookies.reduce((length, cookie) => length + cookie.length, 0) >
      1024 * 1024
  )
    fail();
  parseCookies(value.cookies, steamId, -Infinity);
  return {
    version: 1,
    steamId,
    platform: "WebBrowser",
    refreshToken: value.refreshToken,
    cookies: [...value.cookies],
    updatedAt: value.updatedAt,
  };
}
module.exports = { normalizeBrowserSession };
