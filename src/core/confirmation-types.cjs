"use strict";
const localeText = require("../locales/application.json");
// Observed mobileconf identifiers, not IAuthenticationService guard types.
// Unknown/security confirmations deliberately have no automatic policy mapping.
const definitions = [
  [
    2,
    "trade",
    "transaction",
    "autoTrades",
    [localeText.message_9f287fe, "Trade", localeText.message_605d2fc],
  ],
  [
    3,
    "market-sale",
    "transaction",
    "autoMarket",
    [localeText.message_05c4361, "Market sale", localeText.message_ccfe6ee],
  ],
  [
    6,
    "account-recovery",
    "security",
    null,
    [
      localeText.accountRecovery,
      "Account recovery",
      localeText.accountRecovery_d9850fa,
    ],
  ],
  [
    9,
    "api-key-creation",
    "security",
    null,
    [
      localeText.apiKeyCreation,
      "API key creation",
      localeText.apiKeyCreation_5b893ee,
    ],
  ],
  [
    12,
    "market-purchase",
    "transaction",
    "autoMarketPurchases",
    [localeText.marketPurchase, "Market purchase", localeText.message_ec31fff],
  ],
];
const registry = new Map(
  definitions.map(([type, key, category, automationPolicy, labels]) => [
    type,
    Object.freeze({
      type,
      key,
      category,
      manual: true,
      automationPolicy,
      labels: Object.freeze({ ua: labels[0], en: labels[1], ru: labels[2] }),
    }),
  ]),
);
function getConfirmationType(type) {
  if (!Number.isSafeInteger(type) || type < 0)
    throw new TypeError("Invalid Steam mobile confirmation type");
  return (
    registry.get(type) ||
    Object.freeze({
      type,
      key: "unknown",
      category: "unknown",
      manual: true,
      automationPolicy: null,
      labels: Object.freeze({
        ua: `${localeText.templateText}${type})`,
        en: `Other Steam request (${type})`,
        ru: `${localeText.templateText_e5c06d3}${type})`,
      }),
    })
  );
}
function confirmationTypeLabel(type, language = "ua") {
  const labels = getConfirmationType(type).labels;
  return labels[language] || labels.ua;
}
function canAutoConfirm(type, policy) {
  const field = getConfirmationType(type).automationPolicy;
  return Boolean(
    field && policy?.checkConfirmations === true && policy[field] === true,
  );
}
module.exports = { getConfirmationType, confirmationTypeLabel, canAutoConfirm };
