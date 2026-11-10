"use strict";
const MAX_PASSWORD = 4096;
function loginKey(login) {
  return typeof login === "string" && /^[a-z0-9_]{1,64}$/i.test(login)
    ? login.toLowerCase()
    : null;
}
function passwords(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return [
    value.SteamPassword,
    value.AccountData?.Password,
    value.session?.Password,
    value.Session?.Password,
    value.Password,
    value.password,
  ].filter(
    (v) =>
      typeof v === "string" &&
      v.length > 0 &&
      v.length <= MAX_PASSWORD &&
      !/[\r\n\0]/.test(v),
  );
}
function credential(value) {
  const login =
    value?.account_name ??
    value?.SteamLogin ??
    value?.AccountData?.Username ??
    value?.Username ??
    value?.login ??
    value?.Login ??
    value?.session?.Username;
  const key = loginKey(login);
  const id =
    value.Session?.SteamID ??
    value.steamid ??
    value.steam_id ??
    value.Steamid ??
    value.AccountData?.SteamID ??
    value.SteamID ??
    value.SteamId;
  const steamId =
    typeof id === "string" && /^765\d{14}$/.test(id) ? id : undefined;
  return key
    ? passwords(value).map((loginPassword) => ({
        login,
        loginPassword,
        ...(steamId ? { steamId } : {}),
      }))
    : [];
}
function textCredentials(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length > 10000) throw Error("limit");
  const result = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw Error("format");
    const fields = line.split(":");
    const mailExport =
      fields.length === 4 && /^[^\s:@]+@[^\s:@]+\.[^\s:@]+$/.test(fields[2]);
    const login = line.slice(0, colon),
      loginPassword = mailExport ? fields[1] : line.slice(colon + 1);
    if (
      /^(login|username|account)$/i.test(login) &&
      /^(password|pass)$/i.test(loginPassword)
    )
      continue;
    if (
      !loginKey(login) ||
      !loginPassword ||
      loginPassword.length > MAX_PASSWORD ||
      /[\r\n\0]/.test(loginPassword)
    )
      throw Error("format");
    result.push({ login, loginPassword });
  }
  if (!result.length) throw Error("format");
  return result;
}
module.exports = { loginKey, credential, textCredentials };
