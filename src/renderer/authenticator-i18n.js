"use strict";
const authenticatorI18nLocale = window.SmartLocaleData;
window.AuthenticatorI18n = (() => {
  let locale = "en";
  const words = new Map();
  for (const line of `${authenticatorI18nLocale.translationTable}`.split(
    "\n",
  )) {
    const [en, ua, ru] = line.split("|");
    words.set(en, { en: en === "Hidden code" ? "••• •••" : en, ua, ru });
  }
  words.set(authenticatorI18nLocale.message_43f5d75, {
    en: "Incomplete 2FA import bundle. Import every QR part together.",
    ua: authenticatorI18nLocale.uaText,
    ru: authenticatorI18nLocale.ruText,
  });
  for (const [key, en, ru] of [
    [
      authenticatorI18nLocale.couldNotSaveTheVaultTheBackupMayHaveDifferentAccessSettingsKeepBoth,
      "Could not save the vault. The backup may have different access settings; keep both files.",
      authenticatorI18nLocale.couldNotSaveTheVaultTheBackupMayHaveDifferentAccessSettingsKeepBoth_7256876,
    ],
    [
      authenticatorI18nLocale.couldNotSafelySaveTheBackup,
      "Could not safely save the backup.",
      authenticatorI18nLocale.couldNotSafelySaveTheBackup_2b23b22,
    ],
    [
      authenticatorI18nLocale.message_80bec8e,
      "Invalid 2FA manager data. Check the secret and account settings.",
      authenticatorI18nLocale.message_1378d1a,
    ],
    [
      authenticatorI18nLocale.message_86040dc,
      "2FA account not found.",
      authenticatorI18nLocale.message_14ee023,
    ],
    [
      authenticatorI18nLocale.message_79b93c1,
      "This 2FA account changed. Refresh before saving.",
      authenticatorI18nLocale.message_a2c58de,
    ],
    [
      authenticatorI18nLocale.message_1c9977f,
      "2FA folder not found.",
      authenticatorI18nLocale.message_e3307f5,
    ],
    [
      authenticatorI18nLocale.message_6a7ebe1,
      "The 2FA import preview expired. Import it again.",
      authenticatorI18nLocale.message_2698807,
    ],
    [
      authenticatorI18nLocale.message_a032ca6,
      "The 2FA import contains repeated accounts.",
      authenticatorI18nLocale.message_8ac7996,
    ],
  ])
    words.set(key, { en, ua: key, ru });
  return {
    get locale() {
      return locale;
    },
    set(value) {
      const key = String(value).toLowerCase().split("-")[0];
      locale =
        key === "uk" ? "ua" : ["ua", "en", "ru"].includes(key) ? key : "en";
    },
    t(key) {
      return words.get(key)?.[locale] || key;
    },
  };
})();
