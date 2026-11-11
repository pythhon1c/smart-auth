"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  atomicVaultBackup,
  readBoundedRegularFile,
} = require("./vault-backup.cjs");

function canonical(location) {
  let candidate = path.resolve(location),
    tail = [];
  while (!fs.existsSync(candidate)) {
    // A dangling symlink must never be treated as an absent directory.
    try {
      fs.lstatSync(candidate);
      throw Error("UPDATE_UNSAFE_PATH");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) throw Error("UPDATE_UNSAFE_PATH");
    tail.unshift(path.basename(candidate));
    candidate = parent;
  }
  let result = path.join(fs.realpathSync(candidate), ...tail);
  return process.platform === "win32" ? result.toLowerCase() : result;
}
function contained(parent, child) {
  const relative = path.relative(parent, child);
  return (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
function assertSeparateDirectories(downloadDirectory, userData) {
  const download = canonical(downloadDirectory),
    data = canonical(userData);
  if (contained(download, data) || contained(data, download))
    throw Error("UPDATE_UNSAFE_PATH");
}
class UpdateController {
  constructor({
    updater,
    downloadDirectory,
    userData,
    version,
    packaged,
    vault,
    current,
    relaunch,
    quit,
    backup = atomicVaultBackup,
  }) {
    Object.assign(this, {
      updater,
      downloadDirectory,
      userData,
      version,
      packaged,
      vault,
      current,
      relaunch,
      quit,
      backup,
    });
    this.busy = false;
    this.restartScheduled = false;
  }
  async run(action, current = this.current) {
    if (this.busy || this.restartScheduled)
      return { state: "error", code: "UPDATE_BUSY" };
    this.busy = true;
    let failure = "UPDATE_FAILED";
    try {
      failure = "UPDATE_UNSAFE_PATH";
      assertSeparateDirectories(this.downloadDirectory, this.userData);
      failure = "UPDATE_STALE";
      if (!current()) throw Error();
      if (action === "restartForAppUpdate") {
        failure = "UPDATE_UNAVAILABLE";
        if (
          !(typeof this.packaged === "function"
            ? this.packaged()
            : this.packaged)
        )
          throw Error();
        failure = "UPDATE_FAILED";
        const executable = await this.updater.verifyReady();
        failure = "UPDATE_STALE";
        if (!current()) throw Error();
        assertSeparateDirectories(this.downloadDirectory, this.userData);
        failure = "UPDATE_BACKUP_FAILED";
        const backups = path.join(this.userData, "update-backups");
        if (fs.existsSync(backups)) {
          const stat = fs.lstatSync(backups);
          if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error();
        } else fs.mkdirSync(backups, { mode: 0o700 });
        const version = String(this.version)
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .slice(0, 80);
        const destination = path.join(
          backups,
          `${version}-${Date.now()}-${randomUUID()}`,
        );
        fs.mkdirSync(destination, { mode: 0o700 });
        const snapshot = (sourcePath, name) => {
          const targetPath = path.join(destination, name);
          const original = readBoundedRegularFile(sourcePath);
          this.backup({ sourcePath, targetPath });
          if (!original.equals(readBoundedRegularFile(targetPath)))
            throw Error();
        };
        snapshot(this.vault.filePath, "previous-primary.vault");
        const recovery = this.vault.filePath + ".bak";
        if (fs.existsSync(recovery))
          snapshot(recovery, "previous-recovery.vault");
        this.vault.save();
        snapshot(this.vault.filePath, "smart-sda.vault");
        failure = "UPDATE_FAILED";
        if ((await this.updater.verifyReady()) !== executable) throw Error();
        failure = "UPDATE_STALE";
        if (!current()) throw Error();
        failure = "UPDATE_RESTART_FAILED";
        this.relaunch({
          execPath: executable,
          args: [`--user-data-dir=${this.userData}`],
        });
        this.restartScheduled = true;
        this.quit();
        return { state: "restarting" };
      }
      failure = "UPDATE_FAILED";
      const result =
        await this.updater[
          action === "checkAppUpdate" ? "check" : "download"
        ]();
      failure = "UPDATE_STALE";
      if (!current()) throw Error();
      return result;
    } catch (error) {
      if (
        failure === "UPDATE_FAILED" &&
        ["UPDATER_EXISTING_FILE", "UPDATER_INTEGRITY"].includes(error?.code)
      )
        failure = error.code.replace("UPDATER_", "UPDATE_");
      return { state: "error", code: failure };
    } finally {
      this.busy = false;
    }
  }
}
module.exports = { UpdateController, assertSeparateDirectories };
