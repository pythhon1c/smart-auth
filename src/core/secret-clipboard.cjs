"use strict";
const localeText = require("../locales/application.json");
const { createHash } = require("node:crypto");

// Store a digest rather than another plaintext copy. Never erase text copied
// by another application after our own copy. This does not erase OS history.
class SecretClipboard {
  constructor(
    clipboard,
    { timeoutMs = 10000, schedule = setTimeout, cancel = clearTimeout } = {},
  ) {
    this.clipboard = clipboard;
    this.timeoutMs = timeoutMs;
    this.schedule = schedule;
    this.cancel = cancel;
    this.digest = null;
    this.timer = null;
    this.generation = 0;
  }
  fingerprint(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
  copy(value) {
    if (typeof value !== "string" || !value.length || value.length > 262144)
      throw Error(localeText.message_8fc6466);
    this.clear();
    this.clipboard.writeText(value);
    this.digest = this.fingerprint(value);
    const generation = ++this.generation;
    this.timer = this.schedule(() => {
      if (generation === this.generation) this.clear();
    }, this.timeoutMs);
    this.timer?.unref?.();
    return { copied: true, expiresInSeconds: this.timeoutMs / 1000 };
  }
  clear() {
    this.generation++;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    const digest = this.digest;
    this.digest = null;
    if (!digest) return;
    try {
      if (this.fingerprint(this.clipboard.readText()) === digest)
        this.clipboard.clear();
    } catch {
      // Clipboard ownership can change while Windows is locked or exiting.
    }
  }
}
module.exports = { SecretClipboard };
