"use strict";
const localeText = require("../locales/application.json");
// Imported Desktop/Web credentials are inert auxiliary metadata. They are never
// supplied to Steam Mobile authentication or confirmation requests.
function validateExternalSessions(value, steamId) {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !["DesktopRefreshToken", "WebRefreshToken"].includes(k),
    )
  )
    throw Error(localeText.message_efe342b);
  const out = {};
  for (const key of ["DesktopRefreshToken", "WebRefreshToken"]) {
    const token = value[key];
    if (token === undefined || token === null || token === "") continue;
    if (typeof token !== "string" || token.length > 32768)
      throw Error(localeText.message_efe342b);
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p)))
      throw Error(localeText.message_efe342b);
    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {
      throw Error(localeText.message_efe342b);
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.sub !== steamId ||
      !/^765\d{14}$/.test(steamId) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= 0 ||
      !Array.isArray(payload.aud) ||
      !payload.aud.every((a) => typeof a === "string")
    )
      throw Error(localeText.message_efe342b);
    // Expiration is intentionally not a transfer filter; validity/login is not
    // inferred from decoded unsigned JWT metadata.
    out[key] = token;
  }
  return Object.keys(out).length ? out : undefined;
}
function mergeExternalSessions(...sources) {
  const out = {};
  for (const source of sources)
    for (const [key, value] of Object.entries(source || {})) {
      if (out[key] !== undefined && out[key] !== value)
        throw Error(localeText.message_71ef1cb);
      out[key] = value;
    }
  return Object.keys(out).length ? out : undefined;
}
module.exports = { validateExternalSessions, mergeExternalSessions };
