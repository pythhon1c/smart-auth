"use strict";
const localeText = require("../locales/application.json");
// The sole permitted transition is Steam's exact eligibility round trip.
// Validated server cookies may be reused only inside the same bound profile/route.
const { validateProxy } = require("./transport.cjs");
const { openCommunityCookieCache } = require("./community-cookie-cache.cjs");
const ORIGIN = "https://steamcommunity.com";
const BASE = 76561197960265728n;
function check(ok) {
  if (!ok) throw Error(localeText.message_a9b618e);
}
function validSteamId(id) {
  return (
    typeof id === "string" &&
    /^765\d{14}$/.test(id) &&
    BigInt(id) > BASE &&
    BigInt(id) <= BASE + 4294967295n
  );
}
function createLootCommunitySession({
  steam,
  account,
  kind,
  partnerSteamId,
  tradeToken,
  deadline,
  assertCurrent,
  onResponse = () => {},
}) {
  check(
    steam &&
      account &&
      validSteamId(account.steamId) &&
      ["privacy", "newtrade"].includes(kind),
  );
  check(
    typeof assertCurrent === "function" &&
      typeof onResponse === "function" &&
      Number.isFinite(deadline),
  );
  check(
    kind !== "newtrade" ||
      (validSteamId(partnerSteamId) && partnerSteamId !== account.steamId),
  );
  check(
    tradeToken === undefined ||
      (typeof tradeToken === "string" &&
        /^[A-Za-z0-9_-]{1,128}$/.test(tradeToken)),
  );
  const query =
    kind === "newtrade"
      ? new URLSearchParams({
          partner: (BigInt(partnerSteamId) - BASE).toString(),
          ...(tradeToken ? { token: tradeToken } : {}),
        })
      : new URLSearchParams({ l: "english" });
  const requested = new URL(
    kind === "privacy"
      ? `${ORIGIN}/profiles/${account.steamId}/tradeoffers/privacy?${query}`
      : `${ORIGIN}/tradeoffer/new/?${query}`,
  );
  const sendTarget = new URL(`${ORIGIN}/tradeoffer/new/send`),
    transport = steam.transport;
  check(
    typeof transport?.routes === "function" &&
      typeof transport?.requestVia === "function",
  );
  assertCurrent();
  const routes = transport.routes(account);
  check(Array.isArray(routes));
  routes.forEach((p) => check(p?.id && validateProxy(p.url)));
  const direct = !routes.length && transport.allowDirect?.() === true;
  check(routes.length || direct);
  const active = transport.active?.get(account.id),
    healthy = routes.filter(
      (p) => (transport.health?.get(p.id)?.retryAt || 0) <= Date.now(),
    );
  const route = healthy.find((p) => p.id === active) || healthy[0];
  check(route || direct);
  const pinned = route ? Object.freeze({ ...route }) : null,
    generation = transport.generation;
  const cookieCache = openCommunityCookieCache(steam, account, pinned);
  const cookies = cookieCache.cookies;
  let ready = false,
    sent = false;
  function assert() {
    assertCurrent();
    check(transport.generation === generation && Date.now() < deadline);
    const current = transport.routes(account);
    check(
      pinned
        ? current.some((p) => p.id === pinned.id && p.url === pinned.url) &&
            (transport.health?.get(pinned.id)?.retryAt || 0) <= Date.now()
        : current.length === 0 && transport.allowDirect?.() === true,
    );
  }
  function url(raw) {
    check(
      typeof raw === "string" && raw.length <= 4096 && !/[\r\n\0\\]/.test(raw),
    );
    const target = new URL(raw, ORIGIN);
    check(
      target.origin === ORIGIN &&
        !target.username &&
        !target.password &&
        !target.hash,
    );
    return target;
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
          value = equal < 0 ? "" : attribute.slice(equal + 1).trim();
        if (key === "domain")
          check(
            value.replace(/^\./, "").toLowerCase() === "steamcommunity.com",
          );
        if (key === "path") {
          check(
            value.startsWith("/") &&
              !/[\\\r\n\0?#]/.test(value) &&
              value.length <= 2048,
          );
          path = value;
        }
        if (key === "max-age") {
          check(/^-?\d{1,12}$/.test(value));
          expires =
            Number(value) <= 0
              ? 0
              : Date.now() + Math.min(Number(value), 31536000) * 1000;
        }
        if (key === "expires" && expires === Infinity) {
          expires = Date.parse(value);
          check(Number.isFinite(expires));
        }
      }
      if (name === "steamLoginSecure") {
        let decoded;
        try {
          decoded = decodeURIComponent(value);
        } catch {
          check(false);
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
    return [...values].map(([key, value]) => `${key}=${value}`).join("; ");
  }
  function sessionId() {
    const target = kind === "newtrade" ? sendTarget : requested;
    const values = new Map(
      cookie(target)
        .split(";")
        .map((part) => {
          const at = part.indexOf("=");
          return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
        }),
    );
    const id = values.get("sessionid");
    check(typeof id === "string" && /^[a-fA-F0-9]{16,64}$/.test(id));
    return id;
  }
  async function request(target, options = {}, beforeDispatch = () => {}) {
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
        beforeDispatch();
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
    let response = await request(requested, { method: "GET" });
    if (response.statusCode >= 300 && response.statusCode < 400) {
      check([301, 302, 303, 307, 308].includes(response.statusCode));
      const eligibility = url(
        response.headers?.location ?? response.headers?.Location,
      );
      check(
        eligibility.pathname === "/market/eligibilitycheck/" &&
          [...eligibility.searchParams.keys()].every((key) => key === "goto") &&
          eligibility.searchParams.getAll("goto").length === 1 &&
          url(eligibility.searchParams.get("goto")).href === requested.href,
      );
      response = await request(eligibility, { method: "GET" });
      check(
        [301, 302, 303, 307, 308].includes(response.statusCode) &&
          url(response.headers?.location ?? response.headers?.Location).href ===
            requested.href,
      );
      response = await request(requested, { method: "GET" });
    }
    check(response.statusCode >= 200 && response.statusCode < 300);
    cookieCache.commit();
    ready = true;
    return response;
  }
  async function send(form, { beforeDispatch = () => {} } = {}) {
    assert();
    check(
      kind === "newtrade" &&
        ready &&
        !sent &&
        typeof beforeDispatch === "function",
    );
    const body = new URLSearchParams(form);
    check(new Set(body.keys()).size === [...body.keys()].length);
    check(
      body.get("partner") === partnerSteamId &&
        body.get("sessionid") === sessionId(),
    );
    check(
      body.get("trade_offer_create_params") ===
        JSON.stringify(
          tradeToken ? { trade_offer_access_token: tradeToken } : {},
        ),
    );
    sent = true;
    const response = await request(
      sendTarget,
      {
        method: "POST",
        body: body.toString(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: requested.href,
        },
      },
      () => {
        check(body.get("sessionid") === sessionId());
        beforeDispatch();
      },
    );
    check(response.statusCode >= 200 && response.statusCode < 300);
    cookieCache.commit();
    return response;
  }
  return Object.freeze({ page, send, sessionId });
}
module.exports = { createLootCommunitySession };
