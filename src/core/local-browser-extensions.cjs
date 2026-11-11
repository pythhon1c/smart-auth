"use strict";
// Local packages are deliberately isolated from verified Web Store packages.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const {
  unpackZip,
  checkedDirectory,
  readPackage,
  verifyTree,
  DEFAULT_EXTENSION_ID,
} = require("./browser-extensions.cjs");
const ID = /^[a-p]{32}$/,
  HASH = /^[a-f0-9]{64}$/;
function check(ok, message = "Invalid local extension package.") {
  if (!ok) {
    const error = Error(message);
    error.code = /conflicts/.test(message)
      ? "ZIP_COLLISION"
      : /supported|newer/.test(message)
        ? "ZIP_INCOMPATIBLE"
        : /limit/.test(message)
          ? "ZIP_LIMIT"
          : "ZIP_INVALID";
    throw error;
  }
}
function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function extensionId(key) {
  return hash(Buffer.from(key, "base64"))
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}
function validDisplayName(name) {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.length <= 256 &&
    !/[\x00-\x1f\x7f]/.test(name)
  );
}
function displayName(manifest, entries) {
  check(validDisplayName(manifest.name));
  const token = /^__MSG_([A-Za-z0-9_@]+)__$/.exec(manifest.name);
  if (!token) return manifest.name;
  const unsupported =
    "Localized extension name is not supported by this package. Check its default locale messages.";
  check(
    typeof manifest.default_locale === "string" &&
      /^[A-Za-z]{2,3}(?:_[A-Za-z0-9]{2,8})?$/.test(manifest.default_locale),
    unsupported,
  );
  const file = entries.find(
    (entry) =>
      entry.name === `_locales/${manifest.default_locale}/messages.json` &&
      !entry.directory,
  );
  check(file && file.content.length <= 1024 * 1024, unsupported);
  let messages;
  try {
    messages = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(file.content),
    );
  } catch {
    check(false, unsupported);
  }
  check(
    messages && typeof messages === "object" && !Array.isArray(messages),
    unsupported,
  );
  const keys = Object.keys(messages).filter(
    (key) => key.toLowerCase() === token[1].toLowerCase(),
  );
  check(keys.length === 1, unsupported);
  const descriptor = messages[keys[0]];
  // Chrome message placeholders need caller substitutions, unavailable for the
  // app's display label. Reject rather than expose an unresolved token.
  check(
    descriptor &&
      typeof descriptor === "object" &&
      !Array.isArray(descriptor) &&
      validDisplayName(descriptor.message) &&
      !/\$|__MSG_/i.test(descriptor.message),
    unsupported,
  );
  return descriptor.message;
}
function validateLocalArchive(
  bytes,
  { chromiumVersion = "0", supportedManifestVersions = [3] } = {},
) {
  let entries = unpackZip(bytes);
  let file = entries.find((e) => e.name === "manifest.json" && !e.directory);
  if (!file) {
    const manifests = entries.filter(
      (e) => /^[^/]+\/manifest\.json$/.test(e.name) && !e.directory,
    );
    check(
      manifests.length === 1,
      "ZIP must contain one extension at its root or in one wrapping folder.",
    );
    const prefix = manifests[0].name.split("/")[0] + "/";
    check(
      entries.every(
        (e) =>
          (e.name === prefix.slice(0, -1) && e.directory) ||
          e.name.startsWith(prefix),
      ),
      "ZIP contains files outside the extension folder.",
    );
    entries = entries
      .filter((e) => e.name.startsWith(prefix))
      .map((e) => ({ ...e, name: e.name.slice(prefix.length) }));
    file = entries.find((e) => e.name === "manifest.json");
  }
  check(file.content.length <= 1024 * 1024);
  let manifest;
  try {
    manifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(file.content),
    );
  } catch {
    check(false);
  }
  check(manifest && typeof manifest === "object" && !Array.isArray(manifest));
  check(
    [2, 3].includes(manifest.manifest_version) &&
      supportedManifestVersions.includes(manifest.manifest_version),
    "Extension manifest version is not supported by this browser.",
  );
  check(
    typeof manifest.name === "string" &&
      manifest.name.trim().length > 0 &&
      manifest.name.length <= 256,
  );
  const name = displayName(manifest, entries);
  check(
    typeof manifest.version === "string" &&
      /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(manifest.version) &&
      manifest.version.split(".").every((n) => +n <= 65535) &&
      manifest.version.split(".").some((n) => +n > 0),
  );
  check(!manifest.app, "Chrome Apps cannot be imported as extensions.");
  if (manifest.minimum_chrome_version !== undefined) {
    check(
      typeof manifest.minimum_chrome_version === "string" &&
        /^\d+(\.\d+){0,3}$/.test(manifest.minimum_chrome_version),
    );
    const minimum = manifest.minimum_chrome_version.split(".").map(Number),
      current = chromiumVersion.split(".").map(Number);
    let comparison = 0;
    for (let i = 0; i < 4 && !comparison; i++)
      comparison = (current[i] || 0) - (minimum[i] || 0);
    check(comparison >= 0, "Extension requires a newer browser version.");
  }
  const files = new Set(entries.filter((e) => !e.directory).map((e) => e.name));
  function resource(value) {
    check(
      typeof value === "string" &&
        value.length > 0 &&
        !/[\\:\x00-\x1f]/.test(value) &&
        !value.startsWith("/") &&
        value.split("/").every((p) => p && p !== "." && p !== "..") &&
        files.has(value),
      "Extension references a missing or unsafe resource.",
    );
  }
  if (manifest.background) {
    check(
      typeof manifest.background === "object" &&
        !Array.isArray(manifest.background),
    );
    if (manifest.background.service_worker !== undefined) {
      check(manifest.manifest_version === 3);
      resource(manifest.background.service_worker);
    }
    if (manifest.background.scripts !== undefined) {
      check(
        manifest.manifest_version === 2 &&
          Array.isArray(manifest.background.scripts),
      );
      manifest.background.scripts.forEach(resource);
    }
    if (manifest.background.page !== undefined) {
      check(manifest.manifest_version === 2);
      resource(manifest.background.page);
    }
  }
  for (const action of [
    manifest.action,
    manifest.browser_action,
    manifest.page_action,
  ])
    if (action?.default_popup) resource(action.default_popup);
  if (manifest.content_scripts !== undefined) {
    check(Array.isArray(manifest.content_scripts));
    for (const script of manifest.content_scripts) {
      check(
        script &&
          Array.isArray(script.matches) &&
          script.matches.every((v) => typeof v === "string"),
      );
      for (const field of ["js", "css"])
        if (script[field] !== undefined) {
          check(Array.isArray(script[field]));
          script[field].forEach(resource);
        }
    }
  }
  for (const field of [
    "permissions",
    "optional_permissions",
    "host_permissions",
    "optional_host_permissions",
  ])
    if (manifest[field] !== undefined)
      check(
        Array.isArray(manifest[field]) &&
          manifest[field].every((v) => typeof v === "string"),
      );
  for (const field of ["permissions", "optional_permissions"])
    check(
      !(manifest[field] || []).some((p) =>
        [
          "proxy",
          "nativeMessaging",
          "debugger",
          "management",
          "vpnProvider",
        ].includes(p),
      ),
      "Extension requests unsupported privileged permissions.",
    );
  check(
    !manifest.chrome_settings_overrides && !manifest.devtools_page,
    "Extension requests unsupported browser integration.",
  );
  // Never use the publisher's identity for a local, unverified package.
  {
    const digest = crypto.createHash("sha256");
    const identityManifest = { ...manifest };
    delete identityManifest.key;
    delete identityManifest.update_url;
    for (const e of [...entries]
      .filter((e) => !e.directory && !e.name.startsWith("_metadata/"))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const content =
        e.name === "manifest.json"
          ? Buffer.from(JSON.stringify(identityManifest))
          : e.content;
      digest.update(e.name + "\0" + content.length + "\0");
      digest.update(content);
    }
    // A deterministic public-only RSA SPKI gives Chromium a stable path-independent ID.
    const packageDigest = digest.digest();
    const modulus = Buffer.alloc(256);
    for (let block = 0; block < modulus.length / 32; block++) {
      crypto
        .createHash("sha256")
        .update("smart-auth-local-extension\0")
        .update(packageDigest)
        .update(Buffer.from([block]))
        .digest()
        .copy(modulus, block * 32);
    }
    modulus[0] |= 0x80;
    modulus[255] |= 1;
    manifest.key = crypto
      .createPublicKey({
        key: { kty: "RSA", n: modulus.toString("base64url"), e: "AQAB" },
        format: "jwk",
      })
      .export({ format: "der", type: "spki" })
      .toString("base64");
  }
  delete manifest.update_url;
  file.content = Buffer.from(JSON.stringify(manifest, null, 2));
  entries = entries.filter(
    (e) => e.name !== "_metadata" && !e.name.startsWith("_metadata/"),
  );
  return {
    entries,
    manifest,
    name,
    id: extensionId(manifest.key),
    sha256: hash(bytes),
  };
}
class LocalBrowserExtensionManager {
  constructor({
    userDataDir,
    chromiumVersion,
    supportedManifestVersions = [3],
  }) {
    check(
      typeof userDataDir === "string" &&
        userDataDir.length > 0 &&
        !userDataDir.includes(","),
    );
    this.root = path.resolve(userDataDir, "local-browser-extensions");
    this.options = { chromiumVersion, supportedManifestVersions };
  }
  _root() {
    return checkedDirectory(this.root);
  }
  _metadata(id) {
    check(ID.test(id));
    this._root();
    const dir = path.join(this.root, id);
    checkedDirectory(dir);
    const file = path.join(dir, "metadata.json"),
      stat = fs.lstatSync(file);
    check(stat.isFile() && !stat.isSymbolicLink() && stat.size < 32768);
    const item = JSON.parse(fs.readFileSync(file, "utf8"));
    check(item.id === id && HASH.test(item.sha256));
    check(validDisplayName(item.name));
    return {
      id,
      source: "local",
      name: item.name,
      version: String(item.version).slice(0, 32),
      sha256: item.sha256,
    };
  }
  list() {
    this._root();
    const result = [];
    for (const id of fs.readdirSync(this.root))
      if (ID.test(id)) {
        try {
          result.push(this._metadata(id));
        } catch {}
      }
    return result;
  }
  _collision(id, officialIds = []) {
    check(
      id !== DEFAULT_EXTENSION_ID &&
        !officialIds.some(
          (item) => (typeof item === "string" ? item : item.id) === id,
        ),
      "Local extension identity conflicts with a Chrome Web Store extension.",
    );
  }
  importZip(file, { officialIds = [], isCurrent = () => true } = {}) {
    try {
      return this._importZip(file, { officialIds, isCurrent });
    } catch (error) {
      if (error.code?.startsWith("ZIP_")) throw error;
      check(false);
    }
  }
  _importZip(file, { officialIds, isCurrent }) {
    check(
      typeof file === "string" && /\.zip$/i.test(file),
      "Select a ZIP extension package.",
    );
    const bytes = readPackage(file),
      validated = validateLocalArchive(bytes, this.options);
    this._collision(validated.id, officialIds);
    check(isCurrent(), "Local extension import was canceled.");
    const existing = this.list();
    check(
      existing.some((e) => e.id === validated.id) || existing.length < 20,
      "Local extension limit reached.",
    );
    const created = !existing.some((e) => e.id === validated.id);
    this._root();
    const dir = checkedDirectory(path.join(this.root, validated.id));
    const versions = fs.readdirSync(dir).filter((name) => HASH.test(name));
    check(
      versions.includes(validated.sha256) || versions.length < 4,
      "Local extension cache limit reached. Clear the local extension cache before importing more versions.",
    );
    const metadata = {
      id: validated.id,
      source: "local",
      name: validated.name,
      version: validated.manifest.version,
      sha256: validated.sha256,
    };
    this._write(dir, validated.sha256 + ".zip", bytes);
    this._materialize(dir, validated);
    this._write(dir, "metadata.json", Buffer.from(JSON.stringify(metadata)));
    // Only the current archive is needed to rebuild cache; loaded version trees
    // stay immutable until an explicit local cache clear.
    for (const name of fs.readdirSync(dir))
      if (
        /^[a-f0-9]{64}\.zip$/.test(name) &&
        name !== validated.sha256 + ".zip"
      ) {
        const old = path.join(dir, name),
          stat = fs.lstatSync(old);
        check(stat.isFile() && !stat.isSymbolicLink());
        fs.unlinkSync(old);
      }
    return { ...metadata, created };
  }
  _write(dir, name, bytes) {
    const temp = path.join(dir, crypto.randomUUID() + ".tmp");
    try {
      fs.writeFileSync(temp, bytes, { flag: "wx", mode: 0o600 });
      fs.renameSync(temp, path.join(dir, name));
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  _materialize(dir, validated) {
    const destination = path.join(dir, validated.sha256);
    if (fs.existsSync(destination)) {
      checkedDirectory(destination);
      verifyTree(destination, validated.entries);
      return destination;
    }
    const temp = fs.mkdtempSync(path.join(dir, "unpack-"));
    try {
      for (const entry of validated.entries) {
        const file = path.join(temp, ...entry.name.split("/"));
        if (entry.directory) fs.mkdirSync(file, { recursive: true });
        else {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, entry.content, { flag: "wx", mode: 0o600 });
        }
      }
      fs.renameSync(temp, destination);
      return destination;
    } finally {
      if (fs.existsSync(temp))
        fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  prepare(ids, { officialIds = [], signal } = {}) {
    check(Array.isArray(ids) && ids.length <= 20);
    const extensions = [],
      errors = [];
    for (const value of [
      ...new Set(ids.map((v) => (typeof v === "string" ? v : v.id))),
    ]) {
      try {
        check(!signal?.aborted, "Local extension preparation was canceled.");
        this._collision(value, officialIds);
        const item = this._metadata(value),
          dir = path.join(this.root, value);
        const bytes = readPackage(path.join(dir, item.sha256 + ".zip"));
        check(hash(bytes) === item.sha256);
        const validated = validateLocalArchive(bytes, this.options);
        check(validated.id === value);
        extensions.push({ ...item, path: this._materialize(dir, validated) });
      } catch {
        errors.push({
          id: value,
          message:
            "Local extension is unavailable or invalid. Import its ZIP again.",
        });
      }
    }
    return { paths: extensions.map((e) => e.path), extensions, errors };
  }
  remove(id) {
    check(ID.test(id));
    this._root();
    const dir = path.join(this.root, id);
    if (fs.existsSync(dir)) {
      checkedDirectory(dir);
      fs.rmSync(dir, { recursive: true });
    }
    return this.list();
  }
  clearCache() {
    this._root();
    for (const item of this.list()) {
      const dir = checkedDirectory(path.join(this.root, item.id));
      for (const name of fs.readdirSync(dir))
        if (HASH.test(name)) {
          const target = path.join(dir, name);
          checkedDirectory(target);
          fs.rmSync(target, { recursive: true });
        }
    }
    return this.list();
  }
}
module.exports = {
  LocalBrowserExtensionManager,
  validateLocalArchive,
  extensionId,
};
