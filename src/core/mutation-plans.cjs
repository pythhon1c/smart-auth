"use strict";
const localeText = require("../locales/application.json");
// Pure drafts for account/group mutations. The main process owns consent,
// freshness, persistence, network invalidation and private import lifetimes.
const model = require("./model.cjs");
const { planAccountImport } = require("./account-import.cjs");
const { planPortableImport } = require("./portable-import.cjs");
const { assertTradeBotsAssociations } = require("./trade-bots-adapter.cjs");
const {
  filterAccountImportBans,
  filterPortableImportBans,
  applyImportedBans,
} = require("./import-bans.cjs");

const ALLOCATION_ACTIONS = new Set([
  "addGroup",
  "updateGroup",
  "updateAccount",
  "moveAccounts",
  "commitAccountImport",
  "commitPortableImport",
]);
function uniqueGroupName(data, desired) {
  const base =
    String(desired || localeText.import)
      .trim()
      .slice(0, 100) || localeText.import;
  let name = base,
    suffix = 2;
  while (
    data.groups.some(
      (g) =>
        !g.parentId && g.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    name = `${base} (${suffix++})`;
  return name;
}
function selected(data, ids) {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 5000 ||
    new Set(ids).size !== ids.length
  )
    throw Error(localeText.invalidAccountList);
  return ids.map((id) => model.item(data.accounts, id, localeText.account));
}
function descendants(data, account, id) {
  const seen = new Set();
  let current = account.groupId;
  while (current && !seen.has(current)) {
    if (current === id) return true;
    seen.add(current);
    current = data.groups.find((g) => g.id === current)?.parentId;
  }
  return false;
}
function overrideImportedRoutes(data, accounts, p, groupId) {
  const explicit = p.proxyListIds !== undefined || p.proxyIds !== undefined;
  if (!explicit) return;
  const proxyIds = model.routeIds(data, p.proxyIds || []);
  const proxyListIds = model.listIds(data, p.proxyListIds || []);
  if (groupId) {
    const group = model.item(data.groups, groupId, localeText.folder);
    group.proxyIds = [...proxyIds];
    group.proxyListIds = [...proxyListIds];
  }
  for (const a of accounts) {
    a.proxyIds = [...proxyIds];
    a.proxyListIds = [...proxyListIds];
    a.inheritProxy = Boolean(groupId);
    delete a.proxyAllocation;
  }
}
function stageMutation(source, action, p, prepared = null) {
  if (!ALLOCATION_ACTIONS.has(action))
    throw Error(localeText.unknownProxyAllocationAction);
  if (p.redistribute !== undefined && typeof p.redistribute !== "boolean")
    throw Error(localeText.invalidAllocationOptions);
  const data = structuredClone(source);
  let ids = [],
    preferGroup = false,
    result = null,
    message = "",
    accountId = "";
  let networkChanged = true;
  switch (action) {
    case "addGroup":
    case "updateGroup": {
      const id = model.saveGroup(data, p, action === "addGroup");
      ids = data.accounts
        .filter((a) =>
          p.redistribute ? a.groupId === id : descendants(data, a, id),
        )
        .map((a) => a.id);
      preferGroup = true;
      message = localeText.folderSettingsUpdated;
      break;
    }
    case "updateAccount": {
      model.saveAccount(data, p);
      networkChanged = Object.keys(p).some(
        (key) => !["id", "name", "note"].includes(key),
      );
      if (networkChanged) ids = [p.id];
      preferGroup = p.groupId !== undefined && p.inheritProxy !== false;
      accountId = p.id;
      message = localeText.accountSettingsUpdated;
      break;
    }
    case "moveAccounts": {
      const accounts = selected(data, p.ids),
        groupId = p.groupId || null;
      if (groupId) model.item(data.groups, groupId, localeText.folder);
      for (const a of accounts) a.groupId = groupId;
      ids = accounts.map((a) => a.id);
      preferGroup = true;
      message = `${localeText.templateText_4fac456}${accounts.length}.`;
      break;
    }
    case "commitAccountImport": {
      if (!prepared?.input)
        throw Error(localeText.importPreviewExpiredSelectTheFilesAgain);
      const filtered = filterAccountImportBans(
        data,
        structuredClone(prepared.input),
        prepared.banOptions,
        prepared.bansBySteamId,
      );
      const plan = planAccountImport(data, filtered.input);
      applyImportedBans(
        plan.rows.map((row) => row.account),
        filtered.bansBySteamId,
      );
      const accounts = plan.rows
        .filter((row) => !row.duplicate)
        .map((row) => row.account);
      let groupId = prepared.groupId,
        groups = 0;
      if (groupId) model.item(data.groups, groupId, localeText.folder);
      if (accounts.length && prepared.groupName) {
        groupId = model.saveGroup(
          data,
          {
            name: uniqueGroupName(data, prepared.groupName),
            proxyIds: [],
            proxyListIds: [],
          },
          true,
        );
        groups = 1;
      }
      for (const a of accounts) {
        a.groupId = groupId;
        a.proxyListIds ||= [];
        model.restoreConfirmationHistory(data, a);
      }
      overrideImportedRoutes(data, accounts, p, groups ? groupId : null);
      data.accounts.push(...accounts);
      for (const update of plan.updates)
        model.item(data.accounts, update.id, localeText.account).loginPassword =
          update.loginPassword;
      ids = accounts.map((a) => a.id);
      result = {
        imported: accounts.length,
        duplicates: plan.counts.duplicates,
        groups,
        passwordAdded: plan.updates.length,
        passwordConflicts: plan.counts.passwordConflicts,
        banFilter: filtered.banFilter,
      };
      message = `${localeText.templateText_1b5388e}${accounts.length}${localeText.templateText_21a823a}${plan.counts.duplicates}${localeText.templateText_a4dbd5a}${plan.updates.length}.`;
      break;
    }
    case "commitPortableImport": {
      if (!prepared?.bundle)
        throw Error(localeText.theImportPreviewIsStaleStartTheImportAgain);
      if (prepared.format === "tbs")
        assertTradeBotsAssociations(data, prepared.bundle);
      if (prepared.destinationGroupId)
        model.item(data.groups, prepared.destinationGroupId, localeText.folder);
      const filtered = filterPortableImportBans(
        data,
        structuredClone(prepared.bundle),
        prepared.banOptions,
        prepared.bansBySteamId,
      );
      // Validate and merge all skipped financial evidence without importing
      // credentials, sessions, routes, or authenticator rows for those accounts.
      const evidencePlan = filtered.skippedSteamIds.length
        ? planPortableImport(data, structuredClone(prepared.bundle), {
            duplicatePolicy: "skip",
          })
        : null;
      const plan = planPortableImport(data, filtered.bundle, {
        duplicatePolicy: p.duplicatePolicy ?? "skip",
      });
      if (prepared.destinationGroupId) {
        for (const a of plan.accounts) {
          a.groupId = prepared.destinationGroupId;
          if (
            !a.proxyIds.length &&
            !a.proxyListIds.length &&
            !a.proxyAllocation
          )
            a.inheritProxy = true;
        }
        if (p.duplicatePolicy === "replace")
          for (const update of plan.updates)
            update.account.groupId = prepared.destinationGroupId;
      }
      const replacements = new Map(
        (plan.updates || []).map((u) => [u.id, u.account]),
      );
      for (const id of replacements.keys())
        model.item(data.accounts, id, localeText.account);
      data.accounts = data.accounts.map((a) => {
        const update = replacements.get(a.id);
        if (!update) return a;
        return p.duplicatePolicy === "replace"
          ? { ...update, id: a.id }
          : { ...a, ...update, id: a.id };
      });
      data.accounts.push(...plan.accounts);
      const incomingIds = new Set(
        filtered.bundle.accounts.map((account) => account.steamId),
      );
      applyImportedBans(
        data.accounts.filter((account) => incomingIds.has(account.steamId)),
        filtered.bansBySteamId,
      );
      data.groups.push(...plan.groups);
      data.proxies.push(...plan.proxies);
      data.proxyLists.push(...plan.proxyLists);
      if (plan.retiredConfirmationJournals)
        data.retiredConfirmationJournals = {
          ...(data.retiredConfirmationJournals || {}),
          ...plan.retiredConfirmationJournals,
        };
      if (plan.retiredTradeOfferJournals)
        data.retiredTradeOfferJournals = {
          ...(data.retiredTradeOfferJournals || {}),
          ...plan.retiredTradeOfferJournals,
        };
      if (evidencePlan) {
        const skipped = new Set(filtered.skippedSteamIds);
        for (const key of [
          "retiredConfirmationJournals",
          "retiredTradeOfferJournals",
        ])
          for (const [identity, entries] of Object.entries(
            evidencePlan[key] || {},
          ))
            if (skipped.has(identity)) {
              data[key] ||= {};
              data[key][identity] = structuredClone(entries);
            }
        for (const update of evidencePlan.updates) {
          const account = data.accounts.find(
            (account) => account.id === update.id,
          );
          if (!account || !skipped.has(account.steamId)) continue;
          for (const key of ["confirmationJournal", "tradeOfferJournal"])
            if (update.account[key])
              account[key] = structuredClone(update.account[key]);
        }
      }
      ids = [
        ...plan.accounts.map((a) => a.id),
        ...(p.duplicatePolicy === "replace" ? [...replacements.keys()] : []),
      ];
      overrideImportedRoutes(
        data,
        ids.map((id) => model.item(data.accounts, id, localeText.account)),
        p,
        null,
      );
      result = {
        imported: plan.accounts.length,
        duplicates: plan.duplicates,
        updated: plan.updated || 0,
        enriched: plan.enriched || 0,
        banFilter: filtered.banFilter,
      };
      message = `${localeText.templateText_99bab86}${prepared.format === "tbs" ? "Trade Bots System" : "smart-auth"}: ${plan.accounts.length}.`;
      break;
    }
  }
  return {
    data,
    accountIds: ids,
    preferGroup,
    result,
    message,
    accountId,
    networkChanged,
  };
}
module.exports = { ALLOCATION_ACTIONS, stageMutation };
