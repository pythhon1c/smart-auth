"use strict";
const localeText = require("../locales/application.json");

// Plans credential enrichment separately from authenticator insertion. Nothing
// returned by this function is a renderer DTO: callers must whitelist previews.
const loginOf = (account) =>
  String(account.mafile?.account_name || account.name || "").toLowerCase();
const hasPassword = (account) =>
  typeof account.loginPassword === "string" && account.loginPassword.length > 0;
function planAccountImport(data, prepared) {
  const existingById = new Map(data.accounts.map((a) => [a.steamId, a]));
  const rows = [],
    errors = [...(prepared.errors || [])],
    updates = [];
  const targets = [...data.accounts],
    candidates = new Map(),
    rejected = new Set();
  let passwordConflicts = Number.isInteger(prepared.passwordConflicts)
    ? prepared.passwordConflicts
    : 0;
  function reject(account, reason) {
    if (!rejected.has(account.id)) {
      rejected.add(account.id);
      passwordConflicts++;
      if (errors.length < 1000)
        errors.push({ source: localeText.accountPasswords, reason });
    }
    candidates.delete(account.id);
  }
  function offer(account, password) {
    if (
      typeof password !== "string" ||
      !password.length ||
      password.length > 4096 ||
      rejected.has(account.id)
    )
      return;
    const prior = candidates.get(account.id);
    if (
      (hasPassword(account) && account.loginPassword !== password) ||
      (prior !== undefined && prior !== password)
    ) {
      reject(
        account,
        localeText.conflictingPasswordsTheSavedPasswordWasNotChanged,
      );
      return;
    }
    candidates.set(account.id, password);
  }
  for (const entry of prepared.accounts || []) {
    const incoming = entry.account,
      existing = existingById.get(incoming.steamId);
    if (existing) {
      const compatible =
        loginOf(existing) === loginOf(incoming) &&
        existing.mafile.shared_secret === incoming.mafile.shared_secret &&
        !(
          existing.mafile.identity_secret &&
          incoming.mafile.identity_secret &&
          existing.mafile.identity_secret !== incoming.mafile.identity_secret
        ) &&
        !(
          existing.mafile.device_id &&
          incoming.mafile.device_id &&
          existing.mafile.device_id !== incoming.mafile.device_id
        );
      rows.push({ ...entry, account: existing, duplicate: true });
      if (!compatible)
        reject(
          existing,
          localeText.authenticatorDoesNotMatchTheExistingAccountPasswordUnchanged,
        );
      else offer(existing, incoming.loginPassword);
    } else {
      const account = { ...incoming };
      delete account.loginPassword;
      targets.push(account);
      existingById.set(account.steamId, account);
      rows.push({ ...entry, account, duplicate: false });
      offer(account, incoming.loginPassword);
    }
  }
  const byLogin = new Map();
  for (const account of targets) {
    const key = loginOf(account),
      list = byLogin.get(key) || [];
    list.push(account);
    byLogin.set(key, list);
  }
  for (const credential of prepared.credentials || []) {
    const matches =
      byLogin.get(String(credential.login || "").toLowerCase()) || [];
    if (
      matches.length !== 1 ||
      (credential.steamId && matches[0].steamId !== credential.steamId)
    ) {
      if (errors.length < 1000)
        errors.push({
          source: localeText.accountPasswords,
          reason: localeText.loginHasNoUniqueMatchingAccountPasswordNotImported,
        });
      passwordConflicts++;
      continue;
    }
    const account = matches[0];
    offer(account, credential.loginPassword);
    if (!rows.some((row) => row.account.id === account.id))
      rows.push({
        account,
        duplicate: true,
        source: localeText.accountPasswords,
      });
  }
  for (const account of targets) {
    const password = candidates.get(account.id);
    if (password !== undefined && !hasPassword(account))
      updates.push({ id: account.id, loginPassword: password });
  }
  const updateIds = new Set(updates.map((u) => u.id));
  for (const row of rows) {
    row.hasPassword = hasPassword(row.account) || updateIds.has(row.account.id);
    row.passwordChange = updateIds.has(row.account.id) ? "added" : "none";
  }
  return {
    rows,
    updates,
    errors,
    counts: {
      ready: rows.filter((row) => !row.duplicate).length,
      duplicates: rows.filter((row) => row.duplicate).length,
      invalid: errors.length,
      passwordAdded: updates.length,
      passwordConflicts,
    },
  };
}
// Optional fields belong exclusively to the single-maFile workflow. This
// validation runs before opening a dialog and never includes supplied secrets.
function singleImportDetails(p) {
  const supplied = (key) => p[key] !== undefined && p[key] !== "";
  if (p.mode !== "single") {
    if (["loginPassword", "proxyText", "proxyProtocol"].some(supplied))
      throw Error(localeText.singleAccountDetailsOnly);
    return null;
  }
  if (
    p.loginPassword !== undefined &&
    (typeof p.loginPassword !== "string" ||
      p.loginPassword.length > 4096 ||
      /[\r\n\0]/.test(p.loginPassword))
  )
    throw Error(localeText.invalidImportPassword);
  if (p.proxyText !== undefined && typeof p.proxyText !== "string")
    throw Error(localeText.enterOneProxyInASupportedFormat);
  if (
    p.proxyProtocol !== undefined &&
    !["http", "https", "socks5"].includes(p.proxyProtocol)
  )
    throw Error(localeText.enterOneProxyInASupportedFormat);
  let dedicatedProxy = null;
  if (p.proxyText?.trim()) {
    const { parseManualProxy } = require("./account-proxies.cjs");
    dedicatedProxy = {
      url: parseManualProxy(p.proxyText, p.proxyProtocol || "http"),
    };
  }
  return { loginPassword: p.loginPassword || "", dedicatedProxy };
}
function prepareSingleAccountImport(paths, details) {
  const prepared = require("./imports.cjs").prepareAccounts({
    paths,
    format: "sda",
    mode: "single",
    singleMafile: true,
  });
  if (prepared.errors.length || prepared.accounts.length !== 1)
    throw Error(localeText.singleMafileRequired);
  if (details.loginPassword) {
    prepared.accounts[0].account.loginPassword = details.loginPassword;
    // The explicit field replaces an embedded password for this one new
    // account; existing saved passwords still use the normal conflict policy.
    prepared.credentials = [];
  }
  return prepared;
}
module.exports = {
  planAccountImport,
  hasPassword,
  singleImportDetails,
  prepareSingleAccountImport,
};
