"use strict";
const localeText = require("../locales/application.json");
// Only the Community session parsers write server-validated cookies here.
// Nothing is persisted, and authenticated profile/route changes invalidate reuse.
const TTL_MS = 5 * 60 * 1000;
const MAX_ACCOUNTS = 32;
const caches = new WeakMap();
function binding(steam, account, route) {
  const session = account.mafile?.Session;
  return [
    account.id,
    account.steamId,
    session,
    session?.AccessToken,
    session?.SessionID,
    steam.epoch,
    steam.transport,
    steam.transport?.generation,
    route?.id ?? null,
    route?.url ?? null,
  ];
}
const equal = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);
const sameCookie = (a, b) =>
  a &&
  b &&
  a.name === b.name &&
  a.value === b.value &&
  a.path === b.path &&
  a.expires === b.expires;
function clearCommunityCookieCache(steam) {
  caches.delete(steam);
}
function openCommunityCookieCache(steam, account, route, now = Date.now) {
  let cache = caches.get(steam);
  if (!cache) {
    cache = new Map();
    caches.set(steam, cache);
  }
  const identity = binding(steam, account, route);
  for (const [key, entry] of cache) {
    for (const [name, cookie] of entry.cookies)
      if (cookie.expires <= now()) entry.cookies.delete(name);
    if (!entry.cookies.size) cache.delete(key);
  }
  let previous = cache.get(account);
  if (previous && !equal(previous.identity, identity)) {
    cache.delete(account);
    previous = null;
  }
  const baseline = new Map(
    [...(previous?.cookies || [])].map(([key, cookie]) => [key, { ...cookie }]),
  );
  const cookies = new Map(
    [...baseline].map(([key, cookie]) => [key, { ...cookie }]),
  );
  return {
    cookies,
    commit() {
      // Lock/epoch/session changes while a request is in flight cannot repopulate it.
      if (
        caches.get(steam) !== cache ||
        !equal(identity, binding(steam, account, route))
      )
        return;
      const existing = cache.get(account);
      const merged = new Map(
        existing && equal(existing.identity, identity) ? existing.cookies : [],
      );
      for (const key of baseline.keys())
        if (!cookies.has(key)) merged.delete(key);
      for (const [key, cookie] of cookies) {
        if (sameCookie(cookie, baseline.get(key))) continue;
        if (cookie.expires <= now()) merged.delete(key);
        else
          merged.set(key, {
            ...cookie,
            expires: Math.min(cookie.expires, now() + TTL_MS),
          });
      }
      for (const [key, cookie] of merged)
        if (cookie.expires <= now()) merged.delete(key);
      if (merged.size > 64) throw Error(localeText.message_016856e);
      cache.delete(account);
      if (merged.size) cache.set(account, { identity, cookies: merged });
      while (cache.size > MAX_ACCOUNTS) cache.delete(cache.keys().next().value);
      // Later responses must not republish an unchanged cookie after another
      // completed operation has deleted or replaced it.
      baseline.clear();
      for (const [key, cookie] of cookies) baseline.set(key, { ...cookie });
    },
  };
}
module.exports = {
  openCommunityCookieCache,
  clearCommunityCookieCache,
  TTL_MS,
  MAX_ACCOUNTS,
};
