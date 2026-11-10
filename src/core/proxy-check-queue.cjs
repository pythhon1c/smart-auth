"use strict";
const localeText = require("../locales/application.json");
const { randomUUID } = require("node:crypto");
const { runTaskPool } = require("./task-pool.cjs");
class ProxyCheckQueue {
  constructor({
    accounts,
    check,
    abort,
    onChange = () => {},
    delayMs = 100,
    concurrency = 8,
  }) {
    if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60000)
      throw Error(localeText.message_4ba2691);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
      throw Error(localeText.message_29ed3d8);
    this.accounts = [...accounts];
    this.check = check;
    this.abort = abort;
    this.onChange = onChange;
    this.controller = new AbortController();
    this.job = {
      ticket: randomUUID(),
      state: "running",
      total: accounts.length,
      processed: 0,
      passed: 0,
      failed: [],
      currentId: null,
      currentIds: [],
      delayMs,
      concurrency,
      items: accounts.map((account) => ({ id: account.id, state: "queued" })),
    };
    this.items = new Map(this.job.items.map((item) => [item.id, item]));
  }
  snapshot() {
    return {
      ...this.job,
      currentIds: [...this.job.currentIds],
      failed: this.job.failed.map((x) => ({ ...x })),
      items: this.job.items.map((item) => ({ ...item })),
    };
  }
  notify() {
    try {
      this.onChange();
    } catch {}
  }
  cancel() {
    if (this.job.state !== "running") return;
    this.job.state = "cancelled";
    for (const item of this.job.items)
      if (["queued", "running"].includes(item.state)) item.state = "cancelled";
    this.controller.abort();
    try {
      this.abort?.();
    } catch {}
    this.job.currentIds = [];
    this.job.currentId = null;
    this.notify();
  }
  async run() {
    try {
      await runTaskPool(
        this.accounts,
        async (account) => {
          const item = this.items.get(account.id);
          item.state = "running";
          this.notify();
          let passed = false;
          try {
            passed = (await this.check(account))?.blocked === false;
          } catch {
            /* Network errors can contain proxy credentials. */
          }
          if (this.job.state !== "running") return;
          this.job.processed++;
          item.state = passed ? "complete" : "failed";
          if (!passed) item.message = localeText.message_646402d;
          if (passed) this.job.passed++;
          else
            this.job.failed.push({
              accountId: account.id,
              message: localeText.message_646402d,
            });
          this.notify();
        },
        {
          concurrency: this.job.concurrency,
          startIntervalMs: this.job.delayMs,
          signal: this.controller.signal,
          isCancelled: () => this.job.state !== "running",
          onActive: (accounts) => {
            if (this.job.state !== "running") return;
            this.job.currentIds = accounts.map((account) => account.id);
            this.job.currentId = this.job.currentIds[0] ?? null;
            this.notify();
          },
        },
      );
      if (this.job.state === "running") this.job.state = "done";
    } finally {
      this.job.currentId = null;
      this.job.currentIds = [];
      this.accounts = [];
      this.notify();
    }
  }
}
module.exports = { ProxyCheckQueue };
