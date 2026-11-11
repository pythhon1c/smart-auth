"use strict";
const {
  detectSystemLanguage,
  resolveAppearanceLanguage,
} = require("./core/appearance-settings.cjs");
const localeText = require("./locales/application.json");
const preloadLocaleArgument =
  "--smart-sda-preload-locale=" +
  encodeURIComponent(
    JSON.stringify({
      unknownAction: localeText.unknownAction,
      vaultLocked: localeText.vaultLocked,
    }),
  );
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  powerMonitor,
  Notification,
  clipboard,
  nativeImage,
  nativeTheme,
  Tray,
  Menu,
  shell,
} = require("electron");
const fs = require("node:fs");
const { publicErrorMessage } = require("./core/public-errors.cjs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const rendererLocaleUrl = pathToFileURL(
  path.join(__dirname, "locales", "renderer.js"),
).href;
const { performance } = require("node:perf_hooks");
const { setTimeout, clearTimeout } = require("node:timers");
const { idleLockAction } = require("./core/idle-lock.cjs");
const { Vault } = require("./core/vault.cjs");
const { atomicVaultBackup } = require("./core/vault-backup.cjs");
const { UpdateController } = require("./core/update-controller.cjs");
const { ReleaseUpdater } = require("./core/release-updater.cjs");
let appUpdateController;
function runAppUpdate(action) {
  const captured = epoch;
  if (!appUpdateController) {
    const downloadDirectory = path.join(
      app.getPath("downloads"),
      "smart-auth-updates",
    );
    let updater;
    const release = () =>
      (updater ||= new ReleaseUpdater({
        currentVersion: app.getVersion(),
        directory: downloadDirectory,
      }));
    appUpdateController = new UpdateController({
      updater: {
        check: () => release().check(),
        download: () => release().download(),
        verifyReady: () => release().verifyReady(),
      },
      downloadDirectory,
      userData: app.getPath("userData"),
      version: app.getVersion(),
      packaged: () => app.isPackaged,
      vault,
      relaunch: (options) => app.relaunch(options),
      quit: () => app.quit(),
    });
  }
  return appUpdateController.run(
    action,
    () => epoch === captured && !uiUnavailable(),
  );
}
const { ProxyTransport } = require("./core/transport.cjs");
const { NetworkScheduler } = require("./core/network-scheduler.cjs");
const { runTaskPool } = require("./core/task-pool.cjs");
const { SteamService } = require("./core/steam.cjs");
const { TradeOfferService } = require("./core/trade-offers.cjs");
const { normalizeLootSettings, lootCoverage } = require("./core/loot.cjs");
const { LootCoordinator } = require("./core/loot-coordinator.cjs");
const {
  ensureLootSchemes,
  findLootScheme,
  lootWarehouseEntries,
  createLootScheme,
  updateLootScheme,
  removeLootScheme,
} = require("./core/loot-schemes.cjs");
const { isSteamAdmin } = require("./core/steam-admins.cjs");
const {
  publicPeople,
  saveAdmins,
  warehouseConflict,
  applyWarehouseChoice,
  planLootSettings,
} = require("./core/loot-settings.cjs");
const {
  avatarFromXml,
  imageDataUrl,
  MAX_XML_BYTES,
  MAX_AVATAR_BYTES,
} = require("./core/avatar.cjs");
const { dueAccountActions } = require("./core/account-policy.cjs");
const { browserActionUrl } = require("./core/browser-actions.cjs");
const model = require("./core/model.cjs");
const imports = require("./core/imports.cjs");
const {
  planAccountImport,
  hasPassword,
  singleImportDetails,
  prepareSingleAccountImport,
} = require("./core/account-import.cjs");
const {
  normalizeImportBanOptions,
  filterAccountImportBans,
  filterPortableImportBans,
} = require("./core/import-bans.cjs");
const { normalizeAccountBans } = require("./core/account-bans.cjs");
const exportsService = require("./core/export.cjs");
const { planPortableImport } = require("./core/portable-import.cjs");
const {
  ALLOCATION_ACTIONS,
  stageMutation,
} = require("./core/mutation-plans.cjs");
const {
  planProxyAllocation,
  applyProxyAllocation,
} = require("./core/proxy-allocation.cjs");
const {
  accountProxyOptions,
  planAccountProxy,
} = require("./core/account-proxies.cjs");
const { prepareTradeBots } = require("./core/trade-bots-import.cjs");
const {
  tradeBotsBundle,
  assertTradeBotsAssociations,
} = require("./core/trade-bots-adapter.cjs");
const { randomUUID, createHash } = require("node:crypto");
const {
  NotificationCenter,
  notificationText,
} = require("./core/notifications.cjs");
const QRCode = require("qrcode");
const { BrowserSessions } = require("./core/browser-sessions.cjs");
const { normalizeExtensions } = require("./core/browser-extensions.cjs");
const {
  AsyncLocalBrowserExtensionManager,
} = require("./core/local-browser-extension-worker.cjs");
const { BrowserRuntimeInstaller } = require("./core/browser-runtime.cjs");
const {
  BrowserRuntimeController,
} = require("./core/browser-runtime-controller.cjs");
const browserRuntimeManifest = require("./core/browser-runtime.json");
const { planBrowserProfiles } = require("./core/browser-profile-plans.cjs");
const {
  PasswordManager,
  generateSecret,
} = require("./core/password-manager.cjs");
const { SecretClipboard } = require("./core/secret-clipboard.cjs");
const { ProxyCheckQueue } = require("./core/proxy-check-queue.cjs");
const { AuthenticatorManager } = require("./core/authenticator-manager.cjs");
const { readAuthenticatorFiles } = require("./core/authenticator-files.cjs");
const { createTrayController } = require("./core/tray.cjs");
const appIconPath = path.join(__dirname, "assets", "app-icon.png");

const { configureAppIdentity } = require("./core/app-identity.cjs");
configureAppIdentity(app);
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("disable-features", "MediaRouter");
app.commandLine.appendSwitch(
  "force-webrtc-ip-handling-policy",
  "disable_non_proxied_udp",
);

let systemLanguage = "en";
let win,
  vault,
  transport,
  steam,
  tradeOffers,
  loot,
  lootWindows = new Map(),
  peopleRefresh = null,
  lastInteraction = performance.now(),
  idleSettings = { pinLockMinutes: 0, passwordLockMinutes: 0 },
  epoch = 0,
  tickRunning = false,
  nextPoll = 0,
  pollCursor = 0,
  pendingImport = null,
  importGeneration = 0,
  pendingBulk = null,
  bulkConfirmationJob = null,
  bulkGeneration = 0,
  bulkLogin = null,
  bulkBanCheck = null,
  pendingPortable = null,
  pendingAllocation = null,
  portableGeneration = 0,
  notifications,
  browserSessions,
  browserRuntime,
  browserJob = null,
  browserReserved = new Map(),
  managerWindow = null,
  passwordManager,
  authenticatorWindow = null,
  authenticatorManager,
  authenticatorImport = null,
  generatedSecret = null,
  generatedSecretTimer = null,
  proxyCheck = null,
  trayController = null,
  trayPreferences = { trayEnabled: true, followSystemLanguage: true },
  pendingTrayReview = null;
const { AsyncLocalStorage } = require("node:async_hooks");
const uiRequests = new AsyncLocalStorage();
const pendingExtensionImports = new Map();
let localBrowserExtensions,
  extensionPickerOpen = false,
  extensionDraftGeneration = 0;
let uiLocked = false,
  uiLockMode = "password",
  uiGeneration = 0,
  lastUiBroadcastGeneration = -1;
const lockAcknowledged = new Map(),
  showAfterLock = new Set();
const secretClipboard = new SecretClipboard(clipboard);
function windowBackground(theme = "system") {
  const dark =
    theme === "dark" ||
    (theme === "system" && nativeTheme?.shouldUseDarkColors === true);
  return dark ? "#171a21" : "#eef2f6";
}
function uiStatus() {
  const status = vault?.status() || { locked: true, lockMode: "password" };
  const locked = status.locked || uiLocked;
  return {
    ...status,
    systemLanguage: systemLanguage,
    beta: /-beta\.\d+$/.test(app.getVersion()),
    locked,
    lockMode: locked
      ? status.locked
        ? status.lockMode
        : uiLockMode
      : "unlocked",
    uiGeneration,
    backgroundRunning: locked && !status.locked,
    retryAfterMs:
      uiLocked && uiLockMode === "pin"
        ? vault.uiPinRetryAfterMs()
        : status.retryAfterMs,
  };
}
function uiUnavailable() {
  const lease = uiRequests.getStore();
  return (
    uiStatus().locked || Boolean(lease && lease.generation !== uiGeneration)
  );
}
function assertUiAccess() {
  if (uiUnavailable()) throw Error(localeText.vaultLocked);
}
function uiCopy(value) {
  assertUiAccess();
  return secretClipboard.copy(value);
}
function managedWindows() {
  return [
    win,
    managerWindow,
    authenticatorWindow,
    ...[...lootWindows.values()].map((x) => x.window),
  ].filter((w) => w && !w.isDestroyed());
}
function uiChangedPayload() {
  return uiStatus();
}
function revealAcknowledged(window) {
  if (!window || window.isDestroyed()) return;
  if (
    uiStatus().locked &&
    lockAcknowledged.get(window.webContents.id) !== uiGeneration
  ) {
    showAfterLock.add(window.webContents.id);
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
async function uiRequest(event, action, payload, execute, main = false) {
  checkInput(action, payload);
  enforceIdleLock();
  const generation = uiGeneration;
  if (action === "status") return uiStatus();
  if (action === "lockedReady") {
    if (payload?.uiGeneration !== uiGeneration || !uiStatus().locked)
      return null;
    lockAcknowledged.set(event.sender.id, uiGeneration);
    if (showAfterLock.delete(event.sender.id))
      revealAcknowledged(BrowserWindow.fromWebContents(event.sender));
    return null;
  }
  if (action === "showUnlock") {
    showMainWindow();
    return null;
  }
  if (action === "lock") return lock();
  if (action === "pinLock" && main) {
    assertUiAccess();
    if (!vault.status().pinEnabled) throw Error(localeText.setUpPINFirst);
    return lock("pin");
  }
  if (action === "snapshot" && uiStatus().locked) return uiStatus();
  const authentication =
    main && ["createVault", "unlock", "unlockPin"].includes(action);
  if (authentication && !uiStatus().locked)
    throw Error(localeText.message_5de9400);
  if (!authentication) assertUiAccess();
  try {
    const result = await uiRequests.run({ generation }, execute);
    if (!authentication && (generation !== uiGeneration || uiStatus().locked))
      throw Error(localeText.vaultLocked);
    return result;
  } catch (error) {
    if (!authentication && (generation !== uiGeneration || uiStatus().locked))
      throw Error(localeText.vaultLocked);
    throw error;
  }
}
function finishUiUnlock() {
  uiLocked = false;
  uiLockMode = "password";
  uiGeneration++;
  lockAcknowledged.clear();
  showAfterLock.clear();
  changed();
  return uiStatus();
}
const statuses = new Map(),
  busy = new Set(),
  polledAt = new Map(),
  nativeNotifications = new Set();
const bulkReserved = new Set();
const poolControllers = new WeakMap();
const poolItems = new WeakMap();
const pollActive = new Map();
let pollController = new AbortController();
function initPool(job, settings, browser = false, accounts = []) {
  job.concurrency = browser
    ? settings.browserLaunchConcurrency
    : settings.bulkConcurrency;
  job.startIntervalMs = browser
    ? settings.browserLaunchDelayMs
    : settings.taskStartDelayMs;
  job.currentIds = [];
  resetPoolProgress(job, accounts);
  poolControllers.set(job, new AbortController());
  return job;
}
function resetPoolProgress(job, accounts) {
  job.total = accounts.length;
  job.processed = 0;
  job.items = accounts.map((account) => ({ id: account.id, state: "queued" }));
  poolItems.set(job, new Map(job.items.map((item) => [item.id, item])));
}
function itemProgress(job, id, state, message) {
  const item = poolItems.get(job)?.get(id);
  if (!item || item.state === "cancelled") return;
  item.state = state;
  if (message) item.message = message;
  else delete item.message;
}
function cancelJob(job) {
  if (!job) return;
  job.state = "cancelled";
  for (const item of job.items || [])
    if (item.state === "queued" || item.state === "running")
      itemProgress(job, item.id, "cancelled");
  poolControllers.get(job)?.abort();
}
function resetPolling() {
  pollController.abort();
  pollController = new AbortController();
  pollActive.clear();
}
const entryPath = path.join(__dirname, "renderer", "index.html");
const entryUrl = pathToFileURL(entryPath).href;
const managerPath = path.join(__dirname, "renderer", "password-manager.html");
const managerUrl = pathToFileURL(managerPath).href;
const authenticatorPath = path.join(
  __dirname,
  "renderer",
  "authenticator.html",
);
const authenticatorUrl = pathToFileURL(authenticatorPath).href;
const lootPath = path.join(__dirname, "renderer", "loot.html");
const lootUrl = pathToFileURL(lootPath).href;
function closeLoot() {
  const contexts = [...lootWindows.values()];
  lootWindows.clear();
  for (const { window } of contexts)
    try {
      if (!window.isDestroyed()) window.destroy();
    } catch {}
}
function authenticatorChanged() {
  try {
    if (authenticatorWindow && !authenticatorWindow.isDestroyed())
      authenticatorWindow.webContents.send(
        "smart-sda-authenticator-changed",
        uiChangedPayload(),
      );
  } catch {}
}
function clearAuthenticatorImport() {
  authenticatorImport?.abort();
  authenticatorImport = null;
  authenticatorManager?.clearPending();
}
function closeAuthenticator() {
  clearAuthenticatorImport();
  secretClipboard.clear();
  const window = authenticatorWindow;
  authenticatorWindow = null;
  try {
    if (window && !window.isDestroyed()) window.destroy();
  } catch {}
}
function managerChanged() {
  try {
    if (managerWindow && !managerWindow.isDestroyed())
      managerWindow.webContents.send(
        "smart-sda-password-manager-changed",
        uiChangedPayload(),
      );
  } catch {}
}
function clearGeneratedSecret() {
  clearTimeout(generatedSecretTimer);
  generatedSecretTimer = null;
  generatedSecret = null;
}
function closePasswordManager() {
  clearGeneratedSecret();
  secretClipboard.clear();
  const window = managerWindow;
  managerWindow = null;
  try {
    if (window && !window.isDestroyed()) window.destroy();
  } catch {}
}
function changed() {
  updateTray();
  const state = uiChangedPayload();
  try {
    if (win && !win.isDestroyed())
      win.webContents.send("smart-sda-changed", state);
    for (const { window } of lootWindows.values())
      if (!window.isDestroyed())
        window.webContents.send("smart-sda-loot-changed", state);
    if (lastUiBroadcastGeneration !== uiGeneration) {
      lastUiBroadcastGeneration = uiGeneration;
      managerChanged();
      authenticatorChanged();
    }
  } catch {}
}
function showMainWindow() {
  revealAcknowledged(win);
}
function updateTray() {
  if (!trayController || !vault) return;
  const locked = uiStatus().locked;
  let accounts = [];
  if (!locked) {
    const data = vault.getData();
    trayPreferences = { ...data.settings };
    const chosen = new Set(data.settings.trayAccountIds || []);
    accounts = data.accounts
      .filter((a) => chosen.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        hasSharedSecret: Boolean(a.mafile?.shared_secret),
      }));
  }
  resolveAppearanceLanguage(trayPreferences, systemLanguage);
  trayController.update({ locked, settings: trayPreferences, accounts });
}
function queueTrayReview({ ids, kind }) {
  assertUiAccess();
  const data = unlocked();
  const chosen = new Set(data.settings.trayAccountIds || []);
  if (
    !data.settings.trayEnabled ||
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 10 ||
    ids.some(
      (id) => !chosen.has(id) || !data.accounts.some((a) => a.id === id),
    ) ||
    !["all", "market", "purchase", "trade"].includes(kind)
  )
    return;
  lastInteraction = performance.now();
  pendingTrayReview = { ids: [...new Set(ids)], kind, epoch };
  showMainWindow();
  win?.webContents.send("smart-sda-tray-action");
}
function initTray() {
  if (!Tray || !Menu) return;
  trayController = createTrayController({
    icon: appIconPath,
    createTray: (icon) => new Tray(icon),
    buildMenu: (template) => Menu.buildFromTemplate(template),
    callbacks: {
      show: showMainWindow,
      unlock: showMainWindow,
      lock: () => lock(),
      exit: () => app.quit(),
      review: (value) => {
        try {
          queueTrayReview(value);
        } catch {
          showMainWindow();
        }
      },
      copyCode: (id) => {
        try {
          const data = unlocked();
          if (
            !data.settings.trayEnabled ||
            !(data.settings.trayAccountIds || []).includes(id)
          )
            return;
          void dispatch("copyCode", { id }).catch(() => showMainWindow());
        } catch {
          showMainWindow();
        }
      },
      openTool: (tool) => {
        if (!vault || uiStatus().locked) return showMainWindow();
        lastInteraction = performance.now();
        void (
          tool === "password-manager"
            ? openPasswordManager()
            : openAuthenticator()
        ).catch(() => showMainWindow());
      },
    },
  });
  updateTray();
}
function unlocked() {
  if (!vault) throw new Error(localeText.vaultLocked);
  return vault.getData();
}
function persist() {
  try {
    vault.save();
  } catch (error) {
    runtimeLock();
    if (error.code === "VAULT_PARTIAL_COMMIT") throw error;
    throw new Error(
      localeText.couldNotSaveChangesVaultLockedCheckDiskSpaceAndPermissions,
    );
  }
}
function record(message, accountId = "") {
  if (!vault || vault.status().locked) return;
  const data = vault.getData();
  data.audit.push({ time: new Date().toISOString(), message, accountId });
  if (data.audit.length > 500) data.audit.splice(0, data.audit.length - 500);
  persist();
}
function lock(mode = "password", { idle = false } = {}) {
  mode = mode === "pin" && vault?.status().pinEnabled ? "pin" : "password";
  if (idle && uiLocked && (uiLockMode === "password" || uiLockMode === mode))
    return uiStatus();
  uiLocked = true;
  uiLockMode = mode;
  uiGeneration++;
  pendingExtensionImports.clear();
  lockAcknowledged.clear();
  for (const window of managedWindows()) {
    if (window.isVisible()) showAfterLock.add(window.webContents.id);
    window.hide();
    window.setTitle("smart-auth " + app.getVersion());
  }
  pendingTrayReview = null;
  importGeneration++;
  pendingImport = null;
  pendingPortable = null;
  portableGeneration++;
  clearAllocation();
  clearBulkConfirmations();
  clearGeneratedSecret();
  clearAuthenticatorImport();
  vault?.cancelTotpEnrollment();
  secretClipboard.clear();
  proxyCheck?.cancel();
  proxyCheck = null;
  stopBrowsers();
  for (const notification of nativeNotifications) {
    try {
      notification.close();
    } catch {}
  }
  nativeNotifications.clear();
  changed();
  return uiStatus();
}
function runtimeLock(mode = "password") {
  lock();
  uiLocked = true;
  uiLockMode = "password";
  pendingTrayReview = null;
  proxyCheck?.cancel();
  proxyCheck = null;
  closePasswordManager();
  closeAuthenticator();
  closeLoot();
  loot?.cancelAll();
  clearAllocation();
  stopBrowsers();
  epoch++;
  importGeneration++;
  pendingImport = null;
  pendingPortable = null;
  portableGeneration++;
  clearBulkConfirmations();
  cancelJob(bulkLogin);
  bulkLogin = null;
  cancelJob(bulkBanCheck);
  bulkBanCheck = null;
  resetPolling();
  try {
    notifications?.clear();
  } catch {}
  polledAt.clear();
  try {
    steam?.cancelAll();
    tradeOffers?.cancelAll();
  } catch {}
  try {
    transport?.abortAll();
  } catch {}
  statuses.clear();
  busy.clear();
  browserReserved.clear();
  if (mode === "pin" && vault?.status().pinEnabled) {
    try {
      vault.pinLock();
    } catch {
      vault.lock();
    }
  } else vault?.lock();
  for (const notification of nativeNotifications) {
    try {
      notification.close();
    } catch {}
  }
  nativeNotifications.clear();
  changed();
  return vault?.status();
}
function invalidateNetwork() {
  loot?.cancelAll();
  proxyCheck?.cancel();
  proxyCheck = null;
  clearAllocation();
  stopBrowsers();
  epoch++;
  importGeneration++;
  pendingImport = null;
  pendingPortable = null;
  portableGeneration++;
  clearBulkConfirmations();
  cancelJob(bulkLogin);
  cancelJob(bulkBanCheck);
  resetPolling();
  steam.cancelAll();
  tradeOffers?.cancelAll();
  transport.abortAll();
  notifications?.clear();
  statuses.clear();
  busy.clear();
  browserReserved.clear();
  polledAt.clear();
  nextPoll = Date.now() + 1000;
}
async function accountWork(id, action) {
  const account = model.item(unlocked().accounts, id, localeText.account);
  if (busy.has(id))
    throw new Error(localeText.anOperationIsAlreadyRunningForThisAccount);
  const captured = epoch;
  busy.add(id);
  try {
    const result = await action(account);
    if (epoch !== captured || vault.status().locked)
      throw new Error(localeText.operationCancelled);
    return result;
  } finally {
    if (epoch === captured) busy.delete(id);
  }
}
async function lootAccountWork(id, action, { assertCurrent = () => {} } = {}) {
  const captured = epoch;
  const deadline = Date.now() + 120000;
  for (;;) {
    assertCurrent();
    if (captured !== epoch || vault.status().locked)
      throw Error(localeText.operationCancelled);
    const account = model.item(unlocked().accounts, id, localeText.account);
    const identityBusy = unlocked().accounts.some(
      (a) => a.steamId === account.steamId && busy.has(a.id),
    );
    if (!identityBusy && !browserReserved.has(account.steamId))
      return accountWork(id, (current) => {
        assertCurrent();
        return action(current);
      });
    if (Date.now() >= deadline)
      throw Error(localeText.anOperationIsAlreadyRunningForThisAccount);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
async function browserAccountWork(id, action, isCancelled, onWaiting) {
  const captured = epoch,
    deadline = Date.now() + 120000;
  let announced = false;
  for (;;) {
    if (isCancelled() || captured !== epoch || vault.status().locked)
      throw Error(localeText.operationCancelled);
    const account = model.item(unlocked().accounts, id, localeText.account);
    const identityBusy = unlocked().accounts.some(
      (entry) => entry.steamId === account.steamId && busy.has(entry.id),
    );
    if (!identityBusy) return accountWork(id, action);
    if (!announced) {
      announced = true;
      onWaiting();
    }
    if (Date.now() >= deadline)
      throw Error(
        localeText.theAccountSPreviousOperationIsStillRunningTryOpeningTheBrowserLater,
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
async function accountRead(id, action) {
  const data = unlocked(),
    account = model.item(data.accounts, id, localeText.account),
    captured = epoch;
  const result = await action(account);
  if (
    captured !== epoch ||
    vault.status().locked ||
    !unlocked().accounts.includes(account)
  )
    throw new Error(localeText.operationCancelled);
  return result;
}
function stopBrowsers() {
  browserRuntime?.cancel();
  cancelJob(browserJob);
  // closeAll invalidates launches and closes proxy listeners immediately.
  try {
    void browserSessions?.closeAll().catch(() => {});
  } catch {}
}
function getBrowserRuntime() {
  if (!browserRuntime)
    browserRuntime = new BrowserRuntimeController({
      installer: new BrowserRuntimeInstaller({
        root: path.join(app.getPath("userData"), "browser-runtime"),
      }),
      manifest: browserRuntimeManifest,
    });
  return browserRuntime;
}
function getLocalBrowserExtensions() {
  if (!localBrowserExtensions)
    localBrowserExtensions = new AsyncLocalBrowserExtensionManager({
      userDataDir: app.getPath("userData"),
      chromiumVersion: browserRuntimeManifest.version,
    });
  return localBrowserExtensions;
}
async function importBrowserExtensionZip(data, payload) {
  const { draftIds } = payload;
  if (
    Object.keys(payload).some((key) => key !== "draftIds") ||
    (draftIds !== undefined &&
      (!Array.isArray(draftIds) ||
        draftIds.length > 20 ||
        !draftIds.every(
          (id) => typeof id === "string" && /^[a-p]{32}$/.test(id),
        )))
  )
    throw Error(localeText.invalidRequest);
  if (extensionPickerOpen) return { error: "ZIP_FAILED" };
  extensionPickerOpen = true;
  const generation = uiGeneration,
    draft = extensionDraftGeneration;
  const isCurrent = () =>
    generation === uiGeneration &&
    draft === extensionDraftGeneration &&
    !uiUnavailable();
  try {
    const choice = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!isCurrent() || choice.canceled || choice.filePaths?.length !== 1)
      return { cancelled: true };
    const manager = getLocalBrowserExtensions();
    const saved = new Set(
      (data.settings.browserLocalExtensions || []).map((entry) => entry.id),
    );
    if (draftIds) {
      const retained = new Set(draftIds);
      for (const id of pendingExtensionImports.keys())
        if (!retained.has(id)) pendingExtensionImports.delete(id);
    }
    // Reclaim imports abandoned by a closed settings window or interrupted save.
    for (const entry of manager.list()) {
      if (!isCurrent()) return { cancelled: true };
      if (!saved.has(entry.id) && !pendingExtensionImports.has(entry.id))
        await manager.remove(entry.id);
    }
    if (!isCurrent()) return { cancelled: true };
    const officialIds = normalizeExtensions(
      data.settings.browserExtensions || [],
    ).map((entry) => entry.id);
    const { id, name, version } = await manager.importZip(choice.filePaths[0], {
      officialIds,
      isCurrent,
    });
    if (!isCurrent()) return { cancelled: true };
    const extension = { id, name, version, enabled: true };
    pendingExtensionImports.set(id, extension);
    return { extension };
  } catch (error) {
    if (!isCurrent()) return { cancelled: true };
    return {
      error: [
        "ZIP_INVALID",
        "ZIP_INCOMPATIBLE",
        "ZIP_COLLISION",
        "ZIP_LIMIT",
      ].includes(error.code)
        ? error.code
        : "ZIP_FAILED",
    };
  } finally {
    extensionPickerOpen = false;
  }
}
async function getBrowsers() {
  const runtime = await getBrowserRuntime().resolve();
  assertUiAccess();
  if (browserSessions) return browserSessions;
  browserSessions = new BrowserSessions({
    root: path.join(app.getPath("userData"), "browser-sessions"),
    executablePath: runtime.executablePath,
    chromiumVersion: runtime.version,
    localExtensions: {
      prepare: (ids, options) => getLocalBrowserExtensions().prepare(ids, options),
    },
    getSystemLocale: () =>
      app.getPreferredSystemLanguages()[0] || app.getLocale(),
    steam,
    transport,
    getData: unlocked,
    onChange: (account) => {
      assertUiAccess();
      if (!unlocked().accounts.includes(account))
        throw Error(localeText.operationCancelled);
      persist();
      changed();
    },
    onEvent: (event) => {
      if (uiUnavailable()) return;
      const data = unlocked();
      const account = data.accounts.find((a) => a.id === event.accountId);
      if (!account) return;
      const proxy = data.proxies.find((p) => p.id === event.proxyId);
      if (proxy && ["route", "ready", "rateLimited"].includes(event.outcome)) {
        statuses.set(account.id, {
          state: "connected",
          proxyId: proxy.id,
          message: `${localeText.templateText_707c214}${proxy.id}`,
        });
      }
      const details = [
        `${localeText.templateText_4f4a1e4}${event.stage} / ${event.outcome}`,
        event.proxyId
          ? `${localeText.templateText_8c0b900}${event.proxyId}`
          : localeText.message_a69276c,
      ];
      if (Number.isInteger(event.statusCode))
        details.push(`HTTP ${event.statusCode}`);
      if (Number.isInteger(event.eresult))
        details.push(`EResult ${event.eresult}`);
      if (Number.isFinite(event.retryAfterMs))
        details.push(
          `${localeText.templateText_35ad06c}${Math.ceil(event.retryAfterMs / 1000)}${localeText.seconds}`,
        );
      record(details.join(" · "), account.id);
      changed();
    },
  });
  return browserSessions;
}
async function startBrowserOpen(data, ids, browserAction) {
  browserActionUrl(browserAction);
  let accounts = selectedAccounts(data, ids);
  let limit = data.settings.browserMaxAccounts ?? 10;
  if (accounts.length > limit)
    throw Error(localeText.browserLimitExceededChangeItInSettings);
  if (browserJob?.state === "running")
    throw Error(localeText.browsersAreAlreadyBeingOpened);
  const service = await getBrowsers();
  assertUiAccess();
  data = unlocked();
  accounts = selectedAccounts(data, ids);
  limit = data.settings.browserMaxAccounts ?? 10;
  if (browserJob?.state === "running")
    throw Error(localeText.browsersAreAlreadyBeingOpened);
  if (accounts.length > (data.settings.browserMaxAccounts ?? 10))
    throw Error(localeText.browserLimitExceededChangeItInSettings);
  const union = new Set([...service.list().map((s) => s.accountId), ...ids]);
  if (union.size > limit)
    throw Error(
      localeText.browserLimitExceededCloseSomeWindowsOrChangeTheLimit,
    );
  const job = (browserJob = initPool(
    {
      ticket: randomUUID(),
      state: "running",
      total: accounts.length,
      processed: 0,
      opened: 0,
      failed: [],
      currentId: null,
    },
    data.settings,
    true,
    accounts,
  ));
  const captured = epoch;
  const isCancelled = () =>
    job.state !== "running" || epoch !== captured || vault.status().locked;
  for (const account of accounts)
    browserReserved.set(account.steamId, job.ticket);
  const releaseBrowser = (account) => {
    if (browserReserved.get(account.steamId) === job.ticket)
      browserReserved.delete(account.steamId);
  };
  void (async () => {
    await parallelAccounts(
      accounts,
      async (account) => {
        try {
          await browserAccountWork(
            account.id,
            (a) =>
              service.open(a, {
                isCancelled,
                action: browserAction,
              }),
            isCancelled,
            () => {
              itemProgress(
                job,
                account.id,
                "running",
                localeText.waitingForTheAccountSCurrentOperationToFinish,
              );
              changed();
            },
          );
          if (job.state === "running" && epoch === captured) job.opened++;
        } catch (error) {
          if (job.state === "running" && epoch === captured) {
            job.failed.push({ id: account.id, message: safeFailure(error) });
            itemProgress(job, account.id, "failed", safeFailure(error));
          }
        } finally {
          releaseBrowser(account);
          if (!isCancelled()) job.processed++;
        }
        changed();
      },
      job,
      isCancelled,
    );
    if (job.state === "running") job.state = "complete";
    changed();
  })()
    .catch(() => {
      cancelJob(job);
      changed();
    })
    .finally(() => {
      for (const account of accounts) releaseBrowser(account);
    });
  return { ticket: job.ticket };
}
function selectedAccounts(data, ids, allowEmpty = false) {
  if (
    !Array.isArray(ids) ||
    (!allowEmpty && !ids.length) ||
    ids.length > 5000 ||
    ids.some((id) => typeof id !== "string") ||
    new Set(ids).size !== ids.length
  )
    throw new Error(localeText.invalidAccountList);
  const index = new Map(data.accounts.map((account) => [account.id, account]));
  return ids.map((id) => {
    const account = index.get(id);
    if (!account) throw new Error(localeText.accountNotFound);
    return account;
  });
}
function startProxyCheck(data, p) {
  const accounts = selectedAccounts(data, p.ids);
  if (proxyCheck?.job.state === "running")
    throw Error(localeText.message_ca807b6);
  const captured = epoch;
  let queue;
  // A separate transport lets Cancel stop only this check, without aborting
  // unrelated Steam operations or allowing a direct fallback.
  const checker = new ProxyTransport({
    scheduler: transport.scheduler,
    resolveProxies: (account) => model.resolveRoute(unlocked(), account),
    allowDirect: () => unlocked().settings.allowDirect === true,
    onStatus: (account, status) => {
      if (
        epoch !== captured ||
        queue?.job.state !== "running" ||
        vault.status().locked
      )
        return;
      if (!unlocked().accounts.includes(account)) return;
      statuses.set(account.id, status);
      if (status.proxyId) transport.active.set(account.id, status.proxyId);
      changed();
    },
  });
  queue = new ProxyCheckQueue({
    accounts,
    delayMs: p.delayMs ?? data.settings.taskStartDelayMs,
    concurrency: p.concurrency ?? data.settings.proxyCheckConcurrency,
    abort: () => {
      const currentIds = [...queue.job.currentIds];
      checker.abortAll();
      for (const current of currentIds) {
        if (statuses.get(current)?.state === "checking")
          statuses.set(current, {
            state: "unchecked",
            message: localeText.messageText,
          });
      }
    },
    onChange: changed,
    check: async (account) => {
      if (captured !== epoch || vault.status().locked)
        throw Error(localeText.operationCancelled);
      try {
        return await accountWork(account.id, async () => {
          statuses.set(account.id, {
            state: "checking",
            message: localeText.checkingProxy_499d131,
          });
          changed();
          return checker.check(account);
        });
      } catch (error) {
        if (
          captured === epoch &&
          queue.job.state === "running" &&
          !vault.status().locked
        ) {
          const existing = statuses.get(account.id);
          if (!existing || existing.state === "checking")
            statuses.set(account.id, {
              state: "unchecked",
              message: localeText.message_646402d,
            });
          changed();
        }
        throw error;
      }
    },
  });
  proxyCheck = queue;
  void queue.run().catch(() => queue.cancel());
  return queue.snapshot();
}
function clearBulkConfirmations() {
  if (pendingBulk) {
    if (pendingBulk.state !== "complete") {
      cancelJob(pendingBulk);
      pendingBulk.phase = "cancelled";
    } else poolControllers.get(pendingBulk)?.abort();
    // Public progress can outlive a consumed review; confirmation nonces cannot.
    pendingBulk.entries = [];
  }
  bulkGeneration++;
  pendingBulk = null;
  bulkReserved.clear();
}
function assertBulk(ticket) {
  if (pendingBulk === ticket && Date.now() > ticket.expires)
    clearBulkConfirmations();
  if (
    pendingBulk !== ticket ||
    ticket.epoch !== epoch ||
    ticket.generation !== bulkGeneration ||
    vault.status().locked ||
    Date.now() > ticket.expires
  )
    throw new Error(localeText.confirmationReviewExpiredRefreshTheList);
}
function safeFailure(error) {
  const message = String(error?.message || "");
  return new RegExp(localeText.pattern_d1e8beb, "").test(message) &&
    !/https?:\/\/|socks5|access_token|refresh_token|shared_secret|identity_secret/i.test(
      message,
    )
    ? message.slice(0, 300)
    : localeText.actionFailedCheckTheInputProxiesAndSession;
}
async function parallelAccounts(accounts, task, job, isCancelled) {
  return runTaskPool(
    accounts,
    async (account, index) => {
      if (isCancelled?.()) return;
      itemProgress(job, account.id, "running");
      changed();
      try {
        const result = await task(account, index);
        if (
          !isCancelled?.() &&
          poolItems.get(job)?.get(account.id)?.state === "running"
        )
          itemProgress(job, account.id, "complete");
        return result;
      } catch (error) {
        if (!isCancelled?.())
          itemProgress(job, account.id, "failed", safeFailure(error));
        throw error;
      } finally {
        changed();
      }
    },
    {
      concurrency: job.concurrency,
      startIntervalMs: job.startIntervalMs,
      signal: poolControllers.get(job)?.signal,
      isCancelled,
      onActive: (active) => {
        job.currentIds = active.map((account) => account.id);
        job.currentId = job.currentIds[0] || null;
        changed();
      },
    },
  );
}
async function prepareBulkConfirmations(data, p) {
  const accounts = selectedAccounts(data, p.ids);
  if (!["market", "purchase", "trade", "all"].includes(p.kind))
    throw new Error(localeText.unknownConfirmationType);
  clearBulkConfirmations();
  const ticket = (pendingBulk = initPool(
    {
      ticket: randomUUID(),
      kind: p.kind,
      epoch,
      generation: bulkGeneration,
      expires: Date.now() + 5 * 60 * 1000,
      phase: "preparing",
      state: "running",
      entries: [],
      accounts: [],
      failed: [],
    },
    data.settings,
    false,
    accounts,
  ));
  bulkConfirmationJob = ticket;
  for (const account of accounts) bulkReserved.add(account.id);
  try {
    await parallelAccounts(
      accounts,
      async (account) => {
        assertBulk(ticket);
        try {
          await accountWork(account.id, async (a) => {
            const items = await steam.listConfirmations(a);
            assertBulk(ticket);
            const types = {
              market: [3],
              purchase: [12],
              trade: [2],
              all: [2, 3, 12],
            }[p.kind];
            const selected = items.filter(
              (item) => types.includes(item.type) && !item.held,
            );
            const entries = selected.map((item) => {
              const stored = steam.confirmations.get(a.id)?.get(item.id);
              if (
                !stored ||
                stored.type !== item.type ||
                stored.creatorId !== item.creatorId
              )
                throw new Error(
                  localeText.confirmationChangedRefreshTheList_66bacf8,
                );
              return {
                id: item.id,
                type: item.type,
                creatorId: stored.creatorId,
                key: stored.key,
              };
            });
            ticket.entries.push({ id: a.id, items: entries });
            ticket.accounts.push({
              id: a.id,
              name: a.name,
              count: entries.length,
              confirmations: selected,
            });
          });
        } catch (error) {
          assertBulk(ticket);
          ticket.failed.push({ id: account.id, message: safeFailure(error) });
          itemProgress(ticket, account.id, "failed", safeFailure(error));
        } finally {
          if (
            pendingBulk === ticket &&
            ticket.epoch === epoch &&
            !vault.status().locked
          )
            ticket.processed++;
        }
      },
      ticket,
      () =>
        pendingBulk !== ticket ||
        ticket.epoch !== epoch ||
        vault.status().locked,
    );
    assertBulk(ticket);
    // The review lifetime starts once all accounts have been fetched. Each
    // confirmation also retains SteamService's stricter individual freshness.
    ticket.expires = Date.now() + 5 * 60 * 1000;
    ticket.phase = "ready";
    ticket.state = "ready";
    changed();
    return {
      ticket: ticket.ticket,
      kind: ticket.kind,
      accounts: ticket.accounts,
      count: ticket.accounts.reduce((sum, account) => sum + account.count, 0),
      failed: ticket.failed,
    };
  } catch (error) {
    if (pendingBulk === ticket) clearBulkConfirmations();
    throw error;
  }
}
async function commitBulkConfirmations(id) {
  const ticket = pendingBulk;
  if (!ticket || ticket.ticket !== id || ticket.phase !== "ready")
    throw new Error(localeText.confirmationReviewExpiredRefreshTheList);
  assertBulk(ticket);
  ticket.phase = "committing";
  ticket.state = "running";
  resetPoolProgress(ticket, ticket.entries);
  changed();
  let confirmed = 0;
  const failed = [...ticket.failed];
  try {
    await parallelAccounts(
      ticket.entries,
      async (entry) => {
        assertBulk(ticket);
        try {
          await accountWork(entry.id, async (account) => {
            for (const expected of entry.items) {
              assertBulk(ticket);
              const current = steam.confirmations
                .get(account.id)
                ?.get(expected.id);
              if (
                !current ||
                current.type !== expected.type ||
                current.creatorId !== expected.creatorId ||
                current.key !== expected.key
              )
                throw new Error(
                  localeText.confirmationChangedRefreshTheList_66bacf8,
                );
              await steam.respond(account, expected.id, true);
              assertBulk(ticket);
              confirmed++;
            }
          });
        } catch (error) {
          assertBulk(ticket);
          failed.push({ id: entry.id, message: safeFailure(error) });
          itemProgress(ticket, entry.id, "failed", safeFailure(error));
        } finally {
          if (
            pendingBulk === ticket &&
            ticket.epoch === epoch &&
            !vault.status().locked
          )
            ticket.processed++;
        }
      },
      ticket,
      () =>
        pendingBulk !== ticket ||
        ticket.epoch !== epoch ||
        vault.status().locked,
    );
    assertBulk(ticket);
    ticket.result = { confirmed, failed };
    ticket.phase = "complete";
    ticket.state = "complete";
    return ticket.result;
  } finally {
    if (pendingBulk === ticket) clearBulkConfirmations();
    changed();
  }
}
function bulkConfirmationStatus(id) {
  const job = bulkConfirmationJob;
  if (!job || job.ticket !== id || job.epoch !== epoch)
    throw new Error(localeText.confirmationReviewExpiredRefreshTheList);
  if (pendingBulk === job && Date.now() > job.expires) clearBulkConfirmations();
  const result = {
    ticket: job.ticket,
    kind: job.kind,
    state: job.state,
    phase: job.phase,
    total: job.total,
    processed: job.processed,
    concurrency: job.concurrency,
    currentIds: [...job.currentIds],
    items: job.items.map((item) => ({ ...item })),
    failed: job.failed.map((failure) => ({ ...failure })),
  };
  if (["ready", "committing", "complete"].includes(job.phase))
    result.review = {
      ticket: job.ticket,
      kind: job.kind,
      accounts: job.accounts.map((account) => ({ ...account })),
      count: job.accounts.reduce((sum, account) => sum + account.count, 0),
      failed: job.failed.map((failure) => ({ ...failure })),
    };
  if (job.result) result.result = job.result;
  return structuredClone(result);
}
async function runBulkLogin(job, accounts) {
  const isCancelled = () =>
    job.state !== "running" || job.epoch !== epoch || vault.status().locked;
  await parallelAccounts(
    accounts,
    async (account) => {
      if (
        job.state !== "running" ||
        job.epoch !== epoch ||
        vault.status().locked
      )
        return;
      try {
        if (!hasPassword(account)) {
          job.missingPassword++;
          throw new Error(localeText.noAccountPasswordIsSaved);
        }
        const result = await accountWork(account.id, (a) =>
          steam.login(a, {
            password: a.loginPassword,
            waitForCompletion: true,
          }),
        );
        if (isCancelled()) return;
        job.started++;
        if (result.status === "complete") {
          job.complete++;
          itemProgress(job, account.id, "complete");
        } else {
          job.pending++;
          itemProgress(job, account.id, "pending");
        }
      } catch (error) {
        if (isCancelled()) return;
        job.failed.push({ id: account.id, message: safeFailure(error) });
        itemProgress(job, account.id, "failed", safeFailure(error));
      } finally {
        if (!isCancelled()) job.processed++;
      }
    },
    job,
    isCancelled,
  );
  if (job.state === "running") job.state = "complete";
  changed();
}
async function runBulkBanCheck(job, accounts) {
  const isCancelled = () =>
    job.state !== "running" || job.epoch !== epoch || vault.status().locked;
  await parallelAccounts(
    accounts,
    async (account) => {
      if (isCancelled()) return;
      try {
        const bans = await accountWork(account.id, (a) =>
          steam.refreshBans(a, { force: true }),
        );
        if (isCancelled()) return;
        job.complete++;
        if (bans?.vac == null || bans?.community == null || bans?.game == null)
          job.unknown++;
        itemProgress(job, account.id, "complete");
      } catch (error) {
        if (isCancelled()) return;
        job.failed.push({ id: account.id, message: safeFailure(error) });
        itemProgress(job, account.id, "failed", safeFailure(error));
      } finally {
        if (!isCancelled()) job.processed++;
      }
    },
    job,
    isCancelled,
  );
  if (job.state === "running") job.state = "complete";
  changed();
}
async function exportAccounts(data, p) {
  selectedAccounts(data, p.ids);
  if (
    !["smart-sda", "mafile"].includes(p.format) ||
    typeof p.includeProxies !== "boolean" ||
    (p.key !== undefined && typeof p.key !== "string")
  )
    throw new Error(localeText.message_e28c263);
  if (p.format === "mafile" && (p.key || p.includeProxies))
    throw new Error(localeText.message_d064b63);
  const captured = epoch;
  const assertCurrent = () => {
    if (captured !== epoch || uiUnavailable())
      throw new Error(localeText.operationCancelled);
  };
  if (p.format === "smart-sda") {
    const bundle = exportsService.buildPortable(data, p.ids, {
      includeProxies: p.includeProxies,
    });
    const bytes = await exportsService.encodePortable(bundle, p.key || "");
    try {
      assertCurrent();
      const target = await dialog.showSaveDialog(win, {
        title: localeText.titleText,
        defaultPath: `smart-auth-export-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "smart-auth", extensions: ["json"] }],
      });
      assertCurrent();
      if (target.canceled) return { cancelled: true };
      if (
        [
          vault.filePath,
          vault.filePath + ".bak",
          vault.filePath + ".auth-state",
        ].some((file) => sameFileTarget(target.filePath, file))
      )
        throw new Error(localeText.message_1de5e08);
      const temporary = `${target.filePath}.${randomUUID()}.tmp`;
      try {
        const fd = fs.openSync(temporary, "wx", 0o600);
        try {
          fs.writeFileSync(fd, bytes);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        fs.renameSync(temporary, target.filePath);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    } finally {
      bytes.fill(0);
    }
  } else {
    const files = exportsService.classicFiles(data, p.ids);
    const target = await dialog.showOpenDialog(win, {
      title: localeText.titleText_3e79cd0,
      properties: ["openDirectory", "createDirectory"],
    });
    assertCurrent();
    if (target.canceled) return { cancelled: true };
    const folder = path.join(
      target.filePaths[0],
      `smart-auth-export-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
    );
    fs.mkdirSync(folder, { mode: 0o700 });
    for (const file of files) {
      if (!/^(?:\d{17}\.maFile|manifest\.json)$/.test(file.name))
        throw new Error(localeText.message_eb66308);
      fs.writeFileSync(path.join(folder, file.name), file.content, {
        flag: "wx",
        mode: 0o600,
      });
    }
  }
  record(`${localeText.templateText_6caf24d}${p.ids.length}.`);
  return { saved: true, count: p.ids.length, format: p.format };
}
function sameFileTarget(first, second) {
  const canonical = (file) => {
    let resolved = path.resolve(file);
    try {
      resolved = fs.realpathSync(resolved);
    } catch {
      try {
        resolved = path.join(
          fs.realpathSync(path.dirname(resolved)),
          path.basename(resolved),
        );
      } catch {}
    }
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  if (canonical(first) === canonical(second)) return true;
  try {
    const a = fs.statSync(first),
      b = fs.statSync(second);
    return a.ino !== 0 && a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}
async function collectImportBans(data, candidates, options, guard) {
  guard();
  const bansBySteamId = Object.create(null);
  if (!options.skipVacBanned && !options.skipCommunityBanned)
    return bansBySteamId;
  const accounts = [
    ...new Map(
      candidates
        .filter((a) => /^765\d{14}$/.test(a?.steamId))
        .map((a) => [a.steamId, a]),
    ).values(),
  ];
  const routeAccounts = data.accounts.filter((a) => {
    try {
      return model.resolveRoute(data, a).length > 0;
    } catch {
      return false;
    }
  });
  if (!routeAccounts.length) return bansBySteamId;
  const rows = accounts.filter((account) => {
    const saved = data.accounts.find((a) => a.steamId === account.steamId);
    const bans = normalizeAccountBans(saved?.bans);
    const recent =
      bans.checkedAt && Date.now() - Date.parse(bans.checkedAt) < 6 * 3600000;
    if (
      recent &&
      (!options.skipVacBanned || bans.vac !== null) &&
      (!options.skipCommunityBanned || bans.community !== null)
    ) {
      bansBySteamId[account.steamId] = bans;
      return false;
    }
    return true;
  });
  // These are public identity lookups only, without importing/logging in to an
  // account. Every request uses an already configured proxy; never direct.
  const batchSize =
    data.banApiKey && typeof steam.lookupBansBatch === "function" ? 100 : 1;
  const batches = [];
  for (let i = 0; i < rows.length; i += batchSize)
    batches.push(rows.slice(i, i + batchSize));
  await runTaskPool(
    batches,
    async (batch, index) => {
      guard();
      const own = routeAccounts.find((a) => a.steamId === batch[0].steamId);
      const route = own || routeAccounts[index % routeAccounts.length];
      try {
        const found =
          batchSize > 1
            ? await steam.lookupBansBatch(
                route,
                batch.map((a) => a.steamId),
              )
            : {
                [batch[0].steamId]: await steam.lookupBans(
                  route,
                  batch[0].steamId,
                ),
              };
        guard();
        for (const a of batch) {
          const observation =
            found instanceof Map ? found.get(a.steamId) : found?.[a.steamId];
          if (observation)
            bansBySteamId[a.steamId] = normalizeAccountBans(observation);
        }
      } catch {
        guard();
      }
    },
    {
      concurrency: 3,
      startIntervalMs: 350,
      isCancelled: () => {
        try {
          guard();
          return false;
        } catch {
          return true;
        }
      },
    },
  );
  guard();
  return bansBySteamId;
}
async function preparePortableImport(p) {
  const banOptions = normalizeImportBanOptions(p);
  clearAllocationFor("commitPortableImport");
  if (p.groupId) model.item(unlocked().groups, p.groupId, localeText.folder);
  if (p.key !== undefined && typeof p.key !== "string")
    throw new Error(localeText.message_2a41dfd);
  const captured = epoch,
    generation = ++portableGeneration;
  pendingPortable = null;
  const picked = await dialog.showOpenDialog(win, {
    title: localeText.importSmartSDA,
    properties: ["openFile"],
    filters: [{ name: "smart-auth", extensions: ["json", "sda"] }],
  });
  if (
    captured !== epoch ||
    generation !== portableGeneration ||
    uiUnavailable()
  )
    throw new Error(localeText.operationCancelled);
  if (picked.canceled) return { cancelled: true };
  const fd = fs.openSync(picked.filePaths[0], "r");
  let bytes;
  try {
    const size = fs.fstatSync(fd).size;
    if (size > 64 * 1024 * 1024 || size < 2)
      throw new Error(localeText.message_87a3d35);
    const storage = Buffer.alloc(size + 1);
    let total = 0,
      read;
    while (
      total < storage.length &&
      (read = fs.readSync(fd, storage, total, storage.length - total, total))
    )
      total += read;
    if (total > size) {
      storage.fill(0);
      throw new Error(localeText.message_e5990eb);
    }
    bytes = storage.subarray(0, total);
  } finally {
    fs.closeSync(fd);
  }
  let bundle, encrypted;
  try {
    encrypted =
      JSON.parse(bytes.toString("utf8")).format === "smart-sda-encrypted";
    bundle = await exportsService.decodePortable(bytes, p.key || "");
  } finally {
    bytes.fill(0);
  }
  if (
    captured !== epoch ||
    generation !== portableGeneration ||
    uiUnavailable()
  )
    throw new Error(localeText.operationCancelled);
  const data = unlocked();
  const guard = () => {
    if (
      captured !== epoch ||
      generation !== portableGeneration ||
      uiUnavailable()
    )
      throw Error(localeText.operationCancelled);
  };
  const bansBySteamId = await collectImportBans(
    data,
    bundle.accounts,
    banOptions,
    guard,
  );
  guard();
  const filtered = filterPortableImportBans(
    data,
    bundle,
    banOptions,
    bansBySteamId,
  );
  const plan = planPortableImport(data, filtered.bundle);
  const token = randomUUID();
  pendingPortable = {
    token,
    bundle,
    banOptions,
    bansBySteamId,
    epoch,
    destinationGroupId: p.groupId || null,
    expires: Date.now() + 5 * 60 * 1000,
  };
  return {
    token,
    ready: plan.accounts.length,
    duplicates: plan.duplicates,
    accounts: plan.accounts.map((a) => ({ name: a.name, steamId: a.steamId })),
    groups: plan.groups.length,
    proxies: plan.proxies.length,
    encrypted,
    autoConfirmationsDisabled: true,
    banFilter: filtered.banFilter,
  };
}
function checkInput(action, payload) {
  if (
    typeof action !== "string" ||
    action.length > 64 ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  )
    throw new Error(localeText.invalidRequest);
  const json = JSON.stringify(payload);
  const maxPayload = [
    "prepareAccountImport",
    "importProxies",
    "updateProxyList",
  ].includes(action)
    ? 2 * 1024 * 1024
    : 256 * 1024;
  if (json.length > maxPayload) throw new Error(localeText.requestTooLarge);
  for (const key of Object.keys(payload))
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error(localeText.invalidRequest);
}
async function publishConfirmationNotice(account, items) {
  const captured = epoch,
    details = new Map();
  const pendingIds = notifications.unseenConfirmationIds(account, items);
  // Notification previews are optional; cap enrichment, never the actual list.
  for (const id of pendingIds.slice(0, 3)) {
    try {
      details.set(id, await steam.confirmationDetails(account, id));
    } catch {
      /* The full review remains available even when a preview fails. */
    }
    if (captured !== epoch || vault.status().locked) return;
  }
  if (captured === epoch && !vault.status().locked)
    notifications.confirmations(account, items, details);
}
function showNotification(event) {
  if (!vault || uiStatus().locked) return;
  const settings = unlocked().settings;
  const message = notificationText(
    settings.language,
    event.kind,
    event.count,
    event.stacks,
  );
  if (win && !win.isDestroyed())
    win.webContents.send("smart-sda-notification", event);
  if (!Notification?.isSupported()) return;
  try {
    const notification = new Notification({ ...message, silent: true });
    nativeNotifications.add(notification);
    notification.on("close", () => nativeNotifications.delete(notification));
    notification.on("failed", () => nativeNotifications.delete(notification));
    notification.on("click", showMainWindow);
    while (nativeNotifications.size > 3) {
      const oldest = nativeNotifications.values().next().value;
      oldest.close();
      nativeNotifications.delete(oldest);
    }
    notification.show();
  } catch {
    /* The in-app notification still works if Windows suppresses toasts. */
  }
}
function uniqueGroupName(data, desired) {
  const base =
    String(desired || localeText.import)
      .replace(/[\x00-\x1f]/g, " ")
      .slice(0, 100)
      .trim() || localeText.import;
  let name = base,
    suffix = 2;
  while (
    data.groups.some(
      (g) =>
        !g.parentId && g.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    name = `${base} (${suffix++})`;
  return name;
}
async function chooseImportPaths(mode, title, extensions) {
  const captured = epoch;
  const result = await dialog.showOpenDialog(win, {
    title,
    properties:
      mode === "folder"
        ? ["openDirectory"]
        : mode === "single"
          ? ["openFile"]
          : ["openFile", "multiSelections"],
    ...(mode === "folder" ? {} : { filters: [{ name: "Import", extensions }] }),
  });
  if (epoch !== captured || uiUnavailable())
    throw new Error(localeText.operationCancelled);
  return result.canceled ? null : result.filePaths;
}
function addProxyEntries(data, lists) {
  data.proxyLists ||= [];
  const byUrl = new Map(data.proxies.map((proxy) => [proxy.url, proxy.id]));
  let imported = 0,
    duplicates = 0;
  const result = [];
  for (const list of lists) {
    const ids = [];
    for (const proxy of list.proxies) {
      let id = byUrl.get(proxy.url);
      if (id) duplicates++;
      else {
        id = model.saveProxy(data, proxy, true);
        byUrl.set(proxy.url, id);
        imported++;
      }
      if (!ids.includes(id)) ids.push(id);
    }
    result.push({ name: list.name, proxyIds: ids });
  }
  return { imported, duplicates, lists: result };
}
function proxyDraft(data) {
  return {
    ...data,
    proxies: data.proxies.map((proxy) => ({ ...proxy })),
    proxyLists: (data.proxyLists || []).map((list) => ({
      ...list,
      proxyIds: [...list.proxyIds],
    })),
  };
}
function uniqueListName(data, desired) {
  const base = model.label(desired).slice(0, 100);
  let name = base,
    suffix = 2;
  while (
    (data.proxyLists || []).some(
      (list) => list.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    name = `${base} (${suffix++})`;
  return name;
}
function allocationFingerprint(data) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
function clearAllocation() {
  const value = pendingAllocation;
  pendingAllocation = null;
  function clear(object) {
    if (!object || typeof object !== "object") return;
    for (const key of Object.keys(object)) {
      clear(object[key]);
      delete object[key];
    }
  }
  clear(value?.draft?.data);
}
function clearAllocationFor(action, token) {
  if (
    pendingAllocation?.action === action &&
    (token === undefined || pendingAllocation.payload.token === token)
  )
    clearAllocation();
}
function allocationSource(action, payload) {
  checkInput(action, payload);
  let prepared = null;
  if (action === "commitAccountImport" || action === "commitPortableImport") {
    prepared =
      action === "commitAccountImport" ? pendingImport : pendingPortable;
    if (
      !prepared ||
      prepared.token !== payload.token ||
      prepared.epoch !== epoch ||
      Date.now() > prepared.expires
    )
      throw Error(localeText.theImportPreviewIsStaleStartTheImportAgain);
  }
  return prepared;
}
function allocationDraft(data, action, payload) {
  const prepared = allocationSource(action, payload);
  const draft = stageMutation(data, action, payload, prepared);
  if (action === "updateAccount")
    applyWarehouseChoice(draft.data, [payload.id], payload);
  draft.allocation = planProxyAllocation(draft.data, {
    accountIds: draft.accountIds,
    redistribute: payload.redistribute === true,
    preferGroup: draft.preferGroup,
  });
  return draft;
}
function validateAllocationConsent(plan, reuseListIds) {
  if (plan.lists.some((list) => list.blocked))
    throw Error(
      localeText.theSelectedListHasNoProxiesAddAddressesOrChooseAnotherList,
    );
  const required = plan.lists
    .filter((list) => list.shortage > 0)
    .map((list) => list.id)
    .sort();
  if (
    !Array.isArray(reuseListIds) ||
    reuseListIds.some((id) => typeof id !== "string") ||
    new Set(reuseListIds).size !== reuseListIds.length ||
    JSON.stringify([...reuseListIds].sort()) !== JSON.stringify(required)
  )
    throw Error(localeText.confirmReuseForEachListThatHasAProxyShortage);
}
function applyMutation(data, action, payload, draft) {
  applyProxyAllocation(draft.data, draft.allocation);
  pendingAllocation = null;
  if (draft.networkChanged) {
    invalidateNetwork();
    // In-flight Steam responses still hold references to durable intents.
    // Allocation changes may update scheme settings, but never replace history.
    if (data.loot && draft.data.loot)
      draft.data.loot.journal = data.loot.journal;
    Object.assign(data, draft.data);
  } else {
    // A note/name edit must keep live account objects and sessions intact.
    model.saveAccount(data, payload);
  }
  if (action === "commitAccountImport") pendingImport = null;
  if (action === "commitPortableImport") pendingPortable = null;
  record(draft.message, draft.accountId);
  changed();
  return draft.result === null
    ? null
    : { ...draft.result, allocated: draft.allocation.assigned };
}
function prepareAllocation(data, p) {
  if (!ALLOCATION_ACTIONS.has(p.action))
    throw Error(localeText.unknownProxyAllocationAction);
  if (p.action === "updateAccount") {
    const conflict = warehouseConflict(data, [p.payload?.id], p.payload || {});
    if (conflict) return conflict;
  }
  clearAllocation();
  const payload = structuredClone(p.payload || {}),
    draft = allocationDraft(data, p.action, payload);
  const token = randomUUID();
  pendingAllocation = {
    token,
    action: p.action,
    payload,
    draft,
    epoch,
    fingerprint: allocationFingerprint(data),
    expires: Date.now() + 5 * 60 * 1000,
  };
  return {
    token,
    accountCount: draft.allocation.accountCount,
    assigned: draft.allocation.assigned,
    skipped: draft.allocation.skipped,
    lists: draft.allocation.lists.map(
      ({
        id,
        name,
        available,
        required,
        shortage,
        reused,
        blocked,
        spareAvailable,
        backupAccountCount,
        maxBackupsPerAccount,
        assignedBackups,
      }) => ({
        id,
        name,
        available,
        required,
        shortage,
        reused,
        blocked: blocked === true,
        spareAvailable,
        backupAccountCount,
        maxBackupsPerAccount,
        assignedBackups,
      }),
    ),
    result: draft.result,
  };
}
function commitAllocation(data, p) {
  const prepared = pendingAllocation;
  if (!prepared || prepared.token !== p.token)
    throw Error(localeText.theAllocationPreviewIsStaleReviewItAgain);
  if (
    prepared.epoch !== epoch ||
    Date.now() > prepared.expires ||
    prepared.fingerprint !== allocationFingerprint(data)
  ) {
    clearAllocation();
    throw Error(localeText.theAllocationPreviewIsStaleReviewItAgain);
  }
  try {
    allocationSource(prepared.action, prepared.payload);
  } catch (error) {
    clearAllocation();
    throw error;
  }
  const draft = prepared.draft;
  const allocation = planProxyAllocation(draft.data, {
    accountIds: draft.accountIds,
    redistribute: prepared.payload.redistribute === true,
    preferGroup: draft.preferGroup,
    backupCounts: p.backupCounts ?? {},
  });
  validateAllocationConsent(allocation, p.reuseListIds ?? []);
  draft.allocation = allocation;
  return applyMutation(data, prepared.action, prepared.payload, draft);
}
async function vaultAuthentication(method, payload) {
  const startedEpoch = epoch,
    generation = uiGeneration;
  const current = () => {
    if (startedEpoch !== epoch || generation !== uiGeneration)
      throw Error(localeText.operationCancelled);
  };
  try {
    const result = await vault.withAccessGuard(current, () =>
      vault[method](payload),
    );
    current();
    if (["create", "unlock"].includes(method)) hydrateNetworkCooldowns();
    return result;
  } catch (error) {
    if (error.code === "VAULT_PARTIAL_COMMIT") runtimeLock();
    throw error;
  }
}
function hydrateNetworkCooldowns() {
  if (!transport?.scheduler || vault.status().locked) return;
  try {
    const data = vault.getData(),
      scheduler = transport.scheduler;
    scheduler.hydrateCooldowns(data.networkCooldowns);
    for (const account of data.accounts)
      scheduler.bindCooldownIdentity({
        accountId: account.id,
        steamId: account.steamId,
        url: "https://steamcommunity.com/",
      });
    scheduler.persistCooldowns();
  } catch (error) {
    runtimeLock();
    throw error;
  }
}
function enforceIdleLock() {
  // Enforce expiry before activity or data reads can revive a session between
  // timer ticks, including after a suspended or busy event loop.
  const before = uiStatus();
  const overdue = idleLockAction({
    lastInteraction,
    now: performance.now(),
    settings: idleSettings,
    pinEnabled: before.pinEnabled === true,
    lockMode: before.lockMode || (before.locked ? "password" : "unlocked"),
  });
  if (overdue) lock(overdue, { idle: true });
}
async function dispatch(action, p) {
  checkInput(action, p);
  enforceIdleLock();
  if (
    ["checkAppUpdate", "downloadAppUpdate", "restartForAppUpdate"].includes(
      action,
    )
  ) {
    assertUiAccess();
    if (Object.keys(p).length)
      return { state: "error", code: "UPDATE_INVALID_REQUEST" };
    return runAppUpdate(action);
  }
  if (action === "status") return uiStatus();
  if (action === "createVault") {
    if (typeof p.password !== "string" || [...p.password].length < 15)
      throw new Error(localeText.useAPasswordWithAtLeast15Characters);
    const status = await vaultAuthentication("create", p);
    lastInteraction = performance.now();
    idleSettings = { ...vault.getData().settings };
    changed();
    return finishUiUnlock();
  }
  if (action === "unlock") {
    const generation = uiGeneration;
    if (uiLocked && !vault.status().locked) {
      await vaultAuthentication("verify", {
        ...p,
        assertCurrent: () => {
          if (generation !== uiGeneration)
            throw Error(localeText.operationCancelled);
        },
      });
    } else await vaultAuthentication("unlock", p);
    if (generation !== uiGeneration) throw Error(localeText.operationCancelled);
    lastInteraction = performance.now();
    idleSettings = { ...vault.getData().settings };
    nextPoll = Date.now() + 1000;
    return finishUiUnlock();
  }
  if (action === "lock") return lock();
  if (action === "pinLock") {
    unlocked();
    if (!vault.status().pinEnabled) throw new Error(localeText.setUpPINFirst);
    return lock("pin");
  }
  if (action === "unlockPin") {
    const generation = uiGeneration;
    try {
      if (!uiLocked || uiLockMode !== "pin" || vault.status().locked)
        throw Error(localeText.vaultLocked);
      await vault.verifyPin({
        ...p,
        assertCurrent: () => {
          if (generation !== uiGeneration)
            throw Error(localeText.operationCancelled);
        },
      });
      if (generation !== uiGeneration)
        throw Error(localeText.operationCancelled);
      if (
        idleLockAction({
          lastInteraction,
          now: performance.now(),
          settings: idleSettings,
          pinEnabled: true,
          lockMode: "pin",
        }) === "password"
      ) {
        lock();
        throw Error(localeText.vaultLocked);
      }
      lastInteraction = performance.now();
      return finishUiUnlock();
    } catch (error) {
      if (error.code === "UI_PIN_MASTER_REQUIRED") lock();
      throw error;
    } finally {
      changed();
    }
  }
  const data = unlocked();
  assertUiAccess();
  if (action === "touch") {
    lastInteraction = performance.now();
    return null;
  }
  if (
    ![
      "snapshot",
      "codes",
      "activity",
      "bulkLoginStatus",
      "bulkBanCheckStatus",
      "browserOpenStatus",
      "browserRuntimeStatus",
      "proxyCheckStatus",
      "bulkConfirmationStatus",
    ].includes(action)
  )
    lastInteraction = performance.now();
  if (action === "prepareProxyAllocation") return prepareAllocation(data, p);
  if (action === "commitProxyAllocation") return commitAllocation(data, p);
  if (action === "cancelProxyAllocation") {
    if (p.token === undefined || pendingAllocation?.token === p.token)
      clearAllocation();
    return null;
  }
  if (ALLOCATION_ACTIONS.has(action)) {
    if (action === "updateAccount") {
      const conflict = warehouseConflict(data, [p.id], p);
      if (conflict) return conflict;
    }
    const draft = allocationDraft(data, action, p);
    validateAllocationConsent(draft.allocation, []);
    return applyMutation(data, action, p, draft);
  }
  switch (action) {
    case "takeTrayReview": {
      const pending = pendingTrayReview;
      pendingTrayReview = null;
      if (!pending || pending.epoch !== epoch || !data.settings.trayEnabled)
        return null;
      const chosen = new Set(data.settings.trayAccountIds || []);
      if (
        pending.ids.some(
          (id) => !chosen.has(id) || !data.accounts.some((a) => a.id === id),
        )
      )
        return null;
      return { ids: pending.ids, kind: pending.kind };
    }
    case "openPasswordManager":
      await openPasswordManager();
      return { opened: true };
    case "openAuthenticator":
      await openAuthenticator();
      return { opened: true };
    case "openLoot":
      await openLoot(p.schemeId);
      return { opened: true };
    case "deleteLootScheme": {
      findLootScheme(data, p.schemeId);
      if (!loot.canDelete(p.schemeId)) throw Error(localeText.message_7feac9e);
      loot.cancel(p.schemeId);
      mutateLootSettings(data, () => removeLootScheme(data, p.schemeId));
      for (const context of [...lootWindows.values()])
        if (context.schemeId === p.schemeId) context.window.destroy();
      changed();
      return { deleted: true };
    }
    case "cancelLootScheme":
      findLootScheme(data, p.schemeId);
      loot.cancel(p.schemeId);
      changed();
      return { cancelled: true };
    case "saveSteamAdmins":
      saveAdmins(data, p.steamAdmins);
      invalidateNetwork();
      record(localeText.message_3f60f1b);
      changed();
      void refreshPeopleAvatars().catch(() => {});
      return { steamAdmins: publicPeople(data, data.steamAdmins) };
    case "refreshSteamAdminAvatars":
      await refreshPeopleAvatars();
      return {
        steamAdmins: publicPeople(unlocked(), unlocked().steamAdmins || []),
      };
    case "proxyDetails":
      if (p.id !== undefined) {
        const proxy = model.item(
          data.proxies,
          p.id,
          localeText.proxies_f1fa83d,
        );
        return [{ id: proxy.id, url: proxy.url }];
      }
      return data.proxies.map(({ id, url }) => ({ id, url }));
    case "accountProxyOptions":
      return accountProxyOptions(data, p);
    case "assignAccountProxy": {
      const plan = planAccountProxy(data, p);
      invalidateNetwork();
      Object.assign(data, plan.data);
      record(localeText.accountProxyUpdated, p.id);
      changed();
      return { proxyId: plan.proxyId };
    }
    case "startProxyCheck":
      return startProxyCheck(data, p);
    case "proxyCheckStatus":
      if (!proxyCheck || p.ticket !== proxyCheck.job.ticket)
        throw Error(localeText.message_013740a);
      return proxyCheck.snapshot();
    case "cancelProxyCheck":
      if (!proxyCheck || p.ticket !== proxyCheck.job.ticket)
        throw Error(localeText.message_013740a);
      proxyCheck.cancel();
      return { cancelled: true };
    case "snapshot": {
      const snapshot = model.publicSnapshot(data, uiStatus(), statuses);
      const originals = new Map(
        data.accounts.map((account) => [account.id, account]),
      );
      return {
        ...snapshot,
        locked: false,
        uiGeneration,
        dataDirectory: app.getPath("userData"),
        appVersion: app.getVersion(),
        banApiKeyConfigured: Boolean(data.banApiKey),
        lootStatuses: (loot?.statuses() || []).map((status) => ({
          ...status,
          coverage: loot.coverage(status.schemeId),
          pendingCount: loot.pendingCount(status.schemeId),
        })),
        accounts: snapshot.accounts.map((account) => {
          const original = originals.get(account.id);
          const confirmations = steam.confirmationStatus(original);
          const offers = tradeOffers.snapshot(original, { summaryOnly: true });
          return {
            ...account,
            confirmationCount: confirmations.count,
            incomingTradeOffersCount: offers.count,
            incomingOffersCheckedAt: offers.checkedAt,
          };
        }),
        browsers: browserSessions?.list() || [],
      };
    }
    case "importBrowserExtensionZip":
      return importBrowserExtensionZip(data, p);
    case "browserRuntimeStatus":
      return getBrowserRuntime().status();
    case "startBrowserRuntimeDownload":
      if (Object.keys(p).some((key) => key !== "acceptedTerms"))
        throw Error(localeText.invalidRequest);
      if (browserSessions?.list().length)
        throw Error(localeText.closeTheSelectedAccountsBrowsersFirst);
      return getBrowserRuntime().start(p.acceptedTerms);
    case "cancelBrowserRuntimeDownload":
      return getBrowserRuntime().cancel();
    case "openBrowserRuntimeTerms": {
      const urls = {
        chrome: "https://www.google.com/chrome/terms/",
        google: "https://policies.google.com/terms",
      };
      if (
        !Object.hasOwn(urls, p.kind) ||
        Object.keys(p).some((key) => key !== "kind")
      )
        throw Error(localeText.invalidRequest);
      await shell.openExternal(urls[p.kind]);
      return { opened: true };
    }
    case "startBrowserOpen":
      return startBrowserOpen(data, p.ids);
    case "browserOpenAction":
      return startBrowserOpen(data, [p.id], {
        kind: p.kind,
        ...(p.offerId === undefined ? {} : { offerId: p.offerId }),
      });
    case "getBrowserProfiles":
    case "saveBrowserProfiles":
    case "randomizeBrowserProfiles": {
      const accounts = selectedAccounts(data, p.ids);
      const runningIds = new Set(
        (browserSessions?.list() || []).map((entry) => entry.accountId),
      );
      // Pending launches must also be stopped before changing their configuration.
      if (browserJob?.state === "running")
        for (const item of browserJob.items || [])
          if (["queued", "running"].includes(item.state))
            runningIds.add(item.id);
      const plan = planBrowserProfiles(accounts, {
        ...(action === "saveBrowserProfiles" ? { patch: p.patch } : {}),
        randomize: action === "randomizeBrowserProfiles",
        runningIds: [...runningIds],
      });
      if (action === "saveBrowserProfiles" && p.patch === undefined)
        throw Error(localeText.invalidBrowserProfileSettings);
      const updates = plan.filter((entry) => entry.changed);
      for (const entry of updates) entry.account.browserProfile = entry.profile;
      if (updates.length) {
        record(`${localeText.templateText_9a52c67}${updates.length}.`);
        changed();
      }
      if (action === "getBrowserProfiles")
        return {
          profiles: plan.map(({ account, profile, running }) => ({
            id: account.id,
            name: account.name,
            profile,
            running,
          })),
        };
      return {
        updated: updates.length,
        items: plan.map(({ account, changed: didChange }) => ({
          id: account.id,
          state: "completed",
          changed: didChange,
        })),
      };
    }
    case "browserOpenStatus": {
      if (!browserJob || p.ticket !== browserJob.ticket)
        throw Error(localeText.browserQueueNotFound);
      const {
        ticket,
        state,
        total,
        processed,
        opened,
        failed,
        currentId,
        currentIds,
        concurrency,
        items,
      } = browserJob;
      return {
        ticket,
        state,
        total,
        processed,
        opened,
        currentId,
        currentIds: [...currentIds],
        concurrency,
        items: items.map((item) => ({ ...item })),
        failed: failed.map((entry) => ({ ...entry })),
      };
    }
    case "cancelBrowserOpen": {
      if (!browserJob || p.ticket !== browserJob.ticket)
        throw Error(localeText.browserQueueNotFound);
      cancelJob(browserJob);
      await Promise.all(
        browserJob.currentIds.map((id) => browserSessions?.close(id)),
      );
      changed();
      return { cancelled: true };
    }
    case "closeBrowsers": {
      const accounts = selectedAccounts(data, p.ids);
      const ids = new Set(accounts.map((account) => account.id));
      if (
        browserJob?.state === "running" &&
        accounts.some((a) => browserJob.currentIds.includes(a.id))
      ) {
        cancelJob(browserJob);
        for (const id of browserJob.currentIds) ids.add(id);
      }
      await Promise.all([...ids].map((id) => browserSessions?.close(id)));
      changed();
      return { closed: accounts.length };
    }
    case "activity":
      return data.audit.slice(-200);
    case "codes": {
      const accounts =
        p.ids === undefined
          ? data.accounts
          : selectedAccounts(data, p.ids, true);
      return accounts.map((account) => {
        try {
          return { id: account.id, ...steam.getCode(account) };
        } catch {
          return { id: account.id, code: "", remainingSeconds: 0 };
        }
      });
    }
    case "copyCode": {
      const code = steam.getCode(
        model.item(data.accounts, p.id, localeText.account),
      ).code;
      if (!/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/.test(code))
        throw new Error(localeText.steamGuardCodeUnavailable);
      uiCopy(code);
      return null;
    }
    case "exportAccounts":
      return exportAccounts(data, p);
    case "preparePortableImport":
      return preparePortableImport(p);
    case "cancelPortableImport":
      if (p.token === undefined || pendingPortable?.token === p.token) {
        clearAllocationFor("commitPortableImport", p.token);
        pendingPortable = null;
        portableGeneration++;
      }
      return null;
    case "bulkAccountPolicy": {
      const accounts = selectedAccounts(data, p.ids);
      const conflict = warehouseConflict(data, p.ids, p);
      if (conflict) return conflict;
      const fields = [
        "checkConfirmations",
        "notifyConfirmations",
        "confirmationIntervalSeconds",
        "autoMarket",
        "autoMarketPurchases",
        "autoTrades",
        "watchIncomingTrades",
        "autoAcceptGifts",
        "functionIntervalsSeconds",
      ];
      const policy = Object.fromEntries(
        fields
          .filter((key) => p[key] !== undefined)
          .map((key) => [key, p[key]]),
      );
      if (!Object.keys(policy).length)
        throw new Error(localeText.message_230031b);
      const staged = accounts.map((account) => ({ ...account }));
      const draft = { ...data, accounts: staged };
      for (const account of staged)
        model.saveAccount(draft, {
          id: account.id,
          ...policy,
        });
      for (let i = 0; i < accounts.length; i++)
        Object.assign(
          accounts[i],
          Object.fromEntries(fields.map((key) => [key, staged[i][key]])),
        );
      applyWarehouseChoice(data, p.ids, p);
      invalidateNetwork();
      record(`${localeText.templateText_fafa62e}${accounts.length}.`);
      changed();
      return { updated: accounts.length };
    }
    case "prepareBulkConfirmations":
      return prepareBulkConfirmations(data, p);
    case "startBulkConfirmationPrepare": {
      selectedAccounts(data, p.ids);
      if (!["market", "purchase", "trade", "all"].includes(p.kind))
        throw new Error(localeText.unknownConfirmationType);
      const preparing = prepareBulkConfirmations(data, p);
      const ticket = pendingBulk.ticket;
      void preparing.catch(() => {});
      return { ticket };
    }
    case "bulkConfirmationStatus":
      return bulkConfirmationStatus(p.ticket);
    case "commitBulkConfirmations":
      return commitBulkConfirmations(p.ticket);
    case "startBulkConfirmationCommit": {
      if (
        !pendingBulk ||
        pendingBulk.ticket !== p.ticket ||
        pendingBulk.phase !== "ready"
      )
        throw new Error(localeText.confirmationReviewExpiredRefreshTheList);
      assertBulk(pendingBulk);
      void commitBulkConfirmations(p.ticket).catch(() => {});
      return { ticket: p.ticket };
    }
    case "cancelBulkConfirmations":
      if (pendingBulk?.ticket === p.ticket) clearBulkConfirmations();
      return null;
    case "startBulkLogin": {
      const accounts = selectedAccounts(data, p.ids);
      if (bulkLogin?.state === "running")
        throw new Error(localeText.bulkLoginIsAlreadyRunning);
      const job = (bulkLogin = initPool(
        {
          ticket: randomUUID(),
          state: "running",
          total: accounts.length,
          processed: 0,
          complete: 0,
          pending: 0,
          failed: [],
          missingPassword: 0,
          started: 0,
          epoch,
        },
        data.settings,
        false,
        accounts,
      ));
      void runBulkLogin(job, accounts).catch(() => {
        if (job.state === "running") cancelJob(job);
      });
      return { ticket: job.ticket };
    }
    case "saveBanApiKey": {
      if (
        typeof p.key !== "string" ||
        (p.key !== "" && !/^[a-fA-F0-9]{32}$/.test(p.key))
      )
        throw Error(localeText.message_99bd08e);
      data.banApiKey = p.key;
      persist();
      changed();
      return { configured: Boolean(data.banApiKey) };
    }
    case "refreshAccountBans": {
      const accounts = selectedAccounts(data, p.ids);
      if (accounts.length !== 1) throw Error(localeText.message_40adcd3);
      const bans = await accountWork(accounts[0].id, (account) =>
        steam.refreshBans(account, { force: true }),
      );
      return { checked: 1, bans };
    }
    case "startBulkBanCheck": {
      const accounts = selectedAccounts(data, p.ids);
      if (bulkBanCheck?.state === "running")
        throw Error(localeText.message_2a0e8d7);
      const job = (bulkBanCheck = initPool(
        {
          ticket: randomUUID(),
          state: "running",
          complete: 0,
          failed: [],
          unknown: 0,
          epoch,
        },
        {
          ...data.settings,
          bulkConcurrency: Math.min(3, data.settings.bulkConcurrency),
          taskStartDelayMs: Math.max(350, data.settings.taskStartDelayMs),
        },
        false,
        accounts,
      ));
      void runBulkBanCheck(job, accounts).catch(() => {
        if (job.state === "running") cancelJob(job);
      });
      return { ticket: job.ticket };
    }
    case "bulkBanCheckStatus": {
      if (!bulkBanCheck || bulkBanCheck.ticket !== p.ticket)
        throw Error(localeText.message_b0b6cd0);
      const { epoch: ignored, ...result } = bulkBanCheck;
      return structuredClone(result);
    }
    case "cancelBulkBanCheck":
      if (bulkBanCheck?.ticket === p.ticket) cancelJob(bulkBanCheck);
      return null;
    case "bulkLoginStatus": {
      if (!bulkLogin || bulkLogin.ticket !== p.ticket)
        throw new Error(localeText.bulkLoginCompletedOrCancelled);
      const { epoch: ignored, ...result } = bulkLogin;
      return structuredClone(result);
    }
    case "cancelBulkLogin":
      if (bulkLogin?.ticket === p.ticket) cancelJob(bulkLogin);
      return null;
    case "prepareAccountImport": {
      const banOptions = normalizeImportBanOptions(p);
      const capturedImportEpoch = epoch;
      const singleDetails = singleImportDetails(p);
      if (!["files", "folder", "text", "single"].includes(p.mode))
        throw new Error(localeText.unknownImportMode);
      if (p.groupId) model.item(data.groups, p.groupId, localeText.folder);
      clearAllocationFor("commitAccountImport");
      pendingImport = null;
      const importTicket = ++importGeneration;
      const guard = () => {
        if (
          capturedImportEpoch !== epoch ||
          importTicket !== importGeneration ||
          uiUnavailable()
        )
          throw Error(localeText.operationCancelled);
      };
      const paths =
        p.mode === "text"
          ? undefined
          : await chooseImportPaths(
              p.mode,
              localeText.importAccounts,
              p.mode === "single"
                ? ["maFile", "mafile"]
                : ["maFile", "mafile", "json", "txt", "info", "steamsession"],
            );
      if (importTicket !== importGeneration)
        throw new Error(localeText.operationCancelled);
      if (paths === null) return { cancelled: true };
      if (p.format === "tbs" && p.mode !== "single") {
        clearAllocationFor("commitPortableImport");
        const tbsPortableGeneration = ++portableGeneration;
        pendingPortable = null;
        const tbsGuard = () => {
          guard();
          if (tbsPortableGeneration !== portableGeneration)
            throw Error(localeText.operationCancelled);
        };
        const prepared = prepareTradeBots({ paths, text: p.text });
        const { bundle, warnings } = tradeBotsBundle(prepared, {
          groupName:
            p.mode === "folder"
              ? uniqueGroupName(
                  data,
                  prepared.rootName || path.basename(paths[0]),
                )
              : null,
        });
        assertTradeBotsAssociations(data, bundle);
        const bansBySteamId = await collectImportBans(
          data,
          bundle.accounts,
          banOptions,
          tbsGuard,
        );
        tbsGuard();
        const filtered = filterPortableImportBans(
          data,
          bundle,
          banOptions,
          bansBySteamId,
        );
        const plan = planPortableImport(data, filtered.bundle);
        const token = randomUUID();
        pendingPortable = {
          token,
          bundle,
          banOptions,
          bansBySteamId,
          format: "tbs",
          epoch,
          destinationGroupId: p.mode === "folder" ? null : p.groupId || null,
          expires: Date.now() + 5 * 60 * 1000,
        };
        return {
          token,
          format: "tbs",
          ready: plan.accounts.length,
          duplicates: plan.duplicates,
          accounts: filtered.bundle.accounts.map((a) => ({
            name: a.name,
            steamId: a.steamId,
            warnings: warnings.get(a.steamId) || [],
            hasPassword: hasPassword(a),
          })),
          groups: plan.groups.length,
          proxies: plan.proxies.length,
          encrypted: false,
          autoConfirmationsDisabled: true,
          banFilter: filtered.banFilter,
        };
      }
      const prepared = singleDetails
        ? prepareSingleAccountImport(paths, singleDetails)
        : imports.prepareAccounts({
            paths,
            text: p.text,
            format: p.format || "auto",
            mode: p.mode,
          });
      const candidates = planAccountImport(data, prepared).rows.map(
        (row) => row.account,
      );
      const bansBySteamId = await collectImportBans(
        data,
        candidates,
        banOptions,
        guard,
      );
      guard();
      const filtered = filterAccountImportBans(
        data,
        prepared,
        banOptions,
        bansBySteamId,
      );
      const plan = planAccountImport(data, filtered.input);
      const rows = plan.rows;
      const token = randomUUID();
      const groupName =
        p.mode === "folder"
          ? uniqueGroupName(data, prepared.rootName || path.basename(paths[0]))
          : null;
      pendingImport = {
        token,
        epoch,
        input: prepared,
        singleAccount: Boolean(singleDetails),
        dedicatedProxy: singleDetails?.dedicatedProxy || null,
        banOptions,
        bansBySteamId,
        groupId: p.groupId || null,
        groupName,
        expires: Date.now() + 15 * 60 * 1000,
      };
      return {
        token,
        singleAccount: Boolean(singleDetails),
        hasDedicatedProxy: Boolean(
          singleDetails?.dedicatedProxy && plan.counts.ready,
        ),
        accounts: rows.map(
          ({
            account,
            source,
            duplicate,
            warnings,
            hasPassword,
            passwordChange,
          }) => ({
            name: account.name,
            steamId: account.steamId,
            source,
            groupName,
            duplicate,
            hasPassword,
            passwordChange,
            warnings: warnings || [],
          }),
        ),
        errors: plan.errors,
        counts: plan.counts,
        banFilter: filtered.banFilter,
        createsGroup: Boolean(groupName && plan.counts.ready),
        groupName,
      };
    }
    case "cancelAccountImport":
      if (p.token === undefined || pendingImport?.token === p.token) {
        clearAllocationFor("commitAccountImport", p.token);
        importGeneration++;
        pendingImport = null;
      }
      return null;
    case "importAccounts": {
      const preview = await dispatch("prepareAccountImport", {
        mode: "files",
        format: "auto",
      });
      if (preview.cancelled) return preview;
      return dispatch("commitAccountImport", { token: preview.token });
    }
    case "deleteGroup": {
      model.item(data.groups, p.id, localeText.folder);
      if (
        data.accounts.some((a) => a.groupId === p.id) ||
        data.groups.some((g) => g.parentId === p.id)
      )
        throw new Error(localeText.moveAccountsAndNestedFoldersFirst);
      data.groups = data.groups.filter((g) => g.id !== p.id);
      record(localeText.emptyFolderDeleted);
      changed();
      return null;
    }
    case "addProxy":
    case "updateProxy": {
      model.saveProxy(data, p, action === "addProxy");
      invalidateNetwork();
      record(localeText.proxySettingsUpdated);
      changed();
      return null;
    }
    case "importProxies": {
      if (!["files", "text"].includes(p.mode))
        throw new Error(localeText.unknownImportMode);
      const paths =
        p.mode === "files"
          ? await chooseImportPaths("files", localeText.importProxyLists, [
              "txt",
              "csv",
              "json",
              "list",
            ])
          : undefined;
      if (paths === null) return { cancelled: true };
      const parsed = imports.prepareProxies({
        paths,
        text: p.text,
        name: p.name,
        protocol: p.protocol,
      });
      if (parsed.errors.length)
        return { imported: 0, lists: 0, duplicates: 0, errors: parsed.errors };
      const staged = proxyDraft(data);
      const result = addProxyEntries(staged, parsed.lists);
      for (const list of result.lists)
        model.saveProxyList(
          staged,
          { ...list, name: uniqueListName(staged, list.name) },
          true,
        );
      data.proxies = staged.proxies;
      data.proxyLists = staged.proxyLists;
      invalidateNetwork();
      record(`${localeText.templateText_6c23f8b}${result.lists.length}.`);
      changed();
      return {
        imported: result.imported,
        duplicates: result.duplicates,
        lists: result.lists.length,
        errors: [],
      };
    }
    case "addProxyList":
    case "updateProxyList": {
      const staged = proxyDraft(data);
      let params = p;
      if (p.text !== undefined) {
        if (action === "updateProxyList")
          model.item(data.proxyLists || [], p.id, localeText.proxyList);
        model.label(p.name);
        const parsed = imports.prepareProxies({
          text: p.text,
          name: p.name,
          protocol: p.protocol,
        });
        if (parsed.errors.length || parsed.lists.length !== 1)
          throw new Error(localeText.invalidProxyListRowsCheckTheFormat);
        const result = addProxyEntries(staged, parsed.lists);
        params = { ...p, proxyIds: result.lists[0].proxyIds };
      }
      const id = model.saveProxyList(staged, params, action === "addProxyList");
      data.proxies = staged.proxies;
      data.proxyLists = staged.proxyLists;
      invalidateNetwork();
      record(localeText.proxyListSaved);
      changed();
      return { id };
    }
    case "proxyListText": {
      const list = model.item(
        data.proxyLists || [],
        p.id,
        localeText.proxyList,
      );
      return {
        text: list.proxyIds
          .map(
            (id) =>
              model.item(data.proxies, id, localeText.proxies_f1fa83d).url,
          )
          .join("\n"),
      };
    }
    case "deleteProxyList":
      model.deleteProxyList(data, p.id);
      invalidateNetwork();
      record(localeText.proxyListDeleted);
      changed();
      return null;
    case "deleteProxy": {
      model.item(data.proxies, p.id, localeText.proxies_f1fa83d);
      if (
        [...data.groups, ...data.accounts, ...(data.proxyLists || [])].some(
          (x) => x.proxyIds.includes(p.id),
        )
      )
        throw new Error(
          localeText.removeThisProxyFromAccountAndFolderRoutesFirst,
        );
      data.proxies = data.proxies.filter((x) => x.id !== p.id);
      invalidateNetwork();
      record(localeText.proxyDeleted);
      changed();
      return null;
    }
    case "deleteAccount": {
      const removed = model.item(data.accounts, p.id, localeText.account);
      model.retainConfirmationHistory(data, removed);
      invalidateNetwork();
      data.accounts = data.accounts.filter((a) => a.id !== p.id);
      record(
        localeText.accountRemovedFromVaultTheSteamAuthenticatorRemainsActive,
      );
      changed();
      return null;
    }
    case "checkProxy":
      return accountWork(p.id, (a) => transport.check(a));
    case "syncTime":
      return accountWork(p.id, (a) => steam.syncTime(a));
    case "confirmations":
      return accountWork(p.id, async (a) => {
        const captured = epoch;
        const items = await steam.listConfirmations(a);
        if (captured !== epoch || uiUnavailable())
          throw new Error(localeText.operationCancelled);
        await publishConfirmationNotice(a, items);
        notifications.flush();
        return items;
      });
    case "confirmationDetails":
      return accountRead(p.id, (a) =>
        steam.confirmationDetails(a, p.confirmationId),
      );
    case "confirmationImage":
      return accountRead(p.id, (a) =>
        steam.confirmationImage(a, p.confirmationId, p.index),
      );
    case "respond": {
      if (typeof p.accept !== "boolean" || typeof p.confirmationId !== "string")
        throw new Error(localeText.invalidConfirmation);
      return accountWork(p.id, (a) =>
        steam.respond(a, p.confirmationId, p.accept),
      );
    }
    case "updateAccountPassword": {
      if (
        typeof p.password !== "string" ||
        !p.password.length ||
        p.password.length > 16384 ||
        /[\r\n\0]/.test(p.password)
      )
        throw new Error(
          localeText.enterAPasswordOf116384CharactersWithoutLineBreaks,
        );
      const account = model.item(data.accounts, p.id, localeText.account);
      account.loginPassword = p.password;
      record(localeText.savedAccountPasswordChanged, account.id);
      changed();
      return null;
    }
    case "accountPassword":
    case "copyAccountPassword": {
      const account = model.item(data.accounts, p.id, localeText.account);
      if (!hasPassword(account))
        throw new Error(localeText.noAccountPasswordIsSaved);
      if (action === "copyAccountPassword") {
        uiCopy(account.loginPassword);
        return null;
      }
      return { password: account.loginPassword };
    }
    case "login":
      return accountWork(p.id, (a) => {
        if (p.useSavedPassword === true && !hasPassword(a))
          throw new Error(localeText.noAccountPasswordIsSaved);
        return steam.login(a, {
          ...p,
          password: p.useSavedPassword === true ? a.loginPassword : p.password,
        });
      });
    case "submitGuard":
      return accountWork(p.id, (a) => steam.submitGuard(a, p.code));
    case "beginTotp": {
      const captured = epoch;
      const enrollment = await vaultAuthentication("beginTotp", p);
      const qr = await QRCode.toDataURL(enrollment.uri, {
        width: 240,
        margin: 2,
      });
      if (captured !== epoch) throw new Error(localeText.operationCancelled);
      return { ...enrollment, qr };
    }
    case "cancelTotpEnrollment":
      vault.cancelTotpEnrollment();
      return null;
    case "enableTotp": {
      const status = await vaultAuthentication("enableTotp", p.code);
      record(localeText.twoStepLoginEnabled);
      changed();
      return status;
    }
    case "disableTotp": {
      const status = await vaultAuthentication("disableTotp", p);
      record(localeText.twoStepLoginDisabled);
      changed();
      return status;
    }
    case "changePassword": {
      if (p.newPassword && [...p.newPassword].length < 15)
        throw new Error(localeText.newPasswordMustContainAtLeast15Characters);
      const status = await vaultAuthentication("changePassword", p);
      record(localeText.passwordSettingsChanged);
      changed();
      return status;
    }
    case "enablePin": {
      const status = await vaultAuthentication("enablePin", p);
      record(localeText.pinConfigured);
      changed();
      return status;
    }
    case "disablePin": {
      const status = await vaultAuthentication("disablePin", p);
      record(localeText.pinDisabled);
      changed();
      return status;
    }
    case "settings": {
      const next = resolveAppearanceLanguage(
        model.mergeSettings(data, p),
        systemLanguage,
      );
      const routeChanged = next.allowDirect !== data.settings.allowDirect;
      const previousBrowser = model.normalizeBrowserSettings(data.settings);
      const removedPackages = new Set();
      if (Object.hasOwn(p, "browserLocalExtensions")) {
        const known = new Map([
          ...previousBrowser.browserLocalExtensions.map((entry) => [
            entry.id,
            entry,
          ]),
          ...pendingExtensionImports,
        ]);
        for (const entry of next.browserLocalExtensions) {
          const imported = known.get(entry.id);
          if (
            !imported ||
            entry.name !== imported.name ||
            entry.version !== imported.version
          )
            throw Error(localeText.invalidBrowserSettings);
          known.delete(entry.id);
        }
        for (const id of known.keys()) removedPackages.add(id);
      }
      const browserChanged =
        next.browserSeparateSession !==
          previousBrowser.browserSeparateSession ||
        next.browserTheme !== previousBrowser.browserTheme ||
        next.browserLanguage !== previousBrowser.browserLanguage ||
        next.browserShowBookmarksBar !==
          previousBrowser.browserShowBookmarksBar ||
        JSON.stringify(next.browserBookmarks) !==
          JSON.stringify(previousBrowser.browserBookmarks) ||
        next.browserSmartTraderEnabled !==
          previousBrowser.browserSmartTraderEnabled ||
        next.browserSmartTraderAutoCheck !==
          previousBrowser.browserSmartTraderAutoCheck ||
        JSON.stringify(next.browserLocalExtensions) !==
          JSON.stringify(previousBrowser.browserLocalExtensions) ||
        JSON.stringify(next.browserExtensions) !==
          JSON.stringify(
            data.settings.browserExtensions ??
              model.DEFAULT_SETTINGS.browserExtensions,
          ) ||
        next.browserMaxAccounts < (data.settings.browserMaxAccounts ?? 10);
      data.settings = next;
      pendingTrayReview = null;
      idleSettings = { ...next };
      if (routeChanged) invalidateNetwork();
      else if (browserChanged) stopBrowsers();
      if (!next.notificationsEnabled) notifications.clear();
      record(localeText.appSettingsSaved);
      if (Object.hasOwn(p, "browserLocalExtensions")) {
        extensionDraftGeneration++;
        pendingExtensionImports.clear();
        // Commit the vault before retiring any package. Files held open by
        // Chromium can be reclaimed during the next import.
        for (const id of removedPackages)
          void getLocalBrowserExtensions().remove(id).catch(() => {});
      }
      changed();
      managerChanged();
      authenticatorChanged();
      return null;
    }
    case "testNotification":
      notifications.test();
      return { supported: Boolean(Notification?.isSupported()) };
    case "backup":
      return backupVault(win);
    default:
      throw new Error(localeText.unknownAction);
  }
}

async function tick() {
  if (pendingAllocation && Date.now() > pendingAllocation.expires)
    clearAllocation();
  if (pendingImport && Date.now() > pendingImport.expires) {
    clearAllocationFor("commitAccountImport", pendingImport.token);
    pendingImport = null;
  }
  if (pendingBulk && Date.now() > pendingBulk.expires) clearBulkConfirmations();
  if (pendingPortable && Date.now() > pendingPortable.expires) {
    clearAllocationFor("commitPortableImport", pendingPortable.token);
    pendingPortable = null;
  }
  if (!vault) return;
  const status = uiStatus();
  if (!status.locked) idleSettings = { ...vault.getData().settings };
  const idleAction = idleLockAction({
    lastInteraction,
    now: performance.now(),
    settings: idleSettings,
    pinEnabled: status.pinEnabled === true,
    lockMode: status.lockMode || (status.locked ? "password" : "unlocked"),
  });
  if (idleAction) {
    lock(idleAction, { idle: true });
  }
  if (vault.status().locked) return;
  const data = vault.getData();
  try {
    if (!uiStatus().locked) loot?.maybeRun();
  } catch {
    /* Invalid configuration never authorizes a run. */
  }
  if (tickRunning || Date.now() < nextPoll) return;
  tickRunning = true;
  nextPoll = Date.now() + 1000;
  const captured = epoch;
  try {
    const selected = [],
      count = data.accounts.length;
    const pollBatch = Symbol();
    // Reserve only available slots; completed accounts free a slot independently
    // of slower requests. The next tick replenishes this bounded rolling pool.
    const available = Math.max(
      0,
      data.settings.bulkConcurrency - pollActive.size,
    );
    for (
      let scanned = 0;
      scanned < count && selected.length < available;
      scanned++
    ) {
      const account = data.accounts[pollCursor++ % count];
      if (
        busy.has(account.id) ||
        browserReserved.has(account.steamId) ||
        bulkReserved.has(account.id) ||
        pollActive.has(account.id)
      )
        continue;
      const due = dueAccountActions(
        account,
        polledAt.get(account.id),
        Date.now(),
      );
      const canConfirm =
        account.mafile.identity_secret && account.mafile.device_id;
      if (!canConfirm)
        for (const key of [
          "checkConfirmations",
          "notifyConfirmations",
          "autoMarket",
          "autoMarketPurchases",
          "autoTrades",
        ])
          due[key] = false;
      if (!Object.values(due).some(Boolean)) continue;
      const session = account.mafile.Session || {};
      if (!session.AccessToken && !session.RefreshToken && !hasPassword(account))
        continue;
      if (transport.rateLimitStatus(account).retryAfterMs > 0) continue;
      if (
        !data.settings.allowDirect &&
        !model.resolveRoute(data, account).length
      )
        continue;
      pollActive.set(account.id, pollBatch);
      selected.push(account);
    }
    void runTaskPool(
      selected,
      async (account) => {
        if (captured !== epoch || vault.status().locked) return;
        try {
          // A foreground operation may have claimed a reserved, staggered slot.
          if (
            busy.has(account.id) ||
            bulkReserved.has(account.id) ||
            browserReserved.has(account.steamId) ||
            transport.rateLimitStatus(account).retryAfterMs > 0
          )
            return;
          const due = dueAccountActions(
            account,
            polledAt.get(account.id),
            Date.now(),
          );
          const stamps = { ...(polledAt.get(account.id) || {}) };
          for (const [key, enabled] of Object.entries(due))
            if (enabled) stamps[key] = Date.now();
          polledAt.set(account.id, stamps);
          await accountWork(account.id, async (a) => {
            // Independent tasks share a fresh network read only when due together.
            // A failed confirmation request does not prevent an incoming-offer check.
            let failure;
            if (
              a.mafile.identity_secret &&
              a.mafile.device_id &&
              [
                "checkConfirmations",
                "notifyConfirmations",
                "autoMarket",
                "autoMarketPurchases",
                "autoTrades",
              ].some((key) => due[key])
            ) {
              try {
                const items = await steam.listConfirmations(a);
                if (captured !== epoch || vault.status().locked) return;
                if (due.notifyConfirmations)
                  await publishConfirmationNotice(a, items);
                if (due.autoMarket || due.autoMarketPurchases || due.autoTrades)
                  await steam.runAutomation(a, items, due);
              } catch (error) {
                failure = error;
              }
            }
            if (captured !== epoch || vault.status().locked) return;
            if (due.watchIncomingTrades || due.autoAcceptGifts) {
              try {
                const result = await tradeOffers.poll(a, {
                  autoAccept: due.autoAcceptGifts,
                  autoAcceptAdmins: due.watchIncomingTrades,
                });
                if (captured !== epoch || vault.status().locked) return;
                if (due.watchIncomingTrades)
                  notifications.incomingOffers(a, result.offers);
              } catch (error) {
                failure ||= error;
              }
            }
            changed();
            if (failure) throw failure;
          });
        } catch {
          if (captured === epoch && !vault.status().locked) {
            statuses.set(account.id, {
              ...(statuses.get(account.id) || {}),
              automationError:
                localeText.couldNotCheckConfirmationsCheckTheRouteAndSession,
            });
            notifications.failure(account);
            changed();
          }
        } finally {
          if (pollActive.get(account.id) === pollBatch)
            pollActive.delete(account.id);
        }
      },
      {
        concurrency: data.settings.bulkConcurrency,
        startIntervalMs: data.settings.taskStartDelayMs,
        signal: pollController.signal,
        isCancelled: () => captured !== epoch || vault.status().locked,
      },
    )
      .catch(() => {})
      .finally(() => {
        for (const account of selected)
          if (pollActive.get(account.id) === pollBatch)
            pollActive.delete(account.id);
      });
    notifications.flush();
  } finally {
    tickRunning = false;
  }
}
async function backupVault(owner) {
  const captured = epoch;
  const result = await dialog.showSaveDialog(owner, {
    title: localeText.encryptedBackup,
    defaultPath: `smart-auth-${new Date().toISOString().slice(0, 10)}.vault`,
    filters: [{ name: "smart-auth encrypted vault", extensions: ["vault"] }],
  });
  if (result.canceled) return { cancelled: true };
  enforceIdleLock();
  assertUiAccess();
  if (captured !== epoch || uiUnavailable())
    throw Error(localeText.operationCancelled);
  persist();
  atomicVaultBackup({
    sourcePath: vault.filePath,
    targetPath: result.filePath,
  });
  record(localeText.encryptedBackupSaved);
  return { saved: true };
}
const managerMutations = new Set([
  "saveFolder",
  "deleteFolder",
  "saveEntry",
  "deleteEntry",
  "restoreEntry",
  "purgeEntry",
  "restoreHistory",
]);
async function dispatchManager(action, payload) {
  checkInput(action, payload);
  enforceIdleLock();
  const data = unlocked();
  if (action !== "snapshot") lastInteraction = performance.now();
  if (action === "snapshot")
    return {
      ...passwordManager.snapshot(),
      locked: false,
      uiGeneration,
      appearance: {
        theme: data.settings.theme,
        locale: data.settings.language,
      },
    };
  if (action === "touch") return null;
  if (action === "lock") return lock();
  if (action === "backup") return backupVault(managerWindow);
  if (action === "revealField") return passwordManager.revealField(payload);
  if (action === "copyField")
    return uiCopy(passwordManager.revealField(payload).value);
  if (action === "generateSecret") {
    const { value } = generateSecret(payload);
    clearGeneratedSecret();
    const token = randomUUID();
    generatedSecret = {
      token,
      value,
      epoch,
      expires: performance.now() + 60000,
    };
    generatedSecretTimer = setTimeout(clearGeneratedSecret, 60000);
    generatedSecretTimer.unref();
    return { value, token };
  }
  if (action === "copyGenerated") {
    if (
      !generatedSecret ||
      payload.token !== generatedSecret.token ||
      generatedSecret.epoch !== epoch ||
      performance.now() >= generatedSecret.expires
    )
      throw Error(localeText.message_736daec);
    return uiCopy(generatedSecret.value);
  }
  if (managerMutations.has(action)) {
    const result = passwordManager[action](payload);
    managerChanged();
    return result;
  }
  throw Error(localeText.unknownAction);
}
const authenticatorMutations = new Set([
  "saveFolder",
  "deleteFolder",
  "saveEntry",
  "deleteEntry",
  "moveEntries",
  "advanceCounter",
  "commitImport",
]);
async function dispatchAuthenticator(action, payload) {
  checkInput(action, payload);
  enforceIdleLock();
  const data = unlocked();
  if (!["snapshot", "codes"].includes(action))
    lastInteraction = performance.now();
  if (action === "snapshot")
    return {
      ...authenticatorManager.snapshot(),
      locked: false,
      uiGeneration,
      appearance: {
        theme: data.settings.theme,
        locale: data.settings.language,
      },
    };
  if (action === "codes") return authenticatorManager.codes(payload);
  if (action === "touch") return null;
  if (action === "lock") return lock();
  if (action === "backup") return backupVault(authenticatorWindow);
  if (action === "copyCode") {
    const result = authenticatorManager.codes({ ids: [payload.id] });
    if (!result.codes.length) throw Error(localeText.message_86040dc);
    return uiCopy(result.codes[0].code);
  }
  if (action === "cancelImport") {
    if (payload.token !== undefined)
      authenticatorManager.clearPending(payload.token);
    else clearAuthenticatorImport();
    return null;
  }
  if (action === "previewImport") {
    clearAuthenticatorImport();
    return authenticatorManager.previewImport(payload);
  }
  if (action === "importFiles") {
    clearAuthenticatorImport();
    const controller = new AbortController(),
      captured = epoch,
      window = authenticatorWindow;
    authenticatorImport = controller;
    const active = () => {
      if (
        controller.signal.aborted ||
        captured !== epoch ||
        uiUnavailable() ||
        window !== authenticatorWindow ||
        window.isDestroyed()
      )
        throw Error(localeText.message_8ee986f);
    };
    try {
      const result = await dialog.showOpenDialog(window, {
        title:
          data.settings.language === "en"
            ? "Import 2FA QR codes or text"
            : data.settings.language === "ru"
              ? localeText.message_939d56b
              : localeText.message_4952c0b,
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "QR / URI",
            extensions: ["png", "jpg", "jpeg", "webp", "txt"],
          },
        ],
      });
      active();
      if (result.canceled) return { cancelled: true };
      const text = await readAuthenticatorFiles(result.filePaths, {
        signal: controller.signal,
        decodeImage: (bytes) => {
          const image = nativeImage.createFromBuffer(bytes);
          if (image.isEmpty()) throw Error(localeText.message_45312a1);
          const { width, height } = image.getSize();
          const bitmap = image.toBitmap();
          // Electron's Windows bitmap is BGRA; jsQR expects RGBA.
          for (let i = 0; i < bitmap.length; i += 4) {
            const blue = bitmap[i];
            bitmap[i] = bitmap[i + 2];
            bitmap[i + 2] = blue;
            const alpha = bitmap[i + 3] / 255;
            for (let color = 0; color < 3; color++)
              bitmap[i + color] = Math.round(
                bitmap[i + color] * alpha + 255 * (1 - alpha),
              );
            bitmap[i + 3] = 255;
          }
          return { data: bitmap, width, height };
        },
      });
      active();
      return authenticatorManager.previewImport({ text });
    } finally {
      if (authenticatorImport === controller) authenticatorImport = null;
    }
  }
  if (authenticatorMutations.has(action)) {
    const result = authenticatorManager[action](payload);
    authenticatorChanged();
    return result;
  }
  throw Error(localeText.unknownAction);
}
function ipcError(error) {
  return {
    ok: false,
    error: publicErrorMessage(error),
  };
}
async function refreshPeopleAvatars() {
  if (peopleRefresh) return peopleRefresh;
  const captured = epoch,
    data = unlocked();
  const task = (async () => {
    const lists = [data.steamAdmins || [], lootWarehouseEntries(data)];
    const entries = [
      ...new Set(lists.flatMap((list) => list.map((p) => p.steamId))),
    ];
    for (const steamId of entries) {
      if (captured !== epoch || vault.status().locked) return;
      const internal = data.accounts.find((a) => a.steamId === steamId);
      let avatar = require("./core/avatar.cjs").safeCachedAvatar(
        internal?.avatar,
      );
      if (!avatar) {
        // Even public avatar requests must use a configured account proxy.
        const source = data.accounts.find((a) => {
          try {
            return !busy.has(a.id) && model.resolveRoute(data, a).length > 0;
          } catch {
            return false;
          }
        });
        if (!source) continue;
        try {
          avatar = await accountWork(source.id, async (a) => {
            const xml = await steam._request(
              a,
              `https://steamcommunity.com/profiles/${steamId}/?xml=1`,
              { retrySafe: true, maxBodyBytes: MAX_XML_BYTES },
            );
            const url = avatarFromXml(xml.body, steamId);
            if (!url) return null;
            const image = await steam._request(a, url, {
              retrySafe: true,
              maxBodyBytes: MAX_AVATAR_BYTES,
            });
            const value = imageDataUrl(
              image.body,
              image.headers?.["content-type"],
            );
            return value ? steam.normalizeAvatar(value) : null;
          });
        } catch {
          /* Cached avatars survive temporary proxy/profile failures. */
        }
      }
      if (captured !== epoch || vault.status().locked) return;
      if (avatar)
        for (const list of [
          data.steamAdmins || [],
          lootWarehouseEntries(data),
        ]) {
          for (const entry of list)
            if (entry.steamId === steamId) entry.avatar = avatar;
        }
    }
    if (captured === epoch && !vault.status().locked) {
      persist();
      changed();
    }
  })();
  peopleRefresh = task;
  try {
    return await task;
  } finally {
    if (peopleRefresh === task) peopleRefresh = null;
  }
}
function mutateLootSettings(data, action) {
  const state = ensureLootSchemes(data);
  const previous = state.schemes.map((scheme) => ({
    scheme,
    value: { ...scheme },
  }));
  const policies = data.accounts.map((account) => ({
    account,
    present: Object.hasOwn(account, "autoAcceptGifts"),
    value: account.autoAcceptGifts,
  }));
  try {
    const result = action();
    persist();
    return result;
  } catch (error) {
    state.schemes = previous.map(({ scheme, value }) =>
      Object.assign(scheme, value),
    );
    for (const { account, present, value } of policies) {
      if (present) account.autoAcceptGifts = value;
      else delete account.autoAcceptGifts;
    }
    throw error;
  }
}
async function dispatchLoot(context, action, p = {}) {
  checkInput(action, p);
  if (action === "lock") return lock();
  const data = unlocked();
  if (p.schemeId !== undefined && p.schemeId !== context.schemeId)
    throw Error(localeText.accessDenied);
  const scheme =
    context.schemeId === null ? null : findLootScheme(data, context.schemeId);
  if (!["snapshot", "lootStatus"].includes(action))
    lastInteraction = performance.now();
  switch (action) {
    case "touch":
      return null;
    case "snapshot": {
      const snapshot = model.publicSnapshot(data, uiStatus(), statuses);
      return {
        locked: false,
        uiGeneration,
        accounts: snapshot.accounts,
        groups: snapshot.groups,
        settings: snapshot.settings,
        steamAdmins: snapshot.steamAdmins,
        scheme: scheme ? { id: scheme.id, name: scheme.name } : null,
        loot: {
          settings: {
            ...normalizeLootSettings(scheme?.settings),
            warehouses: (scheme?.settings.warehouses || []).map((w) => ({
              ...w,
              ...publicPeople(data, [w])[0],
            })),
          },
          ...(scheme
            ? loot.status(scheme.id)
            : { running: false, preparing: false, job: null, preview: null }),
          coverage: lootCoverage(data, normalizeLootSettings(scheme?.settings)),
          journal: (data.loot?.journal || [])
            .filter((entry) => scheme && entry.schemeId === scheme.id)
            .slice(-100)
            .map(
              ({
                requestId,
                accountId,
                partnerSteamId,
                offerId,
                state,
                assets,
                createdAt,
                checkedAt,
              }) => ({
                id: requestId,
                accountId,
                partnerSteamId,
                offerId,
                state,
                itemCount: assets.length,
                unitCount: assets
                  .reduce((n, a) => n + BigInt(a.amount), 0n)
                  .toString(),
                assetCount: assets.length,
                createdAt,
                checkedAt,
              }),
            ),
        },
      };
    }
    case "saveLootSettings": {
      const plan = planLootSettings(data, p.settings, scheme?.id);
      if (
        plan.settings.enabled &&
        lootCoverage(data, plan.settings).unassignedAccounts.length
      )
        throw Error(localeText.message_2b7a121);
      if (scheme) loot.cancel(scheme.id);
      const saved = mutateLootSettings(data, () => {
        const result = scheme
          ? updateLootScheme(data, scheme.id, {
              name: p.name ?? scheme.name,
              settings: plan.settings,
            })
          : createLootScheme(data, {
              name: p.name || "Loot",
              settings: plan.settings,
            });
        for (const id of plan.enableIds)
          model.item(data.accounts, id, localeText.account).autoAcceptGifts =
            true;
        return result;
      });
      context.schemeId = saved.id;
      context.window.setTitle("smart-auth · " + saved.name);
      changed();
      void refreshPeopleAvatars().catch(() => {});
      return { saved: true, scheme: { id: saved.id, name: saved.name } };
    }
    case "openLootAccount": {
      const account = data.accounts.find(
        (entry) => entry.steamId === p.steamId,
      );
      if (!account) throw Error(localeText.message_869df5e);
      showMainWindow();
      win.webContents.send("smart-sda-account-navigation", {
        accountId: account.id,
      });
      return { opened: true };
    }
    case "prepareLoot":
      if (!scheme) throw Error(localeText.message_93fa83f);
      return loot.prepare(scheme.id);
    case "startLoot":
      if (!scheme) throw Error(localeText.message_93fa83f);
      return loot.start(scheme.id, { previewId: p.previewId });
    case "cancelLoot":
      if (!scheme) return { cancelled: true };
      loot.cancel(scheme.id);
      changed();
      return loot.status(scheme.id);
    case "lootStatus":
      return scheme
        ? loot.status(scheme.id)
        : { running: false, preparing: false, job: null };
    case "refreshLootJournal":
      if (!scheme) return { running: false };
      await loot.reconcile(scheme.id);
      changed();
      return loot.status(scheme.id);
    case "saveSteamAdmins":
    case "refreshSteamAdminAvatars":
      return dispatch(action, p);
    default:
      throw Error(localeText.unknownAction);
  }
}
async function openLoot(schemeId) {
  assertUiAccess();
  const data = unlocked();
  const scheme = schemeId === undefined ? null : findLootScheme(data, schemeId);
  const existing =
    scheme &&
    [...lootWindows.values()].find((context) => context.schemeId === scheme.id);
  if (existing && !existing.window.isDestroyed()) {
    if (existing.window.isMinimized()) existing.window.restore();
    existing.window.show();
    existing.window.focus();
    return;
  }
  const captured = epoch;
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 420,
    minHeight: 500,
    show: false,
    backgroundColor: windowBackground(unlocked().settings.theme),
    title: "smart-auth · " + (scheme?.name || "Loot"),
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "loot-preload.cjs"),
      additionalArguments: [preloadLocaleArgument],
      partition: `smart-sda-loot-${randomUUID()}`,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  const context = { window, schemeId: scheme?.id || null };
  lootWindows.set(window.webContents.id, context);
  const session = window.webContents.session;
  const allowed = new Set(
    [
      "loot.html",
      "loot.js",
      "loot.css",
      "loot-i18n.js",
      "window-lock.js",
      "window-lock.css",
    ]
      .map((file) => pathToFileURL(path.join(__dirname, "renderer", file)).href)
      .concat(rendererLocaleUrl),
  );
  session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !allowed.has(details.url) }),
  );
  window.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, target) => {
    const url = typeof target === "string" ? target : target?.url;
    if (url !== lootUrl) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("render-process-gone", () => runtimeLock());
  window.on("page-title-updated", (event) => {
    if (uiStatus().locked) event.preventDefault();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    if (uiUnavailable()) return;
    const language = unlocked().settings.language;
    const labels =
      language === "en"
        ? [
            "Unsaved changes",
            "Discard changes and close?",
            "Keep editing",
            "Discard",
          ]
        : language === "ru"
          ? [
              localeText.unsavedChanges,
              localeText.message_5db6aac,
              localeText.continue,
              localeText.message_9aff1e0,
            ]
          : [
              localeText.unsavedChanges_ee929a6,
              localeText.message_6c671bb,
              localeText.continue_a50d268,
              localeText.message_fd5dbc6,
            ];
    if (
      dialog.showMessageBoxSync(window, {
        type: "question",
        title: labels[0],
        message: labels[1],
        buttons: labels.slice(2),
        defaultId: 0,
        cancelId: 0,
      }) === 1
    )
      event.preventDefault();
  });
  window.on("closed", () => {
    for (const [id, current] of lootWindows)
      if (current === context) lootWindows.delete(id);
  });
  try {
    await session.setProxy({
      mode: "fixed_servers",
      proxyRules: "socks5://127.0.0.1:9",
      proxyBypassRules: "<-loopback>",
    });
    if (window.isDestroyed() || captured !== epoch || uiUnavailable())
      throw Error(localeText.operationCancelled);
    await window.loadFile(lootPath);
    if (window.isDestroyed() || captured !== epoch || uiUnavailable())
      throw Error(localeText.operationCancelled);
    window.show();
    window.focus();
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}
async function openPasswordManager() {
  assertUiAccess();
  unlocked();
  if (managerWindow && !managerWindow.isDestroyed()) {
    if (managerWindow.isMinimized()) managerWindow.restore();
    managerWindow.show();
    managerWindow.focus();
    return;
  }
  const captured = epoch;
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 540,
    minHeight: 500,
    show: false,
    backgroundColor: windowBackground(unlocked().settings.theme),
    title: "smart-auth · Password manager",
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "password-manager-preload.cjs"),
      additionalArguments: [preloadLocaleArgument],
      partition: `smart-sda-password-manager-${randomUUID()}`,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  managerWindow = window;
  const session = window.webContents.session;
  const allowed = new Set(
    [
      "password-manager.html",
      "password-manager.js",
      "password-manager.css",
      "password-manager-i18n.js",
      "window-lock.js",
      "window-lock.css",
    ]
      .map((file) => pathToFileURL(path.join(__dirname, "renderer", file)).href)
      .concat(rendererLocaleUrl),
  );
  session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !allowed.has(details.url) }),
  );
  window.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, target) => {
    const url = typeof target === "string" ? target : target?.url;
    if (url !== managerUrl) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("render-process-gone", () => runtimeLock());
  window.on("page-title-updated", (event) => {
    if (uiStatus().locked) event.preventDefault();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    const language = unlocked().settings.language;
    const labels =
      language === "en"
        ? [
            "Unsaved changes",
            "Discard changes and close?",
            "Keep editing",
            "Discard",
          ]
        : language === "ru"
          ? [
              localeText.unsavedChanges,
              localeText.message_5db6aac,
              localeText.continue,
              localeText.message_9aff1e0,
            ]
          : [
              localeText.unsavedChanges_ee929a6,
              localeText.message_6c671bb,
              localeText.continue_a50d268,
              localeText.message_fd5dbc6,
            ];
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      title: labels[0],
      message: labels[1],
      buttons: labels.slice(2),
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  window.on("closed", () => {
    if (managerWindow === window) managerWindow = null;
    clearGeneratedSecret();
    secretClipboard.clear();
  });
  try {
    await session.setProxy({
      mode: "fixed_servers",
      proxyRules: "socks5://127.0.0.1:9",
      proxyBypassRules: "<-loopback>",
    });
    if (window.isDestroyed() || captured !== epoch || uiUnavailable())
      throw Error(localeText.operationCancelled);
    await window.loadFile(managerPath);
    if (window.isDestroyed() || captured !== epoch || uiUnavailable())
      throw Error(localeText.operationCancelled);
    window.show();
    window.focus();
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}
async function openAuthenticator() {
  assertUiAccess();
  unlocked();
  if (authenticatorWindow && !authenticatorWindow.isDestroyed()) {
    if (authenticatorWindow.isMinimized()) authenticatorWindow.restore();
    authenticatorWindow.show();
    authenticatorWindow.focus();
    return;
  }
  const captured = epoch;
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 540,
    minHeight: 500,
    show: false,
    backgroundColor: windowBackground(unlocked().settings.theme),
    title: "2fa (not steam)",
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "authenticator-preload.cjs"),
      additionalArguments: [preloadLocaleArgument],
      partition: `smart-sda-authenticator-${randomUUID()}`,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  authenticatorWindow = window;
  const session = window.webContents.session;
  const allowed = new Set(
    [
      "authenticator.html",
      "authenticator.js",
      "authenticator.css",
      "authenticator-i18n.js",
      "window-lock.js",
      "window-lock.css",
    ]
      .map((file) => pathToFileURL(path.join(__dirname, "renderer", file)).href)
      .concat(rendererLocaleUrl),
  );
  session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !allowed.has(details.url) }),
  );
  window.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, target) => {
    const url = typeof target === "string" ? target : target?.url;
    if (url !== authenticatorUrl) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("render-process-gone", () => runtimeLock());
  window.on("page-title-updated", (event) => {
    if (uiStatus().locked) event.preventDefault();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    const language = unlocked().settings.language;
    const labels =
      language === "en"
        ? [
            "Unsaved changes",
            "Discard changes and close?",
            "Keep editing",
            "Discard",
          ]
        : language === "ru"
          ? [
              localeText.unsavedChanges,
              localeText.message_5db6aac,
              localeText.continue,
              localeText.message_9aff1e0,
            ]
          : [
              localeText.unsavedChanges_ee929a6,
              localeText.message_6c671bb,
              localeText.continue_a50d268,
              localeText.message_fd5dbc6,
            ];
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      title: labels[0],
      message: labels[1],
      buttons: labels.slice(2),
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  window.on("closed", () => {
    if (authenticatorWindow === window) authenticatorWindow = null;
    clearAuthenticatorImport();
    secretClipboard.clear();
  });
  try {
    await session.setProxy({
      mode: "fixed_servers",
      proxyRules: "socks5://127.0.0.1:9",
      proxyBypassRules: "<-loopback>",
    });
    if (window.isDestroyed() || captured !== epoch || uiUnavailable())
      throw Error(localeText.operationCancelled);
    await window.loadFile(authenticatorPath);
    if (window.isDestroyed() || captured !== epoch || uiUnavailable())
      throw Error(localeText.operationCancelled);
    window.show();
    window.focus();
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}
async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 500,
    backgroundColor: windowBackground(),
    title: `smart-auth ${app.getVersion()}`,
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [preloadLocaleArgument],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  const session = win.webContents.session;
  // Chromium is an offline UI. Even networking paths outside webRequest must
  // use a deliberately unreachable local proxy, with no loopback bypass.
  await session.setProxy({
    mode: "fixed_servers",
    proxyRules: "socks5://127.0.0.1:9",
    proxyBypassRules: "<-loopback>",
  });
  if (!win || win.isDestroyed()) return;
  win.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest((details, callback) => {
    // UI is completely offline. Steam is accessible only from the mandatory backend proxy transport.
    let allowed = false;
    try {
      const u = new URL(details.url);
      allowed =
        u.protocol === "data:" ||
        (u.protocol === "file:" &&
          [
            entryUrl,
            rendererLocaleUrl,
            pathToFileURL(path.join(__dirname, "renderer", "styles.css")).href,
            pathToFileURL(path.join(__dirname, "renderer", "app.js")).href,
            pathToFileURL(path.join(__dirname, "renderer", "i18n.js")).href,
            pathToFileURL(path.join(__dirname, "renderer", "features.js")).href,
            pathToFileURL(
              path.join(__dirname, "renderer", "browser-profile.js"),
            ).href,
            pathToFileURL(
              path.join(__dirname, "renderer", "browser-profile.css"),
            ).href,
            pathToFileURL(
              path.join(__dirname, "renderer", "account-context.js"),
            ).href,
            pathToFileURL(
              path.join(__dirname, "renderer", "account-context.css"),
            ).href,
            pathToFileURL(
              path.join(__dirname, "renderer", "confirmation-details.js"),
            ).href,
            pathToFileURL(
              path.join(__dirname, "renderer", "confirmation-details.css"),
            ).href,
          ].includes(u.href));
    } catch {}
    callback({ cancel: !allowed });
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("page-title-updated", (event) => event.preventDefault());
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.on("render-process-gone", runtimeLock);
  win.on("closed", () => {
    runtimeLock();
    win = null;
  });
  win.on("minimize", () => {
    if (trayController?.shouldHideOnMinimize()) win.hide();
  });
  win.on("close", (event) => {
    if (!quitPending && !quitReady && trayController?.shouldHideOnClose()) {
      event.preventDefault();
      win.hide();
    }
  });
  win.loadFile(entryPath);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    showMainWindow();
  });
  app
    .whenReady()
    .then(async () => {
      systemLanguage = detectSystemLanguage(app);
      if (process.platform === "win32")
        app.setAppUserModelId("app.smartsda.desktop");
      vault = new Vault(path.join(app.getPath("userData"), "smart-sda.vault"), {
        systemLanguage: () => systemLanguage,
        protectKey: (text) => {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error(localeText.windowsProtectionIsUnavailable);
          return safeStorage.encryptString(text);
        },
        unprotectKey: (bytes) => {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error(localeText.windowsProtectionIsUnavailable);
          return safeStorage.decryptString(bytes);
        },
      });
      transport = new ProxyTransport({
        scheduler: new NetworkScheduler(),
        resolveProxies: (account) => model.resolveRoute(unlocked(), account),
        allowDirect: () => unlocked().settings.allowDirect === true,
        onStatus: (account, status) => {
          if (
            !vault.status().locked &&
            account.id &&
            vault.getData().accounts.includes(account)
          ) {
            statuses.set(account.id, status);
            changed();
          }
        },
      });
      transport.scheduler.setCooldownPersistence({
        resolveAccount: (id) => {
          try {
            return vault.getData().accounts.find((a) => a.id === id);
          } catch {
            return null;
          }
        },
        save: (snapshot) => {
          if (vault.status().locked) return false;
          const data = vault.getData();
          if (
            JSON.stringify(data.networkCooldowns) === JSON.stringify(snapshot)
          )
            return true;
          data.networkCooldowns = snapshot;
          persist();
          return true;
        },
      });
      notifications = new NotificationCenter({
        settings: () => unlocked().settings,
        emit: showNotification,
      });
      steam = new SteamService({
        transport,
        getBansApiKey: () => unlocked().banApiKey || "",
        normalizeAvatar: (dataUrl) => {
          const image = nativeImage.createFromDataURL(dataUrl);
          if (image.isEmpty()) return null;
          for (const size of [64, 48, 32]) {
            const bytes = image
              .resize({ width: size, height: size, quality: "good" })
              .toJPEG(75);
            if (bytes.length <= 4096)
              return `data:image/jpeg;base64,${bytes.toString("base64")}`;
          }
          return null;
        },
        onChange: (account) => {
          const data = unlocked();
          if (!data.accounts.includes(account))
            throw new Error(localeText.operationCancelled);
          persist();
          changed();
        },
        onEvent: (event) => {
          if (!vault.status().locked) {
            record(event.message, event.accountId || "");
            changed();
          }
        },
      });
      tradeOffers = new TradeOfferService({
        steam,
        isCurrent: (account) =>
          !vault.status().locked && vault.getData().accounts.includes(account),
        canAutoAccept: (account) =>
          !vault.status().locked && account.autoAcceptGifts === true,
        isAdminAllowed: (account, partnerSteamId) =>
          !vault.status().locked &&
          vault.getData().accounts.includes(account) &&
          account.watchIncomingTrades === true &&
          isSteamAdmin(vault.getData().steamAdmins || [], partnerSteamId),
        onChange: (account) => {
          if (!unlocked().accounts.includes(account))
            throw Error(localeText.operationCancelled);
          persist();
          changed();
        },
        onEvent: (event) => {
          if (!vault.status().locked) {
            record(
              event.message || localeText.message_43e98ee,
              event.accountId || "",
            );
            changed();
          }
        },
      });
      passwordManager = new PasswordManager({ getData: unlocked, persist });
      loot = new LootCoordinator({
        steam,
        getData: unlocked,
        accountWork: lootAccountWork,
        isCurrent: (account) =>
          !vault.status().locked && vault.getData().accounts.includes(account),
        onChange: (expectedData) => {
          if (unlocked() !== expectedData)
            throw Error(localeText.operationCancelled);
          persist();
          changed();
        },
        onEvent: (event) => {
          if (!vault.status().locked) {
            if (event.message) record(event.message, event.accountId || "");
            changed();
          }
        },
      });
      authenticatorManager = new AuthenticatorManager({
        getData: unlocked,
        persist,
      });
      ipcMain.handle("smart-sda-loot", async (event, action, payload) => {
        const context = lootWindows.get(event.sender?.id);
        if (
          !context ||
          context.window.isDestroyed() ||
          event.sender !== context.window.webContents ||
          event.senderFrame !== context.window.webContents.mainFrame ||
          event.senderFrame.url !== lootUrl
        )
          return { ok: false, error: localeText.accessDenied };
        try {
          return {
            ok: true,
            value: await uiRequest(event, action, payload, () =>
              dispatchLoot(context, action, payload),
            ),
          };
        } catch (error) {
          return ipcError(error);
        }
      });
      ipcMain.handle(
        "smart-sda-authenticator",
        async (event, action, payload) => {
          if (
            !authenticatorWindow ||
            authenticatorWindow.isDestroyed() ||
            event.sender !== authenticatorWindow.webContents ||
            event.senderFrame !== authenticatorWindow.webContents.mainFrame ||
            event.senderFrame.url !== authenticatorUrl
          )
            return { ok: false, error: localeText.accessDenied };
          try {
            return {
              ok: true,
              value: await uiRequest(event, action, payload, () =>
                dispatchAuthenticator(action, payload),
              ),
            };
          } catch (error) {
            return ipcError(error);
          }
        },
      );
      ipcMain.handle(
        "smart-sda-password-manager",
        async (event, action, payload) => {
          if (
            !managerWindow ||
            managerWindow.isDestroyed() ||
            event.sender !== managerWindow.webContents ||
            event.senderFrame !== managerWindow.webContents.mainFrame ||
            event.senderFrame.url !== managerUrl
          )
            return { ok: false, error: localeText.accessDenied };
          try {
            return {
              ok: true,
              value: await uiRequest(event, action, payload, () =>
                dispatchManager(action, payload),
              ),
            };
          } catch (error) {
            return ipcError(error);
          }
        },
      );
      ipcMain.handle("smart-sda", async (event, action, payload) => {
        if (
          !win ||
          event.sender !== win.webContents ||
          event.senderFrame !== win.webContents.mainFrame ||
          event.senderFrame.url !== entryUrl
        )
          return { ok: false, error: localeText.accessDenied };
        try {
          return {
            ok: true,
            value: await uiRequest(
              event,
              action,
              payload,
              () => dispatch(action, payload),
              true,
            ),
          };
        } catch (error) {
          // Network/library errors may contain credential URLs. Never send those to renderer/logs.
          return ipcError(error);
        }
      });
      await createWindow();
      initTray();
      powerMonitor.on("suspend", lock);
      powerMonitor.on("lock-screen", lock);
      setInterval(() => {
        tick().catch(() => {});
      }, 1000).unref();
    })
    .catch(() => {
      runtimeLock();
      app.quit();
    });
}
app.on("window-all-closed", () => app.quit());
let quitReady = false,
  quitPending = false;
app.on("before-quit", (event) => {
  if (quitReady) return;
  event.preventDefault();
  if (quitPending) return;
  quitPending = true;
  trayController?.dispose();
  trayController = null;
  // Revoke network access now, then let Chromium flush persistent profile data.
  runtimeLock();
  Promise.all([browserSessions?.closeAll(), browserRuntime?.settled()])
    .catch(() => {})
    .finally(() => {
      quitReady = true;
      app.quit();
    });
});
