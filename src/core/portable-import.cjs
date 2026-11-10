"use strict";
const localeText = require("../locales/application.json");
const { randomUUID } = require("node:crypto");
const { mergeTradeJournals } = require("./trade-offers.cjs");
const { label } = require("./model.cjs");
function invalid() {
  throw new Error(localeText.validationMessage_db74a6f);
}
function indexRows(rows) {
  if (!Array.isArray(rows)) invalid();
  const index = new Map();
  for (const row of rows) {
    if (
      !row ||
      typeof row.id !== "string" ||
      !row.id ||
      row.id.length > 128 ||
      index.has(row.id)
    )
      invalid();
    index.set(row.id, row);
  }
  return index;
}
function refs(ids, index, limit) {
  if (
    !Array.isArray(ids) ||
    ids.length > limit ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string" || !index.has(id))
  )
    invalid();
  return ids;
}
function uniqueName(raw, used) {
  const base = label(raw);
  let candidate = base,
    number = 2;
  while (used.has(candidate.toLocaleLowerCase())) {
    const suffix = ` (${number++})`;
    candidate = base.slice(0, 120 - suffix.length).trimEnd() + suffix;
  }
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}
function mergeJournal(...sources) {
  const byRequest = new Map();
  for (const source of sources) {
    if (source === undefined) continue;
    if (!Array.isArray(source)) invalid();
    for (const row of source) {
      if (!row || typeof row.requestId !== "string") invalid();
      const copy = {
        requestId: row.requestId,
        confirmationId: row.confirmationId,
        fingerprint: row.fingerprint,
        decision: row.decision,
        state: row.state,
        createdAt: row.createdAt,
      };
      const prior = byRequest.get(copy.requestId);
      if (prior) {
        if (
          prior.confirmationId !== copy.confirmationId ||
          prior.fingerprint !== copy.fingerprint ||
          prior.decision !== copy.decision ||
          prior.createdAt !== copy.createdAt
        )
          invalid();
        if (copy.state === "acknowledged") prior.state = "acknowledged";
      } else byRequest.set(copy.requestId, copy);
    }
  }
  if (byRequest.size > 10000) invalid();
  return [...byRequest.values()];
}
function planPortableImport(data, bundle, { duplicatePolicy = "skip" } = {}) {
  if (!["skip", "replace", "merge"].includes(duplicatePolicy)) invalid();
  // The export codec owns the exact envelope/account/maFile/session whitelist.
  // It performs bounded validation and returns a detached canonical bundle.
  const { validatePortable } = require("./export.cjs");
  const incoming = validatePortable(bundle);
  const accountsById = indexRows(incoming.accounts),
    groupsById = indexRows(incoming.groups),
    proxiesById = indexRows(incoming.proxies),
    listsById = indexRows(incoming.proxyLists);
  if (!incoming.includeProxies && (proxiesById.size || listsById.size))
    invalid();
  for (const list of listsById.values()) refs(list.proxyIds, proxiesById, 2000);
  for (const owner of [...accountsById.values(), ...groupsById.values()]) {
    refs(owner.proxyIds, proxiesById, 2000);
    refs(owner.proxyListIds, listsById, 100);
    if (
      !incoming.includeProxies &&
      (owner.proxyIds.length || owner.proxyListIds.length)
    )
      invalid();
  }
  const children = new Map(),
    roots = [];
  for (const group of groupsById.values()) {
    if (
      group.parentId !== null &&
      (typeof group.parentId !== "string" ||
        !groupsById.has(group.parentId) ||
        group.parentId === group.id)
    )
      invalid();
    if (group.parentId === null) roots.push(group.id);
    else {
      const list = children.get(group.parentId) || [];
      list.push(group.id);
      children.set(group.parentId, list);
    }
  }
  const ordered = [];
  for (let cursor = 0; cursor < roots.length; cursor++) {
    const id = roots[cursor];
    ordered.push(groupsById.get(id));
    roots.push(...(children.get(id) || []));
  }
  if (ordered.length !== groupsById.size) invalid();
  for (const account of accountsById.values())
    if (account.groupId !== null && !groupsById.has(account.groupId)) invalid();
  const existing = new Map((data.accounts || []).map((a) => [a.steamId, a]));
  const neededGroups = new Set(),
    neededProxies = new Set(),
    neededLists = new Set();
  const routed = [...accountsById.values()].filter(
    (a) => !existing.has(a.steamId) || duplicatePolicy === "replace",
  );
  for (const a of routed.flatMap((account) =>
    account.proxyAllocation?.groupId
      ? [account, { groupId: account.proxyAllocation.groupId }]
      : [account],
  )) {
    let id = a.groupId;
    while (id) {
      neededGroups.add(id);
      id = groupsById.get(id).parentId;
    }
  }
  for (const o of [
    ...routed,
    ...[...groupsById.values()].filter((g) => neededGroups.has(g.id)),
  ]) {
    o.proxyIds.forEach((id) => neededProxies.add(id));
    o.proxyListIds.forEach((id) => neededLists.add(id));
  }
  for (const id of neededLists)
    listsById.get(id).proxyIds.forEach((id) => neededProxies.add(id));
  for (const id of groupsById.keys())
    if (!neededGroups.has(id)) groupsById.delete(id);
  for (const id of proxiesById.keys())
    if (!neededProxies.has(id)) proxiesById.delete(id);
  for (const id of listsById.keys())
    if (!neededLists.has(id)) listsById.delete(id);
  if ((data.proxyLists || []).length + listsById.size > 2000) invalid();
  const groupMap = new Map(
    [...groupsById.keys()].map((id) => [id, randomUUID()]),
  );
  const proxyMap = new Map(
    [...proxiesById.keys()].map((id) => [id, randomUUID()]),
  );
  const listMap = new Map(
    [...listsById.keys()].map((id) => [id, randomUUID()]),
  );
  const route = (owner) => ({
    proxyIds: owner.proxyIds.map((id) => proxyMap.get(id)),
    proxyListIds: owner.proxyListIds.map((id) => listMap.get(id)),
  });
  const proxyNames = new Set(
    (data.proxies || []).map((p) => p.name.toLocaleLowerCase()),
  );
  const proxies = [...proxiesById.values()].map((p) => ({
    id: proxyMap.get(p.id),
    name: uniqueName(p.name, proxyNames),
    url: p.url,
  }));
  const listNames = new Set(
    (data.proxyLists || []).map((p) => p.name.toLocaleLowerCase()),
  );
  const proxyLists = [...listsById.values()].map((list) => ({
    id: listMap.get(list.id),
    name: uniqueName(list.name, listNames),
    proxyIds: list.proxyIds.map((id) => proxyMap.get(id)),
  }));
  const siblingNames = new Map();
  for (const group of data.groups || []) {
    const key = group.parentId || null;
    const names = siblingNames.get(key) || new Set();
    names.add(group.name.toLocaleLowerCase());
    siblingNames.set(key, names);
  }
  const groups = ordered
    .filter((g) => groupsById.has(g.id))
    .map((group) => {
      const parentId =
        group.parentId === null ? null : groupMap.get(group.parentId);
      const names = siblingNames.get(parentId) || new Set();
      siblingNames.set(parentId, names);
      return {
        id: groupMap.get(group.id),
        name: uniqueName(group.name, names),
        parentId,
        ...route(group),
      };
    });

  const accounts = [],
    retiredConfirmationJournals = {};
  const retiredTradeOfferJournals = {};
  const updates = [];
  let duplicates = 0,
    updated = 0,
    enriched = 0;
  for (const source of accountsById.values()) {
    const prior = existing.get(source.steamId);
    if (prior) duplicates++;
    const tradeHistory = mergeTradeJournals(
      data.retiredTradeOfferJournals?.[source.steamId],
      prior?.tradeOfferJournal,
      incoming.retiredTradeOfferJournals?.[source.steamId],
      source.tradeOfferJournal,
    );
    if (tradeHistory.length)
      retiredTradeOfferJournals[source.steamId] = structuredClone(tradeHistory);
    const history = mergeJournal(
      data.retiredConfirmationJournals?.[source.steamId],
      prior?.confirmationJournal,
      incoming.retiredConfirmationJournals?.[source.steamId],
      source.confirmationJournal,
    );
    if (history.length)
      retiredConfirmationJournals[source.steamId] = structuredClone(history);
    if (prior && duplicatePolicy !== "replace") {
      const patch = {};
      if (tradeHistory.length) patch.tradeOfferJournal = tradeHistory;
      if (duplicatePolicy === "merge") {
        if (
          prior.mafile?.account_name?.toLowerCase() !==
          source.mafile.account_name.toLowerCase()
        )
          invalid();
        if (
          prior.mafile?.shared_secret &&
          source.mafile.shared_secret &&
          prior.mafile.shared_secret !== source.mafile.shared_secret
        )
          invalid();
        for (const key of [
          "loginPassword",
          "avatar",
          "note",
          "deviceName",
          "browserProfile",
          "browserSession",
        ])
          if (!prior[key] && source[key] !== undefined)
            patch[key] = structuredClone(source[key]);
        const m = structuredClone(prior.mafile);
        if (!m.ImportedRefreshToken && source.mafile.ImportedRefreshToken)
          m.ImportedRefreshToken = source.mafile.ImportedRefreshToken;
        for (const key of ["identity_secret", "device_id"])
          if (m[key] && source.mafile[key] && m[key] !== source.mafile[key])
            invalid();
        for (const key of ["shared_secret", "identity_secret", "device_id"])
          if (!m[key] && source.mafile[key]) m[key] = source.mafile[key];
        const tokens = (s) =>
          s &&
          (s.AccessToken ||
            s.RefreshToken ||
            s.access_token ||
            s.refresh_token);
        if (!tokens(m.Session) && source.mafile.Session)
          m.Session = structuredClone(source.mafile.Session);
        if (source.mafile.ExternalSessions) {
          m.ExternalSessions ||= {};
          for (const [key, value] of Object.entries(
            source.mafile.ExternalSessions,
          ))
            if (!m.ExternalSessions[key]) m.ExternalSessions[key] = value;
        }
        if (JSON.stringify(m) !== JSON.stringify(prior.mafile))
          patch.mafile = m;
        if (Object.keys(patch).length) enriched++;
      }
      if (
        history.length &&
        JSON.stringify(history) !== JSON.stringify(prior.confirmationJournal)
      )
        patch.confirmationJournal = history;
      if (Object.keys(patch).length)
        updates.push({ id: prior.id, account: patch });
      continue;
    }
    const account = {
      id: prior ? prior.id : randomUUID(),
      name: source.name,
      steamId: source.steamId,
      groupId: source.groupId === null ? null : groupMap.get(source.groupId),
      ...route(source),
      inheritProxy: incoming.includeProxies ? source.inheritProxy : false,

      mafile: structuredClone(source.mafile),

      autoMarket: false,
      autoTrades: false,
      autoMarketPurchases: false,
      checkConfirmations: false,
      watchIncomingTrades: false,
      autoAcceptGifts: false,
      functionIntervalsSeconds: structuredClone(
        source.functionIntervalsSeconds || {},
      ),
      notifyConfirmations: source.notifyConfirmations,
      confirmationIntervalSeconds: source.confirmationIntervalSeconds,
    };
    if (incoming.includeProxies && source.proxyAllocation)
      account.proxyAllocation = {
        groupId:
          source.proxyAllocation.groupId === null
            ? null
            : groupMap.get(source.proxyAllocation.groupId),
        listIds: source.proxyAllocation.listIds.map((id) => listMap.get(id)),
        proxyIds: source.proxyAllocation.proxyIds.map((id) => proxyMap.get(id)),
        ...(source.proxyAllocation.backupProxyIds
          ? {
              backupProxyIds: source.proxyAllocation.backupProxyIds.map((id) =>
                proxyMap.get(id),
              ),
            }
          : {}),
      };
    if (source.deviceName !== undefined) account.deviceName = source.deviceName;
    if (source.browserProfile !== undefined)
      account.browserProfile = structuredClone(source.browserProfile);
    else if (prior?.browserProfile)
      account.browserProfile = structuredClone(prior.browserProfile);
    if (source.browserSession !== undefined)
      account.browserSession = structuredClone(source.browserSession);
    else if (prior?.browserSession)
      account.browserSession = structuredClone(prior.browserSession);
    if (source.note !== undefined) account.note = source.note;
    if (source.loginPassword !== undefined)
      account.loginPassword = source.loginPassword;
    if (source.avatar)
      account.avatar = {
        dataUrl: source.avatar.dataUrl,
        updatedAt: source.avatar.updatedAt,
      };
    if (history.length) account.confirmationJournal = history;
    if (tradeHistory.length) account.tradeOfferJournal = tradeHistory;
    if (prior) {
      updates.push({ id: prior.id, account });
      updated++;
    } else accounts.push(account);
  }
  return {
    accounts,
    groups,
    proxies,
    proxyLists,
    duplicates,
    updates,
    updated,
    enriched,
    ...(Object.keys(retiredTradeOfferJournals).length
      ? { retiredTradeOfferJournals }
      : {}),
    ...(Object.keys(retiredConfirmationJournals).length
      ? { retiredConfirmationJournals }
      : {}),
  };
}
module.exports = { planPortableImport };
