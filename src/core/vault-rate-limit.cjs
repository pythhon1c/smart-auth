"use strict";
const localeText = require("../locales/application.json");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { performance } = require("node:perf_hooks");
const MAX_DELAY = 300000;
const entries = new Map();
function failure() {
  return Error(localeText.couldNotSaveBruteForceProtectionCheckFilePermissions);
}
class VaultRateLimit {
  constructor(vaultPath) {
    this.file = path.resolve(vaultPath) + ".auth-state";
    this.identity =
      process.platform === "win32" ? this.file.toLowerCase() : this.file;
  }
  _load() {
    if (entries.has(this.identity)) return entries.get(this.identity);
    let state = { version: 1, failures: 0, remainingMs: 0 };
    if (fs.existsSync(this.file)) {
      try {
        const stat = fs.lstatSync(this.file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
          throw Error();
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (
          !parsed ||
          Object.keys(parsed).sort().join(",") !==
            "failures,remainingMs,version" ||
          parsed.version !== 1 ||
          !Number.isInteger(parsed.failures) ||
          parsed.failures < 0 ||
          parsed.failures > 1000000 ||
          !Number.isInteger(parsed.remainingMs) ||
          parsed.remainingMs < 0 ||
          parsed.remainingMs > MAX_DELAY
        )
          throw Error();
        state = parsed;
      } catch {
        state = { version: 1, failures: 14, remainingMs: MAX_DELAY };
        this._write(state);
      }
    }
    const entry = { state, deadline: performance.now() + state.remainingMs };
    entries.set(this.identity, entry);
    return entry;
  }
  _write(state) {
    const temp = this.file + "." + crypto.randomUUID() + ".tmp";
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (fs.existsSync(this.file) && fs.lstatSync(this.file).isSymbolicLink())
        throw Error();
      const fd = fs.openSync(temp, "wx", 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(state));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temp, this.file);
    } catch {
      throw failure();
    } finally {
      try {
        fs.unlinkSync(temp);
      } catch {}
    }
  }
  remaining() {
    const entry = this._load();
    return Math.max(0, Math.ceil(entry.deadline - performance.now()));
  }
  reserve() {
    const entry = this._load();
    if (this.remaining() > 0)
      throw Error(localeText.tooManyAttemptsTryAgainLater);
    const failures = Math.min(1000000, entry.state.failures + 1),
      remainingMs =
        failures < 5
          ? 0
          : Math.min(MAX_DELAY, 1000 * 2 ** Math.min(failures - 5, 9));
    const next = { version: 1, failures, remainingMs };
    this._write(next);
    entry.state = next;
    entry.deadline = performance.now() + remainingMs;
  }
  failed() {
    const entry = this._load();
    this._write(entry.state);
    entry.deadline = performance.now() + entry.state.remainingMs;
  }
  success() {
    const entry = this._load(),
      next = { version: 1, failures: 0, remainingMs: 0 };
    this._write(next);
    entry.state = next;
    entry.deadline = 0;
  }
}
module.exports = { VaultRateLimit };
