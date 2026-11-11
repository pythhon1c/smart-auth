"use strict";
const localeText = require("../locales/application.json");
const { browserActionUrl } = require("./browser-actions.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { ProxyTransport, checkedTarget } = require("./transport.cjs");
const { SteamService } = require("./steam.cjs");
const { BrowserWebAuth } = require("./browser-auth.cjs");
const {
  BrowserExtensionManager,
  DEFAULT_EXTENSION_URL,
} = require("./browser-extensions.cjs");
const {
  attachSmartTraderOnboarding,
} = require("./smart-trader-onboarding.cjs");
const { normalizeBrowserSettings } = require("./model.cjs");
const { prepareBrowserPreferences } = require("./browser-preferences.cjs");
const {
  createBrowserProfile,
  normalizeBrowserProfile,
  browserProfileLaunchOptions,
  applyBrowserProfile,
} = require("./browser-profile.cjs");
const { createBrowserProxy } = require("./browser-proxy.cjs");
const failure = () =>
  Error(localeText.couldNotOpenTheProtectedBrowserCheckTheProxyAndSteamSession);
const extensionFailure = () =>
  Object.assign(
    Error(
      localeText.couldNotPrepareBrowserExtensionsCheckTheChromeWebStoreListInSettings,
    ),
    { code: "BROWSER_EXTENSIONS" },
  );
const webFailure = (code) =>
  Object.assign(
    new Error(
      code === "BROWSER_WEB_PASSWORD_REQUIRED"
        ? localeText.saveTheAccountPasswordToCreateASeparateSteamWebSession
        : localeText.steamRequiresAdditionalConfirmationToSignInToTheWebSession,
    ),
    { code },
  );
const stageMessages = Object.freeze({
  probe:
    localeText.couldNotCheckTheConnectionToSteamCheckProxyAvailabilityAndSettings,
  session:
    localeText.couldNotCreateASteamWebSessionCheckYourLoginDetailsAndTryAgain,
  identity:
    localeText.couldNotVerifyTheSteamWebSessionAccountSignInToTheBrowserAgain,
  extensions:
    localeText.couldNotPrepareBrowserExtensionsCheckTheExtensionSettings,
  proxy: localeText.couldNotStartTheLocalBrowserConnectionTryAgain,
  profile:
    localeText.couldNotOpenTheBrowserProfileCloseItsOtherWindowsAndCheckAccessTo,
  launch:
    localeText.couldNotStartChromiumCheckThatTheBrowserIsInstalledAndTryAgain,
  navigation:
    localeText.couldNotOpenTheSteamPageInTheBrowserCheckTheConnectionAndTry,
  ready: localeText.couldNotActivateTheBrowserWindowTryAgain,
});
const safeReasons = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EACCES",
  "EPERM",
  "ENOENT",
  "EEXIST",
]);
function browserFailure(stage, error) {
  if (error?.code === "STEAM_RATE_LIMIT") return error;
  let result;
  if (error?.code === "BROWSER_CANCELLED")
    result = Object.assign(
      Error(localeText.browserOpeningWasCancelledTryAgain),
      { code: "BROWSER_CANCELLED" },
    );
  else if (error?.code === "BROWSER_EXTENSIONS") result = extensionFailure();
  else if (
    ["BROWSER_WEB_PASSWORD_REQUIRED", "BROWSER_WEB_GUARD_REQUIRED"].includes(
      error?.code,
    )
  )
    result = webFailure(error.code);
  else {
    stage = Object.hasOwn(stageMessages, stage) ? stage : "launch";
    result = Object.assign(Error(stageMessages[stage]), {
      code: "BROWSER_STAGE_FAILED",
    });
    const reason = safeReasons.has(error?.code)
      ? error.code
      : error?.name === "TimeoutError"
        ? "ETIMEDOUT"
        : undefined;
    if (reason) result.reason = reason;
  }
  result.stage = stage;
  if (
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 100 &&
    error.statusCode <= 599
  )
    result.statusCode = error.statusCode;
  if (Number.isInteger(error?.eresult)) result.eresult = error.eresult;
  return result;
}
function webCookieHeader(cookies) {
  const selected = cookies.filter(
    (c) =>
      c.domain?.replace(/^\./, "") === "steamcommunity.com" && c.path === "/",
  );
  if (
    !selected.some((c) => c.name === "steamLoginSecure") ||
    selected.some(
      (c) =>
        !/^[a-zA-Z0-9_-]+$/.test(c.name) ||
        typeof c.value !== "string" ||
        /[\r\n\0;]/.test(c.value),
    )
  )
    throw failure();
  return selected.map((c) => `${c.name}=${c.value}`).join("; ");
}
// Chromium can restore saved narrow bounds even when --start-maximized is set.
// Use the real native window; never emulate a viewport or enter fullscreen.
async function maximizeBrowserWindow(context, page, assertActive = () => {}) {
  assertActive();
  const session = await context.newCDPSession(page);
  try {
    assertActive();
    const { windowId } = await session.send("Browser.getWindowForTarget");
    assertActive();
    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });
    for (let attempt = 0; attempt < 40; attempt++) {
      assertActive();
      const { bounds } = await session.send("Browser.getWindowBounds", {
        windowId,
      });
      assertActive();
      if (bounds.windowState === "maximized") return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Chromium window did not maximize");
  } finally {
    await session.detach().catch(() => {});
  }
}
function accessToken(account) {
  const token = account.mafile?.Session?.AccessToken;
  if (
    typeof token !== "string" ||
    token.length > 16384 ||
    !/^[-_a-zA-Z0-9]+\.[-_a-zA-Z0-9]+\.[-_a-zA-Z0-9]+$/.test(token)
  )
    throw failure();
  let data;
  try {
    data = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
  } catch {
    throw failure();
  }
  if (
    data.sub !== account.steamId ||
    !Number.isSafeInteger(data.exp) ||
    data.exp <= Math.floor(Date.now() / 1000) + 30
  )
    throw failure();
  return token;
}
class BrowserSessions {
  constructor({
    root,
    executablePath,
    chromiumVersion,
    steam,
    transport,
    getData,
    onChange,
    onEvent = () => {},
    launchPersistentContext,
    extensions,
    getSystemLocale = () => Intl.DateTimeFormat().resolvedOptions().locale,
  } = {}) {
    if (
      typeof root !== "string" ||
      typeof executablePath !== "string" ||
      !transport ||
      typeof transport.routes !== "function" ||
      typeof getData !== "function" ||
      typeof getSystemLocale !== "function" ||
      typeof onChange !== "function"
    )
      throw failure();
    this.root = path.resolve(root);
    this.executablePath = executablePath;
    this.transport = transport;
    this.getData = getData;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.steam = steam;
    this.chromiumVersion = chromiumVersion;
    this.getSystemLocale = getSystemLocale;
    this.launch =
      launchPersistentContext ||
      ((dir, options) =>
        require("playwright-core").chromium.launchPersistentContext(
          dir,
          options,
        ));
    this.extensions =
      extensions ||
      new BrowserExtensionManager({
        cacheDir: path.join(this.root, "extensions"),
        chromiumVersion,
      });
    this.entries = new Map();
    this.cursors = new Map();
    this.preferred = new Map();
  }
  list() {
    return [...this.entries.values()].map((e) => ({
      accountId: e.account.id,
      state: e.state,
    }));
  }
  _event(e, outcome, error) {
    const event = { accountId: e.account.id, stage: e.stage, outcome };
    if (typeof e.routeProxyId === "string") event.proxyId = e.routeProxyId;
    if (
      Number.isInteger(error?.statusCode) &&
      error.statusCode >= 100 &&
      error.statusCode <= 599
    )
      event.statusCode = error.statusCode;
    if (Number.isInteger(error?.eresult)) event.eresult = error.eresult;
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs >= 0)
      event.retryAfterMs = error.retryAfterMs;
    try {
      Promise.resolve(this.onEvent(event)).catch(() => {});
    } catch {}
  }
  _failed(e, error) {
    this._event(
      e,
      error?.code === "STEAM_RATE_LIMIT" ? "rateLimited" : "failed",
      error,
    );
  }
  _assert(e) {
    if (
      e.cancelled ||
      (e.state === "opening" && e.isCancelled()) ||
      this.entries.get(e.account.id) !== e ||
      normalizeBrowserSettings(this.getData().settings)
        .browserSeparateSession !== e.separateSession ||
      !this.getData().accounts.includes(e.account)
    )
      throw Object.assign(Error("Browser opening cancelled"), {
        code: "BROWSER_CANCELLED",
      });
  }
  _cleanup(e) {
    if (e.lock != null) {
      fs.closeSync(e.lock);
      e.lock = null;
      fs.rmSync(path.join(e.profile, ".smart-sda.lock"), { force: true });
    }
  }
  _cancel(e) {
    e.cancelled = true;
    e.abort.abort();
    e.onboardingCleanup?.();
    e.webAuth?.cancel();
    try {
      e.scoped?.cancelAll();
    } catch {}
    try {
      e.network?.abortAll();
    } catch {}
    if (e.closing) return e.closing;
    e.state = "closing";
    const earlyRelayClose = e.relay
      ? Promise.resolve()
          .then(() => e.relay.close())
          .catch(() => {})
      : null;
    e.closing = (async () => {
      // _open owns all late arriving resources; wait for it without waiting on
      // e.promise, whose rejection handler itself invokes this method.
      try {
        await e.work;
      } catch {}
      const results = await Promise.allSettled([
        Promise.resolve().then(() => e.context?.close()),
        earlyRelayClose || Promise.resolve().then(() => e.relay?.close()),
      ]);
      if (results[0].status === "rejected") throw failure();
      this._cleanup(e);
      if (this.entries.get(e.account.id) === e)
        this.entries.delete(e.account.id);
    })();
    return e.closing;
  }
  close(id) {
    const e = this.entries.get(id);
    return e ? this._cancel(e) : Promise.resolve();
  }
  closeAll() {
    return Promise.allSettled(
      [...this.entries.values()].map((e) => this._cancel(e)),
    );
  }
  _checkResponse(e, proxy, url, response) {
    const limited = e.network.scheduler.rateLimit(
      {
        proxy,
        url: checkedTarget(url),
        accountId: e.account.id,
        steamId: e.account.steamId,
      },
      response,
    );
    if (limited) throw limited;
  }
  async _navigate(e, page, action = e.action) {
    e.stage = "navigation";
    const url = browserActionUrl(action);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    this._assert(e);
    if (response)
      this._checkResponse(e, e.proxy, response.url(), {
        statusCode: response.status(),
        headers: await response.allHeaders(),
      });
  }
  async open(account, { isCancelled = () => false, action } = {}) {
    browserActionUrl(action);
    let existing = this.entries.get(account?.id);
    if (existing?.cancelled) {
      await existing.closing;
      return this.open(account, { isCancelled, action });
    }
    if (existing && !existing.cancelled) {
      await existing.promise;
      this._assert(existing);
      if (isCancelled()) throw failure();
      let actionNavigated = false;
      if (!existing.page || existing.page.isClosed()) {
        if (!existing.pageOpening) {
          existing.pageOpening = (async () => {
            this._assert(existing);
            const page = await existing.context.newPage();
            this._assert(existing);
            if (isCancelled()) throw failure();
            await this._navigate(existing, page, action);
            this._assert(existing);
            existing.page = page;
            return action;
          })()
            .catch(async (error) => {
              const diagnostic = browserFailure(existing.stage, error);
              this._failed(existing, diagnostic);
              await this._cancel(existing);
              throw diagnostic;
            })
            .finally(() => {
              existing.pageOpening = null;
            });
        }
        const openedAction = await existing.pageOpening;
        actionNavigated = openedAction === action;
        this._assert(existing);
        if (isCancelled()) throw failure();
      }
      if (action !== undefined && !actionNavigated) {
        if (isCancelled()) throw failure();
        await this._navigate(existing, existing.page, action);
        if (isCancelled()) throw failure();
      }
      await existing.page.bringToFront();
      this._assert(existing);
      existing.stage = "ready";
      this._event(existing, "ready");
      return {
        alreadyOpen: true,
        proxyId: existing.proxy.id,
        sessionReady: true,
      };
    }
    if (
      !account ||
      typeof account.id !== "string" ||
      !/^765\d{14}$/.test(account.steamId) ||
      typeof isCancelled !== "function"
    )
      throw failure();
    const e = {
      account,
      action,
      isCancelled,
      cancelled: false,
      state: "opening",
      separateSession: normalizeBrowserSettings(this.getData().settings)
        .browserSeparateSession,
      stage: "probe",
      abort: new AbortController(),
    };
    this.entries.set(account.id, e);
    e.work = this._open(e);
    e.promise = e.work.catch(async (error) => {
      const diagnostic = browserFailure(e.stage, error);
      this._failed(e, diagnostic);
      await this._cancel(e);
      throw diagnostic;
    });
    return e.promise;
  }
  async _verifyIdentity(e, pinned, cookie = e.scoped._cookie(e.account)) {
    e.stage = "identity";
    // Steam's /my/?xml=1 route may redirect even valid sessions to login.
    // Establish the authenticated own-profile redirect first, then request XML.
    let identityUrl = new URL("https://steamcommunity.com/my/"),
      verification;
    const identityDeadline = Date.now() + 30000;
    for (let redirects = 0; redirects <= 3; redirects++) {
      verification = await pinned.request(e.account, identityUrl.href, {
        method: "GET",
        retrySafe: true,
        deadline: identityDeadline,
        maxBodyBytes: 1024 * 1024,
        headers: {
          cookie,
          ...(e.webUserAgent ? { "user-agent": e.webUserAgent } : {}),
        },
      });
      if (![301, 302, 303, 307, 308].includes(verification.statusCode)) break;
      if (redirects === 3 || typeof verification.headers?.location !== "string")
        throw failure();
      const next = new URL(verification.headers.location, identityUrl);
      if (
        next.origin === "https://steamcommunity.com" &&
        !next.username &&
        !next.password &&
        !next.hash &&
        /^\/login\/home\/?$/.test(next.pathname)
      )
        return false;
      if (
        next.origin !== "https://steamcommunity.com" ||
        next.username ||
        next.password ||
        next.hash ||
        !/^\/(?:my|profiles\/765\d{14}|id\/[a-zA-Z0-9_-]{1,64})\/?$/.test(
          next.pathname,
        ) ||
        (next.pathname.startsWith("/profiles/") &&
          next.pathname.replace(/\/$/, "") !==
            "/profiles/" + e.account.steamId) ||
        [...next.searchParams.keys()].some((key) => key !== "xml") ||
        next.searchParams.getAll("xml").length > 1 ||
        (next.searchParams.has("xml") && next.searchParams.get("xml") !== "1")
      )
        throw failure();
      // /my/ is authenticated: Steam's own redirect to this exact numeric
      // profile proves identity without a redundant rate-limited public fetch.
      if (next.pathname.replace(/\/$/, "") === "/profiles/" + e.account.steamId)
        return true;
      if (next.pathname.replace(/\/$/, "") === "/my") next.search = "";
      else next.searchParams.set("xml", "1");
      identityUrl = next;
    }
    this._assert(e);
    const xml = verification.body?.toString("utf8") || "",
      match = xml.match(
        /<steamID64>\s*(?:<!\[CDATA\[)?(765\d{14})(?:\]\]>)?\s*<\/steamID64>/,
      );
    if (
      verification.statusCode !== 200 ||
      !match ||
      match[1] !== e.account.steamId
    )
      throw Object.assign(failure(), { statusCode: verification.statusCode });
    return true;
  }
  async _open(e) {
    this._assert(e);
    let configuration =
      e.account.browserProfile === undefined
        ? null
        : normalizeBrowserProfile(e.account.browserProfile);
    if (!configuration) {
      configuration = createBrowserProfile();
      e.account.browserProfile = configuration;
      await this.onChange(e.account);
      this._assert(e);
    }
    e.configuration = configuration;
    const routes = this.transport.routes(e.account).slice();
    if (!routes.length) throw failure();
    const preferred = this.preferred.get(e.account.id),
      start = this.cursors.get(e.account.id) || 0;
    const candidates = routes.map(
      (_, i) => routes[(start + i) % routes.length],
    );
    const active = candidates.findIndex((p) => p.id === preferred);
    if (active > 0) candidates.unshift(...candidates.splice(active, 1));
    e.network = new ProxyTransport({
      scheduler: this.transport.scheduler,
      resolveProxies: () => (e.proxy ? [e.proxy] : []),
      allowDirect: () => false,
    });
    const deadline = Date.now() + 30000;
    let lastProbeError;
    for (let i = 0; i < Math.min(3, candidates.length); i++) {
      this._assert(e);
      const proxy = candidates[i];
      e.routeProxyId = proxy.id;
      try {
        const response = await e.network.requestVia(
          proxy,
          checkedTarget("https://steamcommunity.com/?l=english"),
          {
            accountId: e.account.id,
            steamId: e.account.steamId,
            method: "GET",
            retrySafe: true,
            timeoutMs: 8000,
            deadline,
            maxBodyBytes: 1024 * 1024,
          },
        );
        this._assert(e);
        this._checkResponse(
          e,
          proxy,
          "https://steamcommunity.com/?l=english",
          response,
        );
        if (response.statusCode < 200 || response.statusCode >= 400)
          throw Object.assign(failure(), { statusCode: response.statusCode });
        e.proxy = proxy;
        this._event(e, "route");
        break;
      } catch (error) {
        this._assert(e);
        if (error?.code === "STEAM_RATE_LIMIT") throw error;
        lastProbeError = error;
      }
    }
    this.cursors.set(
      e.account.id,
      (start + Math.min(3, candidates.length)) % routes.length,
    );
    if (!e.proxy) throw lastProbeError || failure();
    this.preferred.set(e.account.id, e.proxy.id);
    const pinned = {
      request: async (account, url, options) => {
        this._assert(e);
        if (account !== e.account) throw failure();
        const result = await e.network.requestVia(e.proxy, checkedTarget(url), {
          ...options,
          accountId: e.account.id,
        });
        this._assert(e);
        this._checkResponse(e, e.proxy, url, result);
        return result;
      },
    };
    e.scoped = new SteamService({
      transport: pinned,
      normalizeAvatar: this.steam?.normalizeAvatar || (() => null),
      onChange: async (account) => {
        this._assert(e);
        if (account !== e.account) throw failure();
        await this.onChange(account);
        this._assert(e);
      },
    });
    let token, cookies;
    if (e.separateSession) {
      e.stage = "session";
      const major = /^\d+/.exec(this.chromiumVersion)?.[0];
      if (!major) throw failure();
      e.webUserAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
      e.webAuth = new BrowserWebAuth({
        transport: pinned,
        assertActive: () => this._assert(e),
        userAgent: e.webUserAgent,
        guardCode: async () => {
          if (!e.account.mafile?.shared_secret) return undefined;
          await e.scoped.syncTime(e.account);
          this._assert(e);
          return e.scoped.getCode(e.account).code;
        },
        onChange: async (account) => {
          this._assert(e);
          if (account !== e.account) throw failure();
          await this.onChange(account);
          this._assert(e);
        },
      });
      for (const options of [
        {},
        { forceRefresh: true },
        { forceLogin: true },
      ]) {
        e.stage = "session";
        ({ cookies } = await e.webAuth.ensure(e.account, {
          password: e.account.loginPassword,
          ...options,
        }));
        this._assert(e);
        if (await this._verifyIdentity(e, pinned, webCookieHeader(cookies)))
          break;
        cookies = null;
      }
      if (!cookies) throw failure();
    } else {
      e.stage = "session";
      const session = await e.scoped.ensureSession(e.account, {
        assertCurrent: () => this._assert(e),
      });
      let loggedIn = session.status === "authenticated";
      this._assert(e);
      accessToken(e.account);
      let verified = await this._verifyIdentity(e, pinned);
      if (!verified) {
        let refreshed = false;
        try {
          e.stage = "session";
          await e.scoped._refresh(e.account, true);
          this._assert(e);
          refreshed = true;
        } catch (error) {
          this._assert(e);
          if (error?.code === "STEAM_RATE_LIMIT") throw error;
        }
        if (refreshed) verified = await this._verifyIdentity(e, pinned);
        if (!verified && !loggedIn && e.account.loginPassword) {
          e.stage = "session";
          const login = await e.scoped.login(e.account, {
            password: e.account.loginPassword,
            waitForCompletion: true,
            automatic: true,
            assertCurrent: () => this._assert(e),
          });
          this._assert(e);
          if (login.status !== "complete") throw failure();
          loggedIn = true;
          verified = await this._verifyIdentity(e, pinned);
        }
        if (!verified) throw failure();
      }
      token = accessToken(e.account);
    }
    let prepared;
    const browserSettings = normalizeBrowserSettings(this.getData().settings);
    try {
      e.stage = "extensions";
      prepared = await this.extensions.prepare(
        [
          ...(browserSettings.browserSmartTraderEnabled
            ? [DEFAULT_EXTENSION_URL]
            : []),
          ...browserSettings.browserExtensions,
        ],
        { signal: e.abort.signal },
      );
    } catch {
      this._assert(e);
      throw extensionFailure();
    }
    this._assert(e);
    if (!prepared || !Array.isArray(prepared.paths) || prepared.errors?.length)
      throw extensionFailure();
    e.stage = "proxy";
    e.relay = await createBrowserProxy({ proxy: e.proxy });
    this._assert(e);
    e.stage = "profile";
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(this.root).isSymbolicLink()) throw failure();
    const profiles = path.join(this.root, "profiles");
    fs.mkdirSync(profiles, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(profiles).isSymbolicLink()) throw failure();
    const key = crypto
      .createHash("sha256")
      .update(
        e.account.steamId +
          ":" +
          configuration.id +
          (e.separateSession ? ":web" : ""),
      )
      .digest("hex");
    e.profile = path.join(profiles, "account-" + key);
    fs.mkdirSync(e.profile, { recursive: true, mode: 0o700 });
    if (
      fs.lstatSync(e.profile).isSymbolicLink() ||
      !fs.lstatSync(e.profile).isDirectory()
    )
      throw failure();
    const lockFile = path.join(e.profile, ".smart-sda.lock");
    try {
      e.lock = fs.openSync(lockFile, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST" || fs.lstatSync(lockFile).isSymbolicLink())
        throw failure();
      const pid = Number(fs.readFileSync(lockFile, "utf8"));
      if (!Number.isSafeInteger(pid) || pid <= 0) throw failure();
      try {
        process.kill(pid, 0);
        throw failure();
      } catch (probe) {
        if (probe.code !== "ESRCH") throw failure();
      }
      fs.unlinkSync(lockFile);
      e.lock = fs.openSync(lockFile, "wx", 0o600);
    }
    fs.writeFileSync(e.lock, String(process.pid));
    const preferences = prepareBrowserPreferences(
      e.profile,
      browserSettings,
      prepared.extensions || [],
      { systemLocale: this.getSystemLocale(), browserProfile: configuration },
    );
    const profileOptions = browserProfileLaunchOptions(configuration, {
      locale: preferences.locale,
      colorScheme: preferences.colorScheme,
    });
    e.launching = true;
    try {
      e.stage = "launch";
      e.context = await this.launch(e.profile, {
        ...profileOptions,
        executablePath: this.executablePath,
        headless: false,
        viewport: profileOptions.viewport,
        locale: profileOptions.locale ?? preferences.locale,
        colorScheme: profileOptions.colorScheme ?? preferences.colorScheme,
        chromiumSandbox: true,
        ignoreDefaultArgs: ["--disable-extensions"],
        proxy: {
          server: e.relay.url,
          username: e.relay.username,
          password: e.relay.password,
          bypass: "<-loopback>",
        },
        args: [
          ...(profileOptions.args || []),
          ...preferences.args,
          "--start-maximized",
          "--no-default-browser-check",
          "--disable-session-crashed-bubble",
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
          "--proxy-bypass-list=<-loopback>",
          ...(prepared.paths.length
            ? [
                `--disable-extensions-except=${prepared.paths.join(",")}`,
                `--load-extension=${prepared.paths.join(",")}`,
              ]
            : []),
        ],
      });
    } finally {
      e.launching = false;
    }
    this._assert(e);
    if (configuration.doNotTrack)
      await e.context.setExtraHTTPHeaders({ DNT: "1" });
    await applyBrowserProfile(e.context, configuration);
    this._assert(e);
    e.onboardingCleanup = attachSmartTraderOnboarding(e.context, {
      profilePath: e.profile,
      enabled:
        browserSettings.browserSmartTraderEnabled &&
        browserSettings.browserSmartTraderAutoCheck,
      extensions: prepared.extensions || [],
      signal: e.abort.signal,
    });
    e.context.on("close", () => {
      void this._cancel(e).catch(() => {});
    });
    if (!e.separateSession) {
      const sessionId = /^[a-fA-F0-9]{16,64}$/.test(
        e.account.mafile.Session.SessionID || "",
      )
        ? e.account.mafile.Session.SessionID
        : crypto.randomBytes(16).toString("hex");
      cookies = [];
      for (const domain of [
        ".steamcommunity.com",
        ".store.steampowered.com",
        ".help.steampowered.com",
      ]) {
        cookies.push(
          {
            name: "steamLoginSecure",
            value: e.account.steamId + "%7C%7C" + token,
            domain,
            path: "/",
            secure: true,
            httpOnly: true,
            sameSite: "None",
          },
          {
            name: "sessionid",
            value: sessionId,
            domain,
            path: "/",
            secure: true,
            httpOnly: false,
            sameSite: "Lax",
          },
        );
      }
    }
    await e.context.addCookies(cookies);
    this._assert(e);
    const page =
      e.context
        .pages()
        .find((candidate) => candidate.url() === "about:blank") ||
      (await e.context.newPage());
    e.page = page;
    this._assert(e);
    await maximizeBrowserWindow(e.context, page, () => this._assert(e));
    this._assert(e);
    await this._navigate(e, page);
    this._assert(e);
    await page.bringToFront();
    this._assert(e);
    e.state = "open";
    e.stage = "ready";
    this._event(e, "ready");
    return { proxyId: e.proxy.id, sessionReady: true };
  }
}
module.exports = { BrowserSessions, maximizeBrowserWindow };
