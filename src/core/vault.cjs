"use strict";
const { IDLE_LOCK_DEFAULTS, migrateIdleLockSettings } = require("./idle-lock-settings.cjs");
const {
  migrateAppearanceSettings,
  resolveAppearanceLanguage,
} = require("./appearance-settings.cjs");
const localeText = require("../locales/application.json");

const fs = require("node:fs");
const { AsyncLocalStorage } = require("node:async_hooks");
const accessGuards = new AsyncLocalStorage();
const { performance } = require("node:perf_hooks");
const { readBoundedRegularFile } = require("./vault-backup.cjs");
const { VaultRateLimit } = require("./vault-rate-limit.cjs");
const {
  descriptor,
  validateKdf,
  passwordPolicy,
  derivePasswordKey,
} = require("./vault-kdf.cjs");
const authFlights = new Set();
const {
  normalizeBrowserSettings,
  DEFAULT_BROWSER_BOOKMARKS,
} = require("./model.cjs");
const { accountPolicy } = require("./account-policy.cjs");
const { normalizeBrowserProfile } = require("./browser-profile.cjs");
const { normalizeBrowserSession } = require("./browser-session-data.cjs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_FILE = 64 * 1024 * 1024;
const MAX_PLAINTEXT_BYTES = 47 * 1024 * 1024;
// Keep traversal bounded without imposing a much smaller, accidental capacity
// on asset journals. A minimal four-field Steam asset occupies 54 JSON bytes
// and five nodes; an eight-byte-per-node budget accommodates such journal data
// up to the existing encrypted payload size limit. Depth and individual field
// limits below still apply, and serialized bytes remain the final size gate.
const MAX_PAYLOAD_NODES = Math.floor(MAX_PLAINTEXT_BYTES / 8);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_SETTINGS = {
  ...IDLE_LOCK_DEFAULTS,
  pollSeconds: 60,
  theme: "system",
  language: "en",
  followSystemLanguage: true,
  allowDirect: false,
  showProxyCredentials: false,
  hideSecurityNotice: false,
  trayEnabled: true,
  trayMinimizeToTray: false,
  trayCloseToTray: false,
  trayAccountIds: [],
  notificationsEnabled: true,
  soundEnabled: true,
  soundVolume: 50,
  notifyErrors: true,
  accountsPerPage: 50,
  browserMaxAccounts: 10,
  browserSeparateSession: true,
  bulkConcurrency: 8,
  proxyCheckConcurrency: 8,
  browserLaunchConcurrency: 2,
  taskStartDelayMs: 100,
  browserLaunchDelayMs: 750,
  browserTheme: "system",
  browserLanguage: "system",
  browserShowBookmarksBar: true,
  browserBookmarks: DEFAULT_BROWSER_BOOKMARKS,
  browserSmartTraderEnabled: true,
  browserSmartTraderAutoCheck: false,
  browserExtensions: [],
};
function migrateData(data) {
  let changed = migrateAppearanceSettings(data.settings);
  if (migrateIdleLockSettings(data.settings)) changed = true;
  if (
    data.banApiKey !== undefined &&
    data.banApiKey !== "" &&
    (typeof data.banApiKey !== "string" ||
      !/^[a-fA-F0-9]{32}$/.test(data.banApiKey))
  )
    throw fail();
  const { normalizeSteamAdmins } = require("./steam-admins.cjs");
  const { ensureLootSchemes } = require("./loot-schemes.cjs");
  const admins = normalizeSteamAdmins(
    data.steamAdmins === undefined ? [] : data.steamAdmins,
  );
  if (JSON.stringify(data.steamAdmins) !== JSON.stringify(admins)) {
    data.steamAdmins = admins;
    changed = true;
  }
  const beforeLoot = JSON.stringify(data.loot);
  ensureLootSchemes(data);
  if (beforeLoot !== JSON.stringify(data.loot)) changed = true;
  if (data.proxyLists === undefined) {
    data.proxyLists = [];
    changed = true;
  }
  if (!Array.isArray(data.proxyLists) || data.proxyLists.length > 2000)
    throw fail();
  for (const list of data.proxyLists) {
    if (
      !list ||
      typeof list.id !== "string" ||
      typeof list.name !== "string" ||
      !Array.isArray(list.proxyIds) ||
      list.proxyIds.length > 2000 ||
      list.proxyIds.some((id) => typeof id !== "string")
    )
      throw fail();
  }
  for (const owner of [...data.accounts, ...data.groups]) {
    if (owner.proxyListIds === undefined) {
      owner.proxyListIds = [];
      changed = true;
    }
    if (
      !Array.isArray(owner.proxyListIds) ||
      owner.proxyListIds.length > 100 ||
      owner.proxyListIds.some((id) => typeof id !== "string")
    )
      throw fail();
  }
  for (const account of data.accounts) {
    const bans = require("./account-bans.cjs").normalizeAccountBans(
      account.bans,
    );
    if (JSON.stringify(account.bans) !== JSON.stringify(bans)) {
      account.bans = bans;
      changed = true;
    }
    if (account.browserSession !== undefined) {
      account.browserSession = normalizeBrowserSession(
        account.browserSession,
        account.steamId,
      );
    }
    if (account.browserProfile !== undefined) {
      const profile = normalizeBrowserProfile(account.browserProfile);
      if (JSON.stringify(profile) !== JSON.stringify(account.browserProfile)) {
        account.browserProfile = profile;
        changed = true;
      }
    }
    for (const [key, value] of Object.entries(accountPolicy(account))) {
      if (account[key] === undefined) {
        account[key] = value;
        changed = true;
      }
    }
  }
  const browserSettings = normalizeBrowserSettings(data.settings);
  for (const [key, value] of Object.entries(browserSettings)) {
    if (JSON.stringify(data.settings[key]) !== JSON.stringify(value)) {
      data.settings[key] = value;
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (data.settings[key] === undefined) {
      data.settings[key] = value;
      changed = true;
    }
  }
  return changed;
}
function fail(message = localeText.couldNotOpenVault) {
  return new Error(message);
}
function base32(buffer) {
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decode32(secret) {
  if (typeof secret !== "string" || !/^[A-Z2-7]{16,128}$/.test(secret))
    throw fail();
  let bits = 0,
    value = 0;
  const bytes = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const key = decode32(secret);
  try {
    const hash = crypto.createHmac("sha1", key).update(counter).digest();
    const offset = hash[hash.length - 1] & 15;
    return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
      6,
      "0",
    );
  } finally {
    key.fill(0);
  }
}
function matchStep(secret, code, lastStep = -1) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code))
    throw fail(localeText.incorrectCredentials);
  const now = Math.floor(Date.now() / 30000);
  for (const step of [now, now - 1, now + 1]) {
    if (
      step > lastStep &&
      crypto.timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))
    )
      return step;
  }
  throw fail(localeText.incorrectCredentials);
}
function passwordKey(password, salt) {
  if (typeof password !== "string" || password.length > 4096)
    throw fail(localeText.incorrectCredentials);
  return crypto.scryptSync(password, salt, 32, SCRYPT);
}
function binary(value, min, max = min) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(max / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw fail();
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length < min ||
    bytes.length > max ||
    bytes.toString("base64") !== value
  )
    throw fail();
  return bytes;
}
function validate(value, depth = 0, state = { count: 0 }) {
  if (++state.count > MAX_PAYLOAD_NODES || depth > 32) throw fail();
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw fail();
    return;
  }
  if (typeof value === "string") {
    if (value.length > 1024 * 1024) throw fail();
    return;
  }
  if (
    typeof value !== "object" ||
    (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
  )
    throw fail();
  if (Array.isArray(value) && value.length > 20000) throw fail();
  for (const key of Object.keys(value)) {
    if (
      ["__proto__", "prototype", "constructor"].includes(key) ||
      key.length > 1024
    )
      throw fail();
    validate(value[key], depth + 1, state);
  }
}
function validatePayload(payload) {
  validate(payload);
  if (
    !payload ||
    !payload.data ||
    !payload.security ||
    !["accounts", "groups", "proxies", "audit"].every((k) =>
      Array.isArray(payload.data[k]),
    ) ||
    !payload.data.settings ||
    typeof payload.data.settings !== "object" ||
    !Number.isSafeInteger(payload.security.lastStep) ||
    payload.security.lastStep < -1 ||
    !(
      payload.security.totpSecret === null ||
      /^[A-Z2-7]{32}$/.test(payload.security.totpSecret)
    )
  )
    throw fail();
  const pin = payload.security.pin;
  if (pin !== undefined && pin !== null) {
    if (
      typeof pin !== "object" ||
      Array.isArray(pin) ||
      Object.keys(pin).sort().join(",") !== "hash,salt"
    )
      throw fail();
    binary(pin.salt, 16);
    binary(pin.hash, 32);
  }
}
function scrub(value) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    scrub(value[key]);
    delete value[key];
  }
}

class Vault {
  constructor(
    filePath,
    { protectKey, unprotectKey, systemLanguage = () => "en" } = {},
  ) {
    this.systemLanguage = systemLanguage;
    this.filePath = filePath;
    this.protectKey = protectKey;
    this.unprotectKey = unprotectKey;
    this._generation = 0;
    this._authPending = false;
    this._limiter = new VaultRateLimit(filePath);
    this._key = null;
    this._payload = null;
    this._envelope = null;
    this._pending = null;
    this._totpEnrollmentGeneration = 0;
    this._pinLocked = false;
    this._pinEnabled = false;
    this._pinFailures = 0;
    this._pinRetryAt = 0;
  }
  exists() {
    return fs.existsSync(this.filePath);
  }
  status() {
    let envelope = this._envelope;
    if (!envelope && this.exists()) {
      try {
        envelope = this._read();
      } catch {
        /* Corrupt files remain locked. */
      }
    }
    return {
      exists: this.exists(),
      locked: !this._key || this._pinLocked,
      lockMode: !this._key ? "password" : this._pinLocked ? "pin" : "unlocked",
      pinEnabled: this._payload
        ? Boolean(this._payload.security.pin)
        : this._pinEnabled,
      passwordEnabled: envelope?.passwordEnabled ?? true,
      totpEnabled: envelope?.totpEnabled ?? false,
      authPending: this._authPending,
      passwordNeedsUpgrade: Boolean(this._key && this._passwordNeedsUpgrade),
      retryAfterMs: this._pinLocked
        ? Math.max(0, this._pinRetryAt - Date.now())
        : this._limiter.remaining(),
      vaultVersion: envelope?.version ?? null,
      kdf: envelope?.passwordEnabled ? descriptor(envelope.version) : null,
    };
  }
  _read() {
    // Read the checked descriptor with a hard bound: a path stat followed by
    // readFileSync can read a replacement or a file that grows without limit.
    const entry = fs.lstatSync(this.filePath);
    if (!entry.isFile() || entry.isSymbolicLink()) throw fail();
    const fd = fs.openSync(
      this.filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    let e;
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size < 1 || stat.size > MAX_FILE) throw fail();
      const bytes = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const count = fs.readSync(
          fd,
          bytes,
          length,
          bytes.length - length,
          null,
        );
        if (!count) break;
        length += count;
      }
      if (length !== stat.size) throw fail();
      e = JSON.parse(bytes.subarray(0, length).toString("utf8"));
    } finally {
      fs.closeSync(fd);
    }
    if (
      !e ||
      ![1, 2].includes(e.version) ||
      typeof e.passwordEnabled !== "boolean" ||
      typeof e.totpEnabled !== "boolean" ||
      Object.keys(e).sort().join(",") !==
        (e.version === 1
          ? "ciphertext,iv,passwordEnabled,salt,tag,totpEnabled,version,wrappedKey"
          : "ciphertext,iv,kdf,passwordEnabled,salt,tag,totpEnabled,version,wrappedKey")
    )
      throw fail();
    if (e.version === 2) validateKdf(e.kdf);
    binary(e.salt, e.version === 1 ? 16 : 32);
    binary(e.iv, 12);
    binary(e.tag, 16);
    binary(e.ciphertext, 1, MAX_PLAINTEXT_BYTES);
    if (
      e.passwordEnabled
        ? e.wrappedKey !== null
        : typeof e.wrappedKey !== "string"
    )
      throw fail();
    if (!e.passwordEnabled) binary(e.wrappedKey, 1, 65536);
    return e;
  }
  _aad(e) {
    return Buffer.from(
      JSON.stringify({
        version: e.version,
        ...(e.version === 2 ? { kdf: descriptor(2) } : {}),
        passwordEnabled: e.passwordEnabled,
        totpEnabled: e.totpEnabled,
        salt: e.salt,
        wrappedKey: e.wrappedKey,
      }),
    );
  }
  _guard() {
    if (!this._key || !this._payload || this._pinLocked)
      throw fail(localeText.vaultLocked);
  }
  _rate() {
    this._limiter.reserve();
  }
  _failed() {
    this._limiter.failed();
  }
  _success() {
    this._limiter.success();
  }
  withAccessGuard(assertCurrent, task) {
    return accessGuards.run(assertCurrent, task);
  }
  async _exclusive(task) {
    const resolved = path.resolve(this.filePath);
    const identity =
      process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (authFlights.has(identity))
      throw fail(localeText.anAccessCheckIsAlreadyRunning);
    authFlights.add(identity);
    this._authPending = true;
    const generation = this._generation;
    const accessGuard = accessGuards.getStore();
    const current = () => {
      accessGuard?.();
      if (this._generation !== generation)
        throw fail(localeText.operationCancelled);
    };
    try {
      const result = await task(current);
      if (
        result &&
        typeof result === "object" &&
        Object.hasOwn(result, "authPending")
      )
        result.authPending = false;
      return result;
    } finally {
      this._authPending = false;
      authFlights.delete(identity);
    }
  }
  async create({ password } = {}) {
    return this._exclusive(async (current) => {
      if (this.exists() || this._key) throw fail(localeText.vaultAlreadyExists);
      if (fs.existsSync(`${this.filePath}.bak`))
        throw fail(
          localeText.aVaultBackupWasFoundRestoreItBeforeCreatingANewVault,
        );
      passwordPolicy(password);
      const salt = crypto.randomBytes(32);
      let key;
      const payload = {
        data: {
          accounts: [],
          groups: [],
          proxies: [],
          proxyLists: [],
          settings: resolveAppearanceLanguage(
            structuredClone(DEFAULT_SETTINGS),
            this.systemLanguage(),
          ),
          audit: [],
        },
        security: { totpSecret: null, lastStep: -1 },
      };
      try {
        key = await derivePasswordKey(password, salt, 2);
        current();
        const envelope = this._writeState(payload, key, {
          version: 2,
          kdf: descriptor(2),
          passwordEnabled: true,
          totpEnabled: false,
          salt: salt.toString("base64"),
          wrappedKey: null,
        });
        this._success();
        current();
        this._key = key;
        key = null;
        this._payload = payload;
        this._envelope = envelope;
        this._pinLocked = false;
        this._pinEnabled = false;
        this._passwordNeedsUpgrade = false;
        return this.status();
      } catch (error) {
        if (this._payload === payload) this.lock();
        scrub(payload);
        throw error;
      } finally {
        key?.fill(0);
      }
    });
  }
  async unlock({ password = "", code = "" } = {}) {
    return this._exclusive(async (current) => {
      if (this._key) throw fail(localeText.vaultIsAlreadyOpen);
      this._rate();
      let key, payload;
      try {
        const e = this._read();
        if (e.passwordEnabled)
          key = await derivePasswordKey(
            password,
            binary(e.salt, e.version === 1 ? 16 : 32),
            e.version,
          );
        else {
          if (!this.unprotectKey) throw fail();
          key = binary(this.unprotectKey(binary(e.wrappedKey, 1, 65536)), 32);
        }
        current();
        const decipher = crypto.createDecipheriv(
          "aes-256-gcm",
          key,
          binary(e.iv, 12),
        );
        decipher.setAAD(this._aad(e));
        decipher.setAuthTag(binary(e.tag, 16));
        const plain = Buffer.concat([
          decipher.update(binary(e.ciphertext, 1, MAX_PLAINTEXT_BYTES)),
          decipher.final(),
        ]);
        try {
          payload = JSON.parse(plain.toString("utf8"));
        } finally {
          plain.fill(0);
        }
        validatePayload(payload);
        const migrated = migrateData(payload.data);
        if (Boolean(payload.security.totpSecret) !== e.totpEnabled)
          throw fail();
        if (e.totpEnabled)
          payload.security.lastStep = matchStep(
            payload.security.totpSecret,
            code,
            payload.security.lastStep,
          );
        let envelope = e;
        if (e.version === 1) {
          const salt = crypto.randomBytes(32);
          if (e.passwordEnabled) {
            const replacement = await derivePasswordKey(password, salt, 2);
            try {
              current();
            } catch (error) {
              replacement.fill(0);
              throw error;
            }
            key.fill(0);
            key = replacement;
          }
          envelope = {
            ...e,
            version: 2,
            kdf: descriptor(2),
            salt: salt.toString("base64"),
          };
          envelope = this._writeState(payload, key, envelope);
        } else if (e.totpEnabled || migrated)
          envelope = this._writeState(payload, key, e);
        current();
        this._success();
        this._key = key;
        key = null;
        this._payload = payload;
        payload = null;
        this._envelope = envelope;
        this._pinLocked = false;
        this._pinEnabled = Boolean(this._payload.security.pin);
        this._pinFailures = 0;
        this._pinRetryAt = 0;
        this._passwordNeedsUpgrade = Boolean(
          e.passwordEnabled && [...password].length < 15,
        );
        return this.status();
      } catch (error) {
        if (this._key) this.lock();
        key?.fill(0);
        scrub(payload);
        this._failed();
        if (error.code === "VAULT_PARTIAL_COMMIT") throw error;
        throw fail(
          error.message === localeText.operationCancelled
            ? error.message
            : localeText.incorrectCredentialsOrDamagedVault,
        );
      }
    });
  }
  lock() {
    this._generation++;
    if (this._key) this._key.fill(0);
    scrub(this._payload);
    this._key = null;
    this._payload = null;
    this._pending = null;
    this._envelope = null;
    this._pinLocked = false;
    this._pinFailures = 0;
    this._pinRetryAt = 0;
    return this.status();
  }
  pinLock() {
    this._guard();
    if (!this._payload.security.pin) throw fail(localeText.setUpPINFirst);
    // A quick lock is a session access gate. The vault key remains in RAM;
    // only full lock() destroys it, and a PIN can never decrypt a disk vault.
    this._generation++;
    this._pinLocked = true;
    this._pending = null;
    return this.status();
  }
  unlockPin({ pin } = {}) {
    if (this._authPending) throw fail(localeText.anAccessCheckIsAlreadyRunning);
    if (
      !this._key ||
      !this._payload ||
      !this._pinLocked ||
      !this._payload.security.pin
    )
      throw fail(localeText.fullyUnlockTheVaultFirst);
    if (Date.now() < this._pinRetryAt)
      throw fail(localeText.tooManyAttemptsTryAgainLater);
    let candidate, expected;
    try {
      if (typeof pin !== "string" || !/^\d{6,12}$/.test(pin)) throw fail();
      candidate = passwordKey(pin, binary(this._payload.security.pin.salt, 16));
      expected = binary(this._payload.security.pin.hash, 32);
      if (!crypto.timingSafeEqual(candidate, expected)) throw fail();
      this._pinLocked = false;
      this._pinFailures = 0;
      this._pinRetryAt = 0;
      return this.status();
    } catch {
      this._pinFailures++;
      if (this._pinFailures >= 5) {
        this.lock();
        throw fail(localeText.pinBlockedFullyUnlockTheVault);
      }
      this._pinRetryAt = Date.now() + 250 * 2 ** (this._pinFailures - 1);
      throw fail(localeText.incorrectPIN);
    } finally {
      candidate?.fill(0);
      expected?.fill(0);
    }
  }
  async enablePin({ currentPassword = "", code = "", pin } = {}) {
    return this._exclusive(async (current) => {
      this._guard();
      if (typeof pin !== "string" || !/^\d{6,12}$/.test(pin))
        throw fail(localeText.pinMustContain612Digits);
      await this._verify({ password: currentPassword, code }, current);
      current();
      const salt = crypto.randomBytes(16),
        hash = passwordKey(pin, salt),
        previous = this._payload.security;
      this._payload.security = {
        ...previous,
        pin: { salt: salt.toString("base64"), hash: hash.toString("base64") },
      };
      hash.fill(0);
      try {
        this.save();
      } catch (error) {
        this._payload.security = previous;
        throw error;
      }
      this._pinEnabled = true;
      return this.status();
    });
  }
  async changePin(options) {
    return this.enablePin(options);
  }
  async disablePin({ currentPassword = "", code = "" } = {}) {
    return this._exclusive(async (current) => {
      await this._verify({ password: currentPassword, code }, current);
      current();
      const previous = this._payload.security;
      this._payload.security = { ...previous, pin: null };
      try {
        this.save();
      } catch (error) {
        this._payload.security = previous;
        throw error;
      }
      this._pinEnabled = false;
      this._pinFailures = 0;
      this._pinRetryAt = 0;
      return this.status();
    });
  }
  getData() {
    this._guard();
    resolveAppearanceLanguage(
      this._payload.data.settings,
      this.systemLanguage(),
    );
    return this._payload.data;
  }
  save() {
    this._guard();
    this._envelope = this._writeState(this._payload, this._key, this._envelope);
  }
  _writeState(payload, key, envelope) {
    migrateData(payload.data);
    validatePayload(payload);
    const plain = Buffer.from(JSON.stringify(payload));
    if (plain.length > MAX_PLAINTEXT_BYTES) {
      plain.fill(0);
      throw fail();
    }
    const e = {
      ...envelope,
      totpEnabled: Boolean(payload.security.totpSecret),
    };
    const expectedDigest = crypto.createHash("sha256").update(plain).digest();
    const iv = crypto.randomBytes(12),
      cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(this._aad(e));
    let ciphertext;
    try {
      ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    } finally {
      plain.fill(0);
    }
    Object.assign(e, {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    });
    const verify = crypto.createDecipheriv("aes-256-gcm", key, iv);
    verify.setAAD(this._aad(e));
    verify.setAuthTag(Buffer.from(e.tag, "base64"));
    const verified = Buffer.concat([verify.update(ciphertext), verify.final()]);
    try {
      if (
        !crypto.timingSafeEqual(
          expectedDigest,
          crypto.createHash("sha256").update(verified).digest(),
        )
      )
        throw fail();
    } finally {
      verified.fill(0);
      expectedDigest.fill(0);
    }
    const temp = `${this.filePath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    const hadPrimary = fs.existsSync(this.filePath);
    let backupCommitted = false;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const fd = fs.openSync(temp, "wx", 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(e));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      // A recovery mirror must use CURRENT access controls and replay counter.
      // Keeping the previous file here would preserve an old password or a
      // pre-enrollment TOTP-free copy after a successful security change.
      const backupTemp = `${temp}.bak`;
      try {
        const backupFd = fs.openSync(backupTemp, "wx", 0o600);
        try {
          fs.writeFileSync(backupFd, JSON.stringify(e));
          fs.fsyncSync(backupFd);
        } finally {
          fs.closeSync(backupFd);
        }
        fs.renameSync(backupTemp, `${this.filePath}.bak`);
        backupCommitted = true;
      } finally {
        try {
          fs.unlinkSync(backupTemp);
        } catch {}
      }
      fs.renameSync(temp, this.filePath);
      return e;
    } catch {
      if (backupCommitted) {
        // No previous-credential snapshot is retained on successful writes.
        // A reported primary failure restores the mirror from the unchanged
        // authoritative primary. This is recovery from an I/O error, not a
        // claim that two separate file renames are crash-atomic.
        const restoreTemp = `${temp}.restore`;
        try {
          if (hadPrimary) {
            const bytes = readBoundedRegularFile(this.filePath);
            const fd = fs.openSync(restoreTemp, "wx", 0o600);
            try {
              fs.writeFileSync(fd, bytes);
              fs.fsyncSync(fd);
            } finally {
              fs.closeSync(fd);
            }
            fs.renameSync(restoreTemp, `${this.filePath}.bak`);
          } else fs.unlinkSync(`${this.filePath}.bak`);
        } catch {
          const error = fail(
            localeText.couldNotSaveTheVaultTheBackupMayHaveDifferentAccessSettingsKeepBoth,
          );
          error.code = "VAULT_PARTIAL_COMMIT";
          throw error;
        } finally {
          try {
            fs.unlinkSync(restoreTemp);
          } catch {}
        }
      }
      throw fail(localeText.couldNotSaveVault);
    } finally {
      try {
        fs.unlinkSync(temp);
      } catch {}
    }
  }
  async beginTotp({ password = "" } = {}) {
    return this._exclusive(async (current) => {
      this.cancelTotpEnrollment();
      const enrollmentGeneration = this._totpEnrollmentGeneration;
      this._guard();
      if (this._payload.security.totpSecret)
        throw fail(localeText.totpIsAlreadyEnabled);
      // Passwordless vaults rely on the already unlocked OS-bound session.
      await this._verify({ password }, current);
      current();
      if (this._totpEnrollmentGeneration !== enrollmentGeneration)
        throw fail(localeText.operationCancelled);
      this._guard();
      this._pending = {
        secret: base32(crypto.randomBytes(20)),
        expires: Date.now() + 10 * 60 * 1000,
        deadline: performance.now() + 10 * 60 * 1000,
        generation: this._generation,
        salt: this._envelope.salt,
      };
      return {
        secret: this._pending.secret,
        uri: `otpauth://totp/smart-auth:Vault?secret=${this._pending.secret}&issuer=smart-auth&algorithm=SHA1&digits=6&period=30`,
      };
    });
  }
  cancelTotpEnrollment() {
    this._totpEnrollmentGeneration++;
    this._pending = null;
    return null;
  }
  enableTotp(code) {
    if (this._authPending) throw fail(localeText.anAccessCheckIsAlreadyRunning);
    this._guard();
    this._rate();
    if (
      !this._pending ||
      this._pending.expires < Date.now() ||
      this._pending.deadline <= performance.now() ||
      this._pending.generation !== this._generation ||
      this._pending.salt !== this._envelope.salt ||
      this._payload.security.totpSecret
    )
      throw fail(localeText.startTOTPSetupAgain);
    let step;
    try {
      step = matchStep(this._pending.secret, code);
    } catch {
      this._failed();
      throw fail(localeText.incorrectCredentials);
    }
    const previous = this._payload.security;
    this._payload.security = {
      ...previous,
      totpSecret: this._pending.secret,
      lastStep: step,
    };
    try {
      this.save();
    } catch (error) {
      this._payload.security = previous;
      throw error;
    }
    this._pending = null;
    this._success();
    return this.status();
  }
  async verify(options = {}) {
    const assertCurrent =
      typeof options.assertCurrent === "function"
        ? options.assertCurrent
        : () => {};
    return this._exclusive((current) =>
      this._verify(options, () => {
        current();
        assertCurrent();
      }),
    );
  }
  async verifyPin({ pin, assertCurrent = () => {} } = {}) {
    return this._exclusive((current) => {
      this._guard();
      current();
      assertCurrent();
      if (!this._payload.security.pin || this._pinFailures >= 5)
        throw Object.assign(fail(localeText.pinBlockedFullyUnlockTheVault), {
          code: "UI_PIN_MASTER_REQUIRED",
        });
      if (Date.now() < this._pinRetryAt)
        throw fail(localeText.tooManyAttemptsTryAgainLater);
      let candidate, expected;
      try {
        if (typeof pin !== "string" || !/^\d{6,12}$/.test(pin)) throw fail();
        candidate = passwordKey(
          pin,
          binary(this._payload.security.pin.salt, 16),
        );
        expected = binary(this._payload.security.pin.hash, 32);
        current();
        assertCurrent();
        if (!crypto.timingSafeEqual(candidate, expected)) throw fail();
        this._pinFailures = 0;
        this._pinRetryAt = 0;
        return true;
      } catch (error) {
        if (error.message === localeText.operationCancelled) throw error;
        this._pinFailures++;
        this._pinRetryAt = Date.now() + 250 * 2 ** (this._pinFailures - 1);
        if (this._pinFailures >= 5)
          throw Object.assign(fail(localeText.pinBlockedFullyUnlockTheVault), {
            code: "UI_PIN_MASTER_REQUIRED",
          });
        throw fail(localeText.incorrectPIN);
      } finally {
        candidate?.fill(0);
        expected?.fill(0);
      }
    });
  }
  uiPinRetryAfterMs() {
    return Math.max(0, this._pinRetryAt - Date.now());
  }
  async _verify({ password = "", code = "" } = {}, current) {
    this._guard();
    this._rate();
    let candidate;
    try {
      const envelope = this._envelope;
      if (envelope.passwordEnabled) {
        candidate = await derivePasswordKey(
          password,
          binary(envelope.salt, envelope.version === 1 ? 16 : 32),
          envelope.version,
        );
        current();
        if (!crypto.timingSafeEqual(candidate, this._key)) throw fail();
      }
      current();
      this._guard();
      if (this._payload.security.totpSecret) {
        const previous = this._payload.security.lastStep;
        this._payload.security.lastStep = matchStep(
          this._payload.security.totpSecret,
          code,
          previous,
        );
        try {
          this.save();
        } catch (error) {
          this._payload.security.lastStep = previous;
          throw error;
        }
      }
      this._success();
      this._pinFailures = 0;
      this._pinRetryAt = 0;
      return true;
    } catch (error) {
      this._failed();
      if (error.code === "VAULT_PARTIAL_COMMIT") throw error;
      throw fail(
        error.message === localeText.operationCancelled
          ? error.message
          : localeText.incorrectCredentials,
      );
    } finally {
      candidate?.fill(0);
    }
  }
  async disableTotp({ password = "", code = "" } = {}) {
    return this._exclusive(async (current) => {
      await this._verify({ password, code }, current);
      current();
      const previous = this._payload.security;
      this._payload.security = { ...previous, totpSecret: null, lastStep: -1 };
      try {
        this.save();
      } catch (error) {
        this._payload.security = previous;
        throw error;
      }
      this._pending = null;
      return this.status();
    });
  }
  async changePassword({ currentPassword = "", code = "", newPassword } = {}) {
    return this._exclusive(async (current) => {
      this._guard();
      if (newPassword !== "") passwordPolicy(newPassword);
      await this._verify({ password: currentPassword, code }, current);
      current();
      const salt = crypto.randomBytes(32);
      let key,
        wrappedKey = null;
      try {
        if (newPassword) key = await derivePasswordKey(newPassword, salt, 2);
        else {
          if (!this.protectKey || !this.unprotectKey) throw fail();
          key = crypto.randomBytes(32);
          const wrapped = this.protectKey(key.toString("base64"));
          if (
            !Buffer.isBuffer(wrapped) ||
            !wrapped.length ||
            wrapped.length > 65536
          )
            throw fail();
          const recovered = binary(this.unprotectKey(wrapped), 32);
          try {
            if (!crypto.timingSafeEqual(key, recovered)) throw fail();
          } finally {
            recovered.fill(0);
          }
          wrappedKey = wrapped.toString("base64");
        }
        current();
        this._guard();
        const envelope = this._writeState(this._payload, key, {
          version: 2,
          kdf: descriptor(2),
          passwordEnabled: Boolean(newPassword),
          totpEnabled: Boolean(this._payload.security.totpSecret),
          salt: salt.toString("base64"),
          wrappedKey,
        });
        this._key.fill(0);
        this._key = key;
        key = null;
        this._envelope = envelope;
        this._passwordNeedsUpgrade = false;
        return this.status();
      } catch (error) {
        if (error.code === "VAULT_PARTIAL_COMMIT") throw error;
        throw fail(
          error.message === localeText.operationCancelled
            ? error.message
            : localeText.couldNotChangePassword,
        );
      } finally {
        key?.fill(0);
      }
    });
  }
}

module.exports = { Vault };
