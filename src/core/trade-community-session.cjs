"use strict";
const localeText = require("../locales/application.json");
// Adapted from the explicitly tested live-community-session eligibility flow.
// A fresh instance belongs to one offer and one already verified session only.
const { validateProxy } = require("./transport.cjs");
const { openCommunityCookieCache } = require("./community-cookie-cache.cjs");
const ORIGIN = "https://steamcommunity.com";
const fail = () => Error(localeText.message_15d0fd9);
function check(ok) {
  if (!ok) throw fail();
}
function createTradeCommunitySession({
  steam,
  account,
  offerId,
  assertCurrent,
  assertCanAccept = assertCurrent,
  deadline,
  onResponse = () => {},
}) {
  check(typeof offerId === "string" && /^[1-9]\d{0,19}$/.test(offerId));
  check(
    typeof assertCurrent === "function" &&
      typeof assertCanAccept === "function" &&
      typeof onResponse === "function",
  );
  const transport = steam.transport,
    requested = new URL(`${ORIGIN}/tradeoffer/${offerId}/`);
  assertCurrent();
  const routes = transport.routes(account);
  check(Array.isArray(routes) && routes.length > 0);
  routes.forEach((p) => check(p?.id && validateProxy(p.url)));
  const active = transport.active?.get(account.id);
  const proxy =
    routes.find(
      (p) =>
        p.id === active &&
        (transport.health?.get(p.id)?.retryAt || 0) <= Date.now(),
    ) ||
    routes.find(
      (p) => (transport.health?.get(p.id)?.retryAt || 0) <= Date.now(),
    );
  check(proxy);
  const pinned = Object.freeze({ ...proxy }),
    generation = transport.generation;
  const acceptTarget = new URL(requested.href + "accept");
  const cookieCache = openCommunityCookieCache(steam, account, pinned);
  const cookies = cookieCache.cookies;
  let ready = false,
    sent = false;
  function assert() {
    assertCurrent();
    check(Date.now() < deadline && transport.generation === generation);
    check(
      transport
        .routes(account)
        .some((p) => p.id === pinned.id && p.url === pinned.url),
    );
    check((transport.health?.get(pinned.id)?.retryAt || 0) <= Date.now());
  }
  function url(raw) {
    check(
      typeof raw === "string" && raw.length <= 4096 && !/[\r\n\0\\]/.test(raw),
    );
    const u = new URL(raw, ORIGIN);
    check(u.origin === ORIGIN && !u.username && !u.password && !u.hash);
    return u;
  }
  function store(headers) {
    const rows = headers?.["set-cookie"] ?? headers?.["Set-Cookie"] ?? [];
    check(Array.isArray(rows) || typeof rows === "string");
    check((Array.isArray(rows) ? rows : [rows]).length <= 64);
    for (const line of typeof rows === "string" ? [rows] : rows) {
      check(
        typeof line === "string" &&
          line.length <= 16384 &&
          !/[\r\n\0]/.test(line),
      );
      const parts = line.split(";"),
        pair = parts.shift(),
        at = pair.indexOf("=");
      check(at > 0);
      const name = pair.slice(0, at).trim(),
        value = pair.slice(at + 1).trim();
      check(
        /^[A-Za-z0-9_-]{1,64}$/.test(name) &&
          value.length <= 8192 &&
          !/[;\x00-\x20\x7f]/.test(value),
      );
      let path = "/",
        expires = Infinity;
      for (const attribute of parts) {
        const equal = attribute.indexOf("="),
          key = (equal < 0 ? attribute : attribute.slice(0, equal))
            .trim()
            .toLowerCase(),
          v = equal < 0 ? "" : attribute.slice(equal + 1).trim();
        if (key === "domain")
          check(v.replace(/^\./, "").toLowerCase() === "steamcommunity.com");
        if (key === "path") {
          check(
            v.startsWith("/") && !/[\\\r\n\0?#]/.test(v) && v.length <= 2048,
          );
          path = v;
        }
        if (key === "max-age") {
          check(/^-?\d{1,12}$/.test(v));
          expires =
            Number(v) <= 0
              ? 0
              : Date.now() + Math.min(Number(v), 31536000) * 1000;
        }
        if (key === "expires" && expires === Infinity) {
          expires = Date.parse(v);
          check(Number.isFinite(expires));
        }
      }
      if (name === "steamLoginSecure") {
        let decoded;
        try {
          decoded = decodeURIComponent(value);
        } catch {
          throw fail();
        }
        check(decoded.startsWith(account.steamId + "||"));
      }
      if (name === "sessionid") check(/^[a-fA-F0-9]{16,64}$/.test(value));
      const key = name + "|" + path;
      if (expires <= Date.now()) cookies.delete(key);
      else cookies.set(key, { name, value, path, expires });
      check(cookies.size <= 64);
    }
  }
  function cookie(target) {
    assert();
    const values = new Map(
      steam
        ._cookie(account)
        .split(";")
        .map((part) => {
          const at = part.indexOf("=");
          return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
        }),
    );
    for (const [key, c] of [...cookies].sort(
      (a, b) => a[1].path.length - b[1].path.length,
    )) {
      if (c.expires <= Date.now()) {
        cookies.delete(key);
        continue;
      }
      if (
        target.pathname === c.path ||
        target.pathname.startsWith(c.path.endsWith("/") ? c.path : c.path + "/")
      )
        values.set(c.name, c.value);
    }
    return [...values].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  function sessionId() {
    const values = new Map(
      cookie(acceptTarget)
        .split(";")
        .map((part) => {
          const at = part.indexOf("=");
          return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
        }),
    );
    const session = values.get("sessionid");
    check(typeof session === "string" && /^[a-fA-F0-9]{16,64}$/.test(session));
    return session;
  }
  async function send(target, options = {}) {
    assert();
    const response = await transport.requestVia(pinned, target, {
      ...options,
      accountId: account.id,
      steamId: account.steamId,
      deadline,
      timeoutMs: Math.min(15000, deadline - Date.now()),
      maxBodyBytes: 16 * 1024 * 1024,
      retrySafe: false,
      beforeDispatch: () => {
        assert();
        if (options.method === "POST") assertCanAccept();
      },
      headers: {
        ...options.headers,
        "user-agent": "okhttp/4.9.2",
        referer: requested.href,
        ...(options.method === "POST" ? { origin: ORIGIN } : {}),
        cookie: cookie(target),
      },
    });
    assert();
    onResponse(response);
    assert();
    store(response.headers);
    return response;
  }
  async function page() {
    check(!ready && !sent);
    let response = await send(requested, { method: "GET" });
    if (response.statusCode >= 300 && response.statusCode < 400) {
      check([301, 302, 303, 307, 308].includes(response.statusCode));
      const eligibility = url(
        response.headers?.location ?? response.headers?.Location,
      );
      check(
        eligibility.pathname === "/market/eligibilitycheck/" &&
          [...eligibility.searchParams.keys()].every((k) => k === "goto") &&
          eligibility.searchParams.getAll("goto").length === 1,
      );
      check(url(eligibility.searchParams.get("goto")).href === requested.href);
      response = await send(eligibility, { method: "GET" });
      check([301, 302, 303, 307, 308].includes(response.statusCode));
      check(
        url(response.headers?.location ?? response.headers?.Location).href ===
          requested.href,
      );
      response = await send(requested, { method: "GET" });
    }
    check(response.statusCode >= 200 && response.statusCode < 300);
    cookieCache.commit();
    ready = true;
    return response;
  }
  async function accept(form) {
    assert();
    check(ready && !sent);
    const body = new URLSearchParams(form);
    check(
      body.get("tradeofferid") === offerId &&
        body.get("sessionid") === sessionId(),
    );
    sent = true;
    const response = await send(acceptTarget, {
      method: "POST",
      body: body.toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: requested.href,
      },
    });
    // Never follow a mutation response redirect or retry the pinned proxy.
    check(response.statusCode >= 200 && response.statusCode < 300);
    cookieCache.commit();
    return response;
  }
  return Object.freeze({ page, accept, sessionId });
}
module.exports = { createTradeCommunitySession };
