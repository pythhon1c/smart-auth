"use strict";
const localeText = require("../locales/application.json");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateKdf } = require("./vault-kdf.cjs");
const MAX_VAULT_BYTES = 64 * 1024 * 1024;
const fail = () => Error(localeText.couldNotSafelySaveTheBackup);

function readBoundedRegularFile(file) {
  const entry = fs.lstatSync(file);
  if (!entry.isFile() || entry.isSymbolicLink()) throw fail();
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = fs.fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size < 1 ||
      stat.size > MAX_VAULT_BYTES ||
      stat.dev !== entry.dev ||
      stat.ino !== entry.ino
    )
      throw fail();
    const bytes = Buffer.alloc(stat.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const n = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (!n) break;
      count += n;
    }
    if (count !== stat.size) throw fail();
    return bytes.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}
function canonical(file) {
  let result = path.resolve(file);
  try {
    result = fs.realpathSync(result);
  } catch {
    result = path.join(
      fs.realpathSync(path.dirname(result)),
      path.basename(result),
    );
  }
  return process.platform === "win32" ? result.toLowerCase() : result;
}
function aliases(first, second) {
  if (canonical(first) === canonical(second)) return true;
  try {
    const a = fs.statSync(first),
      b = fs.statSync(second);
    return a.ino !== 0 && a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}
function validateEncryptedSource(bytes) {
  const e = JSON.parse(bytes.toString("utf8"));
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
  for (const [value, min, max] of [
    [e.salt, e.version === 1 ? 16 : 32, e.version === 1 ? 16 : 32],
    [e.iv, 12, 12],
    [e.tag, 16, 16],
    [e.ciphertext, 1, 47 * 1024 * 1024],
    ...(!e.passwordEnabled ? [[e.wrappedKey, 1, 65536]] : []),
  ]) {
    if (
      typeof value !== "string" ||
      value.length > Math.ceil(max / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
    )
      throw fail();
    const decoded = Buffer.from(value, "base64");
    if (
      decoded.length < min ||
      decoded.length > max ||
      decoded.toString("base64") !== value
    )
      throw fail();
  }
  if (e.passwordEnabled && e.wrappedKey !== null) throw fail();
}
function atomicVaultBackup({ sourcePath, targetPath, protectedPaths = [] }) {
  let temporary;
  try {
    if (
      typeof sourcePath !== "string" ||
      typeof targetPath !== "string" ||
      !Array.isArray(protectedPaths) ||
      protectedPaths.some((file) => typeof file !== "string")
    )
      throw fail();
    const protectedFiles = [
      sourcePath,
      sourcePath + ".bak",
      sourcePath + ".auth-state",
      ...protectedPaths,
    ];
    const checkTarget = () => {
      if (fs.existsSync(targetPath)) {
        const stat = fs.lstatSync(targetPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1)
          throw fail();
      } else {
        // existsSync is false for a dangling symlink too.
        try {
          fs.lstatSync(targetPath);
          throw fail();
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      if (protectedFiles.some((file) => aliases(file, targetPath)))
        throw fail();
    };
    checkTarget();
    const bytes = readBoundedRegularFile(sourcePath);
    validateEncryptedSource(bytes);
    temporary = `${targetPath}.${crypto.randomUUID()}.tmp`;
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    checkTarget();
    fs.renameSync(temporary, targetPath);
    return { saved: true };
  } catch {
    throw fail();
  } finally {
    if (temporary)
      try {
        fs.unlinkSync(temporary);
      } catch {}
  }
}
module.exports = { atomicVaultBackup, readBoundedRegularFile };
