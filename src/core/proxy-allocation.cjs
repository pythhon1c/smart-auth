"use strict";
const localeText = require("../locales/application.json");
function proxyRouteKey(proxy) {
  try {
    return new URL(proxy.url).href;
  } catch {
    return proxy.url;
  }
}
const invalid = () => {
  throw Error(localeText.invalidProxyAllocationPrepareANewPreview);
};
function refs(values, index, limit) {
  if (
    !Array.isArray(values) ||
    values.length > limit ||
    new Set(values).size !== values.length ||
    Array.from(values).some((id) => typeof id !== "string" || !index.has(id))
  )
    invalid();
  return [...values];
}
function getProxyPool(data, account, { preferGroup = false } = {}) {
  const groups = new Map(data.groups.map((group) => [group.id, group]));
  if (
    !account.inheritProxy &&
    !preferGroup &&
    (!account.proxyAllocation || account.proxyAllocation.groupId === null)
  )
    return account.proxyListIds?.length
      ? {
          groupId: null,
          listIds: [...account.proxyListIds],
          proxyIds: [...(account.proxyIds || [])].filter(
            (id) =>
              ![
                ...(account.proxyAllocation?.proxyIds || []),
                ...(account.proxyAllocation?.backupProxyIds || []),
              ].includes(id),
          ),
        }
      : null;
  const visited = new Set();
  let groupId = account.groupId;
  while (groupId) {
    if (visited.has(groupId)) invalid();
    visited.add(groupId);
    const group = groups.get(groupId);
    if (!group) invalid();
    if (group.proxyListIds?.length || group.proxyIds?.length)
      return group.proxyListIds?.length
        ? {
            groupId: group.id,
            listIds: [...group.proxyListIds],
            proxyIds: [...(group.proxyIds || [])],
          }
        : null;
    groupId = group.parentId;
  }
  return null;
}
function allocationRoute(data, account, context = {}) {
  const allocation = account.proxyAllocation;
  if (
    !allocation ||
    typeof allocation !== "object" ||
    Array.isArray(allocation) ||
    !(allocation.groupId === null || typeof allocation.groupId === "string") ||
    !Array.isArray(allocation.listIds) ||
    !Array.isArray(allocation.proxyIds) ||
    (!allocation.listIds.length && !account.proxyIds?.length) ||
    allocation.listIds.length !== allocation.proxyIds.length
  )
    invalid();
  const lists =
    context.lists ||
    new Map((data.proxyLists || []).map((list) => [list.id, list]));
  const proxies =
    context.proxies || new Map(data.proxies.map((proxy) => [proxy.id, proxy]));
  refs(allocation.listIds, lists, 100);
  if (
    allocation.proxyIds.some(
      (id, i) =>
        typeof id !== "string" ||
        !proxies.has(id) ||
        !lists.get(allocation.listIds[i]).proxyIds.includes(id),
    )
  )
    invalid();
  const backups = refs(
    allocation.backupProxyIds === undefined ? [] : allocation.backupProxyIds,
    proxies,
    2000,
  );
  if (
    backups.some(
      (id) =>
        allocation.proxyIds.includes(id) ||
        !allocation.listIds.some((listId) =>
          lists.get(listId).proxyIds.includes(id),
        ) ||
        !account.proxyIds?.includes(id),
    )
  )
    invalid();
  if (
    account.inheritProxy ||
    JSON.stringify(account.proxyListIds || []) !==
      JSON.stringify(allocation.listIds) ||
    allocation.proxyIds.some((id) => !account.proxyIds?.includes(id))
  )
    invalid();
  return refs(account.proxyIds, proxies, 2000).map((id) => proxies.get(id));
}
function planProxyAllocation(
  data,
  {
    accountIds,
    redistribute = false,
    preferGroup = false,
    backupCounts = {},
  } = {},
) {
  const accounts = new Map(
    data.accounts.map((account) => [account.id, account]),
  );
  const proxies = new Map(data.proxies.map((proxy) => [proxy.id, proxy]));
  const lists = new Map((data.proxyLists || []).map((list) => [list.id, list]));
  refs(accountIds, accounts, 5000);
  if (typeof redistribute !== "boolean" || typeof preferGroup !== "boolean")
    invalid();
  if (
    !backupCounts ||
    typeof backupCounts !== "object" ||
    Array.isArray(backupCounts) ||
    Object.entries(backupCounts).some(
      ([id, count]) =>
        !lists.has(id) || !Number.isSafeInteger(count) || count < 0,
    )
  )
    invalid();
  const targets = [];
  const detached = [];
  for (const id of accountIds) {
    const account = accounts.get(id);
    if (
      preferGroup &&
      !redistribute &&
      !account.inheritProxy &&
      (!account.proxyAllocation ||
        (account.proxyAllocation.groupId === null &&
          account.proxyAllocation.listIds.length))
    )
      continue;
    const pool = getProxyPool(data, account, { preferGroup });
    if (
      !pool &&
      account.proxyAllocation &&
      (preferGroup || account.proxyAllocation.groupId !== null)
    ) {
      const visited = new Set();
      let ownerId = account.groupId,
        fallback = [];
      while (ownerId) {
        if (visited.has(ownerId)) invalid();
        visited.add(ownerId);
        const owner = data.groups.find((group) => group.id === ownerId);
        if (!owner) invalid();
        if (owner.proxyIds?.length) {
          fallback = refs(owner.proxyIds, proxies, 2000);
          break;
        }
        if (owner.proxyListIds?.length) break;
        ownerId = owner.parentId;
      }
      const update = {
        id: account.id,
        inheritProxy: false,
        proxyIds: fallback,
        proxyListIds: [],
        proxyAllocation: {
          groupId: account.groupId || null,
          listIds: [],
          proxyIds: [],
        },
      };
      if (
        JSON.stringify({
          proxyIds: account.proxyIds,
          proxyListIds: account.proxyListIds,
          proxyAllocation: account.proxyAllocation,
        }) !==
        JSON.stringify({
          proxyIds: update.proxyIds,
          proxyListIds: update.proxyListIds,
          proxyAllocation: update.proxyAllocation,
        })
      )
        detached.push(update);
      continue;
    }
    if (
      !pool ||
      (!redistribute &&
        !account.inheritProxy &&
        !account.proxyAllocation &&
        !account.proxyListIds?.length)
    )
      continue;
    refs(pool.listIds, lists, 100);
    refs(pool.proxyIds, proxies, 2000);
    let unchanged = false;
    if (
      !redistribute &&
      account.proxyAllocation &&
      account.proxyAllocation.groupId === pool.groupId &&
      JSON.stringify(account.proxyAllocation.listIds) ===
        JSON.stringify(pool.listIds)
    ) {
      try {
        allocationRoute(data, account, { lists, proxies });
        unchanged = true;
      } catch {}
    }
    if (
      unchanged &&
      JSON.stringify(account.proxyIds) !==
        JSON.stringify([
          ...new Set([
            ...account.proxyAllocation.proxyIds,
            ...(account.proxyAllocation.backupProxyIds || []),
            ...pool.proxyIds,
          ]),
        ])
    )
      unchanged = false;
    if (!unchanged) {
      const kept = new Map();
      if (!redistribute && account.proxyAllocation) {
        const prior = account.proxyAllocation;
        for (const id of pool.listIds) {
          const index = prior.listIds.indexOf(id),
            proxyId = prior.proxyIds[index];
          if (
            index >= 0 &&
            lists.get(id).proxyIds.includes(proxyId) &&
            account.proxyIds.includes(proxyId)
          )
            kept.set(id, proxyId);
        }
      }
      targets.push({
        account,
        pool,
        kept,
        keptBackups: !redistribute
          ? (account.proxyAllocation?.backupProxyIds || []).filter((id) =>
              pool.listIds.some((listId) =>
                lists.get(listId).proxyIds.includes(id),
              ),
            )
          : [],
      });
    }
  }
  const targetById = new Map(
    targets.map((target) => [target.account.id, target]),
  );
  const detachedById = new Map(detached.map((update) => [update.id, update]));
  const usage = new Map();
  const counters = new Map();
  for (const { pool } of targets)
    for (const id of pool.listIds)
      if (!usage.has(id)) {
        const list = lists.get(id),
          members = refs(list.proxyIds, proxies, 2000);
        usage.set(id, new Map(members.map((proxyId) => [proxyId, 0])));
        counters.set(id, {
          id,
          name: list.name,
          available: 0,
          required: 0,
          shortage: 0,
          reused: 0,
          ...(!members.length ? { blocked: true } : {}),
        });
      }
  for (const account of data.accounts) {
    const target = targetById.get(account.id);
    const detachedRoute = detachedById.get(account.id);
    let ids = target
      ? [
          ...target.kept.values(),
          ...target.keptBackups,
          ...target.pool.proxyIds,
        ]
      : detachedRoute
        ? detachedRoute.proxyIds
        : account.proxyIds || [];
    if (!target && !detachedRoute && account.inheritProxy) {
      const pool = getProxyPool(data, account);
      // Unallocated inherited pools must not reserve every member of a list.
      if (pool) ids = pool.proxyIds;
      else {
        const visited = new Set();
        let groupId = account.groupId;
        while (groupId && !visited.has(groupId)) {
          visited.add(groupId);
          const owner = data.groups.find((group) => group.id === groupId);
          if (!owner) break;
          if (owner.proxyIds?.length) {
            ids = owner.proxyIds;
            break;
          }
          if (owner.proxyListIds?.length) break;
          groupId = owner.parentId;
        }
      }
    }
    for (const counts of usage.values())
      for (const id of new Set(ids))
        if (counts.has(id)) counts.set(id, counts.get(id) + 1);
  }
  for (const [id, counts] of usage)
    counters.get(id).available = [...counts.values()].filter(
      (count) => count === 0,
    ).length;
  const updates = [...detached];
  for (const { account, pool, kept, keptBackups } of targets) {
    const assigned = [];
    for (const id of pool.listIds) {
      if (kept.has(id)) {
        assigned.push(kept.get(id));
        continue;
      }
      const counts = usage.get(id),
        counter = counters.get(id);
      counter.required++;
      if (!counts.size) {
        assigned.push(null);
        continue;
      }
      const minimum = Math.min(...counts.values());
      const proxyId = [...counts.keys()].find(
        (key) => counts.get(key) === minimum,
      );
      if (minimum > 0) counter.reused++;
      counts.set(proxyId, counts.get(proxyId) + 1);
      assigned.push(proxyId);
    }
    if (!assigned.includes(null))
      updates.push({
        id: account.id,
        proxyIds: refs(
          [...new Set([...assigned, ...keptBackups, ...pool.proxyIds])],
          proxies,
          2000,
        ),
        proxyListIds: [...pool.listIds],
        inheritProxy: false,
        proxyAllocation: {
          groupId: pool.groupId,
          listIds: [...pool.listIds],
          proxyIds: assigned,
          ...(keptBackups.length ? { backupProxyIds: [...keptBackups] } : {}),
        },
      });
  }
  for (const [id, count] of Object.entries(backupCounts))
    if (count > 0 && !counters.has(id)) invalid();
  // Partition candidates by list order before considering requested counts.
  // This keeps preview limits stable when lists contain the same endpoint.
  const occupied = new Set();
  const routeKey = (proxyId) =>
    proxies.has(proxyId) ? proxyRouteKey(proxies.get(proxyId)) : proxyId;
  const untouchedFree = new Set(
    availableProxyIds({
      ...data,
      accounts: data.accounts.filter(
        (account) =>
          !targetById.has(account.id) && !detachedById.has(account.id),
      ),
    }).map(routeKey),
  );
  for (const proxy of data.proxies)
    if (!untouchedFree.has(routeKey(proxy.id)))
      occupied.add(routeKey(proxy.id));
  for (const counts of usage.values())
    for (const [proxyId, count] of counts)
      if (count) occupied.add(routeKey(proxyId));
  for (const update of updates)
    for (const proxyId of update.proxyIds) occupied.add(routeKey(proxyId));
  for (const [id, counter] of counters) {
    counter.shortage = Math.max(0, counter.required - counter.available);
    const recipients = updates.filter((update) =>
      update.proxyAllocation.listIds.includes(id),
    );
    const free = lists.get(id).proxyIds.filter((proxyId) => {
      const key = routeKey(proxyId);
      if (occupied.has(key)) return false;
      occupied.add(key);
      return true;
    });
    counter.spareAvailable = free.length;
    counter.backupAccountCount = recipients.length;
    counter.maxBackupsPerAccount = recipients.length
      ? Math.ceil(free.length / recipients.length)
      : 0;
    const count = backupCounts[id] || 0;
    if (count > counter.maxBackupsPerAccount) invalid();
    counter.assignedBackups = 0;
    for (let round = 0; round < count; round++)
      for (const update of recipients) {
        if (!free.length) break;
        const proxyId = free.shift();
        (update.proxyAllocation.backupProxyIds ||= []).push(proxyId);
        const explicit = targets.find(
          (target) => target.account.id === update.id,
        ).pool.proxyIds;
        update.proxyIds = [
          ...new Set([
            ...update.proxyAllocation.proxyIds,
            ...update.proxyAllocation.backupProxyIds,
            ...explicit,
          ]),
        ];
        for (const counts of usage.values())
          if (counts.has(proxyId)) counts.set(proxyId, counts.get(proxyId) + 1);
        counter.assignedBackups++;
      }
  }
  // Validate the combined route after all list choices, before any mutation.
  for (const update of updates) refs(update.proxyIds, proxies, 2000);
  return {
    updates,
    lists: [...counters.values()],
    assigned: updates.length,
    skipped: accountIds.length - targets.length - detached.length,
    accountCount: targets.length + detached.length,
  };
}
function applyProxyAllocation(data, plan) {
  if (plan.lists.some((list) => list.blocked)) invalid();
  const accounts = new Map(
    data.accounts.map((account) => [account.id, account]),
  );
  for (const update of plan.updates) {
    const account = accounts.get(update.id);
    if (!account) invalid();
    Object.assign(account, structuredClone(update));
  }
  return data;
}
function availableProxyIds(data, { accountId, listId } = {}) {
  if (
    accountId !== undefined &&
    !data.accounts.some((account) => account.id === accountId)
  )
    invalid();
  const list =
    listId === undefined
      ? null
      : (data.proxyLists || []).find((item) => item.id === listId);
  if (listId !== undefined && !list) invalid();
  const used = new Set();
  for (const account of data.accounts) {
    let ids = account.proxyIds || [];
    if (account.inheritProxy) {
      const pool = getProxyPool(data, account);
      if (pool) ids = pool.proxyIds;
      else {
        let groupId = account.groupId;
        const visited = new Set();
        while (groupId && !visited.has(groupId)) {
          visited.add(groupId);
          const group = data.groups.find((item) => item.id === groupId);
          if (!group) break;
          if (group.proxyIds?.length) {
            ids = group.proxyIds;
            break;
          }
          if (group.proxyListIds?.length) break;
          groupId = group.parentId;
        }
      }
    }
    for (const id of ids) used.add(id);
  }
  const proxies = new Map(data.proxies.map((proxy) => [proxy.id, proxy]));
  const usedUrls = new Set(
    [...used]
      .filter((id) => proxies.has(id))
      .map((id) => proxyRouteKey(proxies.get(id))),
  );
  return (list ? list.proxyIds : data.proxies.map((proxy) => proxy.id)).filter(
    (id) => {
      if (!proxies.has(id) || used.has(id)) return false;
      const key = proxyRouteKey(proxies.get(id));
      if (usedUrls.has(key)) return false;
      usedUrls.add(key);
      return true;
    },
  );
}
module.exports = {
  availableProxyIds,
  getProxyPool,
  planProxyAllocation,
  applyProxyAllocation,
  allocationRoute,
};
