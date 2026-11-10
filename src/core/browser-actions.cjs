"use strict";
const localeText = require("../locales/application.json");
function browserActionUrl(action) {
  if (action === undefined) return "https://steamcommunity.com/my/";
  if (
    !action ||
    typeof action !== "object" ||
    Array.isArray(action) ||
    !["incoming", "outgoing", "market"].includes(action.kind) ||
    (action.offerId !== undefined &&
      (typeof action.offerId !== "string" ||
        !/^[1-9]\d{0,19}$/.test(action.offerId)))
  )
    throw Error(localeText.invalidConfirmation);
  if (action.kind === "market") return "https://steamcommunity.com/market/";
  if (action.offerId !== undefined)
    return `https://steamcommunity.com/tradeoffer/${action.offerId}/`;
  // A fixed page per action keeps untrusted renderer URLs and confirmation HTML
  // out of browser navigation. Exact validated IDs avoid guessing which side
  // created an offer that requires mobile confirmation.
  return `https://steamcommunity.com/my/tradeoffers/${action.kind === "outgoing" ? "sent/" : ""}`;
}
module.exports = { browserActionUrl };
