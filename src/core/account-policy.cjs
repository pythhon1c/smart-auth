"use strict";
const localeText = require("../locales/application.json");
const INTERVAL_KEYS = Object.freeze([
  "checkConfirmations",
  "notifyConfirmations",
  "autoMarket",
  "autoMarketPurchases",
  "autoTrades",
  "watchIncomingTrades",
  "autoAcceptGifts",
]);
function accountPolicy(account) {
  const policy = {
    autoMarket: account.autoMarket ?? false,
    autoTrades: account.autoTrades ?? false,
    autoMarketPurchases: account.autoMarketPurchases ?? false,
    notifyConfirmations: account.notifyConfirmations ?? true,
    confirmationIntervalSeconds: account.confirmationIntervalSeconds ?? 60,
    watchIncomingTrades: account.watchIncomingTrades ?? false,
    autoAcceptGifts: account.autoAcceptGifts ?? false,
  };
  policy.checkConfirmations =
    account.checkConfirmations ??
    (policy.autoMarket || policy.autoTrades || policy.autoMarketPurchases);
  for (const key of [
    "autoMarket",
    "autoTrades",
    "autoMarketPurchases",
    "notifyConfirmations",
    "checkConfirmations",
    "watchIncomingTrades",
    "autoAcceptGifts",
  ])
    if (typeof policy[key] !== "boolean")
      throw Error(localeText.message_f759373);
  if (
    !Number.isInteger(policy.confirmationIntervalSeconds) ||
    policy.confirmationIntervalSeconds < 30 ||
    policy.confirmationIntervalSeconds > 86400
  )
    throw Error(localeText.message_750d2bb);
  const supplied = account.functionIntervalsSeconds ?? {};
  if (
    !supplied ||
    typeof supplied !== "object" ||
    Array.isArray(supplied) ||
    Object.keys(supplied).some((key) => !INTERVAL_KEYS.includes(key))
  )
    throw Error(localeText.message_f759373);
  policy.functionIntervalsSeconds = {};
  for (const key of INTERVAL_KEYS) {
    const value = supplied[key] ?? policy.confirmationIntervalSeconds;
    if (!Number.isInteger(value) || value < 30 || value > 86400)
      throw Error(localeText.message_750d2bb);
    policy.functionIntervalsSeconds[key] = value;
  }
  return policy;
}
// One network read can serve several due actions, but never advances another
// action's clock. Shared account/proxy pacing is still enforced by the scheduler.
function dueAccountActions(account, previous = {}, now = Date.now()) {
  const policy = accountPolicy(account),
    due = {};
  for (const key of INTERVAL_KEYS) {
    const enabled =
      policy[key] &&
      (!key.startsWith("auto") ||
        key === "autoAcceptGifts" ||
        policy.checkConfirmations) &&
      (key !== "notifyConfirmations" || policy.checkConfirmations);
    due[key] = Boolean(
      enabled &&
        (previous[key] === undefined ||
          now - previous[key] >= policy.functionIntervalsSeconds[key] * 1000),
    );
  }
  return due;
}
module.exports = { accountPolicy, INTERVAL_KEYS, dueAccountActions };
