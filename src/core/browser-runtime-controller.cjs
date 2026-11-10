"use strict";

// Public installation progress contains no filesystem paths or account data.
const DOWNLOAD_ERROR = "Browser download failed. Check your connection and try again.";
const CONSENT_ERROR = "Accept the Google and Chrome terms before downloading the browser.";
const REQUIRED_ERROR = "Download the browser from Google before opening a profile.";
const ACTIVE = new Set(["downloading", "verifying", "extracting"]);

class BrowserRuntimeController {
  constructor({ installer, manifest }) {
    this.installer = installer;
    this.manifest = manifest;
    this.operation = null;
  }

  base() {
    return { version: this.manifest.version, downloadBytes: this.manifest.archiveBytes };
  }

  async status() {
    const operation = this.operation;
    if (operation && operation.status.state !== "ready") return { ...operation.status };
    const result = await this.installer.inspect();
    if (operation !== this.operation) return this.status();
    return { ...this.base(), ...result };
  }

  start(acceptedTerms) {
    if (acceptedTerms !== true) throw Error(CONSENT_ERROR);
    if (this.operation && ACTIVE.has(this.operation.status.state))
      return { ...this.operation.status };
    const previous = this.operation;
    const operation = {
      abort: new AbortController(),
      status: { ...this.base(), state: "downloading", receivedBytes: 0, totalBytes: this.manifest.archiveBytes },
      promise: null,
    };
    this.operation = operation;
    operation.promise = (async () => {
      // A cancelled installation must finish cleaning its staging directory
      // before a retry can start a new installation of the same version.
      if (previous?.promise) await previous.promise;
      operation.abort.signal.throwIfAborted();
      await this.installer.install({
        acceptedTerms: true,
        signal: operation.abort.signal,
        onProgress: (progress) => {
          if (this.operation !== operation || operation.abort.signal.aborted) return;
          if (!ACTIVE.has(progress.phase) && progress.phase !== "ready") return;
          const finite = (value) => Number.isSafeInteger(value) && value >= 0;
          operation.status = {
            ...this.base(), state: progress.phase,
            ...(finite(progress.receivedBytes) ? { receivedBytes: progress.receivedBytes } : {}),
            ...(finite(progress.totalBytes) ? { totalBytes: progress.totalBytes } : {}),
            ...(Number.isFinite(progress.percent) ? { percent: Math.max(0, Math.min(100, progress.percent)) } : {}),
          };
        },
      });
      operation.abort.signal.throwIfAborted();
      operation.status = { ...this.base(), state: "ready" };
    })().catch(() => {
      operation.status = {
        ...this.base(),
        state: operation.abort.signal.aborted ? "cancelled" : "error",
        ...(operation.abort.signal.aborted ? {} : { message: DOWNLOAD_ERROR }),
      };
    });
    return { ...operation.status };
  }

  cancel() {
    const operation = this.operation;
    if (operation && ACTIVE.has(operation.status.state)) {
      operation.abort.abort();
      operation.status = { ...this.base(), state: "cancelled" };
    }
    return { cancelled: true };
  }

  async resolve() {
    try { return await this.installer.resolve(); }
    catch { throw Error(REQUIRED_ERROR); }
  }

  async settled() {
    await this.operation?.promise;
  }
}

module.exports = { BrowserRuntimeController, DOWNLOAD_ERROR, CONSENT_ERROR, REQUIRED_ERROR };
