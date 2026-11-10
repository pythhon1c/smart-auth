"use strict";
const localeText = require("../locales/application.json");
const https = require("node:https");
const { setMaxListeners } = require("node:events");
const net = require("node:net");
const tls = require("node:tls");
const { performance } = require("node:perf_hooks");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { validatedAvatarUrl } = require("./avatar.cjs");
const { confirmationImageUrl } = require("./confirmation-details.cjs");

const ALLOWED_HOSTS = new Set([
  "api.steampowered.com",
  "steamcommunity.com",
  "store.steampowered.com",
  "login.steampowered.com",
  "help.steampowered.com",
  "checkout.steampowered.com",
  "steam.tv",
  "api.ipify.org",
]);
const { NetworkScheduler } = require("./network-scheduler.cjs");
const MAX_BODY = 4 * 1024 * 1024;
const MAX_EXPLICIT_BODY = 16 * 1024 * 1024;

// Own tunnel sockets from creation, including the period before an Agent has
// attached a socket to ClientRequest. Agent.destroy alone cannot cancel that period.
function readBytes(socket, count) {
  return new Promise((resolve, reject) => {
    const clean = () => {
      socket.off("readable", read);
      socket.off("error", error);
      socket.off("close", close);
      socket.off("end", close);
    };
    const error = () => {
      clean();
      reject(new Error("Proxy handshake failed"));
    };
    const close = () => error();
    const read = () => {
      const data = socket.read(count);
      if (data !== null) {
        clean();
        resolve(data);
      }
    };
    socket.on("readable", read);
    socket.once("error", error);
    socket.once("close", close);
    socket.once("end", close);
    if (socket.destroyed || socket.readableEnded) error();
    else read();
  });
}
async function openTunnel(proxy, target, track) {
  const proxyHost = proxy.hostname.replace(/^\[|\]$/g, "");
  let socket = track(
    proxy.protocol === "https:"
      ? tls.connect({
          host: proxyHost,
          port: Number(proxy.port) || 443,
          servername: net.isIP(proxyHost) ? undefined : proxyHost,
          rejectUnauthorized: true,
          ALPNProtocols: ["http/1.1"],
        })
      : net.connect({
          host: proxyHost,
          port: Number(proxy.port) || (proxy.protocol === "http:" ? 80 : 1080),
        }),
  );
  await new Promise((resolve, reject) => {
    const event = proxy.protocol === "https:" ? "secureConnect" : "connect";
    const clean = () => {
      socket.off(event, connected);
      socket.off("error", failed);
      socket.off("close", failed);
    };
    const connected = () => {
      clean();
      resolve();
    };
    const failed = () => {
      clean();
      reject(new Error("Proxy connection failed"));
    };
    socket.once(event, connected);
    socket.once("error", failed);
    socket.once("close", failed);
    if (socket.destroyed) failed();
  });
  if (proxy.protocol === "socks5h:") {
    const user = Buffer.from(decodeURIComponent(proxy.username)),
      pass = Buffer.from(decodeURIComponent(proxy.password));
    if (user.length > 255 || pass.length > 255)
      throw new Error("Invalid SOCKS credentials");
    socket.write(
      Buffer.from(user.length || pass.length ? [5, 2, 0, 2] : [5, 1, 0]),
    );
    const greeting = await readBytes(socket, 2);
    if (
      greeting[0] !== 5 ||
      ![0, 2].includes(greeting[1]) ||
      (greeting[1] === 2 && !(user.length || pass.length))
    )
      throw new Error("SOCKS authentication rejected");
    if (greeting[1] === 2) {
      socket.write(
        Buffer.concat([
          Buffer.from([1, user.length]),
          user,
          Buffer.from([pass.length]),
          pass,
        ]),
      );
      const auth = await readBytes(socket, 2);
      if (auth[0] !== 1 || auth[1] !== 0)
        throw new Error("SOCKS authentication rejected");
    }
    const host = Buffer.from(target.hostname, "ascii");
    socket.write(
      Buffer.concat([
        Buffer.from([5, 1, 0, 3, host.length]),
        host,
        Buffer.from([1, 187]),
      ]),
    );
    const response = await readBytes(socket, 4);
    if (response[0] !== 5 || response[1] !== 0 || response[2] !== 0)
      throw new Error("SOCKS tunnel rejected");
    if (response[3] === 1) await readBytes(socket, 6);
    else if (response[3] === 4) await readBytes(socket, 18);
    else if (response[3] === 3) {
      const length = await readBytes(socket, 1);
      await readBytes(socket, length[0] + 2);
    } else throw new Error("SOCKS tunnel rejected");
  } else {
    let auth = "";
    if (proxy.username || proxy.password)
      auth = `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}\r\n`;
    socket.write(
      `CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\n${auth}Proxy-Connection: close\r\n\r\n`,
    );
    let header = "";
    while (!header.endsWith("\r\n\r\n")) {
      if (header.length >= 16384) throw new Error("Proxy headers too large");
      header += (await readBytes(socket, 1)).toString("latin1");
    }
    if (!/^HTTP\/1\.[01] 200(?: |\r\n)/.test(header))
      throw new Error("Proxy tunnel rejected");
  }
  socket = track(
    tls.connect({
      socket,
      servername: target.hostname,
      rejectUnauthorized: true,
      ALPNProtocols: ["http/1.1"],
    }),
  );
  return socket;
}

function validateProxy(raw) {
  if (typeof raw !== "string" || raw.length > 2048)
    throw new Error(localeText.invalidProxyURL);
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(
      localeText.proxyFormatHttpUserPasswordHostPortOrSocks5hHostPort,
    );
  }
  if (url.protocol === "socks5:") url.protocol = "socks5h:";
  if (
    !["http:", "https:", "socks5h:"].includes(url.protocol) ||
    !url.hostname ||
    url.hash ||
    url.search ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error(localeText.supportsHTTPHTTPSAndSOCKS5WithRemoteDNS);
  if (url.username.length > 512 || url.password.length > 512)
    throw new Error(localeText.proxyCredentialsAreTooLong);
  // Reject percent-encoded controls before they can become headers.
  try {
    if (/[\r\n\0]/.test(decodeURIComponent(url.username + url.password)))
      throw 0;
  } catch {
    throw new Error(localeText.invalidProxyCredentials);
  }
  return url.toString();
}
function proxyEndpoint(raw) {
  const u = new URL(validateProxy(raw));
  return `${u.protocol}//${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : u.protocol === "http:" ? "80" : "1080")}`;
}
function checkedTarget(raw) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    (!ALLOWED_HOSTS.has(url.hostname) &&
      !validatedAvatarUrl(url.href) &&
      confirmationImageUrl(url.href) !== url.href) ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password
  )
    throw new Error(localeText.networkAddressBlockedByAppPolicy);
  return url;
}

class ProxyTransport {
  constructor({
    resolveProxies,
    onStatus = () => {},
    requestImpl = https.request,
    allowDirect = () => false,
    scheduler = new NetworkScheduler(),
  }) {
    this.scheduler = scheduler;
    this.abortController = new AbortController();
    setMaxListeners(0, this.abortController.signal);
    this.resolveProxies = resolveProxies;
    this.onStatus = onStatus;
    this.requestImpl = requestImpl;
    this.allowDirect = allowDirect;
    this.inflight = new Set();
    this.active = new Map();
    this.generation = 0;
    this.health = new Map();
    this.checkOffsets = new Map();
    this.lootRouteReady = new Map();
  }
  abortAll() {
    this.generation++;
    this.abortController.abort();
    this.abortController = new AbortController();
    setMaxListeners(0, this.abortController.signal);
    for (const abort of [...this.inflight]) abort();
    this.inflight.clear();
    this.active.clear();
    this.health.clear();
    this.checkOffsets.clear();
    this.lootRouteReady.clear();
  }
  routes(account) {
    const routes = this.resolveProxies(account);
    if (
      Array.isArray(routes) &&
      routes.length === 0 &&
      this.allowDirect() === true
    )
      return [];
    if (!Array.isArray(routes) || !routes.length) {
      this.onStatus(account, {
        state: "blocked",
        message: localeText.noProxyAssignedSteamConnectionBlocked,
      });
      throw new Error(
        localeText.noProxyAssignedDirectSteamConnectionIsForbidden,
      );
    }
    return routes.map((p) => ({
      id: p.id,
      name: p.name,
      url: validateProxy(p.url),
    }));
  }
  rateLimitStatus(account) {
    // Resolve every configured route without routes()'s status notifications.
    // Never probe Steam, rotate routes, or change scheduler state here.
    const assigned = this.resolveProxies(account);
    const routes =
      Array.isArray(assigned) && assigned.length
        ? assigned
        : this.allowDirect() === true
          ? [null]
          : [];
    let retryAfterMs = 0;
    for (const proxy of routes)
      for (const url of [
        "https://steamcommunity.com/",
        "https://api.steampowered.com/",
      ])
        retryAfterMs = Math.max(
          retryAfterMs,
          this.scheduler.cooldownMs({
            proxy,
            url,
            accountId: account.id,

            steamId: account.steamId,
          }),
        );
    return { retryAfterMs };
  }
  async ensureRoute(account, { assertCurrent = () => {}, onDetail } = {}) {
    // Loot readiness probes are credential-free and may traverse every assigned
    // backup. General request/mutation retry limits remain unchanged.
    const target = new URL(
      "https://api.steampowered.com/ITwoFactorService/QueryTime/v1/",
    );
    const routes = this.routes(account),
      generation = this.generation;
    const identity = account.steamId,
      accountId = account.id;
    const snapshot = () =>
      JSON.stringify({
        direct: this.allowDirect() === true,
        routes: this.routes(account).map((p) => [p.id, p.url]),
      });
    const settings = snapshot();
    const guard = () => {
      const checked = assertCurrent();
      if (checked && typeof checked.then === "function")
        throw Object.assign(new Error(localeText.validationMessage_d5b431a), {
          noRetry: true,
        });
      if (
        generation !== this.generation ||
        account.id !== accountId ||
        account.steamId !== identity ||
        snapshot() !== settings
      )
        throw Object.assign(new Error(localeText.validationMessage_14cfee4), {
          noRetry: true,
        });
    };
    const cooldown = () => {
      const { retryAfterMs } = this.rateLimitStatus(account);
      if (retryAfterMs > 0)
        throw Object.assign(new Error(localeText.validationMessage_ce6f28b), {
          code: "STEAM_RATE_LIMIT",
          noRetry: true,
          retryAfterMs,
          retryAt: new Date(Date.now() + retryAfterMs).toISOString(),
        });
    };
    const detail = (event) => {
      if (typeof onDetail !== "function") return;
      guard();
      try {
        const pending = onDetail(event);
        if (pending && typeof pending.catch === "function")
          pending.catch(() => {});
      } catch {}
      guard();
    };
    guard();
    cooldown();
    const cached = this.lootRouteReady.get(accountId);
    const active = routes.find((p) => p.id === this.active.get(accountId));
    const activeHealth = active && this.health.get(active.id);
    if (
      cached?.settings === settings &&
      cached.generation === generation &&
      cached.identity === identity &&
      Date.now() >= cached.at &&
      Date.now() - cached.at < 30000 &&
      (active
        ? cached.routeId === active.id &&
          activeHealth?.successAt > 0 &&
          (activeHealth.retryAt || 0) <= Date.now()
        : !routes.length && cached.routeId === null)
    ) {
      guard();
      cooldown();
      detail({
        type: "route-cache-hit",
        attempt: 0,
        total: routes.length || 1,
        fallback: Boolean(active && routes.indexOf(active) > 0),
      });
      return { ready: true, reused: true };
    }
    this.lootRouteReady.delete(accountId);
    const ordered = active
      ? [active, ...routes.filter((p) => p !== active)]
      : routes;
    const candidates = routes.length ? ordered : [null];
    let nextRetryAt = Infinity;
    for (const [index, proxy] of candidates.entries()) {
      const routeDetail = {
        attempt: index + 1,
        total: candidates.length,
        fallback: Boolean(proxy && routes.indexOf(proxy) > 0),
      };
      guard();
      cooldown();
      const health = proxy && this.health.get(proxy.id);
      if (
        (!health?.url || health.url === proxy?.url) &&
        (health?.retryAt || 0) > Date.now()
      ) {
        nextRetryAt = Math.min(nextRetryAt, health.retryAt);
        detail({ type: "route-failure", ...routeDetail, reason: "cooldown" });
        continue;
      }
      // Each candidate gets its own bounded window; a fixed global deadline
      // must not silently discard backups beyond the first few routes.
      const deadline = Date.now() + 10000;
      const deadlineMonotonic = performance.now() + 10000;
      detail({ type: "route-start", ...routeDetail });
      try {
        const response = await this.requestVia(proxy, target, {
          method: "POST",
          accountId,
          steamId: identity,
          timeoutMs: 10000,
          deadline,
          deadlineMonotonic,
          maxBodyBytes: 64 * 1024,
          beforeDispatch: () => {
            guard();
            cooldown();
          },
        });
        guard();
        const limited = this.scheduler.rateLimit(
          { proxy, url: target, accountId, steamId: identity },
          response,
        );
        if (limited) throw limited;
        const time = JSON.parse(String(response.body))?.response?.server_time;
        if (
          response.statusCode !== 200 ||
          !Number.isFinite(Number(time)) ||
          Number(time) <= 0
        )
          throw new Error("Steam unreachable");
        guard();
        cooldown();
        if (proxy) {
          this.active.set(accountId, proxy.id);
          this.health.set(proxy.id, {
            retryAt: 0,
            successAt: Date.now(),
            url: proxy.url,
          });
        } else this.active.delete(accountId);
        this.lootRouteReady.set(accountId, {
          settings,
          generation,
          identity,
          routeId: proxy?.id ?? null,
          at: Date.now(),
        });
        this.onStatus(account, {
          state: proxy ? "connected" : "direct",
          proxyId: proxy?.id,
          proxyName: proxy?.name,
          message: proxy
            ? `${localeText.templateText_d54dca6}${proxy.name}`
            : localeText.directConnectionNoProxy,
        });
        detail({ type: "route-ready", ...routeDetail });
        return { ready: true, reused: false };
      } catch (error) {
        guard();
        detail({
          type: "route-failure",
          ...routeDetail,
          reason:
            error.code === "STEAM_RATE_LIMIT" ||
            error.statusCode === 429 ||
            error.status === 429
              ? "rate-limit"
              : error.code === "ETIMEDOUT" ||
                  new RegExp(localeText.pattern_0ec3704, "i").test(
                    error.message || "",
                  )
                ? "timeout"
                : "unavailable",
        });
        if (
          error.code === "STEAM_RATE_LIMIT" ||
          error.statusCode === 429 ||
          error.status === 429
        )
          throw error;
        // A request's own ten-second expiry may move to the next route;
        // cancellation, invalid guards and persisted cooldown failures may not.
        if (
          error.noRetry &&
          !new RegExp(localeText.pattern_bebfb40, "").test(error.message)
        )
          throw error;
        if (proxy) {
          const retryAt = Date.now() + 30000;
          this.health.set(proxy.id, { retryAt, successAt: 0, url: proxy.url });
          nextRetryAt = Math.min(nextRetryAt, retryAt);
        }
      }
    }
    guard();
    this.active.delete(accountId);
    this.onStatus(account, {
      state: "blocked",
      message:
        localeText.allAssignedProxiesAreUnavailableSteamConnectionBlocked,
    });
    throw Object.assign(
      new Error(
        localeText.allAssignedProxiesAreUnavailableSteamConnectionBlocked,
      ),
      {
        ...(Number.isFinite(nextRetryAt)
          ? { retryAt: new Date(nextRetryAt).toISOString() }
          : {}),
      },
    );
  }
  async request(account, rawUrl, options = {}) {
    if (
      [options.deadline, options.deadlineMonotonic].some(
        (value) => value !== undefined && !Number.isFinite(value),
      )
    )
      throw Object.assign(new Error(localeText.invalidTimeout), {
        noRetry: true,
      });
    const url = checkedTarget(rawUrl);
    const routes = this.routes(account);
    const generation = this.generation;
    const retrySafe =
      options.retrySafe === undefined
        ? ["GET", "HEAD"].includes(
            String(options.method || "GET").toUpperCase(),
          )
        : options.retrySafe === true;
    const deadline = Math.min(Date.now() + 30000, options.deadline ?? Infinity);
    const deadlineMonotonic = Math.min(
      performance.now() + 30000,
      options.deadlineMonotonic ?? Infinity,
    );
    const healthy = routes.filter(
      (p) => (this.health.get(p.id)?.retryAt || 0) <= Date.now(),
    );
    const previous = healthy.find((p) => p.id === this.active.get(account.id));
    const preferred =
      previous ||
      healthy.reduce(
        (best, p) =>
          (this.health.get(p.id)?.successAt || 0) >
          (this.health.get(best?.id)?.successAt || 0)
            ? p
            : best,
        null,
      );
    const ordered = preferred
      ? [preferred, ...healthy.filter((p) => p !== preferred)]
      : healthy;
    // Never create a new mutation attempt after an ambiguous response.
    const selected = !routes.length
      ? [null]
      : retrySafe
        ? ordered.slice(0, 3)
        : ordered.slice(0, 1);
    let attempted = 0;
    for (const proxy of selected) {
      if (generation !== this.generation)
        throw new Error(localeText.operationCancelled);
      try {
        if (proxy && (this.health.get(proxy.id)?.retryAt || 0) > Date.now())
          continue;
        const remaining = Math.min(
          deadline - Date.now(),
          deadlineMonotonic - performance.now(),
        );
        if (remaining < 100) break;
        attempted++;
        const result = await this.requestVia(proxy, url, {
          ...options,
          accountId: account.id,

          steamId: account.steamId,
          timeoutMs: Math.min(options.timeoutMs ?? 15000, remaining),
          deadline,
          deadlineMonotonic,
        });
        if (generation !== this.generation)
          throw new Error(localeText.operationCancelled);
        const limited = this.scheduler.rateLimit(
          { proxy, url, accountId: account.id, steamId: account.steamId },
          result,
        );
        if (limited) throw limited;
        if (
          result.statusCode === 407 ||
          result.statusCode === 502 ||
          result.statusCode === 503 ||
          result.statusCode === 504
        )
          throw new Error("Proxy unavailable");
        if (result.statusCode >= 300 && result.statusCode < 400)
          throw Object.assign(
            new Error(localeText.steamRedirectBlockedRefreshYourSession),
            { noRetry: true },
          );
        if (proxy) {
          this.active.set(account.id, proxy.id);
          this.health.set(proxy.id, { retryAt: 0, successAt: Date.now() });
        } else this.active.delete(account.id);
        this.onStatus(account, {
          state: proxy ? "connected" : "direct",
          proxyId: proxy?.id,
          proxyName: proxy?.name,
          message: proxy
            ? `${localeText.templateText_d54dca6}${proxy.name}`
            : localeText.directConnectionNoProxy,
        });
        return result;
      } catch (error) {
        if (generation !== this.generation)
          throw new Error(localeText.operationCancelled);
        if (error.noRetry) throw error;
        if (proxy)
          this.health.set(proxy.id, {
            retryAt: Date.now() + 30000,
            successAt: 0,
          });
        this.onStatus(account, {
          state: "failed",
          proxyId: proxy?.id,
          proxyName: proxy?.name,
          message: proxy
            ? `${localeText.proxies}${proxy.name}${localeText.templateText_743b9d2}`
            : localeText.directConnectionUnavailable,
        });
        if (!retrySafe)
          throw new Error(
            localeText.noResponseReceivedTheOutcomeIsUnknownCheckTheOperationInSteam,
          );
      }
    }
    this.active.delete(account.id);
    if (!routes.length) {
      this.onStatus(account, {
        state: "blocked",
        direct: true,
        message: localeText.directConnectionNoProxyUnavailable,
      });
      throw new Error(localeText.directConnectionNoProxyUnavailable);
    }
    this.onStatus(account, {
      state: "blocked",
      message:
        attempted < routes.length
          ? localeText.checkedProxiesUnavailableAttemptLimitReachedCheckAgainToContinueTheList
          : localeText.allAssignedProxiesAreUnavailableSteamConnectionBlocked,
    });
    throw new Error(
      attempted < routes.length
        ? localeText.checkedProxiesUnavailableAttemptLimitReachedCheckAgainToContinueTheList
        : localeText.allProxiesUnavailableDirectSteamConnectionBlocked,
    );
  }
  async requestVia(proxy, url, options = {}) {
    const generation = this.generation;
    const deadline = options.deadline ?? Date.now() + 30000;
    const deadlineMonotonic =
      options.deadlineMonotonic ?? performance.now() + 30000;
    return this.scheduler.run(
      {
        proxy,
        url,
        accountId: options.accountId,

        steamId: options.steamId,
        signal: this.abortController.signal,
        deadline,
        deadlineMonotonic,
      },
      async () => {
        if (generation !== this.generation)
          throw new Error(localeText.operationCancelled);
        // Trusted internal context guards run after scheduler waits and before
        // creating a socket. They must be synchronous; no IPC accepts callbacks.
        if (options.beforeDispatch !== undefined) {
          if (typeof options.beforeDispatch !== "function")
            throw Object.assign(
              new Error(localeText.validationMessage_947afdd),
              {
                noRetry: true,
              },
            );
          const checked = options.beforeDispatch();
          if (checked && typeof checked.then === "function")
            throw Object.assign(
              new Error(localeText.validationMessage_d5b431a),
              { noRetry: true },
            );
        }
        const remaining = Math.min(
          deadline - Date.now(),
          deadlineMonotonic - performance.now(),
        );
        if (remaining < 100)
          throw Object.assign(new Error(localeText.operationTimedOut), {
            noRetry: true,
          });
        const result = await this._requestVia(proxy, url, {
          ...options,
          timeoutMs: Math.min(options.timeoutMs ?? 15000, remaining),
        });
        const limited = this.scheduler.rateLimit(
          {
            proxy,
            url,
            accountId: options.accountId,
            steamId: options.steamId,
          },
          result,
        );
        if (limited) throw limited;
        return result;
      },
    );
  }
  _requestVia(
    proxy,
    url,
    {
      method = "GET",
      headers = {},
      body,
      timeoutMs = 15000,
      maxBodyBytes = MAX_BODY,
    } = {},
  ) {
    const startedAtMs = Date.now();
    const startedMonotonic = performance.now();
    checkedTarget(url);
    if (
      !Number.isInteger(maxBodyBytes) ||
      maxBodyBytes < 1 ||
      maxBodyBytes > MAX_EXPLICIT_BODY
    )
      throw new Error(localeText.message_79266ef);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
      throw new Error(localeText.invalidTimeout);
    timeoutMs = Math.min(60000, Math.max(100, timeoutMs));
    const cleanHeaders = {};
    for (const [name, value] of Object.entries(headers)) {
      if (
        /^(host|proxy-authorization|proxy-connection|connection|upgrade|transfer-encoding)$/i.test(
          name,
        )
      )
        throw new Error(localeText.forbiddenNetworkHeader);
      if (
        !/^[!#$%&'*+.^_`|~\da-z-]+$/i.test(name) ||
        /[\r\n\0]/.test(String(value))
      )
        throw new Error(localeText.invalidNetworkHeader);
      cleanHeaders[name.toLowerCase()] = value;
    }
    if (!proxy && this.allowDirect() !== true)
      throw new Error(localeText.directConnectionForbidden);
    const proxyUrl = proxy ? new URL(validateProxy(proxy.url)) : null;
    const agent = !proxyUrl
      ? new https.Agent({ keepAlive: false })
      : proxyUrl.protocol === "socks5h:"
        ? new SocksProxyAgent(proxyUrl, { timeout: timeoutMs })
        : new HttpsProxyAgent(proxyUrl, { timeout: timeoutMs });
    return new Promise((resolve, reject) => {
      let req,
        responseStream,
        timer,
        finished = false;
      const sockets = new Set();
      const closeSocket = (socket) => {
        // These sockets belong exclusively to this single request. A buffered
        // TLS chunk must not reach socketOnData after Node frees its parser on
        // close. Keep error/close listeners so Node still releases the parser.
        socket.pause();
        socket.removeAllListeners("data");
        socket.removeAllListeners("end");
        socket.destroy();
      };
      const track = (socket) => {
        // The connect promise may resolve after cancellation; such sockets must never survive it.
        socket.on("error", () => {});
        if (finished) closeSocket(socket);
        else {
          sockets.add(socket);
          socket.once("close", () => sockets.delete(socket));
        }
        return socket;
      };
      if (proxyUrl) agent.connect = () => openTunnel(proxyUrl, url, track);
      else
        agent.createConnection = (options) =>
          track(tls.connect({ ...options, rejectUnauthorized: true }));
      const done = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.inflight.delete(abort);
        responseStream?.pause?.();
        // Let ClientRequest own HTTP teardown before closing the wrapped TLS
        // socket and then its underlying CONNECT/SOCKS tunnel, in that order.
        req?.destroy();
        for (const socket of [...sockets].reverse()) closeSocket(socket);
        sockets.clear();
        agent.destroy();
        if (error) reject(error);
        else resolve(value);
      };
      const abort = () => {
        done(new Error(localeText.operationCancelled));
      };
      this.inflight.add(abort);
      try {
        req = this.requestImpl(
          url,
          {
            method,
            agent,
            headers: {
              "user-agent": "smart-auth/0.1",
              ...cleanHeaders,
              "accept-encoding": "identity",
            },
            // No browser session, environment proxies, global agent, redirect following or direct fallback.
            rejectUnauthorized: true,
          },
          (response) => {
            if (finished) {
              response.pause?.();
              response.destroy();
              return;
            }
            responseStream = response;
            const chunks = [];
            let length = 0;
            response.on("data", (chunk) => {
              if (finished) return;
              length += chunk.length;
              if (length > maxBodyBytes) {
                response.destroy();
                done(new Error("Response too large"));
              } else chunks.push(chunk);
            });
            response.on("error", (error) => done(error));
            response.on("aborted", () => done(new Error("Response aborted")));
            response.on("end", () =>
              done(null, {
                statusCode: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks),
                timing: {
                  startedAtMs,
                  elapsedMs: performance.now() - startedMonotonic,
                },
              }),
            );
          },
        );
        req.on("error", (error) => done(error));
        timer = setTimeout(() => {
          done(new Error("Proxy timeout"));
        }, timeoutMs);
        if (body !== undefined) req.write(body);
        req.end();
      } catch (error) {
        done(error);
      }
    });
  }
  async check(account) {
    const routes = this.routes(account);
    const generation = this.generation;
    const results = [];
    const deadline = Date.now() + 30000;
    const deadlineMonotonic = performance.now() + 30000;
    let probes = 0;
    let untestedCount = 0;
    const offset = routes.length
      ? (this.checkOffsets.get(account.id) || 0) % routes.length
      : 0;
    const orderedRoutes = routes.length
      ? [...routes.slice(offset), ...routes.slice(0, offset)]
      : [null];
    for (let index = 0; index < orderedRoutes.length; index++) {
      const proxy = orderedRoutes[index];
      if (generation !== this.generation)
        throw new Error(localeText.operationCancelled);
      const start = Date.now();
      if (
        probes >= 3 ||
        Math.min(deadline - Date.now(), deadlineMonotonic - performance.now()) <
          100 ||
        (proxy && (this.health.get(proxy.id)?.retryAt || 0) > Date.now())
      ) {
        untestedCount++;
        continue;
      }
      probes++;
      if (routes.length)
        this.checkOffsets.set(account.id, (offset + index + 1) % routes.length);
      try {
        const response = await this.requestVia(
          proxy,
          new URL("https://api.ipify.org?format=json"),
          {
            accountId: account.id,

            steamId: account.steamId,
            timeoutMs: 10000,
            deadline,
            deadlineMonotonic,
          },
        );
        const limited = this.scheduler.rateLimit(
          {
            proxy,
            url: "https://api.ipify.org",
            accountId: account.id,
            steamId: account.steamId,
          },
          response,
        );
        if (limited) throw limited;
        const ip = JSON.parse(response.body.toString("utf8")).ip;
        if (response.statusCode !== 200 || !net.isIP(ip))
          throw new Error("Invalid proxy check");
        // Verify Steam is also reachable through this same proxy, without sending account credentials.
        const steam = await this.requestVia(
          proxy,
          new URL(
            "https://api.steampowered.com/ITwoFactorService/QueryTime/v1/",
          ),
          {
            accountId: account.id,

            steamId: account.steamId,
            method: "POST",
            timeoutMs: 10000,
            deadline,
            deadlineMonotonic,
          },
        );
        const steamLimited = this.scheduler.rateLimit(
          {
            proxy,
            url: "https://api.steampowered.com",
            accountId: account.id,
            steamId: account.steamId,
          },
          steam,
        );
        if (steamLimited) throw steamLimited;
        const time = JSON.parse(steam.body.toString("utf8"))?.response
          ?.server_time;
        if (
          steam.statusCode !== 200 ||
          !Number.isFinite(Number(time)) ||
          Number(time) <= 0
        )
          throw new Error("Steam unreachable");
        results.push({
          proxyId: proxy?.id || null,
          name: proxy?.name || localeText.directConnectionNoProxy,
          direct: !proxy,
          ok: true,
          ip,
          latencyMs: Date.now() - start,
        });
        if (proxy)
          this.health.set(proxy.id, { retryAt: 0, successAt: Date.now() });
      } catch (error) {
        if (error.code === "STEAM_RATE_LIMIT") throw error;
        if (error.noRetry) {
          untestedCount++;
          continue;
        }
        if (proxy && generation === this.generation)
          this.health.set(proxy.id, {
            retryAt: Date.now() + 30000,
            successAt: 0,
          });
        results.push({
          proxyId: proxy?.id || null,
          name: proxy?.name || localeText.directConnectionNoProxy,
          direct: !proxy,
          ok: false,
          error: proxy
            ? localeText.thisProxyCannotConnect
            : localeText.directConnectionUnavailable,
        });
      }
    }
    if (generation !== this.generation)
      throw new Error(localeText.operationCancelled);
    if (untestedCount)
      results.push({
        skipped: true,
        remaining: untestedCount,
        ok: false,
        name: localeText.deferredProxies,
        error: localeText.checkLimitReachedOrCoolingDownAfterAnError,
      });
    const first = results.find((x) => x.ok);
    if (first?.proxyId) this.active.set(account.id, first.proxyId);
    else this.active.delete(account.id);
    this.onStatus(account, {
      state: first ? (first.direct ? "direct" : "connected") : "blocked",
      proxyId: first?.proxyId,
      proxyName: first?.name,
      ip: first?.ip,
      checkedAt: new Date().toISOString(),
      results,
      message: first
        ? first.direct
          ? `${localeText.directConnectionNoProxy_3e0cc5e}${first.ip}`
          : `${localeText.templateText_d54dca6}${first.name} · ${first.ip}`
        : untestedCount
          ? localeText.checkedProxiesUnavailableRemainingChecksDeferredCheckAgainToContinue
          : localeText.allProxiesUnavailableSteamBlocked,
    });
    return {
      results,
      activeProxyId: first?.proxyId || null,
      blocked: !first,
      direct: Boolean(first?.direct),
      untestedCount,
    };
  }
}
module.exports = {
  ProxyTransport,
  validateProxy,
  proxyEndpoint,
  checkedTarget,
};
