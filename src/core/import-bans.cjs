"use strict";
const localeText = require("../locales/application.json");
const { normalizeAccountBans } = require("./account-bans.cjs");
function normalizeImportBanOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw Error(localeText.message_669ba6a);
  for (const key of ["skipVacBanned", "skipCommunityBanned"])
    if (options[key] !== undefined && typeof options[key] !== "boolean")
      throw Error(localeText.message_669ba6a);
  return {
    skipVacBanned: options.skipVacBanned === true,
    skipCommunityBanned: options.skipCommunityBanned === true,
  };
}
const loginOf = (account) =>
  String(account.mafile?.account_name || account.name || "").toLowerCase();
function resolvedBans(data, supplied = {}) {
  if (
    !supplied ||
    typeof supplied !== "object" ||
    Array.isArray(supplied) ||
    Object.keys(supplied).length > 10000
  )
    throw Error(localeText.message);
  const evidence = new Map();
  const add = (id, bans) => {
    if (bans === undefined) return;
    if (!/^765\d{14}$/.test(id)) throw Error(localeText.message);
    const list = evidence.get(id) || [];
    list.push(normalizeAccountBans(bans));
    evidence.set(id, list);
  };
  for (const [id, bans] of Object.entries(supplied)) add(id, bans);
  for (const account of data.accounts || []) add(account.steamId, account.bans);
  const result = Object.create(null);
  for (const [id, list] of evidence) {
    const ordered = [...list].sort(
      (a, b) => (Date.parse(b.checkedAt) || 0) - (Date.parse(a.checkedAt) || 0),
    );
    const merged = { ...ordered[0] };
    const selectedEvidence = [];
    for (const flag of ["vac", "community", "game"]) {
      const selected =
        ordered.find((b) => b[flag] === true) ||
        ordered.find((b) => b[flag] !== null);
      merged[flag] = selected?.[flag] ?? null;
      if (selected) selectedEvidence.push(selected);
    }
    // A partial import cannot make retained local ban knowledge look freshly
    // checked. The shared timestamp represents the oldest retained evidence.
    if (selectedEvidence.length)
      merged.checkedAt = selectedEvidence.reduce((oldest, bans) =>
        (Date.parse(bans.checkedAt) || 0) < (Date.parse(oldest.checkedAt) || 0)
          ? bans
          : oldest,
      ).checkedAt;
    if (list.some((b) => b.source !== merged.source)) merged.source = "mixed";
    result[id] = merged;
  }
  return result;
}
function classify(ids, options, evidence) {
  const banFilter = {
      skippedVac: 0,
      skippedCommunity: 0,
      unknown: 0,
      checked: 0,
    },
    rejected = new Set();
  const flags = [
    ...(options.skipVacBanned ? ["vac"] : []),
    ...(options.skipCommunityBanned ? ["community"] : []),
  ];
  for (const id of ids) {
    const bans = evidence[id],
      vac = options.skipVacBanned && bans?.vac === true,
      community = options.skipCommunityBanned && bans?.community === true;
    if (vac) banFilter.skippedVac++;
    if (community) banFilter.skippedCommunity++;
    if (vac || community) rejected.add(id);
    if (
      flags.length &&
      flags.every((flag) => typeof bans?.[flag] === "boolean")
    )
      banFilter.checked++;
    else if (flags.length && !vac && !community) banFilter.unknown++;
  }
  return { banFilter, rejected };
}
function filterAccountImportBans(data, input, rawOptions, bansBySteamId) {
  const options = normalizeImportBanOptions(rawOptions),
    evidence = resolvedBans(data, bansBySteamId);
  const all = [
    ...(data.accounts || []),
    ...(input.accounts || []).map((row) => row.account),
  ];
  const ids = new Set((input.accounts || []).map((row) => row.account.steamId));
  for (const credential of input.credentials || [])
    for (const account of all)
      if (
        credential.steamId
          ? credential.steamId === account.steamId
          : String(credential.login || "").toLowerCase() === loginOf(account)
      )
        ids.add(account.steamId);
  const { banFilter, rejected } = classify(ids, options, evidence);
  const filtered = {
    ...input,
    accounts: (input.accounts || []).filter(
      (row) => !rejected.has(row.account.steamId),
    ),
    credentials: (input.credentials || []).filter((credential) => {
      if (credential.steamId && rejected.has(credential.steamId)) return false;
      return !all.some(
        (account) =>
          rejected.has(account.steamId) &&
          loginOf(account) === String(credential.login || "").toLowerCase(),
      );
    }),
  };
  return { input: filtered, banFilter, bansBySteamId: evidence };
}
function filterPortableImportBans(data, bundle, rawOptions, bansBySteamId) {
  const options = normalizeImportBanOptions(rawOptions),
    evidence = resolvedBans(data, bansBySteamId);
  const { banFilter, rejected } = classify(
    new Set(bundle.accounts.map((a) => a.steamId)),
    options,
    evidence,
  );
  const filtered = {
    ...bundle,
    accounts: bundle.accounts.filter((a) => !rejected.has(a.steamId)),
  };
  for (const key of [
    "retiredConfirmationJournals",
    "retiredTradeOfferJournals",
  ])
    if (bundle[key])
      filtered[key] = Object.fromEntries(
        Object.entries(bundle[key]).filter(([id]) => !rejected.has(id)),
      );
  return {
    bundle: filtered,
    banFilter,
    bansBySteamId: evidence,
    skippedSteamIds: [...rejected],
  };
}
function applyImportedBans(accounts, evidence) {
  for (const account of accounts)
    if (evidence[account.steamId])
      account.bans = structuredClone(evidence[account.steamId]);
}
module.exports = {
  normalizeImportBanOptions,
  filterAccountImportBans,
  filterPortableImportBans,
  applyImportedBans,
};
