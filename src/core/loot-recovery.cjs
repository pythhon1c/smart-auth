"use strict";

// Read-only evidence helpers. A missing/partial API result can never authorize
// another send. Persistence and account/session guards belong to the caller.
const BASE = 76561197960265728n;
const MAX_ASSETS = 8192;
const MAX_OFFERS = 10000;
function requireProof(ok) {
  if (!ok) throw Error("Invalid trade evidence");
}
function decimal(value, positive = true) {
  if (Number.isSafeInteger(value) && value >= 0) value = String(value);
  requireProof(typeof value === "string" && /^(0|[1-9]\d{0,31})$/.test(value));
  requireProof(!positive || BigInt(value) > 0n);
  return value;
}
function assetTuples(assets) {
  requireProof(
    Array.isArray(assets) && assets.length > 0 && assets.length <= MAX_ASSETS,
  );
  const seen = new Set();
  return assets
    .map((a) => {
      requireProof(
        a &&
          !a.missing &&
          Number.isSafeInteger(a.appid) &&
          a.appid > 0 &&
          a.appid <= 2147483647,
      );
      const key = [
        a.appid,
        decimal(a.contextid, false),
        decimal(a.assetid),
      ].join(":");
      requireProof(!seen.has(key));
      seen.add(key);
      return key + ":" + decimal(a.amount);
    })
    .sort();
}
function exactAssets(expected, actual) {
  const a = assetTuples(expected),
    b = assetTuples(actual);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function emptyAssets(value) {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}
function offerHeaderIdentity(entry, offer) {
  requireProof(offer && offer.is_our_offer === true);
  requireProof(
    Number.isSafeInteger(offer.accountid_other) &&
      offer.accountid_other > 0 &&
      offer.accountid_other <= 4294967295,
  );
  requireProof(
    (BASE + BigInt(offer.accountid_other)).toString() === entry.partnerSteamId,
  );
  decimal(offer.tradeofferid);
  if (offer.time_created !== undefined)
    requireProof(validTime(offer.time_created));
}
function validTime(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 253402300799;
}
function optionalTradeId(value) {
  if (value === undefined || value === "0" || value === 0) return undefined;
  return decimal(value);
}
// Header proof permits only a read of GetTradeStatus for an already bound ID.
// It deliberately does not prove payload, delivery, or release reservations.
function boundOfferHeader(entry, offer) {
  try {
    requireProof(
      typeof entry.offerId === "string" &&
        decimal(entry.offerId) === offer?.tradeofferid,
    );
    offerHeaderIdentity(entry, offer);
    requireProof([3, 11].includes(offer.trade_offer_state));
    const tradeId = optionalTradeId(offer.tradeid);
    return {
      state: offer.trade_offer_state === 11 ? "escrow" : "accepted",
      offerId: entry.offerId,
      ...(tradeId ? { tradeId } : {}),
      delivered: false,
      resendAllowed: false,
    };
  } catch {
    return { state: "review", delivered: false, resendAllowed: false };
  }
}
function offerIdentity(entry, offer) {
  offerHeaderIdentity(entry, offer);
  requireProof(
    emptyAssets(offer.items_to_receive) &&
      exactAssets(entry.assets, offer.items_to_give),
  );
}
function classifyOffer(entry, offer) {
  try {
    offerIdentity(entry, offer);
    requireProof(!entry.offerId || entry.offerId === offer.tradeofferid);
    const states = {
      2: "sent",
      3: "accepted",
      4: "invalid",
      5: "expired",
      6: "cancelled",
      7: "declined",
      8: "invalid",
      9: "mobile-confirmation",
      10: "cancelled",
      11: "escrow",
    };
    requireProof(
      Number.isSafeInteger(offer.trade_offer_state) &&
        states[offer.trade_offer_state],
    );
    const state = states[offer.trade_offer_state];
    const tradeId = optionalTradeId(offer.tradeid);
    return {
      state,
      offerId: offer.tradeofferid,
      ...(tradeId ? { tradeId } : {}),
      delivered: false,
      resendAllowed: false,
    };
  } catch {
    return { state: "review", delivered: false, resendAllowed: false };
  }
}
function findRecoveryCandidates(
  entry,
  offers,
  { complete = false, windowSeconds = 300 } = {},
) {
  const result = {
    state: "unknown",
    candidateIds: [],
    complete: false,
    resendAllowed: false,
  };
  try {
    requireProof(Array.isArray(offers) && offers.length <= MAX_OFFERS);
    requireProof(
      Number.isSafeInteger(windowSeconds) &&
        windowSeconds >= 0 &&
        windowSeconds <= 86400,
    );
    const created = Date.parse(entry.createdAt) / 1000;
    requireProof(
      Number.isFinite(created) && created > 0 && created <= 253402300799,
    );
    assetTuples(entry.assets);
    let malformed = false;
    const ids = new Set();
    for (const offer of offers) {
      try {
        // Validate every row before allowing a unique result; corrupt rows may
        // conceal a second matching offer in an otherwise complete response.
        requireProof(
          offer &&
            typeof offer.is_our_offer === "boolean" &&
            validTime(offer.time_created),
        );
        decimal(offer.tradeofferid);
        if (
          !offer.is_our_offer ||
          Math.abs(offer.time_created - created) > windowSeconds
        )
          continue;
        requireProof(Number.isSafeInteger(offer.accountid_other));
        if (
          (BASE + BigInt(offer.accountid_other)).toString() !==
          entry.partnerSteamId
        )
          continue;
        // A valid neighboring offer is not an incomplete API row. Validate its
        // payload before comparing so malformed/missing items still fail closed.
        offerHeaderIdentity(entry, offer);
        requireProof(Array.isArray(offer.items_to_give));
        if (offer.items_to_give.length) assetTuples(offer.items_to_give);
        if (offer.items_to_receive !== undefined) {
          requireProof(Array.isArray(offer.items_to_receive));
          if (offer.items_to_receive.length)
            assetTuples(offer.items_to_receive);
        }
        if (
          !offer.items_to_give.length ||
          !emptyAssets(offer.items_to_receive) ||
          !exactAssets(entry.assets, offer.items_to_give)
        )
          continue;
        // A supplied message must match our persisted request marker exactly.
        if (
          offer.message !== undefined &&
          offer.message !== "smart-auth loot " + entry.requestId &&
          offer.message !== "Smart SDA loot " + entry.requestId
        )
          continue;
        ids.add(offer.tradeofferid);
      } catch {
        malformed = true;
      }
    }
    result.candidateIds = [...ids];
    result.complete = complete === true && !malformed;
    if (ids.size > 1) result.state = "review";
    else if (ids.size === 1 && result.complete) {
      result.state = "recovered";
      result.offerId = result.candidateIds[0];
    }
    return result;
  } catch {
    return result;
  }
}
// A narrowly scoped retry policy, not proof that the prior POST was unsent.
// The caller supplies a just-completed, session-bound full inventory read.
function canResolveMissingOffer(
  entry,
  { offers, complete, inventory, inventoryReadAt, now } = {},
) {
  try {
    requireProof(
      entry &&
        ["unknown", "dispatching"].includes(entry.state) &&
        !entry.offerId,
    );
    const attempted = Date.parse(entry.attemptedAt || entry.createdAt);
    requireProof(
      Number.isFinite(now) &&
        Number.isFinite(attempted) &&
        now - attempted >= 60000,
    );
    requireProof(
      Number.isFinite(inventoryReadAt) &&
        now >= inventoryReadAt &&
        now - inventoryReadAt <= 30000,
    );
    const discovery = findRecoveryCandidates(entry, offers, { complete });
    requireProof(discovery.complete && discovery.candidateIds.length === 0);
    const wanted = new Set(
      assetTuples(entry.assets).map((t) => t.slice(0, t.lastIndexOf(":"))),
    );
    const ids = new Set();
    for (const offer of offers) {
      // Sent-only endpoint: missing direction, identity, quantities or payload
      // prevents proving absence, even for another partner or an older offer.
      requireProof(
        offer && offer.is_our_offer === true && validTime(offer.time_created),
      );
      const id = decimal(offer.tradeofferid);
      requireProof(!ids.has(id));
      ids.add(id);
      requireProof(
        Number.isSafeInteger(offer.accountid_other) &&
          offer.accountid_other > 0 &&
          offer.accountid_other <= 4294967295,
      );
      requireProof(
        Number.isSafeInteger(offer.trade_offer_state) &&
          offer.trade_offer_state >= 1 &&
          offer.trade_offer_state <= 255,
      );
      requireProof(Array.isArray(offer.items_to_give));
      requireProof(
        offer.items_to_give.length > 0 ||
          (Array.isArray(offer.items_to_receive) &&
            offer.items_to_receive.length > 0),
      );
      const given = offer.items_to_give.length
        ? assetTuples(offer.items_to_give)
        : [];
      if (offer.items_to_receive !== undefined) {
        requireProof(Array.isArray(offer.items_to_receive));
        if (offer.items_to_receive.length) assetTuples(offer.items_to_receive);
      }
      // Terminal failures cannot consume items; every other/unknown state can.
      if (![4, 5, 6, 7, 8, 10].includes(offer.trade_offer_state))
        requireProof(
          !given.some((t) => wanted.has(t.slice(0, t.lastIndexOf(":")))),
        );
    }
    requireProof(Array.isArray(inventory) && inventory.length <= 2000000);
    const current = new Map();
    for (const asset of inventory) {
      const tuple = assetTuples([asset])[0],
        key = tuple.slice(0, tuple.lastIndexOf(":"));
      requireProof(!current.has(key));
      current.set(key, tuple);
    }
    requireProof(
      assetTuples(entry.assets).every(
        (t) => current.get(t.slice(0, t.lastIndexOf(":"))) === t,
      ),
    );
    return true;
  } catch {
    return false;
  }
}
// Exchange status meanings and field names follow the upstream implementation:
// github.com/DoctorMcKay/node-steam-tradeoffer-manager/resources/ETradeStatus.js
// and lib/classes/TradeOffer.js#getExchangeDetails (GetTradeStatus/v1).
function classifyExchange(entry, trade, { tradeId = entry.tradeId } = {}) {
  try {
    requireProof(trade && decimal(trade.tradeid) === decimal(tradeId));
    if (trade.time_init !== undefined)
      requireProof(
        validTime(trade.time_init) &&
          trade.time_init >= Date.parse(entry.createdAt) / 1000 - 300,
      );
    requireProof(
      typeof trade.steamid_other === "string" &&
        trade.steamid_other === entry.partnerSteamId,
    );
    requireProof(
      Number.isSafeInteger(trade.status) &&
        trade.status >= 0 &&
        trade.status <= 11,
    );
    requireProof(
      emptyAssets(trade.assets_received) &&
        exactAssets(entry.assets, trade.assets_given),
    );
    const common = {
      tradeId: trade.tradeid,
      exchangeStatus: trade.status,
      delivered: false,
      resendAllowed: false,
    };
    if (trade.status === 10) return { ...common, state: "escrow" };
    if ([4, 5, 6, 7, 8, 9, 11].includes(trade.status))
      return { ...common, state: "rollback" };
    if (trade.status !== 3) return { ...common, state: "accepted" };
    const destinations = new Set();
    const delivery = trade.assets_given.map((a) => {
      const contextid = decimal(a.new_contextid, false),
        assetid = decimal(a.new_assetid);
      const key = [a.appid, contextid, assetid].join(":");
      requireProof(!destinations.has(key));
      destinations.add(key);
      requireProof(
        a.rollback_new_assetid === undefined ||
          decimal(a.rollback_new_assetid, false) === "0",
      );
      return { appid: a.appid, contextid, assetid, amount: decimal(a.amount) };
    });
    return { ...common, state: "delivered", delivered: true, delivery };
  } catch {
    return { state: "review", delivered: false, resendAllowed: false };
  }
}
module.exports = {
  assetTuples,
  exactAssets,
  classifyOffer,
  boundOfferHeader,
  findRecoveryCandidates,
  canResolveMissingOffer,
  classifyExchange,
};
