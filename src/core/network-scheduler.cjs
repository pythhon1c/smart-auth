"use strict";
const localeText = require("../locales/application.json");
const { performance } = require("node:perf_hooks");
const { createHash } = require("node:crypto");
const cancelled = () =>
  Object.assign(new Error(localeText.operationCancelled), { noRetry: true });
class NetworkScheduler {
  constructor({
    maxConcurrent = 12,
    routeDelayMs = 750,
    accountDelayMs = 500,
    now = () => performance.now(),
    wallNow = Date.now,
  } = {}) {
    this.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));
    this.routeDelayMs = Math.max(0, routeDelayMs);
    this.accountDelayMs = Math.max(0, accountDelayMs);
    this.now = now;
    this.wallNow = wallNow;
    this.active = 0;
    this.queue = [];
    this.routes = new Map();
    this.accounts = new Map();
    this.cooldowns = new Map();
    this.durableCooldowns = new Map();
    this.resolveAccount = () => null;
    this.saveCooldowns = null;
  }
  setCooldownPersistence({ resolveAccount = () => null, save = null } = {}) {
    this.resolveAccount = resolveAccount;
    this.saveCooldowns = save;
  }
  durableKeys(context) {
    const keys = this.keys(context);
    let account;
    const explicitSteamId = /^765\d{14}$/.test(context.steamId);
    if (!explicitSteamId) {
      try {
        account = this.resolveAccount(context.accountId);
      } catch {}
    }
    const steamId = explicitSteamId ? context.steamId : account?.steamId;
    const identities = [keys.account && `alias:${keys.account}`];
    if (/^765\d{14}$/.test(steamId)) identities.push(`steam:${steamId}`);
    return [
      keys.route,
      ...identities.filter(Boolean).map((id) => `identity:${id}`),
    ].map((key) => createHash("sha256").update(key).digest("hex"));
  }
  exportCooldowns() {
    this.pruneCooldowns();
    return {
      version: 1,
      entries: [...this.durableCooldowns]
        .filter(([, value]) => value.until > this.wallNow())
        .map(([key, value]) => ({ key, ...value })),
    };
  }
  pruneCooldowns() {
    const now = this.wallNow();
    for (const [key, value] of this.durableCooldowns)
      if (value.until <= now) this.durableCooldowns.delete(key);
  }
  hydrateCooldowns(snapshot) {
    if (snapshot != null) {
      if (
        snapshot.version !== 1 ||
        !Array.isArray(snapshot.entries) ||
        snapshot.entries.some(
          (entry) =>
            !entry ||
            typeof entry !== "object" ||
            typeof entry.key !== "string" ||
            !/^[a-f0-9]{64}$/.test(entry.key) ||
            !Number.isFinite(entry.until) ||
            entry.until < 0 ||
            !Number.isInteger(entry.attempt) ||
            entry.attempt < 1,
        )
      )
        throw Object.assign(new Error(localeText.validationMessage_5cf9892), {
          code: "COOLDOWN_STATE_INVALID",
          noRetry: true,
        });
      this.pruneCooldowns();
      for (const entry of snapshot.entries) {
        if (entry.until <= this.wallNow()) continue;
        const prior = this.durableCooldowns.get(entry.key);
        this.durableCooldowns.set(entry.key, {
          until: Math.max(prior?.until || 0, entry.until),
          attempt: Math.max(prior?.attempt || 0, entry.attempt),
        });
      }
    }
    this.pump();
  }
  persistCooldowns() {
    // The synchronous callback returns false while locked; memory survives until unlock.
    if (this.saveCooldowns) {
      try {
        const result = this.saveCooldowns(this.exportCooldowns());
        if (result && typeof result.then === "function")
          throw new Error("Cooldown persistence must be synchronous.");
        return result;
      } catch {
        throw Object.assign(new Error(localeText.validationMessage_6d12047), {
          code: "COOLDOWN_PERSIST_FAILED",
          noRetry: true,
        });
      }
    }
    return false;
  }
  bindCooldownIdentity(context) {
    const keys = this.durableKeys(context).slice(1);
    const until = Math.max(
      0,
      ...keys.map((key) => this.durableCooldowns.get(key)?.until || 0),
    );
    if (until <= this.wallNow()) return;
    const attempt = Math.max(
      1,
      ...keys.map((key) => this.durableCooldowns.get(key)?.attempt || 0),
    );
    let changed = false;
    for (const key of keys)
      if ((this.durableCooldowns.get(key)?.until || 0) < until) {
        this.durableCooldowns.set(key, { until, attempt });
        changed = true;
      }
    if (changed) this.persistCooldowns();
  }
  durableCooldownMs(context) {
    const keys = this.durableKeys(context);
    let until = 0;
    for (const key of keys) {
      const value = this.durableCooldowns.get(key);
      until = Math.max(until, value?.until || 0);
    }
    return Math.max(0, until - this.wallNow());
  }
  keys({ proxy, url, accountId }) {
    const host = new URL(url).hostname;
    const p = proxy ? new URL(proxy.url) : null;
    if (p?.protocol === "socks5:") p.protocol = "socks5h:";
    const endpoint = p
      ? `${p.protocol}//${p.hostname}:${p.port || (p.protocol === "https:" ? 443 : p.protocol === "http:" ? 80 : 1080)}`
      : "direct";
    return {
      route: `${endpoint}|${host}`,
      account: accountId == null ? null : String(accountId),
      accountHost: accountId == null ? null : `${accountId}|${host}`,
    };
  }
  // Read only: inspecting a cooldown neither queues work nor resets backoff.
  cooldownMs(context) {
    const keys = this.keys(context),
      now = this.now();
    return Math.max(
      0,
      this.durableCooldownMs(context),
      (this.cooldowns.get(keys.route)?.until || 0) - now,
      keys.accountHost
        ? (this.cooldowns.get(`account:${keys.accountHost}`)?.until || 0) - now
        : 0,
    );
  }
  rateLimit(context, response) {
    const target = new URL(context.url);
    let webApplicationLimit = false;
    const finalize =
      target.hostname === "login.steampowered.com" &&
      target.pathname === "/jwt/finalizelogin";
    const transfer =
      [
        "login.steampowered.com",
        "steamcommunity.com",
        "store.steampowered.com",
        "help.steampowered.com",
        "checkout.steampowered.com",
      ].includes(target.hostname) && target.pathname === "/login/settoken";
    if (
      response.statusCode === 200 &&
      target.protocol === "https:" &&
      !target.port &&
      !target.username &&
      !target.password &&
      !target.search &&
      !target.hash &&
      (finalize || transfer) &&
      Buffer.isBuffer(response.body) &&
      response.body.length <= 65536
    ) {
      try {
        const body = JSON.parse(response.body.toString("utf8"));
        webApplicationLimit =
          !!body &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          body[finalize ? "error" : "result"] === 84;
      } catch {}
    }
    const applicationLimit =
      webApplicationLimit ||
      (target.protocol === "https:" &&
        target.hostname === "api.steampowered.com" &&
        (!target.port || target.port === "443") &&
        /^\/IAuthenticationService\/[A-Za-z]+\/v1\/$/.test(target.pathname) &&
        response.statusCode === 200 &&
        String(response.headers?.["x-eresult"]) === "84");
    if (
      !applicationLimit &&
      response.statusCode !== 429 &&
      !(
        response.statusCode === 503 &&
        response.headers?.["retry-after"] !== undefined
      )
    )
      return null;
    this.bindCooldownIdentity(context);
    const keys = this.keys(context),
      now = this.now();
    const prior = this.cooldowns.get(keys.route);
    const attempt =
      Math.max(
        prior?.attempt || 0,
        ...this.durableKeys(context).map(
          (key) => this.durableCooldowns.get(key)?.attempt || 0,
        ),
      ) + 1;
    const raw = response.headers?.["retry-after"];
    const seconds =
      typeof raw === "string" && /^\s*\d+(?:\.\d+)?\s*$/.test(raw)
        ? Math.min(Number.MAX_SAFE_INTEGER, Number(raw) * 1000)
        : NaN;
    const date =
      typeof raw === "string" &&
      /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
        raw.trim(),
      )
        ? Date.parse(raw) - this.wallNow()
        : NaN;
    const delay = Number.isFinite(seconds)
      ? seconds
      : Number.isFinite(date)
        ? Math.max(0, date)
        : Math.min(300000, 30000 * 2 ** Math.min(attempt - 1, 4));
    for (const key of [
      keys.route,
      keys.accountHost && `account:${keys.accountHost}`,
    ].filter(Boolean)) {
      const prev = this.cooldowns.get(key);
      this.cooldowns.set(key, {
        until: Math.max(prev?.until || 0, now + delay),
        attempt,
      });
    }
    const wallUntil = Math.min(Number.MAX_SAFE_INTEGER, this.wallNow() + delay);
    for (const key of this.durableKeys(context)) {
      const prev = this.durableCooldowns.get(key);
      this.durableCooldowns.set(key, {
        until: Math.max(prev?.until || 0, wallUntil),
        attempt,
      });
    }
    this.persistCooldowns();
    this.pump();
    return Object.assign(
      new Error(
        `${localeText.templateText_1d3c30d}${applicationLimit ? "EResult 84" : `HTTP ${response.statusCode}`}${localeText.templateText_2882d94}`,
      ),
      {
        code: "STEAM_RATE_LIMIT",
        noRetry: true,
        retryAfterMs: delay,
        statusCode: response.statusCode,
        ...(applicationLimit ? { eresult: 84 } : {}),
      },
    );
  }
  run(context, fn) {
    if (context.signal?.aborted) return Promise.reject(cancelled());
    try {
      this.bindCooldownIdentity(context);
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.queue.length >= 1024)
      return Promise.reject(
        Object.assign(new Error(localeText.validationMessage_c2eefeb), {
          noRetry: true,
        }),
      );
    return new Promise((resolve, reject) => {
      const task = { context, keys: this.keys(context), fn, resolve, reject };
      task.abort = () => {
        const i = this.queue.indexOf(task);
        if (i >= 0) {
          this.queue.splice(i, 1);
          reject(cancelled());
          this.pump();
        }
      };
      context.signal?.addEventListener("abort", task.abort, { once: true });
      this.queue.push(task);
      this.pump();
    });
  }
  pump() {
    clearTimeout(this.timer);
    let wait = Infinity;
    for (let i = 0; i < this.queue.length; ) {
      const task = this.queue[i],
        { context: c, keys: k } = task,
        now = this.now();
      const remaining = Math.min(
        c.deadline == null ? Infinity : c.deadline - this.wallNow(),
        c.deadlineMonotonic == null
          ? Infinity
          : c.deadlineMonotonic - performance.now(),
      );
      if (remaining <= 0 || c.signal?.aborted) {
        this.queue.splice(i, 1);
        c.signal?.removeEventListener("abort", task.abort);
        task.reject(
          c.signal?.aborted
            ? cancelled()
            : Object.assign(new Error(localeText.networkOperationTimedOut), {
                noRetry: true,
              }),
        );
        continue;
      }
      wait = Math.min(wait, remaining);
      const route = this.routes.get(k.route) || { active: false, next: 0 };
      const due = Math.max(
        now + this.durableCooldownMs(c),
        route.next,
        k.account ? this.accounts.get(k.account) || 0 : 0,
        this.cooldowns.get(k.route)?.until || 0,
        k.accountHost
          ? this.cooldowns.get(`account:${k.accountHost}`)?.until || 0
          : 0,
      );
      if (this.active >= this.maxConcurrent || route.active || due > now) {
        if (due > now) wait = Math.min(wait, due - now);
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      c.signal?.removeEventListener("abort", task.abort);
      this.active++;
      route.active = true;
      route.next = now + this.routeDelayMs;
      this.routes.set(k.route, route);
      if (k.account) this.accounts.set(k.account, now + this.accountDelayMs);
      Promise.resolve()
        .then(() => {
          if (c.signal?.aborted) throw cancelled();
          return task.fn();
        })
        .then(task.resolve, task.reject)
        .finally(() => {
          this.active--;
          route.active = false;
          this.pump();
        });
    }
    if (this.queue.length && Number.isFinite(wait))
      this.timer = setTimeout(
        () => this.pump(),
        Math.max(1, Math.min(wait, 2147483647)),
      );
  }
}
module.exports = { NetworkScheduler };
