"use strict";
const localeText = require("../locales/application.json");
const model = require("./model.cjs");
const { prepareProxies } = require("./imports.cjs");
const { availableProxyIds } = require("./proxy-allocation.cjs");
const { proxyEndpoint } = require("./transport.cjs");

function currentRoute(data, account) {
  try {
    return model.resolveRoute(data, account).map((proxy) => proxy.id);
  } catch {
    // An explicit assignment can repair stale/unallocated pools. Only retain
    // known individual slots; never expand an unresolved list into a route.
    return [...new Set(account.proxyIds || [])].filter((id) =>
      data.proxies.some((proxy) => proxy.id === id),
    );
  }
}
function accountProxyOptions(data, { id, listId } = {}) {
  const account = model.item(data.accounts, id, localeText.account);
  if (listId !== undefined && typeof listId !== "string")
    throw Error(localeText.invalidProxyList);
  const chosen = listId
    ? model.item(data.proxyLists || [], listId, localeText.proxyList)
    : null;
  const index = new Map(data.proxies.map((proxy) => [proxy.id, proxy]));
  const free = new Set(
    availableProxyIds(data, { accountId: id }).map(
      (proxyId) => new URL(index.get(proxyId).url).href,
    ),
  );
  function freeMembers(list) {
    const seen = new Set();
    return list.proxyIds.filter((proxyId) => {
      const proxy = index.get(proxyId);
      if (!proxy) return false;
      const url = new URL(proxy.url).href;
      if (!free.has(url) || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }
  const details = (proxyId) => {
    const { id, name, url } = index.get(proxyId);
    return { id, name, url };
  };
  return {
    lists: (data.proxyLists || []).map((list) => ({
      id: list.id,
      name: list.name,
      available: freeMembers(list).length,
    })),
    proxies: chosen ? freeMembers(chosen).map(details) : [],
    assigned: currentRoute(data, account).map(details),
  };
}

function planAccountProxy(source, p) {
  if (
    !p ||
    !["manual", "list"].includes(p.mode) ||
    !["primary", "backup"].includes(p.position)
  )
    throw Error(localeText.invalidProxyAssignment);
  model.item(source.accounts, p.id, localeText.account);
  const data = structuredClone(source);
  const account = model.item(data.accounts, p.id, localeText.account);
  const previous = currentRoute(data, account);
  let proxyId;
  if (p.mode === "list") {
    model.item(data.proxyLists || [], p.listId, localeText.proxyList);
    if (
      !availableProxyIds(data, { accountId: p.id, listId: p.listId }).includes(
        p.proxyId,
      )
    )
      throw Error(
        localeText.thisProxyIsAlreadyAssignedOrUnavailableRefreshTheList,
      );
    proxyId = p.proxyId;
  } else {
    if (
      typeof p.url !== "string" ||
      p.url.length > 2048 ||
      /[\r\n]/.test(p.url)
    )
      throw Error(localeText.enterOneProxyInASupportedFormat);
    const parsed = prepareProxies({
      text: p.url,
      protocol: p.protocol || "http",
    });
    if (
      parsed.errors.length ||
      parsed.lists.length !== 1 ||
      parsed.lists[0].proxies.length !== 1
    )
      throw Error(localeText.enterOneProxyInASupportedFormat);
    const url = parsed.lists[0].proxies[0].url;
    proxyId = data.proxies.find((proxy) => proxy.url === url)?.id;
    if (!proxyId)
      proxyId = model.saveProxy(
        data,
        { url, name: proxyEndpoint(url).slice(0, 120) },
        true,
      );
  }
  const proxyIds = [
    ...new Set(
      p.position === "primary"
        ? [proxyId, ...previous]
        : [...previous, proxyId],
    ),
  ];
  model.routeIds(data, proxyIds);
  Object.assign(account, { proxyIds, proxyListIds: [], inheritProxy: false });
  delete account.proxyAllocation;
  return { data, proxyId };
}
module.exports = { accountProxyOptions, planAccountProxy };
