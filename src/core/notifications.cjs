"use strict";
const localeText = require("../locales/application.json");
const { accountPolicy } = require("./account-policy.cjs");
const { itemIdentity } = require("./item-stacks.cjs");

// IDs are session-local; preview text is bounded and cleared after delivery/lock.
const cleanName = (value) =>
  String(value ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
function stackPreview(items, incomplete = false) {
  const grouped = new Map();
  for (const item of items || []) {
    const name = cleanName(item?.name);
    if (!name) continue;
    const raw = String(item.exactQuantity ?? item.quantity ?? 1);
    const quantity = /^[1-9]\d{0,31}$/.test(raw) ? raw : "1";
    const direction = ["incoming", "outgoing"].includes(item.direction)
      ? item.direction
      : "unknown";
    const key = itemIdentity({ ...item, name, direction });
    const previous = key && grouped.get(key);
    if (previous)
      previous.quantity = (
        BigInt(previous.quantity) + BigInt(quantity)
      ).toString();
    else grouped.set(key || Symbol(), { name, quantity, direction });
  }
  const values = [...grouped.values()];
  if (!values.length) return null;
  return {
    items: values.slice(0, 4),
    omitted: Math.max(0, values.length - 4),
    ...(incomplete ? { incomplete: true } : {}),
  };
}
class NotificationCenter {
  constructor({ settings, emit, now = Date.now }) {
    this.settings = settings;
    this.emit = emit;
    this.now = now;
    this.seen = new Map();
    this.incomingSeen = new Map();
    this.errors = new Map();
    this.pending = 0;
    this.incoming = 0;
    this.failures = 0;
    this.pendingItems = [];
    this.incomingItems = [];
    this.pendingIncomplete = false;
    this.incomingIncomplete = false;
  }
  clear() {
    this.seen.clear();
    this.incomingSeen.clear();
    this.errors.clear();
    this.resetPending();
  }
  resetPending() {
    this.pending = this.incoming = this.failures = 0;
    this.pendingItems = [];
    this.incomingItems = [];
    this.pendingIncomplete = this.incomingIncomplete = false;
  }
  eligibleConfirmations(account, items) {
    if (
      !this.settings().notificationsEnabled ||
      account.notifyConfirmations === false
    )
      return [];
    const policy = accountPolicy(account),
      seen = this.seen.get(account.id);
    return (items || []).filter(
      (item) =>
        !item.held &&
        !(
          policy.checkConfirmations &&
          ((item.type === 2 && policy.autoTrades) ||
            (item.type === 3 && policy.autoMarket) ||
            (item.type === 12 && policy.autoMarketPurchases))
        ) &&
        !seen?.has(String(item.id)),
    );
  }
  unseenConfirmationIds(account, items) {
    return [
      ...new Set(
        this.eligibleConfirmations(account, items).map((item) =>
          String(item.id),
        ),
      ),
    ];
  }
  remember(map, accountId, id) {
    let seen = map.get(accountId);
    if (!seen) map.set(accountId, (seen = new Set()));
    if (seen.has(id)) return false;
    seen.add(id);
    while (seen.size > 2000) seen.delete(seen.values().next().value);
    return true;
  }
  confirmations(account, items, detailsById) {
    for (const item of this.eligibleConfirmations(account, items)) {
      if (!this.remember(this.seen, account.id, String(item.id))) continue;
      this.pending++;
      const detail =
        detailsById instanceof Map
          ? (detailsById.get(String(item.id)) ?? detailsById.get(item.id))
          : detailsById?.[item.id];
      if (detail?.items?.length) {
        this.pendingItems.push(...detail.items.slice(0, 100));
        if (detail.itemsTruncated || detail.items.length > 100)
          this.pendingIncomplete = true;
      } else this.pendingIncomplete = true;
      if (this.pendingItems.length > 400) {
        this.pendingItems.length = 400;
        this.pendingIncomplete = true;
      }
    }
  }
  incomingOffers(account, offers) {
    if (
      !this.settings().notificationsEnabled ||
      account.watchIncomingTrades !== true
    )
      return;
    for (const offer of offers || []) {
      if (
        Number(offer.state) !== 2 ||
        !offer.id ||
        !this.remember(this.incomingSeen, account.id, String(offer.id))
      )
        continue;
      this.incoming++;
      if (offer.previewStacks?.length) {
        this.incomingItems.push(...offer.previewStacks.slice(0, 100));
        if (offer.previewStacks.length > 100) this.incomingIncomplete = true;
      } else this.incomingIncomplete = true;
      if (this.incomingItems.length > 400) {
        this.incomingItems.length = 400;
        this.incomingIncomplete = true;
      }
    }
  }
  failure(account) {
    const settings = this.settings();
    if (!settings.notificationsEnabled || !settings.notifyErrors) return;
    const last = this.errors.get(account.id);
    if (last !== undefined && this.now() - last < 10 * 60 * 1000) return;
    this.errors.set(account.id, this.now());
    this.failures++;
  }
  flush() {
    if (this.settings().notificationsEnabled) {
      for (const [kind, count, items, incomplete] of [
        ["pending", this.pending, this.pendingItems, this.pendingIncomplete],
        [
          "incoming",
          this.incoming,
          this.incomingItems,
          this.incomingIncomplete,
        ],
      ]) {
        if (!count) continue;
        const stacks = stackPreview(items, incomplete);
        this.emit({ kind, count, ...(stacks ? { stacks } : {}) });
      }
      if (this.failures) this.emit({ kind: "error", count: this.failures });
    }
    this.resetPending();
  }
  test() {
    this.emit({ kind: "test", count: 1 });
  }
}

function notificationText(language, kind, count, stacks) {
  const copy = {
    ua: {
      incoming: [
        localeText.newIncomingTradeOffers,
        `${localeText.templateText_fc01552}${count}${localeText.templateText_28a9eb5}`,
      ],
      pending: [
        localeText.confirmationRequired,
        `${localeText.templateText_9962061}${count}${localeText.templateText_28a9eb5}`,
      ],
      error: [
        localeText.attentionRequired,
        `${localeText.templateText_a588a7f}${count}${localeText.templateText_8e65918}`,
      ],
      test: [
        localeText.notificationTest,
        localeText.smartSDANotificationsAreWorking,
      ],
    },
    en: {
      incoming: [
        "New incoming trade offers",
        `New offers: ${count}. Open smart-auth to review them.`,
      ],
      pending: [
        "Confirmation needed",
        `New requests: ${count}. Open smart-auth to review them.`,
      ],
      error: [
        "Attention needed",
        `Accounts could not be checked: ${count}. Check the route and session in smart-auth.`,
      ],
      test: ["Notification test", "smart-auth notifications are working."],
    },
    ru: {
      incoming: [
        localeText.newIncomingTradeOffers_e2e4888,
        `${localeText.templateText_7f43076}${count}${localeText.templateText_617330e}`,
      ],
      pending: [
        localeText.message_2b8de2e,
        `${localeText.templateText_c39a5d3}${count}${localeText.templateText_617330e}`,
      ],
      error: [
        localeText.attentionRequired_a82b9f2,
        `${localeText.templateText_7f953ac}${count}${localeText.templateText_ed77659}`,
      ],
      test: [
        localeText.notificationTest_b12a954,
        localeText.smartSDANotificationsAreWorking_e77ba49,
      ],
    },
  };
  const [title, body] = (copy[language] || copy.ua)[kind] || copy.ua.test;
  let message = body + notificationStackText(language, stacks);
  if (message.length > 500) {
    const tail = notificationStackText(language, {
      items: [],
      omitted: stacks?.omitted || 0,
      incomplete: true,
    });
    message = message.slice(0, 499 - tail.length) + "…" + tail;
  }
  return { title: `smart-auth · ${title}`, body: message };
}

function notificationStackText(language, stacks) {
  if (!stacks || !Array.isArray(stacks.items)) return "";
  const rows = stacks.items
    .slice(0, 4)
    .map((item) => {
      const name = cleanName(item.name),
        raw = String(item.exactQuantity ?? item.quantity ?? 1);
      const labels = {
        ua: [localeText.give, localeText.receive],
        en: ["Give", "Receive"],
        ru: [localeText.give_74c66f9, localeText.receive_bc2a14e],
      }[language] || [localeText.give, localeText.receive];
      const arrow =
        item.direction === "outgoing"
          ? "↑ " + labels[0] + " "
          : item.direction === "incoming"
            ? "↓ " + labels[1] + " "
            : "";
      return name
        ? arrow + name + " × " + (/^[1-9]\d{0,40}$/.test(raw) ? raw : "1")
        : "";
    })
    .filter(Boolean);
  if (Number.isSafeInteger(stacks.omitted) && stacks.omitted > 0)
    rows.push(
      (
        {
          en: "+{n} more stacks",
          ru: localeText.ruText,
          ua: localeText.uaText,
        }[language] || localeText.uaText
      ).replace("{n}", stacks.omitted),
    );
  if (stacks.incomplete)
    rows.push(
      {
        en: "View all items in smart-auth",
        ru: localeText.viewAllItemsInSmartSDA,
        ua: localeText.viewAllItemsInSmartSDA_54615da,
      }[language] || localeText.viewAllItemsInSmartSDA_54615da,
    );
  return rows.length ? "\n" + rows.join(" · ") : "";
}
module.exports = {
  NotificationCenter,
  notificationText,
  notificationStackText,
};
