"use strict";
const localeText = require("../locales/application.json");
const { LootService, lootCoverage, lootPendingCount } = require("./loot.cjs");

// Queue by Steam identity before taking a global slot, so a busy identity
// cannot consume the capacity needed by independent accounts.
class LootCoordinator {
  constructor(options) {
    this.options = options;
    this.services = new Map();
    this.data = null;
    this.retiringTasks = new Set();
    this.inventoryReadAt = new Map();
    this.rateLimitedUntil = new Map();
    this.tails = new Map();
    this.active = 0;
    this.waiters = [];
  }
  async _slot(assertCurrent) {
    while (this.active >= 4)
      await new Promise((resolve) => this.waiters.push(resolve));
    assertCurrent();
    this.active++;
  }
  async _work(id, action, { assertCurrent = () => {} } = {}) {
    assertCurrent();
    const data = this.options.getData();
    const account = data.accounts.find((a) => a.id === id);
    const key = account?.steamId || id;
    const previous = this.tails.get(key) || Promise.resolve();
    let release;
    const tail = new Promise((resolve) => {
      release = resolve;
    });
    this.tails.set(key, tail);
    await previous;
    let acquired = false;
    try {
      assertCurrent();
      await this._slot(assertCurrent);
      acquired = true;
      assertCurrent();
      const adapter =
        this.options.accountWork ||
        (async (accountId, fn) =>
          fn(this.options.getData().accounts.find((a) => a.id === accountId)));
      return await adapter(
        id,
        async (current) => {
          assertCurrent();
          return action(current);
        },
        { assertCurrent },
      );
    } finally {
      if (acquired) {
        this.active--;
        this.waiters.splice(0).forEach((resolve) => resolve());
      }
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
  service(id) {
    const data = this.options.getData();
    if (!data?.loot?.schemes?.some((s) => s.id === id))
      throw Error(localeText.message_63fd329);
    if (this.data !== data) {
      this.cancelAll();
      this.data = data;
    }
    let service = this.services.get(id);
    if (!service) {
      service = new LootService({
        ...this.options,
        schemeId: id,
        inventoryReadAt: this.inventoryReadAt,
        rateLimitedUntil: this.rateLimitedUntil,
        accountWork: (...args) => this._work(...args),
        onEvent: (event) => this.options.onEvent?.({ ...event, schemeId: id }),
      });
      this.services.set(id, service);
    }
    return service;
  }
  status(id) {
    return this.service(id).status();
  }
  statuses() {
    return (this.options.getData()?.loot?.schemes || []).map((s) => ({
      schemeId: s.id,
      ...this.status(s.id),
    }));
  }
  coverage(id) {
    const data = this.options.getData();
    return lootCoverage(
      data,
      data.loot.schemes.find((s) => s.id === id)?.settings,
    );
  }
  prepare(id) {
    return this.service(id).prepare();
  }
  start(id, options) {
    return this.service(id).start(options);
  }
  cancel(id) {
    return this.services.get(id)?.cancel() || { cancelled: true };
  }
  cancelAll() {
    for (const service of this.services.values()) {
      service.cancelAll();
      for (const task of [service.task, service.recoveryTask].filter(Boolean)) {
        this.retiringTasks.add(task);
        task.finally(() => this.retiringTasks.delete(task));
      }
    }
    this.services.clear();
    this.data = null;
    this.inventoryReadAt.clear();
    return { cancelled: true };
  }
  pendingCount(id) {
    return lootPendingCount(this.options.getData(), id);
  }
  canDelete(id) {
    const now = this.options.now?.() ?? Date.now();
    const monitoring = (this.options.getData()?.loot?.journal || []).some(
      (entry) =>
        (entry.schemeId ?? "legacy") === id &&
        entry.state === "delivered" &&
        Date.parse(entry.monitorUntil) > now,
    );
    return this.pendingCount(id) === 0 && !monitoring;
  }
  maybeRun() {
    return (this.options.getData()?.loot?.schemes || []).map((s) => {
      try {
        return { schemeId: s.id, ...this.service(s.id).maybeRun() };
      } catch (error) {
        return {
          schemeId: s.id,
          ...this.status(s.id),
          blocked: true,
          message: error.lootSafeMessage || error.message,
          coverage: error.coverage,
        };
      }
    });
  }
  async reconcile(id) {
    if (id) return this.service(id).reconcile();
    for (const scheme of this.options.getData()?.loot?.schemes || [])
      await this.service(scheme.id).reconcile();
    return this.statuses();
  }
  async wait(id) {
    if (id) return this.service(id).wait();
    await Promise.all([
      ...this.retiringTasks,
      ...[...this.services.values()].map((s) => s.wait()),
    ]);
    return this.statuses();
  }
}
module.exports = { LootCoordinator };
