"use strict";

// Add future Trade Protection games here. Each game receives its own offers.
const TRADE_PROTECTION_APP_IDS = Object.freeze([730]);
const isTradeProtectedApp = (appid) =>
  TRADE_PROTECTION_APP_IDS.includes(Number(appid));

function planOfferAssets(assets, maxPositions = 8192) {
  if (
    !Number.isInteger(maxPositions) ||
    maxPositions < 1 ||
    maxPositions > 8192
  )
    throw new RangeError("Offer position limit must be between 1 and 8192.");
  const groups = new Map();
  for (const asset of assets) {
    const key = isTradeProtectedApp(asset.appid)
      ? "protected:" + Number(asset.appid)
      : "unprotected";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }
  const offers = [];
  for (const group of groups.values())
    for (let offset = 0; offset < group.length; offset += maxPositions)
      offers.push(group.slice(offset, offset + maxPositions));
  return offers;
}

module.exports = {
  TRADE_PROTECTION_APP_IDS,
  isTradeProtectedApp,
  planOfferAssets,
};
