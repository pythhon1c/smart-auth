"use strict";
const localeText = require("../locales/application.json");
const crypto = require("node:crypto");
const {
  normalizeAccountBans,
  profileBansFromXml,
  playerBansFromApi,
  mergeAccountBans,
} = require("./account-bans.cjs");
const { clearCommunityCookieCache } = require("./community-cookie-cache.cjs");
const { accountPolicy } = require("./account-policy.cjs");
const { getConfirmationType } = require("./confirmation-types.cjs");
const {
  MAX_DETAIL_BYTES,
  confirmationImageUrl,
  parseConfirmationDetails,
  economyClass,
  parseEconomyHover,
} = require("./confirmation-details.cjs");
const { stackItems } = require("./item-stacks.cjs");
const https = require("node:https");
const { performance } = require("node:perf_hooks");
const { LoginSession, EAuthTokenPlatformType } = require("steam-session");
// Pinned to steam-session 1.9.4; required to override its hard-coded MobileApp device name.
const { getProtoForMethod } = require("steam-session/dist/protobufs");
const {
  avatarFromXml,
  safeCachedAvatar,
  imageDataUrl,
  updateAvatarCache,
  MAX_AVATAR_BYTES,
  MAX_XML_BYTES,
} = require("./avatar.cjs");
const ALPHABET = "23456789BCDFGHJKMNPQRTVWXY";
const API = "https://api.steampowered.com";
const COMMUNITY = "https://steamcommunity.com";
const MOBILE = { "user-agent": "okhttp/4.9.2" };
const AUTH_METHODS = new Set([
  "GetPasswordRSAPublicKey",
  "BeginAuthSessionViaCredentials",
  "UpdateAuthSessionWithSteamGuardCode",
  "PollAuthSessionStatus",
  "GenerateAccessTokenForApp",
]);
function secretBytes(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    value.length % 4 !== 0
  )
    throw new Error(localeText.invalidBase64Secret);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 20 || bytes.toString("base64") !== value)
    throw new Error(localeText.steamSecretMustBe20Bytes);
  return bytes;
}
function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(localeText.invalidTime);
  const result = Buffer.alloc(8);
  result.writeBigUInt64BE(BigInt(value));
  return result;
}
function steamCode(secret, unixSeconds = Math.floor(Date.now() / 1000)) {
  const digest = crypto
    .createHmac("sha1", secretBytes(secret))
    .update(timestamp(Math.floor(unixSeconds / 30)))
    .digest();
  const offset = digest[19] & 15;
  let number = digest.readUInt32BE(offset) & 0x7fffffff;
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += ALPHABET[number % 26];
    number = Math.floor(number / 26);
  }
  return code;
}
function confirmationKey(secret, unixSeconds, tag) {
  if (typeof tag !== "string" || !/^[a-z0-9]+$/.test(tag) || tag.length > 32)
    throw new Error(localeText.invalidConfirmationTag);
  return crypto
    .createHmac("sha1", secretBytes(secret))
    .update(Buffer.concat([timestamp(unixSeconds), Buffer.from(tag)]))
    .digest("base64");
}
function randomDeviceName() {
  const devices = [
    "Samsung Galaxy S25",
    "Samsung Galaxy S24",
    "Samsung Galaxy A55",
    "Google Pixel 9 Pro",
    "Google Pixel 8",
    "Xiaomi 14",
    "Redmi Note 13 Pro",
    "OnePlus 12",
    "Nothing Phone (2)",
  ];
  return devices[crypto.randomInt(devices.length)];
}
function validSteamId(value) {
  return (
    typeof value === "string" &&
    /^\d{17}$/.test(value) &&
    BigInt(value) >= 76561197960265728n &&
    BigInt(value) <= 76561202255233023n
  );
}
function tokenData(token) {
  try {
    if (typeof token !== "string" || token.length > 32768) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p)))
      return null;
    const value = JSON.parse(Buffer.from(parts[1], "base64url"));
    if (
      !value ||
      !validSteamId(value.sub) ||
      !Number.isSafeInteger(value.exp) ||
      value.exp <= 0 ||
      !Array.isArray(value.aud) ||
      !value.aud.every((a) => typeof a === "string")
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
function classifyRefreshToken(token, steamId) {
  const data = tokenData(token);
  if (!data || data.sub !== steamId || !data.aud.includes("derive"))
    throw new Error(localeText.message_2d639ca);
  const platforms = ["mobile", "client", "web"].filter((a) =>
    data.aud.includes(a),
  );
  if (platforms.length !== 1) throw new Error(localeText.message_4d39c52);
  return platforms[0] === "client" ? "desktop" : platforms[0];
}
function mobileTokenEligible(token, steamId, refresh, parentToken, now) {
  const value = tokenData(token);
  return (
    !!value &&
    value.sub === steamId &&
    value.aud.includes("mobile") &&
    value.aud.includes("derive") === refresh &&
    value.exp > now
  );
}
function parseMafile(raw, { allowMissingAuthenticator = false } = {}) {
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  if (typeof raw !== "string" || raw.length > 2 * 1024 * 1024)
    throw new Error(localeText.invalidOrOversizedMaFile);
  let mafile;
  try {
    mafile = JSON.parse(raw.replace(/^\uFEFF/, ""), (key, value, context) => {
      if (
        ["SteamID", "steamid", "steam_id"].includes(key) &&
        typeof value === "number"
      ) {
        if (!context || !/^\d+$/.test(context.source))
          throw new Error(localeText.steamidMustPreserveExactPrecision);
        return context.source;
      }
      return value;
    });
  } catch {
    throw new Error(localeText.mafileMustContainValidJSON);
  }
  if (!mafile || Array.isArray(mafile) || typeof mafile !== "object")
    throw new Error(localeText.invalidMaFile);
  // Refuse ambiguous/prototype-bearing input, retaining every other unknown field.
  let keyCount = 0;
  function inspect(value, depth = 0) {
    if (!value || typeof value !== "object") return;
    if (depth > 32) throw new Error(localeText.mafileNestingIsTooDeep);
    for (const key of Object.keys(value)) {
      if (++keyCount > 10000) throw new Error(localeText.tooManyMaFileFields);
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error(localeText.unsafeMaFileField);
      inspect(value[key], depth + 1);
    }
  }
  inspect(mafile);
  if (
    mafile.ImportedRefreshToken !== undefined &&
    (typeof mafile.ImportedRefreshToken !== "string" ||
      !mafile.ImportedRefreshToken.length ||
      mafile.ImportedRefreshToken.length > 16384 ||
      /[\r\n\0]/.test(mafile.ImportedRefreshToken))
  )
    throw new Error(localeText.message_d59e880);
  if (mafile.shared_secret !== undefined) secretBytes(mafile.shared_secret);
  else if (!allowMissingAuthenticator) secretBytes(mafile.shared_secret);
  else if (
    mafile.identity_secret !== undefined ||
    mafile.device_id !== undefined
  )
    throw new Error(localeText.message_eb91548);
  if (mafile.identity_secret != null && mafile.identity_secret !== "")
    secretBytes(mafile.identity_secret);
  if (
    mafile.Session != null &&
    (typeof mafile.Session !== "object" || Array.isArray(mafile.Session))
  )
    throw new Error(localeText.invalidMaFileSession);
  const session = mafile.Session || {};
  const ids = [
    mafile.steamid,
    mafile.steam_id,
    session.SteamID,
    session.steamid,
  ].filter((v) => v != null && v !== "");
  if (
    !ids.length ||
    ids.some((v) => !validSteamId(v)) ||
    new Set(ids).size !== 1
  )
    throw new Error(localeText.aConsistentSteamID64StringIsRequired);
  const steamId = ids[0];
  if (
    typeof mafile.account_name !== "string" ||
    !(
      allowMissingAuthenticator
        ? /^[A-Za-z0-9_]{1,128}$/
        : /^[A-Za-z0-9_]{1,64}$/
    ).test(mafile.account_name)
  )
    throw new Error(localeText.invalidSteamAccountName);
  if (
    mafile.device_id != null &&
    (typeof mafile.device_id !== "string" ||
      !/^android:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        mafile.device_id,
      ))
  )
    throw new Error(localeText.invalidDeviceId);
  if (mafile.identity_secret && !mafile.device_id)
    throw new Error(localeText.confirmationsRequireTheOriginalDeviceId);
  for (const field of ["AccessToken", "RefreshToken"]) {
    if (session[field]) {
      const data = tokenData(session[field]);
      if (
        !data ||
        String(data.sub) !== steamId ||
        (allowMissingAuthenticator &&
          (!data.aud.includes("mobile") ||
            data.aud.includes("derive") !== (field === "RefreshToken")))
      )
        throw new Error(
          localeText.sessionTokenBelongsToAnotherAccountOrIsDamaged,
        );
    }
  }
  return {
    id: crypto.randomUUID(),
    name: mafile.account_name,
    steamId,
    groupId: null,
    proxyIds: [],
    inheritProxy: true,
    deviceName: randomDeviceName(),
    mafile,
    ...accountPolicy({}),
  };
}
class SteamService {
  constructor({
    transport,
    onChange = () => {},
    onEvent = () => {},
    normalizeAvatar = (value) => value,
    getBansApiKey = () => null,
  }) {
    if (!transport || typeof transport.request !== "function")
      throw new Error(localeText.aProtectedProxyTransportIsRequired);
    this.transport = transport;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.normalizeAvatar = normalizeAvatar;
    this.getBansApiKey = getBansApiKey;
    this.banRefreshes = new WeakMap();
    this.banAttemptAt = new WeakMap();
    this.epoch = 0;
    this.sessions = new Map();
    this.offsets = new Map();
    this.timeSyncedAt = new Map();
    this.confirmations = new Map();
    this.confirmationFetches = new Map();
    this.confirmationProfileAvatars = new Map();
    this.confirmationImageCache = new Map();
    this.confirmationImageBytes = 0;
    this.busy = new Set();
    this.refreshes = new Map();
    this.lootAuthFailures = new WeakMap();
    this.sessionPreparations = new Map();
    this.cookiePreparations = new Map();
    this.uncertain = new Set();
    this.responding = new Set();
  }
  _assert(epoch) {
    if (epoch !== this.epoch)
      throw new Error(localeText.operationCancelled_bd689af);
  }
  _now(account) {
    return Math.floor(Date.now() / 1000 + (this.offsets.get(account.id) || 0));
  }
  getCode(account) {
    if (!account.mafile?.shared_secret)
      throw new Error(localeText.message_68cd5e2);
    const now = this._now(account);
    return {
      code: steamCode(account.mafile.shared_secret, now),
      remainingSeconds: 30 - (now % 30),
    };
  }
  cancelAll() {
    clearCommunityCookieCache(this);
    this.epoch++;
    for (const entry of this.sessions.values()) {
      entry.cancelled = true;
      entry.finishLogin?.(false);
      entry.session.cancelLoginAttempt();
      entry.adapter.cancel();
    }
    this.sessions.clear();
    this.confirmations.clear();
    this.confirmationFetches.clear();
    this.confirmationProfileAvatars.clear();
    this.confirmationImageCache.clear();
    this.confirmationImageBytes = 0;
    this.offsets.clear();
    this.timeSyncedAt.clear();
    this.refreshes.clear();
    this.sessionPreparations.clear();
    this.cookiePreparations.clear();
    this.lootAuthFailures = new WeakMap();
    this.banRefreshes = new WeakMap();
    this.banAttemptAt = new WeakMap();
  }
  async _request(account, url, options = {}, epoch = this.epoch) {
    this._assert(epoch);
    const result = await this.transport.request(account, url, options);
    this._assert(epoch);
    if (result.statusCode < 200 || result.statusCode >= 300)
      throw new Error(`Steam HTTP ${result.statusCode}`);
    return result;
  }
  async _saveBans(account, observation, epoch) {
    this._assert(epoch);
    const next = mergeAccountBans(account.bans, observation);
    if (
      JSON.stringify(next) !==
      JSON.stringify(normalizeAccountBans(account.bans))
    ) {
      account.bans = next;
      await this.onChange(account);
      this._assert(epoch);
    }
    return normalizeAccountBans(account.bans);
  }
  async lookupBans(routeAccount, steamId, { apiKey } = {}) {
    if (!routeAccount || !/^765\d{14}$/.test(steamId))
      throw Error(localeText.message_c1a5be3);
    const epoch = this.epoch;
    let observation = null;
    if (
      typeof this.transport.routes !== "function" ||
      !this.transport.routes(routeAccount).length
    )
      return normalizeAccountBans();
    const existingKey = apiKey ?? (await this.getBansApiKey(routeAccount));
    this._assert(epoch);
    // Keys are supplied explicitly by trusted main-process code. Never create,
    // scrape or substitute a session token for the documented API key.
    if (
      typeof existingKey === "string" &&
      /^[A-Fa-f0-9]{32}$/.test(existingKey)
    ) {
      try {
        const query = new URLSearchParams({
          key: existingKey,
          steamids: steamId,
        });
        const response = await this._request(
          routeAccount,
          API + "/ISteamUser/GetPlayerBans/v1/?" + query,
          { method: "GET", retrySafe: true, maxBodyBytes: 256 * 1024 },
          epoch,
        );
        observation = playerBansFromApi(
          JSON.parse(String(response.body)),
          steamId,
        );
      } catch (error) {
        this._assert(epoch);
        if (
          error.code === "STEAM_RATE_LIMIT" ||
          error.statusCode === 429 ||
          /HTTP 429\b/.test(error.message)
        )
          return normalizeAccountBans();
      }
    }
    if (!observation) {
      try {
        const response = await this._request(
          routeAccount,
          COMMUNITY + "/profiles/" + steamId + "/?xml=1",
          { method: "GET", retrySafe: true, maxBodyBytes: MAX_XML_BYTES },
          epoch,
        );
        observation = profileBansFromXml(response.body, steamId);
      } catch {
        this._assert(epoch);
      }
    }

    this._assert(epoch);
    return observation
      ? mergeAccountBans(undefined, observation)
      : normalizeAccountBans();
  }
  async lookupBansBatch(routeAccount, steamIds, { apiKey } = {}) {
    if (
      !Array.isArray(steamIds) ||
      steamIds.length > 100 ||
      new Set(steamIds).size !== steamIds.length ||
      steamIds.some((id) => typeof id !== "string" || !/^765\d{14}$/.test(id))
    )
      throw Error(localeText.message_a5f098b);
    const unknown = () =>
      Object.fromEntries(steamIds.map((id) => [id, normalizeAccountBans()]));
    if (!steamIds.length) return {};
    const epoch = this.epoch;
    if (
      typeof this.transport.routes !== "function" ||
      !this.transport.routes(routeAccount).length
    )
      return unknown();
    const existingKey = apiKey ?? (await this.getBansApiKey(routeAccount));
    this._assert(epoch);
    if (
      typeof existingKey !== "string" ||
      !/^[a-fA-F0-9]{32}$/.test(existingKey)
    )
      return unknown();
    let payload;
    try {
      const query = new URLSearchParams({
        key: existingKey,
        steamids: steamIds.join(","),
      });
      const response = await this._request(
        routeAccount,
        API + "/ISteamUser/GetPlayerBans/v1/?" + query,
        { method: "GET", retrySafe: true, maxBodyBytes: 256 * 1024 },
        epoch,
      );
      payload = JSON.parse(String(response.body));
    } catch {
      this._assert(epoch);
      return unknown();
    }
    this._assert(epoch);
    return Object.fromEntries(
      steamIds.map((id) => {
        const observation = playerBansFromApi(payload, id);
        return [
          id,
          observation
            ? mergeAccountBans(undefined, observation)
            : normalizeAccountBans(),
        ];
      }),
    );
  }
  async refreshBans(account, { force = false, apiKey } = {}) {
    if (!/^765\d{14}$/.test(account?.steamId))
      throw Error(localeText.message_c1a5be3);
    const epoch = this.epoch;
    const prior = normalizeAccountBans(account.bans),
      now = Date.now();
    if (this.banRefreshes.has(account)) return this.banRefreshes.get(account);
    const effectiveKey = apiKey ?? (await this.getBansApiKey(account));
    this._assert(epoch);
    if (this.banRefreshes.has(account)) return this.banRefreshes.get(account);
    const keyed =
      typeof effectiveKey === "string" &&
      /^[a-fA-F0-9]{32}$/.test(effectiveKey);
    const needsAuthoritative =
      keyed && (prior.community === null || prior.game === null);
    const last = this.banAttemptAt.get(account);
    if (
      !force &&
      ((!needsAuthoritative &&
        prior.checkedAt &&
        now - Date.parse(prior.checkedAt) < 6 * 3600000) ||
        (last &&
          last.keyed === keyed &&
          now - last.at <
            (last.success && !needsAuthoritative ? 6 * 3600000 : 60000)))
    )
      return prior;
    this.banAttemptAt.set(account, { at: now, keyed });
    const task = (async () => {
      const observation = await this.lookupBans(account, account.steamId, {
        apiKey: effectiveKey,
      });
      this._assert(epoch);
      if (observation.checkedAt)
        this.banAttemptAt.set(account, { at: now, keyed, success: true });
      return observation.checkedAt
        ? this._saveBans(account, observation, epoch)
        : normalizeAccountBans(account.bans);
    })().finally(() => {
      if (this.banRefreshes.get(account) === task)
        this.banRefreshes.delete(account);
    });
    this.banRefreshes.set(account, task);
    return task;
  }
  async fetchAvatar(account) {
    const epoch = this.epoch;
    this._assert(epoch);
    if (!/^765\d{14}$/.test(account.steamId)) return null;
    try {
      const xml = await this._request(
        account,
        COMMUNITY + "/profiles/" + account.steamId + "/?xml=1",
        { method: "GET", retrySafe: true, maxBodyBytes: MAX_XML_BYTES },
        epoch,
      );
      const observation = profileBansFromXml(xml.body, account.steamId);
      if (
        observation &&
        typeof this.transport.routes === "function" &&
        this.transport.routes(account).length
      )
        await this._saveBans(account, observation, epoch);
      const url = avatarFromXml(xml.body, account.steamId);
      if (!url) return null;
      const image = await this._request(
        account,
        url,
        { method: "GET", retrySafe: true, maxBodyBytes: MAX_AVATAR_BYTES },
        epoch,
      );
      return imageDataUrl(image.body, image.headers?.["content-type"]);
    } catch {
      this._assert(epoch);
      return null;
    }
  }
  async refreshAvatar(account) {
    const epoch = this.epoch;
    const dataUrl = await this.fetchAvatar(account);
    this._assert(epoch);
    if (!dataUrl) return false;
    let normalized;
    try {
      normalized = await this.normalizeAvatar(dataUrl);
    } catch {
      this._assert(epoch);
      return false;
    }
    this._assert(epoch);
    if (!updateAvatarCache(account, normalized)) return false;
    await this.onChange(account);
    this._assert(epoch);
    return true;
  }
  _adapter(account, epoch, assertCurrent = () => {}) {
    let cancelled = false;
    return {
      cancel() {
        cancelled = true;
      },
      close() {},
      sendRequest: async (request) => {
        this._assert(epoch);
        assertCurrent();
        if (cancelled) throw new Error(localeText.loginCancelled);
        if (
          request.apiInterface !== "Authentication" ||
          !AUTH_METHODS.has(request.apiMethod) ||
          request.apiVersion !== 1 ||
          !(request.requestData instanceof Uint8Array) ||
          request.requestData.length > 262144
        )
          throw new Error(localeText.unknownAuthenticationRequest);
        let data = Buffer.from(request.requestData || []);
        if (request.apiMethod === "BeginAuthSessionViaCredentials") {
          const proto = getProtoForMethod(
            request.apiInterface,
            request.apiMethod,
          ).request;
          const value = proto.decode(data);
          value.device_details ||= {};
          value.device_details.device_friendly_name = account.deviceName;
          value.device_friendly_name = account.deviceName;
          data = Buffer.from(proto.encode(value).finish());
        }
        const url = new URL(
          `${API}/IAuthenticationService/${request.apiMethod}/v${request.apiVersion}/`,
        );
        if (request.accessToken)
          url.searchParams.set("access_token", request.accessToken);
        const get = request.apiMethod === "GetPasswordRSAPublicKey";
        const boundary = `----SmartSDA${crypto.randomBytes(12).toString("hex")}`;
        const multipart = `--${boundary}\r\nContent-Disposition: form-data; name="input_protobuf_encoded"\r\n\r\n${data.toString("base64")}\r\n--${boundary}--\r\n`;
        if (get) {
          url.searchParams.set(
            "input_protobuf_encoded",
            data.toString("base64"),
          );
          url.searchParams.set("origin", "SteamMobile");
        }
        const result = await this._request(
          account,
          url.href,
          {
            method: get ? "GET" : "POST",
            headers: {
              ...request.headers,
              ...MOBILE,
              cookie: "mobileClient=android; mobileClientVersion=777777 3.10.3",
              ...(get
                ? {}
                : {
                    "content-type": `multipart/form-data; boundary=${boundary}`,
                  }),
            },
            body: get ? undefined : multipart,
            retrySafe: get || request.apiMethod === "PollAuthSessionStatus",
            beforeDispatch: () => {
              this._assert(epoch);
              assertCurrent();
              if (cancelled) throw new Error(localeText.loginCancelled);
            },
          },
          epoch,
        );
        if (cancelled) throw new Error(localeText.loginCancelled);
        const header = result.headers["x-eresult"];
        if (
          !header ||
          !/^\d+$/.test(String(header)) ||
          Number(header) < 1 ||
          Number(header) > 255 ||
          !Buffer.isBuffer(result.body) ||
          result.body.length > 2 * 1024 * 1024
        )
          throw new Error(localeText.invalidSteamAuthenticationResponse);
        if (
          request.apiMethod === "BeginAuthSessionViaCredentials" &&
          Number(header) === 1
        ) {
          const proto = getProtoForMethod(
            request.apiInterface,
            request.apiMethod,
          ).response;
          const response = proto.toObject(proto.decode(result.body), {
            longs: String,
          });
          if (response.steamid !== account.steamId)
            throw new Error(localeText.loginBelongsToAnotherSteamID);
        }
        return { result: Number(header), responseData: result.body };
      },
    };
  }
  _newSession(account, epoch, assertCurrent = () => {}) {
    const adapter = this._adapter(account, epoch, assertCurrent);
    // MobileApp credential/refresh flows use ITransport. Block the library's separate
    // web client too, so future library changes cannot silently introduce direct egress.
    const denyAgent = new https.Agent();
    denyAgent.addRequest = () => {
      throw new Error(localeText.directNetworkAccessForbidden);
    };
    return {
      session: new LoginSession(EAuthTokenPlatformType.MobileApp, {
        transport: adapter,
        agent: denyAgent,
      }),
      adapter,
      cancelled: false,
    };
  }
  _assertAutomaticLoginAvailable(account) {
    const entry = this.sessions.get(account.id);
    if (entry && !entry.complete && !entry.failed && !entry.cancelled) {
      const message = localeText.message_66206ef;
      throw Object.assign(new Error(message), {
        code: "LOOT_LOGIN_PENDING",
        lootSafeMessage: message,
      });
    }
  }
  async login(
    account,
    {
      password,
      guardCode,
      waitForCompletion = false,
      automatic = false,
      assertCurrent = () => {},
    } = {},
  ) {
    if (typeof password !== "string" || !password)
      throw new Error(localeText.enterYourSteamPassword);
    assertCurrent();
    if (automatic) this._assertAutomaticLoginAvailable(account);
    const previous = this.sessions.get(account.id);
    if (previous) {
      previous.cancelled = true;
      previous.finishLogin?.(false);
      previous.session.cancelLoginAttempt();
      previous.adapter.cancel();
    }
    const epoch = this.epoch;
    const entry = this._newSession(account, epoch, assertCurrent);
    this.sessions.set(account.id, entry);
    const { session } = entry;
    session.loginTimeout = 120000;
    let completion, deadline;
    if (waitForCompletion) {
      completion = new Promise((resolve) => {
        let settled = false;
        entry.finishLogin = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          resolve(ok);
        };
      });
      deadline = setTimeout(() => {
        entry.failed = true;
        entry.cancelled = true;
        if (automatic)
          entry.loginError = Object.assign(
            new Error(localeText.loginTimedOut),
            {
              code: "ETIMEDOUT",
            },
          );
        entry.finishLogin(false);
        session.cancelLoginAttempt();
        entry.adapter.cancel();
        if (this.sessions.get(account.id) === entry)
          this.sessions.delete(account.id);
      }, 120000);
      deadline.unref?.();
    }
    session.on("error", (error) => {
      if (this.epoch === epoch && this.sessions.get(account.id) === entry) {
        entry.failed = true;
        if (error?.code === "STEAM_RATE_LIMIT") entry.loginError = error;
        else if (automatic)
          entry.loginError = Object.assign(
            new Error(localeText.validationMessage_74b7c59, {
              cause: error,
            }),
            { eresult: error?.eresult },
          );
        entry.finishLogin?.(false);
        this.sessions.delete(account.id);
        this.onEvent({
          accountId: account.id,
          type: "login-error",
          message: entry.loginError?.message || localeText.steamLoginFailed,
        });
      }
    });
    session.on("timeout", () => {
      entry.failed = true;
      if (automatic)
        entry.loginError = Object.assign(new Error(localeText.loginTimedOut), {
          code: "ETIMEDOUT",
        });
      entry.finishLogin?.(false);
      if (this.epoch === epoch && this.sessions.get(account.id) === entry) {
        this.sessions.delete(account.id);
        this.onEvent({
          accountId: account.id,
          type: "login-timeout",
          message: localeText.loginTimedOut,
        });
      }
    });
    session.on("authenticated", async () => {
      if (
        this.epoch !== epoch ||
        entry.cancelled ||
        this.sessions.get(account.id) !== entry
      )
        return;
      try {
        assertCurrent();
        if (session.steamID?.getSteamID64() !== account.steamId)
          throw new Error(localeText.loginBelongsToAnotherSteamID);
        const access = tokenData(session.accessToken),
          refresh = tokenData(session.refreshToken);
        if (
          !access ||
          !refresh ||
          access.sub !== account.steamId ||
          refresh.sub !== account.steamId ||
          !mobileTokenEligible(
            session.accessToken,
            account.steamId,
            false,
            session.refreshToken,
            this._now(account),
          ) ||
          !mobileTokenEligible(
            session.refreshToken,
            account.steamId,
            true,
            null,
            this._now(account),
          )
        )
          throw new Error(localeText.invalidSteamSessionTokens);
        const hadSession = Object.hasOwn(account.mafile, "Session");
        const previousSession = account.mafile.Session;
        const nextSession = {
          ...account.mafile.Session,
          SteamID: account.steamId,
          AccessToken: session.accessToken,
          RefreshToken: session.refreshToken,
          SessionID: crypto.randomBytes(16).toString("hex"),
        };
        account.mafile.Session = nextSession;
        try {
          await this.onChange(account);
        } catch (error) {
          if (account.mafile.Session === nextSession) {
            if (hadSession) account.mafile.Session = previousSession;
            else delete account.mafile.Session;
          }
          if (automatic) error.lootFatal = true;
          throw error;
        }
        this._assert(epoch);
        assertCurrent();
        if (entry.cancelled || this.sessions.get(account.id) !== entry)
          throw Error(localeText.operationCancelled_bd689af);
        entry.complete = true;
        this.lootAuthFailures.delete(account);
        entry.finishLogin?.(true);
        this.onEvent({
          accountId: account.id,
          type: "login-complete",
          message: localeText.steamSessionUpdated,
        });
      } catch (error) {
        if (automatic) entry.loginError = error;
        entry.failed = true;
        entry.finishLogin?.(false);
        if (this.epoch === epoch)
          this.onEvent({
            accountId: account.id,
            type: "login-error",
            message: automatic
              ? localeText.message_78613df
              : localeText.sessionSteamIDDoesNotMatchTheAccount,
          });
      }
      if (this.sessions.get(account.id) === entry)
        this.sessions.delete(account.id);
      if (entry.complete && this.epoch === epoch && !automatic)
        void this.refreshAvatar(account).catch(() => {});
    });
    try {
      if (!guardCode && account.mafile?.shared_secret) {
        await this.syncTime(account, { assertCurrent });
        this._assert(epoch);
        assertCurrent();
        guardCode = this.getCode(account).code;
      }
      const starting = session.startWithCredentials({
        accountName: account.mafile.account_name,
        password,
        ...(guardCode ? { steamGuardCode: guardCode } : {}),
      });
      const result = await (completion
        ? Promise.race([
            starting,
            completion.then((ok) => {
              if (!ok)
                throw entry.loginError || Error(localeText.message_ec4d6f3);
              return {};
            }),
          ])
        : starting);
      this._assert(epoch);
      assertCurrent();
      if (automatic && result.actionRequired && !entry.complete)
        throw Object.assign(new Error(localeText.validationMessage_d1ddb07), {
          code: "LOOT_MANUAL_AUTH_REQUIRED",
        });
      if (session.steamID?.getSteamID64() !== account.steamId) {
        session.cancelLoginAttempt();
        entry.adapter.cancel();
        this.sessions.delete(account.id);
        throw new Error(localeText.loginBelongsToAnotherSteamID);
      }
      if (entry.failed)
        throw entry.loginError || new Error(localeText.steamLoginFailed);
      if (completion && !(await completion))
        throw entry.loginError || new Error(localeText.message_ec4d6f3);
      this._assert(epoch);
      assertCurrent();
      return {
        status: entry.complete ? "complete" : "pending",
        actionRequired: !!result.actionRequired,
        validActions: (result.validActions || []).map((a) => ({
          type: a.type,
        })),
      };
    } catch (error) {
      entry.finishLogin?.(false);
      session.cancelLoginAttempt();
      entry.adapter.cancel();
      if (this.sessions.get(account.id) === entry)
        this.sessions.delete(account.id);
      throw error;
    }
  }
  async submitGuard(account, code) {
    if (typeof code !== "string" || !/^[A-Za-z0-9]{5,8}$/.test(code))
      throw new Error(localeText.invalidSteamGuardCode);
    const entry = this.sessions.get(account.id);
    if (!entry) throw new Error(localeText.startLoginFirst);
    const epoch = this.epoch;
    await entry.session.submitSteamGuardCode(code);
    this._assert(epoch);
    return { status: entry.complete ? "complete" : "pending" };
  }
  async syncTime(account, { assertCurrent = () => {} } = {}) {
    const epoch = this.epoch;
    assertCurrent();
    const started = Date.now();
    const monotonicStarted = performance.now();
    const response = await this._request(
      account,
      `${API}/ITwoFactorService/QueryTime/v1/`,
      {
        method: "POST",
        body: "steamid=0",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        retrySafe: true,
        beforeDispatch: () => {
          this._assert(epoch);
          assertCurrent();
        },
      },
      epoch,
    );
    let time;
    try {
      time = Number(JSON.parse(response.body).response.server_time);
    } catch {
      throw new Error(localeText.invalidSteamTimeResponse);
    }
    const received = Date.now();
    const monotonicElapsed = performance.now() - monotonicStarted;
    const timing = response.timing;
    const hasTiming =
      Number.isFinite(timing?.startedAtMs) &&
      Number.isFinite(timing?.elapsedMs);
    const sent = hasTiming ? timing.startedAtMs : started;
    const arrived = hasTiming ? sent + timing.elapsedMs : received;
    if (
      !Number.isSafeInteger(time) ||
      time < 1000000000 ||
      arrived < sent ||
      arrived - sent > 10000 ||
      arrived > received + 10 ||
      received - arrived > 5000 ||
      Math.abs(received - started - monotonicElapsed) > 1000
    )
      throw new Error(localeText.invalidSteamTime);
    this.offsets.set(account.id, time - (sent + arrived) / 2000);
    this.timeSyncedAt.set(account.id, arrived);
    return {
      synchronized: true,
      offsetSeconds: Math.round(this.offsets.get(account.id)),
    };
  }
  async _ensureTime(account) {
    const age = Date.now() - (this.timeSyncedAt.get(account.id) || 0);
    if (!this.offsets.has(account.id) || age < 0 || age >= 5 * 60 * 1000)
      await this.syncTime(account);
  }
  async ensureSession(account, options = {}) {
    const epoch = this.epoch;
    const assertCurrent = options.assertCurrent || (() => {});
    this._assert(epoch);
    assertCurrent();
    let task = this.sessionPreparations.get(account.id);
    if (!task) {
      // The initiating operation owns preparation; joiners recheck their own
      // cancellation before cookies or authenticated use.
      task = this._prepareSession(account, options);
      task.verifyRoute = options.verifyRoute === true;
      this.sessionPreparations.set(account.id, task);
    }
    try {
      const result = await task;
      this._assert(epoch);
      assertCurrent();
      // A loot caller joining ordinary session preparation still needs its
      // route-readiness policy before proceeding with loot operations.
      if (options.verifyRoute && !task.verifyRoute &&
          typeof this.transport.ensureRoute === "function") {
        options.onPhase?.("proxy");
        await this.transport.ensureRoute(account, {
          assertCurrent: () => { this._assert(epoch); assertCurrent(); },
          onDetail: options.onDetail,
        });
        this._assert(epoch);
        assertCurrent();
      }
      if (options.cookieSession !== false)
        await this._ensureCookieSession(account, () => {
          this._assert(epoch);
          assertCurrent();
        });
      this._assert(epoch);
      assertCurrent();
      return result;
    } finally {
      if (this.sessionPreparations.get(account.id) === task)
        this.sessionPreparations.delete(account.id);
    }
  }
  async _ensureCookieSession(account, guard) {
    guard();
    let task = this.cookiePreparations.get(account.id);
    if (!task) {
      task = (async () => {
        const previous = account.mafile.Session;
        if (/^[a-fA-F0-9]{16,64}$/.test(previous?.SessionID || "")) return;
        const next = {
          ...previous,
          SessionID: crypto.randomBytes(16).toString("hex"),
        };
        account.mafile.Session = next;
        try {
          await this.onChange(account);
        } catch (error) {
          if (account.mafile.Session === next) account.mafile.Session = previous;
          error.lootFatal = true;
          throw error;
        }
      })();
      this.cookiePreparations.set(account.id, task);
    }
    try {
      await task;
      guard();
    } finally {
      if (this.cookiePreparations.get(account.id) === task)
        this.cookiePreparations.delete(account.id);
    }
  }
  async ensureLootSession(account, options = {}) {
    return this.ensureSession(account, { ...options, verifyRoute: true });
  }
  async _prepareSession(
    account,
    { assertCurrent = () => {}, onPhase = () => {}, onDetail, verifyRoute = false } = {},
  ) {
    const epoch = this.epoch;
    const guard = () => {
      try {
        this._assert(epoch);
        assertCurrent();
      } catch (error) {
        error.noRetry = true;
        throw error;
      }
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
    this._assertAutomaticLoginAvailable(account);
    if (verifyRoute) onPhase("proxy");
    if (verifyRoute && typeof this.transport.ensureRoute === "function")
      await this.transport.ensureRoute(account, {
        assertCurrent: guard,
        onDetail: typeof onDetail === "function" ? detail : undefined,
      });
    guard();
    this._assertAutomaticLoginAvailable(account);
    onPhase("session");
    const previousAccessToken = account.mafile.Session?.AccessToken;
    try {
      await this._refresh(account, false, { assertCurrent: guard });
      guard();
      this._assertAutomaticLoginAvailable(account);
      this.lootAuthFailures.delete(account);
      detail({
        type:
          account.mafile.Session?.AccessToken !== previousAccessToken
            ? "session-refreshed"
            : "session-ready",
      });
      return { status: "ready" };
    } catch (error) {
      guard();
      const needsLogin =
        new RegExp(localeText.pattern_79ad207, "").test(error.message || "") ||
        error.message === localeText.steamSessionDamagedOrExpiredLogInAgain ||
        [5, 15, 27].includes(error.eresult);
      // A failed connection is not evidence that credentials need replacing.
      if (error.lootFatal || !needsLogin) throw error;
    }
    const password = account.loginPassword;
    if (typeof password !== "string" || !password)
      throw Object.assign(new Error(localeText.validationMessage_5b21a29), {
        lootSkipSource: true,
        lootSafeMessage: localeText.validationMessage_5b21a29,
      });
    const fingerprint = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");
    const blocked = this.lootAuthFailures.get(account);
    if (blocked?.fingerprint === fingerprint) throw blocked.error;
    guard();
    this._assertAutomaticLoginAvailable(account);
    onPhase("auth");
    detail({ type: "auth-start" });
    try {
      const result = await this.login(account, {
        password,
        waitForCompletion: true,
        automatic: true,
        assertCurrent: guard,
      });
      guard();
      if (result.status !== "complete")
        throw Object.assign(new Error(localeText.validationMessage_d1ddb07), {
          code: "LOOT_MANUAL_AUTH_REQUIRED",
        });
      await this._refresh(account, false, { assertCurrent: guard });
      guard();
      this._assertAutomaticLoginAvailable(account);
      detail({ type: "auth-success" });
      return { status: "authenticated" };
    } catch (error) {
      guard();
      if (error.lootFatal || error.code === "LOOT_LOGIN_PENDING") throw error;
      this._assertAutomaticLoginAvailable(account);
      const manual = error.code === "LOOT_MANUAL_AUTH_REQUIRED";
      const permanent = manual || [5, 15, 65, 85, 88].includes(error.eresult);
      const message = manual
        ? localeText.validationMessage_d1ddb07
        : permanent
          ? localeText.message_f904879
          : localeText.validationMessage_74b7c59;
      const safe = Object.assign(new Error(message, { cause: error }), {
        lootSafeMessage: message,
        ...(permanent ? { lootSkipSource: true } : {}),
      });
      // Prevent three schemes retrying the same rejected password or challenge.
      // Explicit successful login, edited password, or vault lock clears this gate.
      if (permanent)
        this.lootAuthFailures.set(account, { fingerprint, error: safe });
      throw safe;
    }
  }
  async _refresh(account, force = false, { assertCurrent = () => {} } = {}) {
    const epoch = this.epoch;
    assertCurrent();
    const old = account.mafile.Session || {};
    const data = tokenData(old.AccessToken || "");
    if (
      !force &&
      old.AccessToken &&
      data &&
      mobileTokenEligible(
        old.AccessToken,
        account.steamId,
        false,
        old.RefreshToken,
        this._now(account) + 60,
      )
    )
      return;
    if (!old.RefreshToken) throw new Error(localeText.logInToSteam);
    const refreshData = tokenData(old.RefreshToken);
    if (
      !refreshData ||
      !mobileTokenEligible(
        old.RefreshToken,
        account.steamId,
        true,
        null,
        this._now(account),
      )
    )
      throw new Error(localeText.steamSessionDamagedOrExpiredLogInAgain);
    if (this.refreshes.has(account.id)) return this.refreshes.get(account.id);
    const promise = (async () => {
      const entry = this._newSession(account, epoch, assertCurrent);
      entry.session.on("error", () => {});
      entry.session.refreshToken = old.RefreshToken;
      try {
        await entry.session.refreshAccessToken();
        this._assert(epoch);
        assertCurrent();
        if (entry.session.steamID?.getSteamID64() !== account.steamId)
          throw new Error(localeText.tokenSteamIDDoesNotMatch);
        const access = tokenData(entry.session.accessToken);
        if (
          !access ||
          !mobileTokenEligible(
            entry.session.accessToken,
            account.steamId,
            false,
            old.RefreshToken,
            this._now(account),
          )
        )
          throw new Error(localeText.steamReturnedAnInvalidToken);
        const hadSession = Object.hasOwn(account.mafile, "Session");
        const previousSession = account.mafile.Session;
        const nextSession = {
          ...old,
          AccessToken: entry.session.accessToken,
          SteamID: account.steamId,
          SessionID: old.SessionID || crypto.randomBytes(16).toString("hex"),
        };
        account.mafile.Session = nextSession;
        try {
          await this.onChange(account);
        } catch (error) {
          if (account.mafile.Session === nextSession) {
            if (hadSession) account.mafile.Session = previousSession;
            else delete account.mafile.Session;
          }
          error.lootFatal = true;
          throw error;
        }
        this._assert(epoch);
      } finally {
        entry.adapter.cancel();
      }
    })();
    this.refreshes.set(account.id, promise);
    try {
      await promise;
    } finally {
      if (this.refreshes.get(account.id) === promise)
        this.refreshes.delete(account.id);
    }
  }
  _cookie(account) {
    const s = account.mafile.Session || {};
    if (typeof s.AccessToken !== "string" || /[\r\n;]/.test(s.AccessToken))
      throw new Error(localeText.invalidSteamToken);
    return `steamLoginSecure=${account.steamId}%7C%7C${s.AccessToken}; sessionid=${/^[a-fA-F0-9]{16,64}$/.test(s.SessionID || "") ? s.SessionID : ""}; mobileClient=android; mobileClientVersion=777777 3.10.3`;
  }
  _query(account, tag) {
    if (!account.mafile.identity_secret || !account.mafile.device_id)
      throw new Error(localeText.mafileHasNoConfirmationCredentials);
    const time = this._now(account);
    return new URLSearchParams({
      p: account.mafile.device_id,
      a: account.steamId,
      k: confirmationKey(account.mafile.identity_secret, time, tag),
      t: String(time),
      m: "react",
      tag,
    });
  }
  confirmationStatus(account) {
    const fetchedAt = this.confirmationFetches.get(account.id);
    const entries = this.confirmations.get(account.id);
    const known =
      Number.isFinite(fetchedAt) &&
      Date.now() - fetchedAt <= 5 * 60 * 1000 &&
      Boolean(entries);
    return {
      known,
      count: known ? entries.size : null,
      fetchedAt: known ? fetchedAt : null,
    };
  }
  async listConfirmations(account, refreshed = false) {
    this.confirmationFetches.delete(account.id);
    // Validate identity capability before any refresh or other network activity.
    if (!account.mafile.identity_secret || !account.mafile.device_id)
      throw new Error(localeText.mafileHasNoConfirmationCredentials);
    const epoch = this.epoch;
    await this._ensureTime(account);
    this._assert(epoch);
    await this.ensureSession(account, { cookieSession: false });
    this._assert(epoch);
    const query = this._query(account, "conf");
    const response = await this._request(
      account,
      `${COMMUNITY}/mobileconf/getlist?${query}`,
      { headers: { ...MOBILE, cookie: this._cookie(account) } },
      epoch,
    );
    let data;
    try {
      data = JSON.parse(response.body, (key, value, context) => {
        if (
          ["id", "nonce", "creator_id"].includes(key) &&
          typeof value === "number"
        ) {
          if (!context || !/^\d+$/.test(context.source))
            throw new Error(localeText.invalidIdentifier);
          return context.source;
        }
        return value;
      });
    } catch {
      throw new Error(localeText.invalidSteamConfirmationResponse);
    }
    if (data.needauth && !refreshed) {
      await this._refresh(account, true);
      this._assert(epoch);
      return this.listConfirmations(account, true);
    }
    if (data.needauth) throw new Error(localeText.pleaseLogInToSteamAgain);
    if (
      data.success !== true ||
      !Array.isArray(data.conf) ||
      data.conf.length > 500
    )
      throw new Error(localeText.couldNotLoadSteamConfirmations);
    const stored = new Map();
    const results = [];
    for (const item of data.conf) {
      if (
        !item ||
        !/^\d+$/.test(String(item.id)) ||
        !/^\d+$/.test(String(item.nonce)) ||
        !Number.isSafeInteger(item.type) ||
        item.type < 0 ||
        stored.has(String(item.id))
      )
        throw new Error(localeText.invalidOrDuplicateSteamConfirmationRecord);
      const typeInfo = getConfirmationType(item.type);
      const safe = {
        id: String(item.id),
        type: Number(item.type),
        typeKey: typeInfo.key,
        category: typeInfo.category,
        automationPolicy: typeInfo.automationPolicy,
        typeName: String(item.type_name || "").slice(0, 200),
        creatorId: String(item.creator_id || ""),
        headline: String(item.headline || "").slice(0, 500),
        // At most 20 rows and 10,000 aggregate characters cross IPC.
        summary: Array.isArray(item.summary)
          ? item.summary.slice(0, 20).map((s) => String(s).slice(0, 500))
          : [],
        creationTime: Number(item.creation_time) || 0,
        held: (account.confirmationJournal || []).some(
          (entry) => entry.confirmationId === String(item.id),
        ),
        decisionState:
          (account.confirmationJournal || []).find(
            (entry) => entry.confirmationId === String(item.id),
          )?.state || null,
      };
      stored.set(safe.id, {
        ...safe,
        key: String(item.nonce),
        fetchedAt: Date.now(),
        detailImages: [],
      });
      results.push(safe);
    }
    this.confirmations.set(account.id, stored);
    this.confirmationFetches.set(account.id, Date.now());
    return results;
  }
  _confirmationForDetails(account, id) {
    if (typeof id !== "string" || !/^\d{1,32}$/.test(id))
      throw new Error(localeText.invalidConfirmation);
    const item = this.confirmations.get(account.id)?.get(id);
    if (!item || Date.now() - item.fetchedAt > 5 * 60 * 1000)
      throw new Error(localeText.refreshTheConfirmationList);
    return item;
  }
  async confirmationDetails(account, id) {
    const epoch = this.epoch,
      item = this._confirmationForDetails(account, id);
    if (item.details) return item.details;
    if (item.detailPromise) return item.detailPromise;
    const task = (async () => {
      await this._ensureTime(account);
      this._assert(epoch);
      await this.ensureSession(account, { cookieSession: false });
      this._assert(epoch);
      if (this._confirmationForDetails(account, id) !== item)
        throw new Error(localeText.refreshTheConfirmationList);
      const response = await this._request(
        account,
        `${COMMUNITY}/mobileconf/detailspage/${id}?${this._query(account, "details")}`,
        {
          headers: { ...MOBILE, cookie: this._cookie(account) },
          maxBodyBytes: MAX_DETAIL_BYTES,
          retrySafe: true,
        },
        epoch,
      );
      const html = response.body.toString("utf8");
      if (
        !/<(?:div|section)\b/i.test(html) ||
        /id=["'](?:login_form|loginForm)["']/i.test(html)
      )
        throw new Error(localeText.message_2f0e648);
      const parsed = parseConfirmationDetails(html, item, account.steamId);
      // Steam's trade page uses InitEconomyHovers instead of embedding names.
      // Resolve only class identifiers discovered in this authenticated page,
      // through fixed Community endpoints and this account's proxy route.
      const metadata = new Map();
      const metadataDeadline = Date.now() + 15000;
      const metadataDeadlineMonotonic = performance.now() + 15000;
      if ([2, 3, 12].includes(item.type))
        for (const asset of parsed.detail.items) {
          this._assert(epoch);
          if (this._confirmationForDetails(account, id) !== item)
            throw new Error(localeText.refreshTheConfirmationList);
          const remaining = Math.min(
            metadataDeadline - Date.now(),
            metadataDeadlineMonotonic - performance.now(),
          );
          if (remaining < 100) break;
          if (asset.name && asset.image !== null) continue;
          const economy = economyClass(asset.economyId);
          if (!economy) continue;
          const key = `${economy.appId}/${economy.classId}/${economy.instanceId}`;
          if (!metadata.has(key)) {
            if (metadata.size >= 20) continue;
            metadata.set(key, null);
            try {
              const hover = await this._request(
                account,
                `${COMMUNITY}/economy/itemclasshover/${key}?content_only=1&l=english`,
                {
                  method: "GET",
                  retrySafe: true,
                  maxBodyBytes: 256 * 1024,
                  timeoutMs: Math.min(5000, remaining),
                  deadline: metadataDeadline,
                  deadlineMonotonic: metadataDeadlineMonotonic,
                },
                epoch,
              );
              if (this._confirmationForDetails(account, id) !== item)
                throw new Error(localeText.refreshTheConfirmationList);
              metadata.set(
                key,
                parseEconomyHover(hover.body.toString("utf8"), economy),
              );
            } catch (error) {
              this._assert(epoch);
              if (this._confirmationForDetails(account, id) !== item)
                throw new Error(localeText.refreshTheConfirmationList);
              if (error.code === "STEAM_RATE_LIMIT" || error.noRetry) break;
              // Incomplete optional metadata is explicit in the review UI.
            }
          }
          const info = metadata.get(key);
          if (!info) continue;
          asset.name ||= info.name;
          for (const field of [
            "appId",
            "contextId",
            "classId",
            "instanceId",
            "traitKey",
          ])
            if (info[field] !== undefined && asset[field] === undefined)
              asset[field] = info[field];
          if (asset.image === null && info.imageUrl) {
            let index = parsed.images.indexOf(info.imageUrl);
            if (index === -1 && parsed.images.length < 100) {
              index = parsed.images.length;
              parsed.images.push(info.imageUrl);
            }
            if (index >= 0) asset.image = index;
            else parsed.detail.imagesTruncated = true;
          }
        }
      // Avatars follow the same account proxy route; only exact SteamID64 XML
      // endpoints and validated avatar hosts can add opaque image indexes.
      parsed.detail.owner = {
        steamId: account.steamId,
        name: account.name || account.accountName || null,
        avatar: safeCachedAvatar(account.avatar),
        image: null,
      };
      for (const person of parsed.detail.counterparties || []) {
        if (person.image !== null || !validSteamId(person.steamId)) continue;
        const remaining = Math.min(
          metadataDeadline - Date.now(),
          metadataDeadlineMonotonic - performance.now(),
        );
        if (remaining < 100) break;
        const cacheKey = account.id + ":" + person.steamId;
        let cached = this.confirmationProfileAvatars.get(cacheKey);
        if (cached && Date.now() - cached.at > 5 * 60 * 1000) cached = null;
        if (!cached) {
          try {
            const xml = await this._request(
              account,
              COMMUNITY + "/profiles/" + person.steamId + "/?xml=1",
              {
                method: "GET",
                retrySafe: true,
                maxBodyBytes: MAX_XML_BYTES,
                timeoutMs: Math.min(3000, remaining),
                deadline: metadataDeadline,
                deadlineMonotonic: metadataDeadlineMonotonic,
              },
              epoch,
            );
            if (this._confirmationForDetails(account, id) !== item)
              throw new Error(localeText.refreshTheConfirmationList);
            const url = avatarFromXml(xml.body, person.steamId);
            cached = { url, at: Date.now() };
            while (this.confirmationProfileAvatars.size >= 100)
              this.confirmationProfileAvatars.delete(
                this.confirmationProfileAvatars.keys().next().value,
              );
            this.confirmationProfileAvatars.set(cacheKey, cached);
          } catch (error) {
            this._assert(epoch);
            if (this._confirmationForDetails(account, id) !== item)
              throw new Error(localeText.refreshTheConfirmationList);
            if (error.code === "STEAM_RATE_LIMIT" || error.noRetry) break;
          }
        }
        if (cached?.url) {
          let index = parsed.images.indexOf(cached.url);
          if (index < 0 && parsed.images.length < 100) {
            index = parsed.images.length;
            parsed.images.push(cached.url);
          }
          if (index >= 0) person.image = index;
          else parsed.detail.imagesTruncated = true;
        }
      }
      parsed.detail.items = stackItems(parsed.detail.items);
      parsed.detail.partial =
        parsed.detail.itemsTruncated ||
        !parsed.detail.items.length ||
        parsed.detail.items.some(
          (asset) => !asset.name || asset.direction === "unknown",
        );
      this._assert(epoch);
      if (this._confirmationForDetails(account, id) !== item)
        throw new Error(localeText.refreshTheConfirmationList);
      // Return opaque image indexes, never remote URLs or confirmation nonces.
      item.detailImages = parsed.images;
      item.details = parsed.detail;
      return item.details;
    })();
    item.detailPromise = task;
    try {
      return await task;
    } finally {
      if (item.detailPromise === task) delete item.detailPromise;
    }
  }
  async confirmationImage(account, id, index) {
    const epoch = this.epoch,
      item = this._confirmationForDetails(account, id);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= item.detailImages.length
    )
      throw new Error(localeText.message_65cf304);
    const url = confirmationImageUrl(item.detailImages[index]);
    if (!url) throw new Error(localeText.message_65cf304);
    const key = JSON.stringify([account.id, id, index, url]);
    const cached = this.confirmationImageCache.get(key);
    if (cached) {
      this.confirmationImageCache.delete(key);
      if (cached.item === item) {
        this.confirmationImageCache.set(key, cached);
        return cached.dataUrl;
      }
      this.confirmationImageBytes -= cached.bytes;
    }
    item.imagePromises ||= new Map();
    if (item.imagePromises.has(index)) return item.imagePromises.get(index);
    const task = (async () => {
      const response = await this._request(
        account,
        url,
        { method: "GET", retrySafe: true, maxBodyBytes: MAX_AVATAR_BYTES },
        epoch,
      );
      const dataUrl = imageDataUrl(
        response.body,
        response.headers?.["content-type"],
      );
      if (!dataUrl) throw new Error(localeText.message_65cf304);
      this._assert(epoch);
      if (
        this._confirmationForDetails(account, id) !== item ||
        item.detailImages[index] !== url
      )
        throw new Error(localeText.refreshTheConfirmationList);
      // A service-wide LRU bounds retained images across every account and
      // confirmation. Count UTF-16 bytes conservatively for JS string storage.
      const bytes = Buffer.byteLength(dataUrl, "utf16le");
      while (
        this.confirmationImageCache.size &&
        (this.confirmationImageCache.size >= 32 ||
          this.confirmationImageBytes + bytes > 8 * 1024 * 1024)
      ) {
        const oldest = this.confirmationImageCache.keys().next().value;
        this.confirmationImageBytes -=
          this.confirmationImageCache.get(oldest).bytes;
        this.confirmationImageCache.delete(oldest);
      }
      if (bytes <= 8 * 1024 * 1024) {
        this.confirmationImageCache.set(key, { item, dataUrl, bytes });
        this.confirmationImageBytes += bytes;
      }
      return dataUrl;
    })();
    item.imagePromises.set(index, task);
    try {
      return await task;
    } finally {
      if (item.imagePromises.get(index) === task)
        item.imagePromises.delete(index);
    }
  }
  async respond(
    account,
    confirmation,
    accept,
    { assertCurrent = () => {} } = {},
  ) {
    if (typeof assertCurrent !== "function")
      throw new Error(localeText.validationMessage_e3341db);
    assertCurrent();
    const epoch = this.epoch;
    const id =
      typeof confirmation === "string"
        ? confirmation
        : String(confirmation?.id || "");
    const stored = this.confirmations.get(account.id)?.get(id);
    if (!stored || Date.now() - stored.fetchedAt > 5 * 60 * 1000)
      throw new Error(localeText.refreshTheConfirmationList);
    if (typeof accept !== "boolean")
      throw new Error(localeText.invalidConfirmationAction);
    const operationKey = `${account.id}:${id}`;
    if (
      this.responding.has(operationKey) ||
      (account.confirmationJournal || []).some(
        (entry) => entry.confirmationId === id,
      )
    )
      throw new Error(
        localeText.thisConfirmationHasARecordedActionCheckItsStateInSteamAutomaticRetriesBlocked,
      );
    this.responding.add(operationKey);
    try {
      assertCurrent();
      await this._ensureTime(account);
      this._assert(epoch);
      assertCurrent();
      await this.ensureSession(account, { assertCurrent, cookieSession: false });
      this._assert(epoch);
      assertCurrent();
      const current = this.confirmations.get(account.id)?.get(id);
      if (
        !current ||
        current.key !== stored.key ||
        current.creatorId !== stored.creatorId ||
        current.type !== stored.type ||
        Date.now() - stored.fetchedAt > 5 * 60 * 1000
      )
        throw new Error(localeText.confirmationChangedRefreshTheList);
      if ((account.confirmationJournal || []).length >= 10000)
        throw new Error(localeText.confirmationJournalFullNewActionsBlocked);
      const intent = {
        requestId: crypto.randomUUID(),
        confirmationId: id,
        fingerprint: crypto
          .createHash("sha256")
          .update(
            JSON.stringify([id, stored.key, stored.creatorId, stored.type]),
          )
          .digest("hex"),
        decision: accept ? "accept" : "reject",
        state: "dispatching",
        createdAt: new Date().toISOString(),
      };
      account.confirmationJournal ||= [];
      account.confirmationJournal.push(intent);
      // A durable encrypted intent is required before a possible remote mutation.
      await this.onChange(account);
      this._assert(epoch);
      assertCurrent();
      const query = this._query(account, accept ? "accept" : "reject");
      query.set("op", accept ? "allow" : "cancel");
      query.set("cid", id);
      query.set("ck", stored.key);
      // Remove before sending: a lost response must not cause a blind mutation retry.
      this.confirmations.get(account.id)?.delete(id);
      const uncertainKey = `${account.id}:${id}`;
      this.uncertain.add(uncertainKey);
      let response;
      try {
        response = await this._request(
          account,
          `${COMMUNITY}/mobileconf/ajaxop?${query}`,
          {
            headers: { ...MOBILE, cookie: this._cookie(account) },
            retrySafe: false,
            beforeDispatch: () => {
              this._assert(epoch);
              assertCurrent();
            },
          },
          epoch,
        );
      } catch {
        this._assert(epoch);
        throw new Error(
          localeText.actionOutcomeUnknownCheckTheOriginalActionInSteamRetriesBlocked,
        );
      }
      let data;
      try {
        data = JSON.parse(response.body);
      } catch {
        throw new Error(
          localeText.actionOutcomeUnknownCheckTheOriginalActionInSteamRetriesBlocked,
        );
      }
      if (data.success !== true)
        throw new Error(
          localeText.steamDidNotAcknowledgeTheActionCheckTheOriginalActionInSteamRetriesAre,
        );
      intent.state = "acknowledged";
      await this.onChange(account);
      this._assert(epoch);
      assertCurrent();
      this.uncertain.delete(uncertainKey);
      this.onEvent({
        accountId: account.id,
        type: accept ? "confirmation-accepted" : "confirmation-rejected",
        message: accept
          ? localeText.confirmationAcknowledged
          : localeText.confirmationRejected,
      });
      return { success: true };
    } finally {
      this.responding.delete(operationKey);
    }
  }
  async runAutomation(account, fetchedItems, enabledActions) {
    const enabled = (action) =>
      !enabledActions || enabledActions[action] === true;
    const policy = accountPolicy(account);
    if (
      !policy.checkConfirmations ||
      (!account.autoMarket &&
        !account.autoTrades &&
        !account.autoMarketPurchases) ||
      this.busy.has(account.id)
    )
      return { accepted: 0 };
    this.busy.add(account.id);
    const epoch = this.epoch;
    let accepted = 0;
    try {
      const items = fetchedItems || (await this.listConfirmations(account));
      this._assert(epoch);
      for (const item of items) {
        if (this.uncertain.has(`${account.id}:${item.id}`)) continue;
        if (
          (account.confirmationJournal || []).some(
            (entry) => entry.confirmationId === item.id,
          )
        )
          continue;
        if (
          (item.type === 2 && account.autoTrades && enabled("autoTrades")) ||
          (item.type === 3 && account.autoMarket && enabled("autoMarket")) ||
          (item.type === 12 &&
            account.autoMarketPurchases &&
            enabled("autoMarketPurchases"))
        ) {
          await this.respond(account, item.id, true);
          this._assert(epoch);
          accepted++;
        }
      }
      return { accepted };
    } finally {
      this.busy.delete(account.id);
    }
  }
}
module.exports = {
  SteamService,
  steamCode,
  confirmationKey,
  randomDeviceName,
  parseMafile,
  classifyRefreshToken,
};
