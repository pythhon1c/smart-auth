"use strict";
const localeText = require("../locales/application.json");
// Ported from the owner's Smart Trader export 1.21.20 (04fee40):
// offerwatch, autoaccept, quickaccept, accept-monitor and lib/trade-items.
// Preserve exact asset amounts and refuse incomplete data; unlike the browser
// queue, a possibly dispatched acceptance is never automatically resent.
const crypto = require("node:crypto");
const { OfferRecord } = require("./trade-offer-record.cjs");
const {
  createTradeCommunitySession,
} = require("./trade-community-session.cjs");
const { itemMetadata, stackItems } = require("./item-stacks.cjs");
const API = "https://api.steampowered.com/IEconService/";
const COMMUNITY = "https://steamcommunity.com";
const ID = /^[1-9]\d{0,19}$/;
const UINT = /^\d{1,20}$/;
function digits(value, positive = false) {
  const s =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value;
  if (typeof s !== "string" || !UINT.test(s) || (positive && BigInt(s) === 0n))
    throw new Error(localeText.validationMessage_9e05bf6);
  return s;
}
function side(items) {
  if (!Array.isArray(items))
    throw new Error(localeText.validationMessage_f082fe9);
  // No slice, display cap or floating point conversion may establish emptiness.
  const result = items.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      item.missing === true ||
      item.missing === 1
    )
      throw new Error(localeText.validationMessage_52c689f);
    return {
      appid: digits(item.appid, true),
      contextid: digits(item.contextid),
      assetid: digits(item.assetid, true),
      amount: digits(item.amount, true),
      ...(item.classid !== undefined ? { classid: digits(item.classid) } : {}),
      ...(item.instanceid !== undefined
        ? { instanceid: digits(item.instanceid) }
        : {}),
    };
  });
  const keys = new Set(
    result.map((x) => `${x.appid}:${x.contextid}:${x.assetid}`),
  );
  if (keys.size !== result.length)
    throw new Error(localeText.validationMessage_188dc31);
  return result;
}
function offerHeader(raw) {
  if (
    !raw ||
    typeof raw.tradeofferid !== "string" ||
    !ID.test(raw.tradeofferid) ||
    !Number.isInteger(raw.trade_offer_state) ||
    raw.trade_offer_state < 2 ||
    raw.trade_offer_state > 11 ||
    raw.is_our_offer !== false ||
    !Number.isSafeInteger(raw.accountid_other) ||
    raw.accountid_other <= 0 ||
    raw.accountid_other > 4294967295
  )
    throw new Error(localeText.validationMessage_c69b8f5);
  return {
    id: raw.tradeofferid,
    state: raw.trade_offer_state,
    partnerSteamId: String(76561197960265728n + BigInt(raw.accountid_other)),
  };
}
const TERMINAL_OFFER_STATES = new Set([3, 4, 5, 6, 7, 8, 10, 11]);
function parseOffer(raw) {
  const header = offerHeader(raw);
  // Web API protobuf JSON omits empty repeated fields. This is a candidate
  // only: acceptance independently proves both complete sides in Steam's page.
  const give = side(raw.items_to_give === undefined ? [] : raw.items_to_give),
    receive = side(
      raw.items_to_receive === undefined ? [] : raw.items_to_receive,
    );
  return {
    ...header,
    give,
    receive,
    giveAmount: give.reduce((n, x) => n + BigInt(x.amount), 0n).toString(),
    receiveAmount: receive
      .reduce((n, x) => n + BigInt(x.amount), 0n)
      .toString(),
    gift:
      raw.trade_offer_state === 2 && give.length === 0 && receive.length > 0,
    updatedAt: Number.isSafeInteger(raw.time_updated) ? raw.time_updated : 0,
  };
}
function fingerprint(offer) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        offer.id,
        offer.partnerSteamId,
        ...[offer.give, offer.receive].map((s) =>
          s
            .map((x) => [x.appid, x.contextid, x.assetid, x.amount].join(":"))
            .sort(),
        ),
      ]),
    )
    .digest("hex");
}
function previewStacks(offer, descriptions) {
  const descriptionsByKey = new Map();
  for (const description of Array.isArray(descriptions) ? descriptions : []) {
    if (description && typeof description === "object")
      descriptionsByKey.set(
        `${description.appid}:${description.classid}:${description.instanceid ?? "0"}`,
        description,
      );
  }
  const items = [];
  for (const [direction, assets] of [
    ["outgoing", offer.give],
    ["incoming", offer.receive],
  ])
    for (const asset of assets) {
      const description = descriptionsByKey.get(
        `${asset.appid}:${asset.classid}:${asset.instanceid ?? "0"}`,
      );
      const name = String(
        description?.market_hash_name ||
          description?.market_name ||
          description?.name ||
          `Steam item ${asset.appid}`,
      )
        .replace(/[\p{Cc}\p{Cf}]/gu, " ")
        .slice(0, 300);
      const exact = BigInt(asset.amount);
      items.push({
        direction,
        name,
        ...itemMetadata({ ...asset, description: description || {} }),
        quantity: exact <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(exact) : 1,
        ...(exact > BigInt(Number.MAX_SAFE_INTEGER)
          ? { exactQuantity: asset.amount }
          : {}),
      });
    }
  // Huge quantities keep a separate exact decimal alongside the bounded display
  // quantity; asset data above is the sole input to any acceptance decision.
  const normal = stackItems(items.filter((x) => !x.exactQuantity));
  return [...normal, ...items.filter((x) => x.exactQuantity)];
}
function json(result) {
  let data;
  try {
    data = JSON.parse(String(result.body));
  } catch {
    throw new Error(localeText.validationMessage_8cc147e);
  }
  if (
    !data?.response ||
    typeof data.response !== "object" ||
    Array.isArray(data.response)
  )
    throw new Error(localeText.validationMessage_8a29889);
  return data.response;
}
const JOURNAL_STATES = new Set([
  "dispatching",
  "unknown",
  "mobile-confirmation",
  "email-confirmation",
  "accepted",
  "expired",
  "cancelled",
  "declined",
  "invalid",
  "escrow",
]);
const RESULT_MESSAGES = Object.freeze({
  dispatching: localeText.dispatchingText,
  unknown: localeText.unknownText,
  "mobile-confirmation": localeText.message_573a67d,
  "email-confirmation": localeText.message_005f48e,
  accepted: localeText.acceptedText,
  expired: localeText.expiredText,
  cancelled: localeText.cancelledText,
  declined: localeText.declinedText,
  invalid: localeText.invalidText,
  escrow: localeText.escrowText,
});
function validateTradeJournal(entries) {
  if (!Array.isArray(entries) || entries.length > 10000)
    throw new Error(localeText.validationMessage_5bf8439);
  const seen = new Set();
  return entries.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !ID.test(entry.offerId) ||
      typeof entry.offerId !== "string" ||
      typeof entry.partnerSteamId !== "string" ||
      !/^765\d{14}$/.test(entry.partnerSteamId) ||
      typeof entry.requestId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(entry.requestId) ||
      typeof entry.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.fingerprint) ||
      !JOURNAL_STATES.has(entry.state) ||
      typeof entry.createdAt !== "string" ||
      !Number.isFinite(Date.parse(entry.createdAt)) ||
      (entry.checkedAt !== undefined &&
        (typeof entry.checkedAt !== "string" ||
          !Number.isFinite(Date.parse(entry.checkedAt)))) ||
      seen.has(entry.offerId)
    )
      throw new Error(localeText.validationMessage_be81692);
    seen.add(entry.offerId);
    return {
      requestId: entry.requestId,
      offerId: entry.offerId,
      partnerSteamId: entry.partnerSteamId,
      fingerprint: entry.fingerprint,
      state: entry.state,
      createdAt: entry.createdAt,
      ...(entry.checkedAt !== undefined ? { checkedAt: entry.checkedAt } : {}),
    };
  });
}
function mergeTradeJournals(...journals) {
  const merged = new Map();
  for (const journal of journals)
    for (const entry of validateTradeJournal(journal || [])) {
      const previous = merged.get(entry.offerId);
      if (!previous) merged.set(entry.offerId, entry);
      else if (
        previous.fingerprint !== entry.fingerprint ||
        previous.partnerSteamId !== entry.partnerSteamId ||
        previous.state !== entry.state
      )
        merged.set(entry.offerId, { ...previous, state: "unknown" });
    }
  return validateTradeJournal([...merged.values()]);
}
class TradeOfferService {
  constructor({
    steam,
    onChange = async () => {},
    onEvent = () => {},
    isCurrent = () => true,
    canAutoAccept = () => false,
    isAdminAllowed = () => false,
    now = Date.now,
    maxPages = 1000,
  } = {}) {
    if (!steam) throw new Error(localeText.validationMessage_362b67b);
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10000)
      throw new Error(localeText.validationMessage_b59c7aa);
    Object.assign(this, {
      steam,
      onChange,
      onEvent,
      isCurrent,
      canAutoAccept,
      isAdminAllowed,
      now,
      maxPages,
    });
    this.epoch = 0;
    this.busy = new Set();
    this.polling = new Set();
    this.snapshots = new Map();
  }
  cancelAll() {
    this.epoch++;
    this.snapshots.clear();
  }
  snapshot(account, { summaryOnly = false } = {}) {
    const value = this.snapshots.get(account.id);
    if (
      value?.steamId !== account.steamId ||
      this.now() - value.snapshot.checkedAt > 5 * 60 * 1000
    )
      return { count: null };
    return summaryOnly
      ? { count: value.snapshot.count, checkedAt: value.snapshot.checkedAt }
      : structuredClone(value.snapshot);
  }
  _context(account) {
    const ctx = {
      epoch: this.epoch,
      steamEpoch: this.steam.epoch,
      steamId: account.steamId,
      session: account.mafile?.Session,
      token: account.mafile?.Session?.AccessToken,
      sessionid: account.mafile?.Session?.SessionID,
      deadline: Date.now() + 120000,
      bytes: 0,
    };
    this._check(account, ctx);
    return ctx;
  }
  _check(account, ctx) {
    if (Date.now() >= ctx.deadline)
      throw new Error(localeText.validationMessage_baa2ab6);
    if (
      ctx.epoch !== this.epoch ||
      ctx.steamEpoch !== this.steam.epoch ||
      !this.isCurrent(account) ||
      account.steamId !== ctx.steamId ||
      account.mafile?.Session !== ctx.session ||
      ctx.session?.AccessToken !== ctx.token ||
      ctx.session?.SessionID !== ctx.sessionid
    )
      throw new Error(localeText.validationMessage_46b482a);
    let token;
    try {
      token = JSON.parse(Buffer.from(ctx.token.split(".")[1], "base64url"));
    } catch {}
    if (
      !token ||
      token.sub !== account.steamId ||
      !Number.isSafeInteger(token.exp) ||
      token.exp <= this.now() / 1000
    )
      throw new Error(localeText.validationMessage_6b32873);
  }
  async _ready(account) {
    if (!this.isCurrent(account))
      throw new Error(localeText.validationMessage_ca8421a);
    const epoch = this.epoch;
    if (typeof this.steam.ensureSession === "function")
      await this.steam.ensureSession(account, {
        assertCurrent: () => {
          if (epoch !== this.epoch || !this.isCurrent(account))
            throw new Error(localeText.operationCancelled_bd689af);
        },
      });
    else await this.steam._refresh(account);
    if (epoch !== this.epoch)
      throw new Error(localeText.operationCancelled_bd689af);
    return this._context(account);
  }
  async _request(account, ctx, url, options = {}) {
    this._check(account, ctx);
    if (Date.now() >= ctx.deadline)
      throw new Error(localeText.validationMessage_baa2ab6);
    const result = await this.steam._request(
      account,
      url,
      { ...options, deadline: ctx.deadline },
      ctx.steamEpoch,
    );
    this._check(account, ctx);
    const bytes = Buffer.isBuffer(result.body)
      ? result.body.length
      : Buffer.byteLength(String(result.body));
    ctx.bytes += bytes;
    if (ctx.bytes > 128 * 1024 * 1024 || Date.now() >= ctx.deadline)
      throw new Error(localeText.validationMessage_4a0c812);
    return result;
  }
  async _api(account, ctx, method, params = {}) {
    const query = new URLSearchParams({ access_token: ctx.token, ...params });
    return json(
      await this._request(account, ctx, `${API}${method}/v1/?${query}`, {
        retrySafe: true,
        maxBodyBytes: 16 * 1024 * 1024,
      }),
    );
  }
  async _list(account, ctx) {
    let cursor = "0";
    const cursors = new Set(),
      offers = new Map(),
      seenOffers = new Set();
    for (let page = 0; page < this.maxPages; page++) {
      if (cursors.has(cursor))
        throw new Error(localeText.validationMessage_d328677);
      cursors.add(cursor);
      const data = await this._api(account, ctx, "GetTradeOffers", {
        get_received_offers: "1",
        active_only: "1",
        get_descriptions: "1",
        cursor,
      });
      if (
        data.trade_offers_received === undefined &&
        data.next_cursor === undefined
      )
        throw new Error(localeText.validationMessage_b3516bf);
      // Steam omits an empty array; it is safe only when an explicit zero cursor
      // terminates a real response. No offer with omitted sides is actionable.
      if (
        data.trade_offers_received !== undefined &&
        !Array.isArray(data.trade_offers_received)
      )
        throw new Error(localeText.validationMessage_5d433a6);
      for (const raw of data.trade_offers_received || []) {
        const header = offerHeader(raw);
        if (seenOffers.has(header.id))
          throw new Error(localeText.validationMessage_cb02df9);
        seenOffers.add(header.id);
        // active_only can include a just-completed received offer whose moved
        // assets Steam marks missing. Validate its header and deduplicate it,
        // then omit known terminal states before inspecting obsolete assets.
        if (TERMINAL_OFFER_STATES.has(header.state)) continue;
        const offer = parseOffer(raw);
        offer.previewStacks = previewStacks(offer, data.descriptions);
        offers.set(offer.id, offer);
      }
      if (data.next_cursor === undefined || String(data.next_cursor) === "0")
        return [...offers.values()];
      cursor = digits(data.next_cursor);
    }
    throw new Error(localeText.validationMessage_e9da0b0);
  }
  async list(account) {
    return this._list(account, await this._ready(account));
  }
  async poll(account, { autoAccept = false, autoAcceptAdmins = false } = {}) {
    if (this.polling.has(account.id))
      throw new Error(localeText.validationMessage_c78e5c4);
    this.polling.add(account.id);
    this.snapshots.delete(account.id);
    try {
      const ctx = await this._ready(account);
      const summary = await this._api(account, ctx, "GetTradeOffersSummary");
      if (!Object.keys(summary).length)
        throw new Error(localeText.validationMessage_e2971fc);
      const count = (k) => {
        const v = summary[k] ?? 0;
        if (!Number.isSafeInteger(v) || v < 0)
          throw new Error(localeText.validationMessage_d3a8346);
        return v;
      };
      const pending = count("pending_received_count"),
        fresh = count("new_received_count");
      let offers = await this._list(account, ctx);
      if (offers.filter((x) => x.state === 2).length < pending)
        throw new Error(localeText.validationMessage_eac5802);
      // Reconcile ambiguous acceptance using reads; only an independently
      // rebound pending admin mobile confirmation may create a separate action.
      // Bound work independently of asset count so a large historical journal
      // cannot monopolize every poll; oldest checked entries rotate the batch.
      const unresolved = (account.tradeOfferJournal || [])
        .filter((entry) =>
          [
            "dispatching",
            "unknown",
            "mobile-confirmation",
            "email-confirmation",
          ].includes(entry.state),
        )
        .sort(
          (a, b) =>
            Date.parse(a.checkedAt || a.createdAt) -
            Date.parse(b.checkedAt || b.createdAt),
        );
      let confirmedAdmin = false;
      for (const entry of unresolved.slice(0, 20)) {
        this._check(account, ctx);
        try {
          if (
            autoAcceptAdmins &&
            ["dispatching", "unknown", "mobile-confirmation"].includes(
              entry.state,
            ) &&
            this.isAdminAllowed(account, entry.partnerSteamId) === true &&
            !this.busy.has(account.id)
          ) {
            this.busy.add(account.id);
            try {
              confirmedAdmin =
                (await this._confirmAdmin(account, ctx, entry)) ||
                confirmedAdmin;
            } finally {
              this.busy.delete(account.id);
            }
          }
          await this._reconcileOne(account, ctx, entry);
        } catch {
          this._check(account, ctx);
        }
      }
      this._check(account, ctx);
      let dispatched = confirmedAdmin;
      if (autoAccept || autoAcceptAdmins)
        for (const offer of offers) {
          this._check(account, ctx);
          if (
            offer.state === 2 &&
            !(account.tradeOfferJournal || []).some(
              (x) => x.offerId === offer.id,
            )
          ) {
            if (
              autoAcceptAdmins &&
              this.isAdminAllowed(account, offer.partnerSteamId) === true
            ) {
              await this.acceptAdmin(account, offer.id);
              dispatched = true;
            } else if (
              autoAccept &&
              offer.gift &&
              this.canAutoAccept(account)
            ) {
              await this.acceptGift(account, offer.id);
              dispatched = true;
            }
          }
        }
      if (dispatched) offers = await this._list(account, ctx);
      // The bulk listing can lag a fresh per-offer terminal read. A durable
      // known outcome must not reappear as an actionable incoming offer.
      const completed = new Set(
        (account.tradeOfferJournal || [])
          .filter((entry) =>
            [
              "accepted",
              "expired",
              "cancelled",
              "declined",
              "invalid",
              "escrow",
            ].includes(entry.state),
          )
          .map((entry) => entry.offerId),
      );
      const listedCount = offers.length;
      offers = offers.filter((offer) => !completed.has(offer.id));
      const removedCompleted = offers.length !== listedCount;
      const activeCount = offers.filter((x) => x.state === 2).length;
      const snapshot = {
        count: activeCount,
        pending: dispatched || removedCompleted ? activeCount : pending,
        fresh,
        offers,
        checkedAt: this.now(),
      };
      this._check(account, ctx);
      this.snapshots.set(account.id, { steamId: account.steamId, snapshot });
      return snapshot;
    } finally {
      this.polling.delete(account.id);
    }
  }
  async _offer(account, ctx, id) {
    const data = await this._api(account, ctx, "GetTradeOffer", {
      tradeofferid: id,
      get_descriptions: "0",
    });
    if (data.offer?.tradeofferid !== id)
      throw new Error(localeText.validationMessage_59addd9);
    return parseOffer(data.offer);
  }
  async acceptGift(account, id) {
    return this._accept(account, id, false);
  }
  async acceptAdmin(account, id) {
    return this._accept(account, id, true);
  }
  async _accept(account, id, admin) {
    if (
      typeof id !== "string" ||
      !ID.test(id) ||
      (!admin && !this.canAutoAccept(account))
    )
      throw new Error(localeText.validationMessage_8b45a26);
    if (this.busy.has(account.id))
      throw new Error(localeText.validationMessage_222089d);
    if ((account.tradeOfferJournal || []).some((x) => x.offerId === id))
      throw new Error(localeText.validationMessage_61f05e4);
    this.busy.add(account.id);
    try {
      const ctx = await this._ready(account);
      const offer = await this._offer(account, ctx, id);
      const allowed = () =>
        admin
          ? this.isAdminAllowed(account, offer.partnerSteamId) === true
          : Boolean(this.canAutoAccept(account));
      if (admin) {
        if (offer.state !== 2 || !allowed())
          throw new Error(localeText.validationMessage_c85085e);
      } else if (!offer.gift)
        throw new Error(localeText.validationMessage_9a47926);
      if (offer.give.length + offer.receive.length > 8192)
        throw new Error(localeText.validationMessage_2cd2a21);
      const community =
        typeof this.steam.transport?.routes === "function" &&
        typeof this.steam.transport?.requestVia === "function"
          ? createTradeCommunitySession({
              steam: this.steam,
              account,
              offerId: id,
              deadline: ctx.deadline,
              assertCurrent: () => this._check(account, ctx),
              assertCanAccept: () => {
                this._check(account, ctx);
                if (!allowed())
                  throw new Error(localeText.validationMessage_517ddc5);
              },
              onResponse: (result) => {
                ctx.bytes += Buffer.isBuffer(result.body)
                  ? result.body.length
                  : Buffer.byteLength(String(result.body));
                if (ctx.bytes > 128 * 1024 * 1024)
                  throw new Error(localeText.validationMessage_4a0c812);
              },
            })
          : null;
      const page = community
        ? await community.page()
        : await this._request(account, ctx, `${COMMUNITY}/tradeoffer/${id}/`, {
            headers: { cookie: this.steam._cookie(account) },
            retrySafe: true,
            maxBodyBytes: 16 * 1024 * 1024,
          });
      const record = OfferRecord.parse(String(page.body), id);
      if (
        !record.ok ||
        record.partner !== offer.partnerSteamId ||
        (!admin && record.me.n !== 0) ||
        record.me.cur !== 0 ||
        record.me.cut ||
        record.them.cut ||
        (!admin && record.them.n === 0) ||
        record.them.cur !== 0 ||
        (!admin && record.hold.their !== 0)
      )
        throw new Error(
          admin ? localeText.message_5a1f135 : localeText.message_e633a89,
        );
      if (record.me.n + record.them.n > 8192)
        throw new Error(localeText.validationMessage_95655d5);
      const tuples = (items) =>
        items
          .map((x) => [x.appid, x.contextid, x.assetid, x.amount].join(":"))
          .sort();
      if (
        JSON.stringify(tuples(offer.give)) !==
          JSON.stringify(record.me.a.map((x) => x.join(":")).sort()) ||
        JSON.stringify(tuples(offer.receive)) !==
          JSON.stringify(record.them.a.map((x) => x.join(":")).sort())
      )
        throw new Error(localeText.validationMessage_2e6a5ba);
      // Final API read follows the page read; both sides and the exact partner
      // must still match the independently verified record before dispatch.
      const final = await this._offer(account, ctx, id);
      if (
        (admin ? final.state !== 2 || !allowed() : !final.gift) ||
        fingerprint(final) !== fingerprint(offer)
      )
        throw new Error(localeText.validationMessage_e5ffbf6);
      const sessionid = community
        ? community.sessionId()
        : ctx.session.SessionID;
      if (
        typeof sessionid !== "string" ||
        !/^[a-fA-F0-9]{16,64}$/.test(sessionid)
      )
        throw new Error(localeText.validationMessage_9f798ad);
      if ((account.tradeOfferJournal || []).length >= 10000)
        throw new Error(localeText.validationMessage_c8d86ef);
      const intent = {
        requestId: crypto.randomUUID(),
        offerId: id,
        partnerSteamId: offer.partnerSteamId,
        fingerprint: fingerprint(offer),
        state: "dispatching",
        createdAt: new Date(this.now()).toISOString(),
      };
      account.tradeOfferJournal ||= [];
      account.tradeOfferJournal.push(intent);
      await this.onChange(account);
      this._check(account, ctx);
      if (!allowed() || (community && community.sessionId() !== sessionid))
        throw new Error(localeText.validationMessage_517ddc5);
      try {
        const form = {
          sessionid,
          serverid: "1",
          tradeofferid: id,
          partner: offer.partnerSteamId,
          captcha: "",
        };
        const response = community
          ? await community.accept(form)
          : await this._request(
              account,
              ctx,
              `${COMMUNITY}/tradeoffer/${id}/accept`,
              {
                method: "POST",
                retrySafe: false,
                beforeDispatch: () => {
                  this._check(account, ctx);
                  if (!allowed())
                    throw new Error(localeText.validationMessage_517ddc5);
                },
                headers: {
                  cookie: this.steam._cookie(account),
                  "content-type": "application/x-www-form-urlencoded",
                  referer: `${COMMUNITY}/tradeoffer/${id}/`,
                },
                body: new URLSearchParams({
                  sessionid,
                  serverid: "1",
                  tradeofferid: id,
                  partner: offer.partnerSteamId,
                  captcha: "",
                }).toString(),
              },
            );
        const data = JSON.parse(String(response.body));
        intent.state = data.needs_mobile_confirmation
          ? "mobile-confirmation"
          : data.needs_email_confirmation
            ? "email-confirmation"
            : "unknown";
      } catch {
        intent.state = "unknown";
      }
      this._check(account, ctx);
      await this.onChange(account);
      if (admin && intent.state === "mobile-confirmation") {
        try {
          await this._confirmAdmin(account, ctx, intent);
        } catch {
          this._check(account, ctx);
        }
      }
      // A read may resolve uncertainty; it never permits another mutation.
      let resolved = false;
      try {
        resolved = await this._reconcileOne(account, ctx, intent);
      } catch {
        /* keep durable ambiguous intent */
      }
      if (!resolved) {
        this._check(account, ctx);
        this._result(account, intent);
      }
      return { offerId: id, state: intent.state };
    } finally {
      this.busy.delete(account.id);
    }
  }
  async _confirmAdmin(account, ctx, entry) {
    if (
      typeof this.steam.listConfirmations !== "function" ||
      typeof this.steam.respond !== "function"
    )
      return false;
    const { offerId, partnerSteamId, fingerprint: expected } = entry;
    let expectedState = entry.state;
    if (
      !["dispatching", "unknown", "mobile-confirmation"].includes(expectedState)
    )
      return false;
    const guard = () => {
      this._check(account, ctx);
      if (
        this.isAdminAllowed(account, partnerSteamId) !== true ||
        !(account.tradeOfferJournal || []).includes(entry) ||
        entry.offerId !== offerId ||
        entry.partnerSteamId !== partnerSteamId ||
        entry.fingerprint !== expected ||
        entry.state !== expectedState
      )
        throw Error(localeText.message_16db535);
    };
    guard();
    const offer = await this._offer(account, ctx, offerId);
    guard();
    if (offer.state !== 9 || fingerprint(offer) !== expected) return false;
    if (expectedState !== "mobile-confirmation") {
      entry.state = expectedState = "mobile-confirmation";
      await this.onChange(account);
      guard();
    }
    const confirmations = await this.steam.listConfirmations(account);
    guard();
    const matching = confirmations.filter(
      (item) => item.type === 2 && item.creatorId === offerId,
    );
    if (
      matching.length !== 1 ||
      matching[0].held ||
      (account.confirmationJournal || []).some(
        (item) => item.confirmationId === matching[0].id,
      )
    )
      return false;
    const final = await this._offer(account, ctx, offerId);
    guard();
    if (final.state !== 9 || fingerprint(final) !== expected) return false;
    await this.steam.respond(account, matching[0].id, true, {
      assertCurrent: guard,
    });
    guard();
    return true;
  }
  _result(account, entry) {
    this.onEvent({
      accountId: account.id,
      type: "trade-offer-result",
      offerId: entry.offerId,
      state: entry.state,
      message: RESULT_MESSAGES[entry.state] || localeText.message_b65e5c3,
    });
  }
  async _reconcileOne(account, ctx, entry) {
    const data = await this._api(account, ctx, "GetTradeOffer", {
      tradeofferid: entry.offerId,
      get_descriptions: "0",
    });
    const offer = data.offer;
    if (
      offer?.tradeofferid !== entry.offerId ||
      offer.is_our_offer !== false ||
      String(76561197960265728n + BigInt(offer.accountid_other || 0)) !==
        entry.partnerSteamId
    )
      throw new Error(localeText.validationMessage_f420b03);
    const states = {
      3: "accepted",
      5: "expired",
      6: "cancelled",
      7: "declined",
      8: "invalid",
      10: "cancelled",
      11: "escrow",
    };
    entry.checkedAt = new Date(this.now()).toISOString();
    if (states[offer.trade_offer_state]) {
      entry.state = states[offer.trade_offer_state];
      await this.onChange(account);
      this._check(account, ctx);
      this._result(account, entry);
      return true;
    } else {
      await this.onChange(account);
      this._check(account, ctx);
      return false;
    }
  }
  async reconcile(account) {
    const ctx = await this._ready(account);
    for (const entry of account.tradeOfferJournal || [])
      if (
        [
          "dispatching",
          "unknown",
          "mobile-confirmation",
          "email-confirmation",
        ].includes(entry.state)
      )
        await this._reconcileOne(account, ctx, entry);
  }
}
module.exports = {
  TradeOfferService,
  parseOffer,
  fingerprint,
  validateTradeJournal,
  mergeTradeJournals,
};
