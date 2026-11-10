"use strict";
const lootI18nLocale = window.SmartLocaleData;
window.LootI18n = (() => {
  let locale = "en";
  const words = new Map();
  for (const line of `${lootI18nLocale.translationTable_d4b6682}`.split("\n")) {
    const [en, ua, ru] = line.split("|");
    words.set(en, { en, ua, ru });
  }
  for (const [key, en] of Object.entries({
    delivered: "Delivered (verified)",
    "retry-wait": "Waiting to retry",
    "retry-preparing": "Preparing retry",
    review: "Review required",
    "not-found": "Offer not found — available for next run",
    "rollback-review": "Return requires review",
    "accepted-awaiting-proof": "Accepted, awaiting delivery verification",
  }))
    words.get(key).en = en;
  words.set(lootI18nLocale.message_8ce6ecd, {
    en: "Could not verify the full inventory or Steam session.",
    ua: lootI18nLocale.message_8ce6ecd,
    ru: lootI18nLocale.ruText_06c705c,
  });
  words.set(lootI18nLocale.message_1da6628, {
    en: "The previous offer was found; no retry is needed.",
    ua: lootI18nLocale.message_1da6628,
    ru: lootI18nLocale.ruText_bf5ee24,
  });
  words.set(lootI18nLocale.message_cd0ff01, {
    en: "Could not verify safe sending.",
    ua: lootI18nLocale.message_cd0ff01,
    ru: lootI18nLocale.ruText_5ecc735,
  });
  words.set(lootI18nLocale.message_5137be9, {
    en: "Steam did not verify trade permissions for the items in this offer.",
    ua: lootI18nLocale.message_5137be9,
    ru: lootI18nLocale.ruText_c8fbefa,
  });
  const permissionMessage = new RegExp(lootI18nLocale.pattern_849cbd6, "");
  return {
    set(value) {
      locale =
        value === "uk"
          ? "ua"
          : ["en", "ua", "ru"].includes(value)
            ? value
            : "en";
    },
    t(key) {
      const message =
        typeof key === "string" ? permissionMessage.exec(key) : null;
      if (message && Number(message[2]) <= 2147483647) {
        const source = message[1] === lootI18nLocale.message_7bc7d54,
          appid = message[2];
        if (locale === "en")
          return source
            ? "Steam does not allow the source to send items from game " +
                appid +
                "."
            : "Steam does not allow the warehouse to receive items from game " +
                appid +
                ".";
        if (locale === "ru")
          return source
            ? lootI18nLocale.message_45beae8 + appid + "."
            : lootI18nLocale.message_7858b85 + appid + ".";
      }
      return words.get(key)?.[locale] || key;
    },
  };
})();
