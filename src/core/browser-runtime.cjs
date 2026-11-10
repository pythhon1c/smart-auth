"use strict";
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const https = require("node:https");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const localManifest = require("./browser-runtime.json");
const flights = new Map();
function abort(signal) {
  if (signal?.aborted) throw new Error("Browser download cancelled.");
}
function safeName(name) {
  if (
    !name ||
    name.includes("\\") ||
    name.includes(":") ||
    name.startsWith("/") ||
    name.includes("\0") ||
    name
      .split("/")
      .some(
        (p) =>
          p === ".." ||
          p === "." ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
  )
    throw new Error("Unsafe browser archive path.");
  return name;
}
async function digest(file) {
  const h = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), h);
  return h.digest("hex");
}
async function regular(file) {
  const s = await fsp.lstat(file, { bigint: true });
  if (!s.isFile() || s.isSymbolicLink())
    throw new Error("Invalid browser installation.");
  return {
    size: Number(s.size),
    signature: [
      s.dev,
      s.ino,
      s.mode,
      s.size,
      s.mtimeNs,
      s.ctimeNs,
      s.birthtimeNs,
    ].join(":"),
  };
}
async function noLinks(root) {
  let current = path.resolve(root);
  for (;;) {
    try {
      if ((await fsp.lstat(current)).isSymbolicLink())
        throw new Error("Unsafe browser runtime directory.");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
async function readAt(handle, length, position) {
  const b = Buffer.alloc(length);
  const { bytesRead } = await handle.read(b, 0, length, position);
  if (bytesRead !== length) throw new Error("Truncated browser archive.");
  return b;
}
// Central directory is bounded; file contents are streamed and inflated with strict output limits.
async function extractZip(archive, destination, manifest, signal) {
  await noLinks(archive);
  await regular(archive);
  await noLinks(destination);
  const handle = await fsp.open(archive, "r");
  try {
    const size = (await handle.stat()).size;
    const tail = await readAt(
      handle,
      Math.min(size, 65557),
      Math.max(0, size - 65557),
    );
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--)
      if (
        tail.readUInt32LE(i) === 0x06054b50 &&
        i + 22 + tail.readUInt16LE(i + 20) === tail.length
      ) {
        end = i;
        break;
      }
    if (end < 0) throw new Error("Invalid browser ZIP directory.");
    const count = tail.readUInt16LE(end + 10),
      cdSize = tail.readUInt32LE(end + 12),
      offset = tail.readUInt32LE(end + 16);
    if (
      tail.readUInt16LE(end + 4) !== 0 ||
      tail.readUInt16LE(end + 6) !== 0 ||
      tail.readUInt16LE(end + 8) !== count ||
      count === 65535 ||
      count > 10000 ||
      cdSize > 16 * 1024 * 1024 ||
      offset + cdSize > size - tail.length + end
    )
      throw new Error("Unsupported browser ZIP directory.");
    const cd = await readAt(handle, cdSize, offset);
    let cursor = 0,
      total = 0;
    const entries = [],
      seen = new Set();
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > cd.length || cd.readUInt32LE(cursor) !== 0x02014b50)
        throw new Error("Invalid browser ZIP entry.");
      const flags = cd.readUInt16LE(cursor + 8),
        method = cd.readUInt16LE(cursor + 10),
        compressed = cd.readUInt32LE(cursor + 20),
        uncompressed = cd.readUInt32LE(cursor + 24),
        n = cd.readUInt16LE(cursor + 28),
        extra = cd.readUInt16LE(cursor + 30),
        comment = cd.readUInt16LE(cursor + 32),
        attrs = cd.readUInt32LE(cursor + 38),
        local = cd.readUInt32LE(cursor + 42);
      const next = cursor + 46 + n + extra + comment;
      if (next > cd.length) throw new Error("Truncated browser ZIP entry.");
      const name = safeName(
        cd.subarray(cursor + 46, cursor + 46 + n).toString("utf8"),
      );
      const directory = name.endsWith("/");
      const key = name.toLowerCase();
      if (seen.has(key)) throw new Error("Duplicate browser ZIP entry.");
      seen.add(key);
      const mode = (attrs >>> 16) & 0xf000;
      if (
        flags & 1 ||
        ![0, 8].includes(method) ||
        (mode && mode !== 0x8000 && mode !== 0x4000) ||
        local + 30 + compressed > offset ||
        uncompressed > 1024 * 1024 * 1024 ||
        (compressed === 0 && uncompressed !== 0) ||
        (compressed > 0 && uncompressed / compressed > 2000)
      )
        throw new Error("Unsafe browser ZIP entry.");
      total += uncompressed;
      if (total > 2 * 1024 * 1024 * 1024)
        throw new Error("Browser ZIP exceeds size limit.");
      if (
        !directory &&
        (!Object.hasOwn(manifest.files, name) ||
          manifest.files[name].size !== uncompressed)
      )
        throw new Error("Unexpected browser ZIP file.");
      entries.push({
        name,
        directory,
        flags,
        method,
        compressed,
        uncompressed,
        local,
      });
      cursor = next;
    }
    if (
      cursor !== cd.length ||
      entries.filter((e) => !e.directory).length !==
        Object.keys(manifest.files).length
    )
      throw new Error("Incomplete browser ZIP package.");
    for (const e of entries) {
      abort(signal);
      const dest = path.join(destination, ...e.name.split("/"));
      if (e.directory) {
        await fsp.mkdir(dest, { recursive: true });
        continue;
      }
      const header = await readAt(handle, 30, e.local);
      if (
        header.readUInt32LE(0) !== 0x04034b50 ||
        header.readUInt16LE(8) !== e.method ||
        header.readUInt16LE(6) !== e.flags
      )
        throw new Error("Invalid browser ZIP header.");
      const nameLength = header.readUInt16LE(26),
        extraLength = header.readUInt16LE(28);
      const name = await readAt(handle, nameLength, e.local + 30);
      if (name.toString("utf8") !== e.name)
        throw new Error("Mismatched browser ZIP path.");
      const start = e.local + 30 + nameLength + extraLength;
      if (start + e.compressed > offset)
        throw new Error("Invalid browser ZIP data.");
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      let written = 0;
      const hash = crypto.createHash("sha256");
      const limit = new Transform({
        transform(chunk, encoding, callback) {
          written += chunk.length;
          if (written > e.uncompressed)
            return callback(new Error("Browser ZIP exceeds declared size."));
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      if (e.compressed === 0)
        await fsp.writeFile(dest, Buffer.alloc(0), { flag: "wx" });
      else {
        const streams = [
          fs.createReadStream(archive, {
            start,
            end: start + e.compressed - 1,
          }),
        ];
        if (e.method === 8) streams.push(zlib.createInflateRaw());
        streams.push(limit, fs.createWriteStream(dest, { flags: "wx" }));
        await pipeline(...streams, { signal });
      }
      if (
        written !== e.uncompressed ||
        hash.digest("hex") !== manifest.files[e.name].sha256
      )
        throw new Error("Browser extracted file verification failed.");
    }
  } finally {
    await handle.close();
  }
}
async function download({ url, destination, totalBytes, onProgress, signal }) {
  abort(signal);
  await new Promise((resolve, reject) => {
    let received = 0;
    let response;
    let bodyStarted = false;
    const req = https.get(url, { signal }, (res) => {
      response = res;
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error("Google browser download failed."));
        return;
      }
      const length = Number(res.headers["content-length"]);
      if (length !== totalBytes) {
        res.destroy();
        reject(new Error("Browser download size does not match."));
        return;
      }
      const meter = new Transform({
        transform(chunk, encoding, callback) {
          received += chunk.length;
          if (received > totalBytes)
            return callback(
              new Error("Browser download exceeds expected size."),
            );
          onProgress(received);
          callback(null, chunk);
        },
      });
      bodyStarted = true;
      pipeline(res, meter, fs.createWriteStream(destination, { flags: "wx" }), {
        signal,
      }).then(
        () =>
          received === totalBytes
            ? resolve()
            : reject(new Error("Browser download was truncated.")),
        reject,
      );
    });
    req.setTimeout(30000, () =>
      req.destroy(new Error("Browser download timed out.")),
    );
    req.on("error", (error) => {
      if (bodyStarted) response.destroy(error);
      else reject(error);
    });
  });
}
class BrowserRuntimeInstaller {
  constructor({
    root,
    manifest = localManifest,
    downloader = download,
    extractor = extractZip,
  } = {}) {
    if (!root || !path.isAbsolute(root))
      throw new Error("Browser runtime root must be absolute.");
    this.root = path.resolve(root);
    this.manifest = structuredClone(manifest);
    this.downloader = downloader;
    this.extractor = extractor;
    this.verifiedFiles = new Map();
    this.inspection = null;
    const m = this.manifest;
    if (
      !/^\d+\.\d+\.\d+\.\d+$/.test(m.version) ||
      !Number.isSafeInteger(m.archiveBytes) ||
      m.archiveBytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(m.archiveSha256) ||
      m.url !==
        `https://storage.googleapis.com/chrome-for-testing-public/${m.version}/win64/chrome-win64.zip`
    )
      throw new Error("Invalid browser runtime manifest.");
    safeName(m.executable);
    for (const [name, f] of Object.entries(m.files)) {
      safeName(name);
      if (
        !Number.isSafeInteger(f.size) ||
        f.size < 0 ||
        !/^[a-f0-9]{64}$/.test(f.sha256)
      )
        throw new Error("Invalid browser file manifest.");
    }
    if (!Object.hasOwn(m.files, m.executable))
      throw new Error("Missing browser executable manifest.");
    this.directory = path.join(this.root, `chrome-${m.version}-win64`);
  }
  runtime() {
    return {
      root: this.directory,
      executablePath: path.join(
        this.directory,
        ...this.manifest.executable.split("/"),
      ),
      version: this.manifest.version,
      revision: this.manifest.revision,
    };
  }
  inspect() {
    if (!this.inspection)
      this.inspection = this._inspect(this.directory).finally(() => {
        this.inspection = null;
      });
    return this.inspection;
  }
  async _inspect(directory) {
    const base = {
      version: this.manifest.version,
      downloadBytes: this.manifest.archiveBytes,
    };
    try {
      await noLinks(directory);
      try {
        await fsp.lstat(directory);
      } catch (e) {
        if (e.code === "ENOENT") return { ...base, state: "missing" };
        throw e;
      }
      const expected = new Set(Object.keys(this.manifest.files));
      const walk = async (dir, prefix = "") => {
        for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
          const name = prefix + entry.name,
            file = path.join(dir, entry.name);
          if (entry.isSymbolicLink())
            throw new Error("Invalid browser installation.");
          if (entry.isDirectory()) await walk(file, name + "/");
          else {
            if (!expected.delete(name))
              throw new Error("Unexpected browser installation file.");
            const s = await regular(file);
            const pin = this.manifest.files[name];
            if (s.size !== pin.size)
              throw new Error("Corrupt browser installation.");
            // Memory-only hash cache: every inspection still walks and stats every file.
            // Restarts always hash again; even preserved mtimes cannot hide changed ctimes.
            if (this.verifiedFiles.get(file) !== s.signature) {
              if (
                (await digest(file)) !== pin.sha256 ||
                (await regular(file)).signature !== s.signature
              )
                throw new Error("Corrupt browser installation.");
              this.verifiedFiles.set(file, s.signature);
            }
          }
        }
      };
      await walk(directory);
      if (expected.size) throw new Error("Incomplete browser installation.");
      return { ...base, state: "ready" };
    } catch {
      this.verifiedFiles.clear();
      return { ...base, state: "invalid" };
    }
  }
  async resolve() {
    if ((await this.inspect()).state !== "ready")
      throw new Error(
        "Browser runtime is not installed or failed verification.",
      );
    return this.runtime();
  }
  install({ acceptedTerms, onProgress = () => {}, signal } = {}) {
    if (acceptedTerms !== true)
      return Promise.reject(
        new Error("Browser download requires accepting Google Chrome terms."),
      );
    if (flights.has(this.directory)) return flights.get(this.directory);
    const operation = this._install(onProgress, signal)
      .catch((error) => {
        if (
          /^(Browser |Google browser |Unsafe browser |Invalid browser |Unsupported browser |Unexpected browser |Incomplete browser |Duplicate browser |Truncated browser |Mismatched browser |Corrupt browser |Missing browser )/.test(
            error.message,
          )
        )
          throw error;
        throw new Error("Browser installation failed. Please retry.");
      })
      .finally(() => flights.delete(this.directory));
    flights.set(this.directory, operation);
    return operation;
  }
  async _install(onProgress, signal) {
    const m = this.manifest;
    const progress = (phase, receivedBytes) => {
      try {
        onProgress({
          phase,
          receivedBytes,
          totalBytes: m.archiveBytes,
          percent: Math.floor((receivedBytes / m.archiveBytes) * 100),
        });
      } catch {}
    };
    abort(signal);
    if ((await this.inspect()).state === "ready") {
      progress("ready", m.archiveBytes);
      return this.runtime();
    }
    await noLinks(this.root);
    await fsp.mkdir(this.root, { recursive: true });
    await noLinks(this.root);
    const stage = await fsp.mkdtemp(path.join(this.root, ".chrome-install-"));
    const archive = path.join(stage, "archive.zip"),
      payload = path.join(stage, "payload");
    const timeout = AbortSignal.timeout(10 * 60 * 1000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        abort(combined);
        await fsp.rm(archive, { force: true });
        progress("downloading", 0);
        try {
          await this.downloader({
            url: m.url,
            destination: archive,
            totalBytes: m.archiveBytes,
            onProgress: (bytes) => progress("downloading", bytes),
            signal: combined,
          });
          break;
        } catch (e) {
          abort(combined);
          if (attempt === 2)
            throw new Error("Google browser download failed. Please retry.");
        }
      }
      abort(combined);
      progress("verifying", m.archiveBytes);
      if (
        (await regular(archive)).size !== m.archiveBytes ||
        (await digest(archive)) !== m.archiveSha256
      )
        throw new Error("Browser download verification failed. Please retry.");
      abort(combined);
      progress("extracting", m.archiveBytes);
      await fsp.mkdir(payload);
      await this.extractor(archive, payload, m, combined);
      // Check the result even when an alternative extraction implementation is injected.
      const status = await this._inspect(payload);
      if (status.state !== "ready")
        throw new Error("Browser installation verification failed.");
      abort(combined);
      await noLinks(this.root);
      await noLinks(this.directory);
      // Quarantine only this exact version; other app data is never traversed or removed.
      const old = path.join(stage, "previous");
      try {
        await fsp.rename(this.directory, old);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      try {
        await fsp.rename(payload, this.directory);
      } catch (e) {
        try {
          await fsp.rename(old, this.directory);
        } catch {}
        throw e;
      }
      progress("ready", m.archiveBytes);
      return this.runtime();
    } catch (e) {
      if (combined.aborted)
        throw new Error(
          signal?.aborted
            ? "Browser download cancelled."
            : "Browser download timed out.",
        );
      throw e;
    } finally {
      // Verify the exact resolved deletion target immediately before recursive removal.
      await noLinks(this.root);
      await noLinks(stage);
      const resolvedRoot = await fsp.realpath(this.root);
      const resolvedStage = await fsp.realpath(stage);
      if (
        path.dirname(resolvedStage) !== resolvedRoot ||
        !path.basename(resolvedStage).startsWith(".chrome-install-") ||
        path.resolve(stage) !== path.join(this.root, path.basename(stage))
      )
        throw new Error("Unsafe browser runtime cleanup path.");
      await fsp.rm(resolvedStage, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  }
}
module.exports = { BrowserRuntimeInstaller, extractZip, download };
