"use strict";
const localeText = require("../locales/application.json");
// Protocol references: Chromium components/crx_file/crx3.proto and crx_verifier.cc.
// Packages are verified and unpacked as data; this module never executes them.
const fs = require("node:fs"),
  path = require("node:path"),
  https = require("node:https"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib");
const DEFAULT_EXTENSION_ID = "cikfmbllbfiplfpllhbomapngmcedglo";
const DEFAULT_EXTENSION_URL = `https://chromewebstore.google.com/detail/smart-trader-trading-tool/${DEFAULT_EXTENSION_ID}`;
const PUBLISHER_HASH =
  "61f7f2a6bfcf74cd0bc1fe2497cc9b04254c658f79f2145392867ea8366367cf";
const MAX_CRX = 64 * 1024 * 1024,
  MAX_TOTAL = 128 * 1024 * 1024,
  MAX_FILE = 16 * 1024 * 1024;
const ID = /^[a-p]{32}$/;
function fail(message = localeText.extensionSecurityVerificationFailed) {
  throw Error(message);
}
function need(ok, message) {
  if (!ok) fail(message);
}
function normalizeExtension(value) {
  need(
    typeof value === "string" && value.length <= 1024,
    localeText.enterAChromeWebStoreIDOrHTTPSLink,
  );
  let id = value.trim();
  if (!ID.test(id)) {
    let url;
    try {
      url = new URL(id);
    } catch {
      fail(localeText.invalidChromeWebStoreLink);
    }
    need(
      url.protocol === "https:" &&
        url.hostname === "chromewebstore.google.com" &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
      localeText.onlyACanonicalChromeWebStoreHTTPSLinkIsAllowed,
    );
    const match = /^\/detail\/([a-zA-Z0-9_-]{1,200})\/([a-p]{32})$/.exec(
      url.pathname,
    );
    need(match && url.href === id, localeText.invalidChromeWebStoreLink);
    id = match[2];
  }
  return {
    id,
    url:
      id === DEFAULT_EXTENSION_ID
        ? DEFAULT_EXTENSION_URL
        : `https://chromewebstore.google.com/detail/extension/${id}`,
  };
}
function normalizeExtensions(values) {
  need(
    Array.isArray(values) && values.length <= 20,
    localeText.upTo20ExtensionsAreAllowed,
  );
  const seen = new Set();
  return values
    .map((value) =>
      normalizeExtension(
        typeof value === "object" && value ? value.url || value.id : value,
      ),
    )
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}
function protobuf(bytes) {
  let offset = 0,
    count = 0;
  const fields = new Map();
  const integer = () => {
    let value = 0,
      scale = 1;
    for (let n = 0; n < 5; n++) {
      need(offset < bytes.length);
      const byte = bytes[offset++];
      value += (byte & 127) * scale;
      need(Number.isSafeInteger(value));
      if (!(byte & 128)) return value;
      scale *= 128;
    }
    fail();
  };
  while (offset < bytes.length) {
    need(++count <= 128);
    const tag = integer(),
      number = Math.floor(tag / 8),
      wire = tag & 7;
    need(number > 0);
    if (wire === 2) {
      const length = integer();
      need(length <= bytes.length - offset);
      const value = bytes.subarray(offset, offset + length);
      offset += length;
      const values = fields.get(number) || [];
      values.push(value);
      fields.set(number, values);
    } else if (wire === 0) integer();
    else if (wire === 1 || wire === 5) {
      offset += wire === 1 ? 8 : 4;
      need(offset <= bytes.length);
    } else fail();
  }
  return fields;
}
function one(fields, number) {
  const values = fields.get(number);
  need(values?.length === 1);
  return values[0];
}
function keyId(bytes) {
  return crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}
function verifyCrx3(
  bytes,
  expectedId,
  { publisherHash = PUBLISHER_HASH } = {},
) {
  need(
    Buffer.isBuffer(bytes) &&
      bytes.length >= 34 &&
      bytes.length <= MAX_CRX &&
      ID.test(expectedId),
  );
  need(bytes.toString("ascii", 0, 4) === "Cr24" && bytes.readUInt32LE(4) === 3);
  const length = bytes.readUInt32LE(8);
  need(length > 0 && length <= 1024 * 1024 && length < bytes.length - 12);
  const header = bytes.subarray(12, 12 + length),
    archive = bytes.subarray(12 + length);
  for (const token of ["504b0506", "504b0607", "504b0606"])
    need(!header.includes(Buffer.from(token, "hex")));
  const fields = protobuf(header),
    signed = one(fields, 10000),
    declared = one(protobuf(signed), 1);
  need(
    declared.length === 16 &&
      declared
        .toString("hex")
        .replace(/[0-9a-f]/g, (c) =>
          String.fromCharCode(97 + parseInt(c, 16)),
        ) === expectedId,
  );
  const size = Buffer.alloc(4);
  size.writeUInt32LE(signed.length);
  const chunks = [Buffer.from("CRX3 SignedData\0"), size, signed, archive];
  let developerKey,
    publisher = false,
    proofs = 0;
  for (const [number, type] of [
    [2, "rsa"],
    [3, "ec"],
  ])
    for (const proof of fields.get(number) || []) {
      need(++proofs <= 16);
      const data = protobuf(proof),
        key = one(data, 1),
        signature = one(data, 2);
      need(key.length <= 16384 && signature.length <= 16384);
      let publicKey;
      try {
        publicKey = crypto.createPublicKey({
          key,
          format: "der",
          type: "spki",
        });
      } catch {
        fail();
      }
      need(publicKey.asymmetricKeyType === type);
      if (type === "ec")
        need(publicKey.asymmetricKeyDetails?.namedCurve === "prime256v1");
      const verifier = crypto.createVerify("sha256");
      for (const chunk of chunks) verifier.update(chunk);
      need(
        verifier.verify(
          {
            key: publicKey,
            ...(type === "rsa"
              ? { padding: crypto.constants.RSA_PKCS1_PADDING }
              : {}),
          },
          signature,
        ),
      );
      if (keyId(key) === expectedId) developerKey = key;
      if (
        crypto.createHash("sha256").update(key).digest("hex") === publisherHash
      )
        publisher = true;
    }
  need(developerKey && publisher, localeText.message_8bbe897);
  return {
    archive,
    publicKey: developerKey.toString("base64"),
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function safeName(name) {
  need(
    typeof name === "string" &&
      name.length > 0 &&
      name.length <= 240 &&
      !/[\\:\x00-\x1f\x7f]/.test(name) &&
      !name.startsWith("/"),
  );
  const clean = name.endsWith("/") ? name.slice(0, -1) : name;
  need(
    clean &&
      clean
        .split("/")
        .every(
          (part) =>
            part &&
            part !== "." &&
            part !== ".." &&
            !/[. ]$/.test(part) &&
            !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
        ),
  );
  return clean;
}
function unpackZip(bytes) {
  need(Buffer.isBuffer(bytes) && bytes.length <= MAX_CRX);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  need(
    end >= 0 &&
      bytes.readUInt16LE(end + 4) === 0 &&
      bytes.readUInt16LE(end + 6) === 0,
  );
  const count = bytes.readUInt16LE(end + 10),
    centralSize = bytes.readUInt32LE(end + 12),
    central = bytes.readUInt32LE(end + 16);
  need(
    count > 0 &&
      count <= 10000 &&
      bytes.readUInt16LE(end + 8) === count &&
      central + centralSize === end,
  );
  let at = central,
    total = 0;
  const entries = [],
    names = new Set(),
    ranges = [];
  for (let i = 0; i < count; i++) {
    need(at + 46 <= end && bytes.readUInt32LE(at) === 0x02014b50);
    const flags = bytes.readUInt16LE(at + 8),
      method = bytes.readUInt16LE(at + 10),
      crc = bytes.readUInt32LE(at + 16),
      compressed = bytes.readUInt32LE(at + 20),
      size = bytes.readUInt32LE(at + 24),
      nameSize = bytes.readUInt16LE(at + 28),
      extraSize = bytes.readUInt16LE(at + 30),
      commentSize = bytes.readUInt16LE(at + 32),
      local = bytes.readUInt32LE(at + 42);
    need(
      !(flags & ~0x080e) &&
        !(flags & 1) &&
        [0, 8].includes(method) &&
        bytes.readUInt16LE(at + 34) === 0 &&
        at + 46 + nameSize + extraSize + commentSize <= end &&
        compressed !== 0xffffffff &&
        size <= MAX_FILE,
    );
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameSize);
    let name;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    } catch {
      fail();
    }
    if (!(flags & 0x800)) need([...nameBytes].every((b) => b < 128));
    const clean = safeName(name),
      directory = name.endsWith("/"),
      fold = clean.toLowerCase();
    need(!names.has(fold));
    names.add(fold);
    const mode = bytes.readUInt32LE(at + 38) >>> 16,
      type = mode & 0xf000;
    need(type === 0 || type === (directory ? 0x4000 : 0x8000));
    let extra = at + 46 + nameSize;
    while (extra < at + 46 + nameSize + extraSize) {
      need(extra + 4 <= at + 46 + nameSize + extraSize);
      const tag = bytes.readUInt16LE(extra),
        len = bytes.readUInt16LE(extra + 2);
      need(tag !== 1);
      extra += 4 + len;
      need(extra <= at + 46 + nameSize + extraSize);
    }
    need(
      local + 30 <= central &&
        bytes.readUInt32LE(local) === 0x04034b50 &&
        bytes.readUInt16LE(local + 6) === flags &&
        bytes.readUInt16LE(local + 8) === method,
    );
    const localName = bytes.readUInt16LE(local + 26),
      localExtra = bytes.readUInt16LE(local + 28),
      begin = local + 30 + localName + localExtra;
    need(
      localName === nameSize &&
        bytes.subarray(local + 30, local + 30 + localName).equals(nameBytes) &&
        begin + compressed <= central,
    );
    if (!(flags & 8))
      need(
        bytes.readUInt32LE(local + 14) === crc &&
          bytes.readUInt32LE(local + 18) === compressed &&
          bytes.readUInt32LE(local + 22) === size,
      );
    need(!directory || size === 0);
    total += size;
    need(total <= MAX_TOTAL && size <= Math.max(1024 * 1024, compressed * 500));
    let content;
    try {
      content =
        method === 0
          ? Buffer.from(bytes.subarray(begin, begin + compressed))
          : zlib.inflateRawSync(bytes.subarray(begin, begin + compressed), {
              maxOutputLength: Math.max(1, size),
            });
    } catch {
      fail();
    }
    need(content.length === size && crc32(content) === crc);
    entries.push({ name: clean, directory, content });
    ranges.push([local, begin + compressed]);
    at += 46 + nameSize + extraSize + commentSize;
  }
  need(at === end);
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++)
    need(ranges[i][0] >= ranges[i - 1][1]);
  const files = new Set(
    entries.filter((e) => !e.directory).map((e) => e.name.toLowerCase()),
  );
  for (const entry of entries) {
    const parts = entry.name.toLowerCase().split("/");
    parts.pop();
    while (parts.length) {
      need(!files.has(parts.join("/")));
      parts.pop();
    }
  }
  return entries;
}
function validateManifest(entries, publicKey) {
  const file = entries.find((e) => e.name === "manifest.json" && !e.directory);
  need(file && file.content.length <= 1024 * 1024);
  let manifest;
  try {
    manifest = JSON.parse(file.content.toString("utf8"));
  } catch {
    fail();
  }
  need(
    manifest &&
      typeof manifest === "object" &&
      !Array.isArray(manifest) &&
      manifest.manifest_version === 3 &&
      typeof manifest.name === "string" &&
      manifest.name.length <= 256 &&
      typeof manifest.version === "string" &&
      /^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(manifest.version) &&
      manifest.version.split(".").every((n) => Number(n) <= 65535),
    localeText.message_24c78c3,
  );
  for (const field of ["permissions", "optional_permissions"])
    if (manifest[field] !== undefined) {
      need(
        Array.isArray(manifest[field]) &&
          manifest[field].every((p) => typeof p === "string"),
      );
      need(
        !manifest[field].some((p) =>
          [
            "proxy",
            "nativeMessaging",
            "debugger",
            "management",
            "vpnProvider",
          ].includes(p),
        ),
        localeText.message_6e34f03,
      );
    }
  need(
    !manifest.chrome_settings_overrides && !manifest.devtools_page,
    localeText.message_2351e7f,
  );
  if (manifest.key !== undefined) need(manifest.key === publicKey);
  // An unpacked extension otherwise receives a new path-derived ID.
  manifest.key = publicKey;
  file.content = Buffer.from(JSON.stringify(manifest, null, 2));
  // Chromium deletes generated metadata when loading unpacked extensions. Do
  // not materialize it: otherwise Chromium's own cleanup changes our cache.
  for (let i = entries.length - 1; i >= 0; i--)
    if (
      entries[i].name === "_metadata" ||
      entries[i].name.startsWith("_metadata/")
    )
      entries.splice(i, 1);
  return manifest;
}
function downloadUrl(id, chromiumVersion) {
  need(
    ID.test(id) && /^\d+(?:\.\d+){1,3}$/.test(chromiumVersion),
    localeText.message_29439e2,
  );
  const url = new URL("https://clients2.google.com/service/update2/crx");
  for (const [k, v] of Object.entries({
    response: "redirect",
    prodversion: chromiumVersion,
    acceptformat: "crx3",
    prod: "chromiumcrx",
    os: "win",
    arch: "x64",
    x: `id=${id}&installsource=ondemand&uc`,
  }))
    url.searchParams.set(k, v);
  return url.href;
}
function officialUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail();
  }
  need(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      ((url.hostname === "clients2.google.com" &&
        url.pathname === "/service/update2/crx") ||
        (["clients2.googleusercontent.com", "clients2.google.com"].includes(
          url.hostname,
        ) &&
          url.pathname.startsWith("/crx/")) ||
        (/^([a-z0-9-]+\.)?gvt1\.com$/.test(url.hostname) &&
          url.pathname.startsWith("/crx/"))),
  );
  return url;
}
async function downloadOfficial(url, { signal } = {}) {
  for (let redirects = 0; redirects <= 5; redirects++) {
    const target = officialUrl(url);
    const result = await new Promise((resolve, reject) => {
      const req = https.get(
        target,
        {
          signal,
          headers: {
            "User-Agent": "smart-auth extension package downloader",
            Accept: "application/x-chrome-extension,application/octet-stream",
            "Accept-Encoding": "identity",
          },
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            const location = res.headers.location;
            res.resume();
            if (!location) return reject(Error(localeText.message_5b23883));
            try {
              resolve({
                redirect: officialUrl(new URL(location, target).href).href,
              });
            } catch {
              reject(Error(localeText.message_4f964d0));
            }
            return;
          }
          if (
            res.statusCode !== 200 ||
            (res.headers["content-encoding"] &&
              res.headers["content-encoding"] !== "identity") ||
            Number(res.headers["content-length"] || 0) > MAX_CRX
          ) {
            res.destroy();
            return reject(Error(localeText.message_da9acb1));
          }
          let size = 0;
          const chunks = [];
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_CRX) res.destroy(Error(localeText.message_892af41));
            else chunks.push(chunk);
          });
          res.once("error", reject);
          res.once("end", () => resolve({ bytes: Buffer.concat(chunks) }));
        },
      );
      const deadline = setTimeout(
        () => req.destroy(Error(localeText.message_61e113f)),
        45000,
      );
      deadline.unref();
      req.once("close", () => clearTimeout(deadline));
      req.setTimeout(30000, () =>
        req.destroy(Error(localeText.message_61e113f)),
      );
      req.once("error", () =>
        reject(
          Error(
            signal?.aborted
              ? localeText.message_cddadab
              : localeText.message_abf1b1f,
          ),
        ),
      );
    });
    if (result.bytes) return result.bytes;
    url = result.redirect;
  }
  fail(localeText.message_67cb857);
}
function checkedDirectory(dir) {
  const resolved = path.resolve(dir);
  let current = path.parse(resolved).root;
  for (const part of resolved
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current))
      need(
        fs.lstatSync(current).isDirectory() &&
          !fs.lstatSync(current).isSymbolicLink(),
      );
    else fs.mkdirSync(current);
  }
  return resolved;
}
function readPackage(file) {
  const stat = fs.lstatSync(file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_CRX);
  return fs.readFileSync(file);
}
function verifyTree(root, entries) {
  const expected = new Map(
    entries.filter((e) => !e.directory).map((e) => [e.name, e.content]),
  );
  const seen = new Set();
  let count = 0;
  function walk(dir, relative = "") {
    for (const name of fs.readdirSync(dir)) {
      need(++count <= 20000);
      const full = path.join(dir, name),
        rel = relative ? relative + "/" + name : name,
        stat = fs.lstatSync(full);
      need(!stat.isSymbolicLink());
      if (stat.isDirectory()) walk(full, rel);
      else {
        need(
          stat.isFile() &&
            expected.has(rel) &&
            stat.size === expected.get(rel).length &&
            fs.readFileSync(full).equals(expected.get(rel)),
        );
        seen.add(rel);
      }
    }
  }
  walk(root);
  need(seen.size === expected.size);
}
class BrowserExtensionManager {
  constructor({ cacheDir, chromiumVersion, download = downloadOfficial }) {
    need(
      typeof cacheDir === "string" &&
        !cacheDir.includes(",") &&
        typeof download === "function",
    );
    this.cacheDir = path.resolve(cacheDir);
    this.chromiumVersion = chromiumVersion;
    this.download = download;
    this.tail = Promise.resolve();
  }
  prepare(values, options = {}) {
    const task = this.tail.then(() => this._prepare(values, options));
    this.tail = task.catch(() => {});
    return task;
  }
  async _prepare(values, { signal, refresh = false } = {}) {
    const selected = normalizeExtensions(values),
      extensions = [],
      errors = [];
    checkedDirectory(this.cacheDir);
    for (const descriptor of selected) {
      try {
        if (signal?.aborted) fail(localeText.message_cddadab);
        const dir = checkedDirectory(path.join(this.cacheDir, descriptor.id)),
          packageFile = path.join(dir, "package.crx");
        const cached = !refresh && fs.existsSync(packageFile),
          bytes = cached
            ? readPackage(packageFile)
            : await this.download(
                downloadUrl(descriptor.id, this.chromiumVersion),
                { signal },
              );
        if (signal?.aborted) fail(localeText.message_cddadab);
        const verified = verifyCrx3(bytes, descriptor.id),
          entries = unpackZip(verified.archive),
          manifest = validateManifest(entries, verified.publicKey),
          destination = path.join(dir, verified.sha256);
        if (manifest.minimum_chrome_version !== undefined) {
          need(
            typeof manifest.minimum_chrome_version === "string" &&
              /^\d+(?:\.\d+){0,3}$/.test(manifest.minimum_chrome_version) &&
              typeof this.chromiumVersion === "string" &&
              /^\d+(?:\.\d+){1,3}$/.test(this.chromiumVersion),
          );
          const minimum = manifest.minimum_chrome_version
              .split(".")
              .map(Number),
            current = this.chromiumVersion.split(".").map(Number);
          let compatible = true;
          for (let i = 0; i < 4; i++) {
            if ((current[i] || 0) > (minimum[i] || 0)) break;
            if ((current[i] || 0) < (minimum[i] || 0)) {
              compatible = false;
              break;
            }
          }
          need(compatible, localeText.message_761f3c7);
        }
        if (fs.existsSync(destination)) {
          need(
            fs.lstatSync(destination).isDirectory() &&
              !fs.lstatSync(destination).isSymbolicLink(),
          );
          verifyTree(destination, entries);
        } else {
          const temp = fs.mkdtempSync(path.join(dir, "unpack-"));
          try {
            for (const entry of entries) {
              const file = path.join(temp, ...entry.name.split("/"));
              if (entry.directory) fs.mkdirSync(file, { recursive: true });
              else {
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, entry.content, {
                  flag: "wx",
                  mode: 0o600,
                });
              }
            }
            fs.renameSync(temp, destination);
          } finally {
            if (fs.existsSync(temp))
              fs.rmSync(temp, { recursive: true, force: true });
          }
        }
        if (!cached) {
          const temp = path.join(
            dir,
            "package-" + crypto.randomUUID() + ".tmp",
          );
          try {
            fs.writeFileSync(temp, bytes, { flag: "wx", mode: 0o600 });
            fs.renameSync(temp, packageFile);
          } finally {
            if (fs.existsSync(temp)) fs.unlinkSync(temp);
          }
        }
        extensions.push({
          ...descriptor,
          path: destination,
          version: manifest.version,
        });
      } catch (error) {
        errors.push({
          id: descriptor.id,
          message:
            error.message.startsWith(localeText.message_ddeef3c) ||
            error.message.startsWith(localeText.message_d382957) ||
            error.message.startsWith(localeText.message_3f35c20) ||
            error.message.includes("Chrome Web Store") ||
            error.message.startsWith(localeText.message_7558ec2)
              ? error.message
              : localeText.message_0244530,
        });
      }
    }
    return { paths: extensions.map((e) => e.path), extensions, errors };
  }
}
module.exports = {
  DEFAULT_EXTENSION_ID,
  DEFAULT_EXTENSION_URL,
  normalizeExtension,
  normalizeExtensions,
  BrowserExtensionManager,
  verifyCrx3,
  unpackZip,
  validateManifest,
  downloadUrl,
  downloadOfficial,
  checkedDirectory,
  readPackage,
  verifyTree,
};
