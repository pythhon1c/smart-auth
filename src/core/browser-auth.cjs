"use strict";
const localeText = require("../locales/application.json");
const crypto = require("node:crypto");
const https = require("node:https");
const {
  LoginSession,
  EAuthTokenPlatformType,
  EAuthSessionGuardType,
} = require("steam-session");
const { getProtoForMethod } = require("steam-session/dist/protobufs");
const METHODS = new Set([
  "GetPasswordRSAPublicKey",
  "BeginAuthSessionViaCredentials",
  "UpdateAuthSessionWithSteamGuardCode",
  "PollAuthSessionStatus",
]);
const DOMAINS = new Set([
  "steamcommunity.com",
  "store.steampowered.com",
  "help.steampowered.com",
  "checkout.steampowered.com",
  "login.steampowered.com",
  "steam.tv",
]);
// Steam also returns shared session/Akamai cookies for the parent domain.
// This cookie scope is not an additional network transfer destination.
const COOKIE_DOMAINS = new Set([...DOMAINS, "steampowered.com"]);
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
function claims(token) {
  try {
    if (
      typeof token !== "string" ||
      token.length > 32768 ||
      !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)
    )
      return null;
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  } catch {
    return null;
  }
}
function validRefresh(token, steamId, now) {
  const c = claims(token);
  return !!(
    c &&
    c.sub === steamId &&
    Number.isSafeInteger(c.exp) &&
    c.exp > now / 1000 + 60 &&
    Array.isArray(c.aud) &&
    c.aud.includes("web") &&
    c.aud.includes("derive") &&
    !c.aud.includes("mobile") &&
    !c.aud.includes("client")
  );
}
function parseCookies(values, steamId, now) {
  if (
    !Array.isArray(values) ||
    values.length > 100 ||
    values.some((value) => typeof value !== "string") ||
    values.reduce((total, value) => total + Buffer.byteLength(value), 0) >
      1024 * 1024
  )
    throw new Error(localeText.validationMessage);
  const cookies = values.map((raw) => {
    if (
      typeof raw !== "string" ||
      raw.length > 65536 ||
      /[\x00-\x1f\x7f]/.test(raw)
    )
      throw new Error(localeText.validationMessage_45d3079);
    const [pair, ...attrs] = raw.split(";");
    const index = pair.indexOf("=");
    if (
      index < 1 ||
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(pair.slice(0, index)) ||
      /[\x00-\x20\x7f]/.test(pair.slice(index + 1))
    )
      throw new Error(localeText.validationMessage_45d3079);
    const cookie = {
      name: pair.slice(0, index),
      value: pair.slice(index + 1),
      path: "/",
      secure: true,
      httpOnly: false,
      sameSite: "None",
    };
    let maxAge;
    for (const attr of attrs) {
      const [key, ...rest] = attr.trim().split("=");
      const value = rest.join("=");
      switch (key.toLowerCase()) {
        case "domain":
          cookie.domain = value.toLowerCase();
          break;
        case "path":
          cookie.path = value;
          break;
        case "httponly":
          cookie.httpOnly = true;
          break;
        case "max-age":
          if (/^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)))
            maxAge = Number(value);
          break;
        case "expires":
          if (!cookie.expires && Number.isFinite(Date.parse(value)))
            cookie.expires = Date.parse(value) / 1000;
          break;
        case "samesite":
          if (["None", "Lax", "Strict"].includes(value))
            cookie.sameSite = value;
          break;
      }
    }
    if (maxAge !== undefined) cookie.expires = Math.floor(now / 1000) + maxAge;
    if (
      !COOKIE_DOMAINS.has(cookie.domain?.replace(/^\./, "")) ||
      cookie.path !== "/"
    )
      throw new Error(localeText.validationMessage_9a4a180);
    if (
      ["steamLoginSecure", "steamRefresh_steam"].includes(cookie.name) &&
      !DOMAINS.has(cookie.domain?.replace(/^\./, ""))
    )
      throw new Error(localeText.validationMessage_9a4a180);
    if (cookie.name === "steamLoginSecure") {
      let decoded;
      try {
        decoded = decodeURIComponent(cookie.value);
      } catch {}
      const parts = (decoded || "").split("||");
      const [owner, token] = parts;
      const c = claims(token);
      if (
        parts.length !== 2 ||
        owner !== steamId ||
        !c ||
        c.sub !== steamId ||
        !Number.isSafeInteger(c.exp) ||
        c.exp <= now / 1000 + 60 ||
        !Array.isArray(c.aud) ||
        !c.aud.some(
          (a) => typeof a === "string" && (a === "web" || a.startsWith("web:")),
        ) ||
        c.aud.some((a) => ["derive", "mobile", "client"].includes(a))
      )
        throw new Error(localeText.validationMessage_a56a4a5);
      cookie.expires = Math.min(cookie.expires ?? c.exp, c.exp);
    }
    if (cookie.name === "steamRefresh_steam") {
      let decoded;
      try {
        decoded = decodeURIComponent(cookie.value);
      } catch {}
      const parts = (decoded || "").split("||");
      const token =
        parts.length === 1
          ? parts[0]
          : parts.length === 2 && parts[0] === steamId
            ? parts[1]
            : null;
      if (!validRefresh(token, steamId, now))
        throw new Error(localeText.validationMessage_30292e6);
      cookie.expires = Math.min(
        cookie.expires ?? claims(token).exp,
        claims(token).exp,
      );
    }
    if (
      Number.isFinite(now) &&
      cookie.expires !== undefined &&
      cookie.expires <= now / 1000
    )
      throw new Error(localeText.validationMessage_fcbe836);
    return cookie;
  });
  if (
    !cookies.some(
      (c) =>
        c.name === "steamLoginSecure" &&
        c.domain.replace(/^\./, "") === "steamcommunity.com",
    )
  )
    throw new Error(localeText.validationMessage_9fd79d7);
  return cookies;
}
class BrowserWebAuth {
  constructor({
    transport,
    onChange = () => {},
    assertActive = () => {},
    userAgent = DEFAULT_USER_AGENT,
    guardCode,
    now = Date.now,
    sessionFactory = (type, options) => new LoginSession(type, options),
  }) {
    Object.assign(this, {
      transport,
      onChange,
      assertActive,
      userAgent,
      guardCode,
      now,
      sessionFactory,
    });
    this.epoch = 0;
    this.pending = new Set();
    this.sessions = new Set();
  }
  cancel() {
    this.epoch++;
    for (const session of this.sessions) session.cancelLoginAttempt();
    for (const entry of this.pending) {
      entry.session.cancelLoginAttempt();
      entry.reject(new Error(localeText.loginCancelled));
    }
    this.pending.clear();
  }
  _assert(epoch) {
    if (epoch !== this.epoch) throw new Error(localeText.loginCancelled);
    this.assertActive();
  }
  async _request(account, url, options, epoch) {
    this._assert(epoch);
    const result = await this.transport.request(account, url, options);
    this._assert(epoch);
    return result;
  }
  _session(account, epoch) {
    let webFailure;
    const routed = {
      close() {},
      sendRequest: async (request) => {
        this._assert(epoch);
        if (
          request.apiInterface !== "Authentication" ||
          !METHODS.has(request.apiMethod) ||
          request.apiVersion !== 1 ||
          !(request.requestData instanceof Uint8Array) ||
          request.requestData.length > 262144
        )
          throw new Error(localeText.validationMessage_8c49211);
        const data = Buffer.from(request.requestData);
        const url = new URL(
          `https://api.steampowered.com/IAuthenticationService/${request.apiMethod}/v1/`,
        );
        const get = request.apiMethod === "GetPasswordRSAPublicKey";
        const form = new URLSearchParams({
          input_protobuf_encoded: data.toString("base64"),
        });
        if (get) url.search = form.toString();
        const result = await this._request(
          account,
          url.href,
          {
            method: get ? "GET" : "POST",
            headers: {
              ...request.headers,
              "user-agent": this.userAgent,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: get ? undefined : form.toString(),
            retrySafe: get || request.apiMethod === "PollAuthSessionStatus",
          },
          epoch,
        );
        if (
          result.statusCode !== 200 ||
          !/^\d+$/.test(String(result.headers["x-eresult"])) ||
          Number(result.headers["x-eresult"]) < 1 ||
          Number(result.headers["x-eresult"]) > 255 ||
          !Buffer.isBuffer(result.body) ||
          result.body.length > 2 * 1024 * 1024
        )
          throw new Error(localeText.validationMessage_4f297d6);
        if (
          request.apiMethod === "BeginAuthSessionViaCredentials" &&
          Number(result.headers["x-eresult"]) === 1
        ) {
          const response = getProtoForMethod(
            "Authentication",
            request.apiMethod,
          ).response.decode(result.body);
          if (String(response.steamid) !== account.steamId)
            throw new Error(localeText.validationMessage_0a5bb2e);
        }
        return {
          result: Number(result.headers["x-eresult"]),
          responseData: result.body,
        };
      },
    };
    const agent = new https.Agent();
    agent.createConnection = () => {
      throw new Error(localeText.validationMessage_135e672);
    };
    agent.addRequest = agent.createConnection;
    const session = this.sessionFactory(EAuthTokenPlatformType.WebBrowser, {
      transport: routed,
      userAgent: this.userAgent,
      agent,
    });
    // steam-session 1.9.4 bypasses its custom transport for finalizelogin and transfers.
    // Replace that shared client's request before any operation can issue network I/O.
    if (!session._webClient)
      throw new Error(localeText.validationMessage_db4e552);
    session.on("error", () => {});
    session._webClient.request = async (options) => {
      if (webFailure) throw webFailure;
      const url = new URL(options.url);
      if (
        url.protocol !== "https:" ||
        url.port ||
        url.username ||
        url.password ||
        !DOMAINS.has(url.hostname) ||
        options.method !== "POST" ||
        !(
          (url.hostname === "login.steampowered.com" &&
            url.pathname === "/jwt/finalizelogin") ||
          url.pathname === "/login/settoken"
        )
      )
        throw new Error(localeText.validationMessage_ea9acd0);
      const boundary = `----SmartSDA${crypto.randomBytes(12).toString("hex")}`;
      let body = "";
      for (const [key, item] of Object.entries(options.multipartForm || {})) {
        if (
          !/^[a-zA-Z0-9_]+$/.test(key) ||
          !["string", "number"].includes(typeof item.content)
        )
          throw new Error(localeText.validationMessage_988a1bf);
        body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${item.content}\r\n`;
      }
      body += `--${boundary}--\r\n`;
      let result;
      try {
        result = await this._request(
          account,
          url.href,
          {
            method: "POST",
            headers: {
              ...options.headers,
              "user-agent": this.userAgent,
              "content-type": `multipart/form-data; boundary=${boundary}`,
            },
            body,
            retrySafe: false,
          },
          epoch,
        );
      } catch (error) {
        webFailure = error;
        throw error;
      }
      let jsonBody;
      try {
        jsonBody = JSON.parse(result.body.toString("utf8"));
      } catch {}
      if (result.statusCode !== 200) {
        webFailure = Object.assign(
          new Error(localeText.validationMessage_2c85730),
          {
            statusCode: result.statusCode,
          },
        );
        throw webFailure;
      }
      if (
        url.pathname === "/jwt/finalizelogin" &&
        Array.isArray(jsonBody?.transfer_info)
      ) {
        if (jsonBody.transfer_info.length > 10)
          throw new Error(localeText.validationMessage_8774913);
        for (const transfer of jsonBody.transfer_info) {
          const target = new URL(transfer.url);
          if (
            target.protocol !== "https:" ||
            target.port ||
            target.username ||
            target.password ||
            !DOMAINS.has(target.hostname) ||
            target.pathname !== "/login/settoken" ||
            target.search ||
            target.hash ||
            !transfer.params ||
            typeof transfer.params !== "object" ||
            Array.isArray(transfer.params) ||
            Object.entries(transfer.params).some(
              ([key, value]) =>
                !/^[a-zA-Z0-9_]+$/.test(key) ||
                !["string", "number"].includes(typeof value),
            )
          )
            throw new Error(localeText.validationMessage_dd83ad7);
        }
      }
      return {
        ...result,
        url: url.href,
        jsonBody,
        textBody: result.body.toString("utf8"),
        rawBody: result.body,
      };
    };
    return session;
  }
  async ensure(
    account,
    { password, guardCode, forceRefresh = false, forceLogin = false } = {},
  ) {
    const epoch = this.epoch;
    this._assert(epoch);
    const stored = account.browserSession;
    const reusable =
      !forceLogin &&
      stored?.version === 1 &&
      stored.steamId === account.steamId &&
      stored.platform === "WebBrowser" &&
      validRefresh(stored.refreshToken, account.steamId, this.now());
    if (reusable && !forceRefresh) {
      try {
        const cookies = parseCookies(
          stored.cookies,
          account.steamId,
          this.now(),
        );
        return { cookies };
      } catch {}
    }
    let session = this._session(account, epoch);
    this.sessions.add(session);
    try {
      if (reusable) session.refreshToken = stored.refreshToken;
      else {
        if (typeof password !== "string" || !password)
          throw Object.assign(new Error(localeText.validationMessage_08fb906), {
            code: "BROWSER_WEB_PASSWORD_REQUIRED",
          });
        const code =
          guardCode ||
          (this.guardCode ? await this.guardCode(account) : undefined);
        this._assert(epoch);
        await new Promise((resolve, reject) => {
          let settled = false;
          let timer;
          const entry = { session, reject: (error) => finish(error) };
          this.pending.add(entry);
          const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            this.pending.delete(entry);
            session.removeListener("authenticated", ok);
            session.removeListener("timeout", timeout);
            session.removeListener("error", fail);
            if (error) session.cancelLoginAttempt();
            error ? reject(error) : resolve();
          };
          const ok = () => finish();
          const timeout = () =>
            finish(new Error(localeText.validationMessage_f955fdd));
          const fail = (error) => finish(error);
          session.once("authenticated", ok);
          session.once("timeout", timeout);
          session.once("error", fail);
          timer = setTimeout(timeout, 60000);
          Promise.resolve(
            session.startWithCredentials({
              accountName: account.mafile.account_name,
              password,
              ...(code ? { steamGuardCode: code } : {}),
            }),
          )
            .then((result) => {
              if (
                result.actionRequired &&
                !result.validActions?.some((a) =>
                  [
                    EAuthSessionGuardType.DeviceConfirmation,
                    EAuthSessionGuardType.EmailConfirmation,
                  ].includes(a.type),
                )
              )
                finish(
                  Object.assign(
                    new Error(localeText.validationMessage_58eafca),
                    { code: "BROWSER_WEB_GUARD_REQUIRED" },
                  ),
                );
            })
            .catch(fail);
        });
      }
      this._assert(epoch);
      if (!validRefresh(session.refreshToken, account.steamId, this.now()))
        throw new Error(localeText.validationMessage_0793d5e);
      const values = await session.getWebCookies();
      this._assert(epoch);
      const cookies = parseCookies(values, account.steamId, this.now());
      account.browserSession = {
        version: 1,
        steamId: account.steamId,
        platform: "WebBrowser",
        refreshToken: session.refreshToken,
        cookies: values,
        updatedAt: this.now(),
      };
      await this.onChange(account);
      this._assert(epoch);
      return { cookies };
    } catch (error) {
      this._assert(epoch);
      if (
        reusable &&
        [5, 15, 25, 27].includes(error.eresult) &&
        !error.rateLimited &&
        error.statusCode !== 429
      ) {
        session.cancelLoginAttempt();
        return this.ensure(account, { password, guardCode, forceLogin: true });
      }
      throw error;
    } finally {
      this.sessions.delete(session);
      session.cancelLoginAttempt();
    }
  }
}
module.exports = {
  BrowserWebAuth,
  DEFAULT_USER_AGENT,
  validRefresh,
  parseCookies,
};
