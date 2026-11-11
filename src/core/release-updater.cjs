"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const API =
  "https://api.github.com/repos/pythhon1c/smart-auth/releases?per_page=100";
const MAX_BINARY = 1024 * 1024 * 1024,
  MAX_METADATA = 2 * 1024 * 1024;
const failure = (code) => Object.assign(new Error(code), { code });
function semver(value) {
  const m =
    typeof value === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/.exec(
      value,
    );
  if (
    !m ||
    m
      .slice(1)
      .filter(Boolean)
      .some((x) => !Number.isSafeInteger(Number(x)))
  )
    return null;
  return [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    m[4] === undefined ? Infinity : Number(m[4]),
  ];
}
function compare(a, b) {
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
class ReleaseUpdater {
  constructor({
    currentVersion,
    directory,
    fetch: fetcher = globalThis.fetch,
    timeoutMs = 30000,
    downloadTimeoutMs = 20 * 60 * 1000,
    stallTimeoutMs = 30000,
  } = {}) {
    if (
      !semver(currentVersion) ||
      typeof directory !== "string" ||
      !path.isAbsolute(directory) ||
      typeof fetcher !== "function"
    )
      throw failure("UPDATER_CONFIGURATION");
    this.currentVersion = currentVersion;
    this.directory = path.resolve(directory);
    this.fetch = fetcher;
    const bounded = (value, maximum) => {
      if (!Number.isFinite(value) || value < 1)
        throw failure("UPDATER_CONFIGURATION");
      return Math.min(Math.max(value, 100), maximum);
    };
    this.timeoutMs = bounded(timeoutMs, 120000);
    this.downloadTimeoutMs = bounded(downloadTimeoutMs, 20 * 60 * 1000);
    this.stallTimeoutMs = bounded(stallTimeoutMs, 120000);
    this.release = null;
    this.latestVersion = null;
    this.ready = false;
    this.flight = null;
  }
  status() {
    return {
      state: this.ready ? "ready" : this.release ? "available" : "current",
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      version: this.release?.version || this.currentVersion,
    };
  }
  async _exclusive(action, fn) {
    if (this.flight) {
      if (this.flight.action === action) return this.flight.promise;
      throw failure("UPDATER_BUSY");
    }
    const promise = Promise.resolve().then(fn);
    this.flight = { action, promise };
    try {
      return await promise;
    } finally {
      if (this.flight?.promise === promise) this.flight = null;
    }
  }
  async _request(url, signal, asset = false) {
    for (let hop = 0; hop <= 5; hop++) {
      const u = new URL(url);
      const allowed = asset
        ? ["github.com", "release-assets.githubusercontent.com"]
        : ["api.github.com"];
      if (
        u.protocol !== "https:" ||
        (u.port && u.port !== "443") ||
        u.username ||
        u.password ||
        !allowed.includes(u.hostname)
      )
        throw failure("UPDATER_UNTRUSTED_URL");
      const response = await this.fetch(u.href, {
        redirect: "manual",
        credentials: "omit",
        signal,
        headers: {
          "User-Agent": "smart-auth-release-updater",
          Accept: asset
            ? "application/octet-stream"
            : "application/vnd.github+json",
        },
      });
      const cancel = () => {
        try {
          Promise.resolve(response.body?.cancel?.()).catch(() => {});
        } catch {}
      };
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) {
        cancel();
        signal.throwIfAborted();
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel?.();
        if (!asset || !location || hop === 5) throw failure("UPDATER_REDIRECT");
        url = new URL(location, u).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel?.();
        throw failure("UPDATER_HTTP");
      }
      return response;
    }
    throw failure("UPDATER_REDIRECT");
  }
  async _withTimeout(fn, download = false) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      download ? this.downloadTimeoutMs : this.timeoutMs,
    );
    let stalled;
    const touch = () => {
      clearTimeout(stalled);
      if (download)
        stalled = setTimeout(() => controller.abort(), this.stallTimeoutMs);
    };
    touch();
    try {
      return await fn(controller.signal, touch);
    } catch (error) {
      if (error?.code?.startsWith("UPDATER_")) throw error;
      throw failure("UPDATER_FAILED");
    } finally {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(stalled);
    }
  }
  async check() {
    return this._exclusive("check", () =>
      this._withTimeout(async (signal) => {
        const response = await this._request(API, signal);
        const chunks = [];
        let size = 0;
        const declared = response.headers.get("content-length");
        if (
          declared &&
          (!/^\d+$/.test(declared) || Number(declared) > MAX_METADATA)
        )
          throw failure("UPDATER_METADATA");
        for await (const chunk of response.body || []) {
          size += chunk.length;
          if (size > MAX_METADATA) throw failure("UPDATER_METADATA");
          chunks.push(Buffer.from(chunk));
        }
        const releases = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!Array.isArray(releases) || releases.length > 100)
          throw failure("UPDATER_METADATA");
        const current = semver(this.currentVersion),
          candidates = [];
        for (const release of releases) {
          if (!release || release.draft || typeof release.tag_name !== "string")
            continue;
          const version = release.tag_name.replace(/^v/, ""),
            parsed = semver(version);
          if (
            !parsed ||
            (current[3] === Infinity && parsed[3] !== Infinity) ||
            Boolean(release.prerelease) !== (parsed[3] !== Infinity)
          )
            continue;
          const name = `smart-auth-${version}-win-x64.exe`;
          const assets = Array.isArray(release.assets)
            ? release.assets.filter((a) => a?.name === name)
            : [];
          if (assets.length !== 1) continue;
          const asset = assets[0],
            expected = `https://github.com/pythhon1c/smart-auth/releases/download/${release.tag_name}/${name}`;
          if (
            asset.browser_download_url !== expected ||
            !Number.isSafeInteger(asset.size) ||
            asset.size < 1 ||
            asset.size > MAX_BINARY ||
            typeof asset.digest !== "string" ||
            !/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest)
          )
            continue;
          candidates.push({
            version,
            parsed,
            name,
            url: expected,
            size: asset.size,
            digest: asset.digest.slice(7).toLowerCase(),
          });
        }
        candidates.sort((a, b) => compare(b.parsed, a.parsed));
        const latest = candidates[0];
        this.latestVersion = latest?.version || null;
        const selected = latest && compare(latest.parsed, current) > 0 ? latest : null;
        if (
          this.release?.version !== selected?.version ||
          this.release?.digest !== selected?.digest ||
          this.release?.size !== selected?.size
        )
          this.ready = false;
        this.release = selected;
        if (selected) {
          try {
            await this._verify();
            this.ready = true;
          } catch {
            this.ready = false;
          }
        }
        return this.status();
      }),
    );
  }
  async _directory() {
    // Reject existing ancestor aliases before creating even the download folder.
    let ancestor = this.directory;
    for (;;) {
      try {
        const resolved = await fs.promises.realpath(ancestor);
        const canonical = (p) =>
          process.platform === "win32" ? p.toLowerCase() : p;
        if (canonical(resolved) !== canonical(ancestor))
          throw failure("UPDATER_DIRECTORY");
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        const parent = path.dirname(ancestor);
        if (parent === ancestor) throw failure("UPDATER_DIRECTORY");
        ancestor = parent;
      }
    }
    await fs.promises.mkdir(this.directory, { recursive: true });
    const stat = await fs.promises.lstat(this.directory);
    const real = await fs.promises.realpath(this.directory);
    const canonical = (p) =>
      process.platform === "win32" ? p.toLowerCase() : p;
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      canonical(real) !== canonical(this.directory)
    )
      throw failure("UPDATER_DIRECTORY");
    return stat;
  }
  async _verify() {
    if (!this.release) throw failure("UPDATER_NOT_READY");
    await this._directory();
    const file = path.join(this.directory, this.release.name),
      entry = await fs.promises.lstat(file);
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.nlink !== 1 ||
      entry.size !== this.release.size
    )
      throw failure("UPDATER_INTEGRITY");
    const handle = await fs.promises.open(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    try {
      const initial = await handle.stat();
      const same = (a, b) =>
        b.isFile() &&
        b.nlink === 1 &&
        a.dev === b.dev &&
        a.ino === b.ino &&
        a.size === b.size &&
        a.mtimeMs === b.mtimeMs &&
        a.ctimeMs === b.ctimeMs;
      if (!same(entry, initial)) throw failure("UPDATER_INTEGRITY");
      const hash = crypto.createHash("sha256"),
        buffer = Buffer.alloc(64 * 1024);
      let bytes = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        bytes += bytesRead;
        if (bytes > this.release.size) throw failure("UPDATER_INTEGRITY");
        hash.update(buffer.subarray(0, bytesRead));
      }
      if (
        bytes !== this.release.size ||
        hash.digest("hex") !== this.release.digest ||
        !same(initial, await handle.stat()) ||
        !same(initial, await fs.promises.lstat(file))
      )
        throw failure("UPDATER_INTEGRITY");
      return file;
    } finally {
      await handle.close();
    }
  }
  async verifyReady() {
    return this._exclusive("verify", async () => {
      try {
        const file = await this._verify();
        this.ready = true;
        return file;
      } catch {
        this.ready = false;
        throw failure("UPDATER_INTEGRITY");
      }
    });
  }
  async download() {
    return this._exclusive("download", () =>
      this._withTimeout(async (signal, touch) => {
        if (!this.release) throw failure("UPDATER_NOT_AVAILABLE");
        try {
          await this._verify();
          this.ready = true;
          return this.status();
        } catch {}
        this.ready = false;
        await this._directory();
        const destination = path.join(this.directory, this.release.name);
        try {
          await fs.promises.lstat(destination);
          throw failure("UPDATER_EXISTING_FILE");
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        const temporary = path.join(
          this.directory,
          `.partial-${crypto.randomUUID()}`,
        );
        let handle;
        try {
          handle = await fs.promises.open(temporary, "wx", 0o600);
          const initial = await handle.stat();
          const response = await this._request(this.release.url, signal, true);
          const declared = response.headers.get("content-length");
          if (declared && Number(declared) !== this.release.size)
            throw failure("UPDATER_INTEGRITY");
          const hash = crypto.createHash("sha256");
          let bytes = 0;
          touch();
          for await (const chunk of response.body || []) {
            signal.throwIfAborted();
            touch();
            bytes += chunk.length;
            if (bytes > this.release.size) throw failure("UPDATER_INTEGRITY");
            const buffer = Buffer.from(chunk);
            hash.update(buffer);
            let offset = 0;
            while (offset < buffer.length) {
              const { bytesWritten } = await handle.write(
                buffer,
                offset,
                buffer.length - offset,
              );
              if (!bytesWritten) throw failure("UPDATER_FAILED");
              offset += bytesWritten;
            }
          }
          if (
            bytes !== this.release.size ||
            hash.digest("hex") !== this.release.digest
          )
            throw failure("UPDATER_INTEGRITY");
          await handle.sync();
          const entry = await fs.promises.lstat(temporary),
            final = await handle.stat();
          if (
            !entry.isFile() ||
            entry.isSymbolicLink() ||
            entry.nlink !== 1 ||
            entry.ino !== initial.ino ||
            entry.dev !== initial.dev ||
            final.size !== bytes
          )
            throw failure("UPDATER_INTEGRITY");
          await handle.close();
          handle = null;
          await this._directory();
          signal.throwIfAborted();
          await fs.promises.link(temporary, destination);
        } finally {
          await handle?.close();
          try {
            await fs.promises.unlink(temporary);
          } catch {}
        }
        await this._verify();
        this.ready = true;
        return this.status();
      }, true),
    );
  }
}
module.exports = { ReleaseUpdater };
