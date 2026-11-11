"use strict";
// Untrusted decompression and full tree verification never run on Electron's UI
// thread. Only bounded metadata reads and atomic staging promotion happen there.
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("node:worker_threads");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const {
  LocalBrowserExtensionManager,
  validateLocalArchive,
} = require("./local-browser-extensions.cjs");
const {
  checkedDirectory,
  readPackage,
  verifyTree,
} = require("./browser-extensions.cjs");
const TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const queues = new Map();
function cleanupStale(config) {
  const root = checkedDirectory(
    path.join(config.userDataDir, ".local-extension-staging"),
  );
  for (const token of fs.readdirSync(root)) {
    if (!TOKEN.test(token)) continue;
    const dir = path.join(root, token),
      stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    try {
      const ownerFile = path.join(dir, ".owner.json"),
        ownerStat = fs.lstatSync(ownerFile);
      if (
        !ownerStat.isFile() ||
        ownerStat.isSymbolicLink() ||
        ownerStat.size > 1024
      )
        continue;
      const owner = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
      if (
        !Number.isSafeInteger(owner.pid) ||
        owner.pid <= 0 ||
        owner.token !== token
      )
        continue;
      try {
        process.kill(owner.pid, 0);
        continue;
      } catch (error) {
        if (error.code !== "ESRCH") continue;
      }
      cleanupStage(config, token);
    } catch {}
  }
}
function failure(message, code = "ZIP_INVALID") {
  const error = Error(message);
  error.code = code;
  return error;
}
function cleanupStage(config, token) {
  if (!TOKEN.test(token))
    throw failure("Invalid local extension staging token.");
  const root = checkedDirectory(
    path.join(config.userDataDir, ".local-extension-staging"),
  );
  const dir = path.join(root, token);
  if (fs.existsSync(dir)) {
    checkedDirectory(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function execute(operation, config, args) {
  const manager = new LocalBrowserExtensionManager(config);
  if (operation === "stage") {
    const root = checkedDirectory(
      path.join(config.userDataDir, ".local-extension-staging"),
    );
    const stage = checkedDirectory(path.join(root, args.token));
    const staged = new LocalBrowserExtensionManager({
      ...config,
      userDataDir: stage,
    });
    const item = staged.importZip(args.file, { officialIds: args.officialIds });
    const existingTree = path.join(manager.root, item.id, item.sha256);
    let repairTree = false;
    if (fs.existsSync(existingTree)) {
      const validated = validateLocalArchive(
        readPackage(path.join(staged.root, item.id, item.sha256 + ".zip")),
        staged.options,
      );
      try {
        checkedDirectory(existingTree);
        verifyTree(existingTree, validated.entries);
      } catch {
        repairTree = true;
      }
    }
    return { ...item, repairTree };
  }
  if (operation === "cleanupStale") return cleanupStale(config);
  if (operation === "cleanup") return cleanupStage(config, args.token);
  if (operation === "prepare")
    return manager.prepare(args.ids, { officialIds: args.officialIds });
  if (operation === "remove") return manager.remove(args.id);
  if (operation === "clearCache") return manager.clearCache();
  throw failure("Invalid local extension operation.");
}
if (!isMainThread && workerData?.localExtensionWorker === true) {
  execute(workerData.operation, workerData.config, workerData.args).then(
    (value) => parentPort.postMessage({ value }),
    (error) =>
      parentPort.postMessage({
        error: {
          message: error.code?.startsWith("ZIP_")
            ? error.message
            : "Local extension operation failed.",
          code: error.code?.startsWith("ZIP_") ? error.code : "ZIP_INVALID",
        },
      }),
  );
}
class AsyncLocalBrowserExtensionManager {
  constructor(config) {
    this.manager = new LocalBrowserExtensionManager(config);
    this.config = {
      userDataDir: path.resolve(config.userDataDir),
      chromiumVersion: config.chromiumVersion,
      supportedManifestVersions: config.supportedManifestVersions || [3],
    };
    this.tail = Promise.resolve();
    this._queue(() => this._worker("cleanupStale")).catch(() => {});
  }
  _queue(callback) {
    const task = (queues.get(this.config.userDataDir) || this.tail).then(
      callback,
    );
    this.tail = task.catch(() => {});
    queues.set(this.config.userDataDir, this.tail);
    return task;
  }
  _worker(operation, args = {}) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          localExtensionWorker: true,
          operation,
          config: this.config,
          args,
        },
      });
      let settled = false;
      worker.once("message", (result) => {
        settled = true;
        if (result.error)
          reject(failure(result.error.message, result.error.code));
        else resolve(result.value);
      });
      worker.once("error", () => {
        settled = true;
        reject(failure("Local extension worker failed."));
      });
      worker.once("exit", () => {
        if (!settled)
          reject(failure("Local extension worker stopped unexpectedly."));
      });
    });
  }
  list() {
    return this.manager.list();
  }
  importZip(file, { officialIds = [], isCurrent = () => true, signal } = {}) {
    return this._queue(async () => {
      const token = crypto.randomUUID();
      try {
        if (!isCurrent() || signal?.aborted)
          throw failure("Local extension import was canceled.");
        const stage = checkedDirectory(
          path.join(this.config.userDataDir, ".local-extension-staging", token),
        );
        fs.writeFileSync(
          path.join(stage, ".owner.json"),
          JSON.stringify({ pid: process.pid, token }),
          { flag: "wx", mode: 0o600 },
        );
        const { repairTree, ...item } = await this._worker("stage", {
          file,
          officialIds,
          token,
        });
        // Promotion is synchronous and bounded. The event loop cannot process a
        // vault lock between this final validity check and the metadata commit.
        if (!isCurrent() || signal?.aborted)
          throw failure("Local extension import was canceled.");
        this.manager._collision(item.id, officialIds);
        const current = this.manager.list(),
          created = !current.some((e) => e.id === item.id);
        if (created && current.length >= 20)
          throw failure("Local extension limit reached.", "ZIP_LIMIT");
        const source = checkedDirectory(
          path.join(
            this.config.userDataDir,
            ".local-extension-staging",
            token,
            "local-browser-extensions",
            item.id,
          ),
        );
        this.manager._root();
        const destination = path.join(this.manager.root, item.id);
        if (!fs.existsSync(destination)) fs.renameSync(source, destination);
        else {
          checkedDirectory(destination);
          const versions = fs
            .readdirSync(destination)
            .filter((name) => /^[a-f0-9]{64}$/.test(name));
          if (!versions.includes(item.sha256) && versions.length >= 4)
            throw failure(
              "Local extension cache limit reached. Clear the local extension cache before importing more versions.",
              "ZIP_LIMIT",
            );
          for (const name of [item.sha256, item.sha256 + ".zip"]) {
            const target = path.join(destination, name);
            if (!fs.existsSync(target))
              fs.renameSync(path.join(source, name), target);
            else {
              const stat = fs.lstatSync(target);
              if (
                stat.isSymbolicLink() ||
                (name === item.sha256 ? !stat.isDirectory() : !stat.isFile())
              )
                throw failure("Invalid local extension cache.");
              if (name.endsWith(".zip") || repairTree) {
                // Move damaged data aside without recursive work on the UI
                // thread. The private staging cleanup deletes it in a worker.
                const backup = path.join(stage, "replaced-" + name);
                fs.renameSync(target, backup);
                try {
                  fs.renameSync(path.join(source, name), target);
                } catch (error) {
                  fs.renameSync(backup, target);
                  throw error;
                }
              }
            }
          }
          this.manager._write(
            destination,
            "metadata.json",
            Buffer.from(JSON.stringify(item)),
          );
          for (const name of fs.readdirSync(destination))
            if (
              /^[a-f0-9]{64}\.zip$/.test(name) &&
              name !== item.sha256 + ".zip"
            ) {
              const target = path.join(destination, name),
                stat = fs.lstatSync(target);
              if (stat.isFile() && !stat.isSymbolicLink())
                fs.unlinkSync(target);
            }
        }
        return { ...item, created };
      } catch (error) {
        if (error.code?.startsWith("ZIP_")) throw error;
        throw failure("Local extension import failed.");
      } finally {
        await this._worker("cleanup", { token }).catch(() => {});
      }
    });
  }
  prepare(ids, { officialIds = [], signal } = {}) {
    return this._queue(async () => {
      const canceled = () => ({
        paths: [],
        extensions: [],
        errors: ids.map((value) => ({
          id: typeof value === "string" ? value : value.id,
          message: "Local extension preparation was canceled.",
        })),
      });
      if (signal?.aborted) return canceled();
      const result = await this._worker("prepare", { ids, officialIds });
      return signal?.aborted ? canceled() : result;
    });
  }
  remove(id) {
    return this._queue(() => this._worker("remove", { id }));
  }
  clearCache() {
    return this._queue(() => this._worker("clearCache"));
  }
}
module.exports = { AsyncLocalBrowserExtensionManager };
