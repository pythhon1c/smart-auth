"use strict";
// Offline packaging only. Does not build, launch the app, use Git/network, or open user data.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib"),
  cp = require("node:child_process"),
  assert = require("node:assert/strict"),
  { createRequire } = require("node:module");

const ROOT_FILES = [
  ".gitignore", "README.md", "README.uk.md", "README.ru.md", "LICENSE",
  "THIRD-PARTY-NOTICES.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
];
const DOCS = [
  "BUILD", "USER-GUIDE", "DISTRIBUTION-NOTES",
];
const ASSETS = ["app-icon.ico", "icon.ico", "icon.svg"];
const BUILD_SCRIPTS = ["prepare-release.cjs", "check.cjs"];
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function releaseVersion(version) {
  assert(typeof version === "string" && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-beta\.(?:0|[1-9]\d*))?$/.test(version), "Expected a stable or numeric beta.N release version");
  return { channel: version.includes("-beta.") ? "beta" : "stable", prerelease: version.includes("-beta.") };
}
function relativePath(name) {
  assert(typeof name === "string" && /^[A-Za-z0-9_. /-]+$/.test(name), "Invalid archive path");
  assert(!name.split("/").some((part) => !part || part === "." || part === ".."), "Unsafe archive path");
  assert(!path.isAbsolute(name), "Absolute archive path");
  return name;
}
function filePath(root, name) {
  relativePath(name);
  let current = path.resolve(root);
  assert(!fs.lstatSync(current).isSymbolicLink(), "Linked root is not allowed");
  for (const part of name.split("/")) {
    current = path.join(current, part);
    assert(!fs.lstatSync(current).isSymbolicLink(), "Linked release input: " + name);
  }
  assert(fs.statSync(current).isFile(), "Expected file: " + name);
  return current;
}
function walk(root, prefix = "") {
  const folder = prefix ? path.join(root, prefix) : root;
  assert(!fs.lstatSync(folder).isSymbolicLink(), "Linked directory is not allowed");
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix ? prefix + "/" + entry.name : entry.name;
    relativePath(name);
    assert(!entry.isSymbolicLink(), "Linked release input: " + name);
    return entry.isDirectory() ? walk(root, name) : [name];
  }).sort();
}
function collectSource(root, version) {
  releaseVersion(version);
  // Only application/build inputs, public English documentation and README translations are publishable.
  // No tests, fixtures, logs, audits, research, exports, or historical releases.
  const files = [
    ...ROOT_FILES,
    ...DOCS.map((name) => "docs/" + name + ".md"),
    "docs/THIRD-PARTY-LICENSES.txt",
    "docs/RELEASE-" + version + ".md",
    ...ASSETS.map((name) => "assets/" + name),
    ...BUILD_SCRIPTS.map((name) => "scripts/" + name),
  ];
  const names = walk(root, "src"), codeRule = /\.(?:cjs|js|html|css|ps1|png|svg|ico|json)$/;
  assert(names.every((name) => codeRule.test(name)), "Review unexpected src file type");
  files.push(...names);
  assert.equal(new Set(files).size, files.length, "Duplicate source path");
  return files.sort().map((name) => {
    const data = fs.readFileSync(filePath(root, name));
    if (!/\.(?:png|ico)$/.test(name) && !name.startsWith("src/locales/") && !["README.uk.md", "README.ru.md"].includes(name)) {
      const selector = "**English** \u00b7 [\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430](README.uk.md) \u00b7 [\u0420\u0443\u0441\u0441\u043a\u0438\u0439](README.ru.md)";
      const text = name === "README.md"
        ? data.toString("utf8").split(/\r?\n/).filter((line) => line !== selector).join("\n")
        : data.toString("utf8");
      assert(!/[\u0400-\u052f]/u.test(text), "Move non-English text into a locale file: " + name);
    }
    return { path: name, size: data.length, sha256: hash(data), data };
  });
}
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function sourceZip(files) {
  assert(files.length > 0 && files.length < 65535, "ZIP member limit");
  assert.equal(new Set(files.map((file) => file.path)).size, files.length, "Duplicate ZIP member");
  const records = [], directory = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(relativePath(file.path)), data = file.data;
    assert.equal(hash(data), file.sha256, "Source changed while preparing ZIP");
    const compressed = zlib.deflateRawSync(data, { level: 9 }), sum = crc32(data);
    assert(data.length < 0xffffffff && compressed.length < 0xffffffff, "ZIP64 not supported");
    const header = Buffer.alloc(30), central = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(sum, 14); header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(sum, 16); central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    records.push(header, name, compressed); directory.push(central, name);
    offset += header.length + name.length + compressed.length;
  }
  const index = Buffer.concat(directory), end = Buffer.alloc(22);
  assert(offset + index.length < 0xffffffff, "ZIP64 not supported");
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...records, index, end]);
  const members = require("../src/core/browser-extensions.cjs").unpackZip(bytes);
  assert.equal(members.length, files.length);
  const byName = new Map(members.map((member) => [member.name, member.content]));
  for (const file of files) assert.equal(hash(byName.get(file.path)), file.sha256, "ZIP verification failed");
  return bytes;
}
function loadAsar() {
  const builder = createRequire(require.resolve("electron-builder/package.json"));
  return createRequire(builder.resolve("app-builder-lib/package.json"))("@electron/asar");
}
function verifyAsar(root, archive, version, sources, asar = loadAsar()) {
  const packaged = asar.listPackage(archive).map((name) => name.replaceAll("\\", "/").replace(/^\//, ""));
  assert(!packaged.some((name) => name.startsWith("node_modules/playwright-core/lib/tools/skills/") && !asar.statFile(archive, path.normalize(name)).files), "ASAR contains Playwright coding-agent skills");
  const names = packaged.filter((name) => name.startsWith("src/") && !asar.statFile(archive, path.normalize(name)).files).sort();
  const source = sources.filter((file) => file.path.startsWith("src/"));
  assert.deepEqual(names, source.map((file) => file.path).sort(), "ASAR source file list differs");
  for (const file of source) assert(asar.extractFile(archive, path.normalize(file.path)).equals(file.data), "ASAR source differs: " + file.path);
  assert(names.includes("src/core/browser-runtime.cjs") && names.includes("src/core/browser-runtime.json"), "ASAR runtime installer and manifest missing");
  // Playwright's lib/server/chromium directory is JavaScript adapter code, not a runtime.
  assert(!packaged.some((name) => /(?:^|\/)chrome(?:\.exe|\.dll)$|(?:^|\/)(?:bundled-chromium|chrome-win64)(?:\/|$)|^(?:resources\/)?chromium(?:\/|$)/i.test(name)), "ASAR contains browser binaries");
  const pkg = JSON.parse(asar.extractFile(archive, "package.json"));
  assert.equal(pkg.version, version, "ASAR version differs");
  assert.equal(pkg.license, JSON.parse(fs.readFileSync(filePath(root, "package.json"))).license, "ASAR license metadata differs");
  for (const name of ["LICENSE", "THIRD-PARTY-NOTICES.md", "docs/THIRD-PARTY-LICENSES.txt", "docs/DISTRIBUTION-NOTES.md"]) {
    assert(packaged.includes(name), "ASAR notice missing: " + name);
    assert(asar.extractFile(archive, path.normalize(name)).equals(fs.readFileSync(filePath(root, name))), "ASAR notice differs: " + name);
  }
  return names.length;
}
function treeHashes(root) {
  return walk(root).map((name) => {
    const data = fs.readFileSync(filePath(root, name));
    return { path: name, size: data.length, sha256: hash(data) };
  });
}
function verifyNoBundledBrowser(root) {
  for (const name of ["chromium", "resources/chromium", "chrome-win64", "bundled-chromium"]) assert(!fs.existsSync(path.join(root, name)), "Google Chrome browser files must not be distributed");
  const files = walk(root);
  assert(!files.some((name) => /(?:^|\/)(?:chromium|bundled-chromium|chrome-win64)(?:\/|$)|(?:^|\/)chrome(?:\.exe|\.dll)$|(?:^|\/)LICENSE\.chromium\.txt$/i.test(name)), "Google Chrome browser files must not be distributed");
  return files;
}
function findSevenZip() {
  const override = process.env.SMART_AUTH_7ZIP || process.env.SMART_SDA_7ZIP;
  if (override) return path.resolve(override);
  const cache = process.env.ELECTRON_BUILDER_CACHE || path.join(process.env.LOCALAPPDATA || "", "electron-builder", "Cache");
  const parent = path.join(cache, "7zip@1.0.0");
  const matches = fs.existsSync(parent) ? fs.readdirSync(parent).filter((name) => name.startsWith("7zip-win-x64-")).map((name) => path.join(parent, name, "bin", "7za.exe")).filter((name) => fs.existsSync(name)) : [];
  assert.equal(matches.length, 1, "Set SMART_AUTH_7ZIP to an existing offline 7za executable");
  return matches[0];
}
function verifyPortable(root, exe, unpacked) {
  const seven = findSevenZip();
  const run = (args) => {
    const result = cp.spawnSync(seven, args, { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, "Offline 7-Zip verification failed");
    return result.stdout;
  };
  const layout = (folder, prefix = "") => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix ? prefix + "/" + entry.name : entry.name;
    relativePath(name);
    assert(!entry.isSymbolicLink(), "Linked portable input is not allowed");
    assert(entry.isDirectory() || entry.isFile(), "Nonregular portable input is not allowed");
    return entry.isDirectory()
      ? [{ path: name, directory: true }, ...layout(path.join(folder, entry.name), name)]
      : [{ path: name, directory: false }];
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  // Validate every listed member before giving an extractor any output directory.
  const listing = run(["l", "-slt", exe]).split("----------").slice(1).join("----------");
  const members = listing.split(/\r?\n\r?\n/).flatMap((record) => {
    const member = /^Path = ([^\r\n]+)\r?$/m.exec(record);
    if (!member) return [];
    assert(!/^(?:Symbolic Link|Hard Link) = /m.test(record), "Linked portable member is not allowed");
    const name = member[1].replaceAll("\\", "/");
    relativePath(name);
    for (const part of name.split("/")) {
      assert(part === part.trim() && !part.endsWith("."), "Ambiguous Windows archive path");
      assert(!/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part), "Reserved Windows archive path");
    }
    return [{ path: name, directory: /^Folder = \+\r?$/m.test(record) || /^Attributes = D(?:\s|\r?$)/m.test(record) }];
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert(members.length > 0, "Portable payload not recognized");
  assert.equal(new Set(members.map((member) => member.path.toLowerCase())).size, members.length, "Duplicate portable member");
  const expectedLayout = layout(unpacked), expectedFiles = treeHashes(unpacked);
  assert(expectedFiles.length > 0, "Unpacked application is empty");
  assert.deepEqual(members, expectedLayout, "Portable member tree differs from unpacked application");
  const temp = fs.mkdtempSync(path.join(root, "release", ".verify-portable-"));
  try {
    run(["x", "-y", "-bd", "-bb0", "-o" + temp, exe]);
    assert.deepEqual(layout(temp), expectedLayout, "Extracted portable member tree differs");
    assert.deepEqual(treeHashes(temp), expectedFiles, "Portable file bytes differ from unpacked application");
    return expectedFiles.length;
  } finally {
    // Only this freshly allocated directory is owned; never perform recursive deletion.
    const remove = (folder) => {
      assert(path.resolve(folder).startsWith(temp + path.sep) || folder === temp);
      assert(!fs.lstatSync(folder).isSymbolicLink(), "Refusing linked cleanup directory");
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const child = path.join(folder, entry.name);
        assert(!entry.isSymbolicLink(), "Refusing linked cleanup entry");
        if (entry.isDirectory()) remove(child); else fs.unlinkSync(child);
      }
      fs.rmdirSync(folder);
    };
    remove(temp);
  }
}
function prepareRelease(root = path.resolve(__dirname, "..")) {
  root = path.resolve(root);
  const pkg = JSON.parse(fs.readFileSync(filePath(root, "package.json"))), version = pkg.version;
  const release = releaseVersion(version);
  const destination = path.join(root, "release", "publish-v" + version);
  assert(!fs.existsSync(destination), "Preserve existing publish directory; choose a new version or move it aside manually");
  const sources = collectSource(root, version), zip = sourceZip(sources);
  const exeName = "smart-auth-" + version + "-win-x64.exe", zipName = "smart-auth-" + version + "-source.zip";
  const exe = filePath(root, "release/" + exeName), unpacked = path.join(root, "release/win-unpacked");
  const sourceFiles = verifyAsar(root, filePath(unpacked, "resources/app.asar"), version, sources);
  verifyNoBundledBrowser(unpacked);
  verifyPortable(root, exe, unpacked);
  // All verification precedes creating the output. A failure preserves previous releases.
  fs.mkdirSync(destination);
  const artifacts = [];
  const record = (name) => {
    const data = fs.readFileSync(filePath(destination, name));
    artifacts.push({ path: name, size: data.length, sha256: hash(data) });
  };
  fs.copyFileSync(exe, path.join(destination, exeName), fs.constants.COPYFILE_EXCL); record(exeName);
  fs.writeFileSync(path.join(destination, zipName), zip, { flag: "wx" }); record(zipName);
  const sidecars = {
    "LICENSE": "LICENSE", "THIRD-PARTY-NOTICES.md": "THIRD-PARTY-NOTICES.md",
    "THIRD-PARTY-LICENSES.txt": "docs/THIRD-PARTY-LICENSES.txt",
    "DISTRIBUTION-NOTES.md": "docs/DISTRIBUTION-NOTES.md",
    "BUILD.md": "docs/BUILD.md", "USER-GUIDE.md": "docs/USER-GUIDE.md",
    "RELEASE-NOTES.md": "docs/RELEASE-" + version + ".md",
  };
  for (const [name, source] of Object.entries(sidecars)) {
    fs.copyFileSync(filePath(root, source), path.join(destination, name), fs.constants.COPYFILE_EXCL); record(name);
  }
  const manifest = {
    version, ...release, status: "prepared-for-review", distributionReviewRequired: false, distributionReviewScope: "No Google Chrome binary is redistributed; other component obligations still apply",
    verification: { sourceArchiveRoundTrip: true, asarSourceFiles: sourceFiles, asarVersionAndNotices: true, portableResourcesMatch: true, noBundledBrowser: true, runtimeManifestIncluded: true },
    sources: sources.map(({ data, ...file }) => file), artifacts,
  };
  fs.writeFileSync(path.join(destination, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }); record("release-manifest.json");
  fs.writeFileSync(path.join(destination, "SHA256SUMS.txt"), artifacts.map((file) => file.sha256 + "  " + file.path).join("\n") + "\n", { flag: "wx" });
  return { directory: "release/publish-v" + version, version, sourceFiles: sources.length, browserFiles: 0, verified: true, distributionReviewRequired: false };
}
module.exports = { releaseVersion, collectSource, sourceZip, verifyAsar, verifyNoBundledBrowser, verifyPortable, relativePath, prepareRelease };
if (require.main === module) {
  try { console.log(JSON.stringify(prepareRelease(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
