"use strict";
const i18nLocale = window.SmartLocaleData;
// Only public appearance preferences persist outside the encrypted vault.
window.SmartI18n = (() => {
  const locale = window.navigator?.language?.toLowerCase().split("-")[0];
  let systemLanguage = locale === "uk" ? "ua" : locale === "ru" ? "ru" : "en";
  const systemColors = window.matchMedia?.("(prefers-color-scheme: dark)");
  const preferences = { language: systemLanguage, followSystemLanguage: true, theme: "system" };
  try {
    const saved = JSON.parse(
      localStorage.getItem("smart-sda-appearance") || "{}",
    );
    const legacy = typeof saved.followSystemLanguage !== "boolean";
    preferences.followSystemLanguage = legacy
      ? !["en", "ru"].includes(saved.language)
      : saved.followSystemLanguage;
    if (!preferences.followSystemLanguage && ["ua", "en", "ru"].includes(saved.language))
      preferences.language = saved.language;
    if (["dark", "light", "system"].includes(saved.theme) && !(legacy && saved.theme === "dark"))
      preferences.theme = saved.theme;
  } catch {}
  const appearanceKeys = (next) => {
    const valid = {};
    if (["ua", "en", "ru"].includes(next?.language)) {
      valid.language = next.language;
      valid.followSystemLanguage = next.followSystemLanguage === true;
    }
    if (["dark", "light", "system"].includes(next?.theme)) valid.theme = next.theme;
    return valid;
  };
  let pendingPreferences = {};
  try {
    pendingPreferences = appearanceKeys(
      JSON.parse(localStorage.getItem("smart-sda-pending-appearance") || "{}"),
    );
  } catch {}
  function savePending() {
    try {
      if (Object.keys(pendingPreferences).length)
        localStorage.setItem(
          "smart-sda-pending-appearance",
          JSON.stringify(pendingPreferences),
        );
      else localStorage.removeItem("smart-sda-pending-appearance");
    } catch {}
  }
  const dictionary = new Map();
  const entries = `${i18nLocale.translationTable_9b39cee}\n${i18nLocale.browserRuntimeTranslations}\n${i18nLocale.betaTranslations}\n${i18nLocale.singleImportTranslations}\n${i18nLocale.appUpdateTranslations}\n${i18nLocale.dataDirectoryTranslations}\n${i18nLocale.sessionAuthTranslations}\n${i18nLocale.settingsLayoutTranslations}\n${i18nLocale.localExtensionsTranslations}`;
  for (const line of entries.split("\n")) {
    const [ua, en, ru] = line.split("|");
    dictionary.set(ua, { ua, en, ru });
  }
  const patterns = [
    [
      new RegExp(i18nLocale.pattern, ""),
      (n) => [
        `Automatic confirmation rules updated for accounts: ${n}.`,
        `${i18nLocale.templateText_1a70f6c}${n}.`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_d49f17a, ""),
      (a, b) => [
        `Accounts imported: ${a}. Duplicates skipped: ${b}.`,
        `${i18nLocale.templateText_529a72a}${a}${i18nLocale.templateText_088894a}${b}.`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_36ae341, ""),
      (n) => [
        `Proxy lists imported: ${n}.`,
        `${i18nLocale.templateText_ee567b6}${n}.`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_b83fb57, ""),
      (n) => [
        `Accounts moved: ${n}.`,
        `${i18nLocale.templateText_7c38269}${n}.`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_b532970, ""),
      (n) => [
        `Direct connection (no proxy) · ${n}`,
        `${i18nLocale.directConnectionNoProxy_4cfec4e}${n}`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_eaa81d6, ""),
      (n) => [`${n} accounts`, `${n}${i18nLocale.templateText_03aad3d}`],
    ],
    [
      new RegExp(i18nLocale.pattern_309830c, ""),
      (n) => [`Backup ${n}`, `${i18nLocale.message_6af24b8}${n}`],
    ],
    [
      new RegExp(i18nLocale.pattern_406e91c, ""),
      (n) => [`Order: ${n}`, `${i18nLocale.templateText_a5f4179}${n}`],
    ],
    [
      new RegExp(i18nLocale.pattern_8865a12, ""),
      (n) => [`Proxies: ${n}`, `${i18nLocale.templateText_eb3b870}${n}`],
    ],
    [
      new RegExp(i18nLocale.pattern_3acc74e, ""),
      (n) => [`Selected: ${n}`, `${i18nLocale.templateText_3ef8b74}${n}`],
    ],
    [
      new RegExp(i18nLocale.pattern_960a308, ""),
      (a, b, c) => [
        `Ready: ${a} · Duplicates: ${b} · Errors: ${c}`,
        `${i18nLocale.templateText_6d248a2}${a}${i18nLocale.templateText_33d04bd}${b}${i18nLocale.templateText_c0689c9}${c}`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_8fe48d1, ""),
      (n) => [
        `A folder will be created: ${n}`,
        `${i18nLocale.templateText_9d8da16}${n}`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_01aa771, ""),
      (a, b) => [
        `Imported: ${a} · Duplicates: ${b}`,
        `${i18nLocale.templateText_d16103f}${a}${i18nLocale.templateText_33d04bd}${b}`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_b9939c8, ""),
      (n) => [`Via ${n}`, `${i18nLocale.templateText_d54dca6}${n}`],
    ],
    [
      new RegExp(i18nLocale.pattern_74bc54c, ""),
      (n) => [
        `Proxy ${n} is unavailable.`,
        `${i18nLocale.proxies_7e4b0bd}${n}${i18nLocale.templateText_e12d660}`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_bdab0fa, ""),
      (n, c) => [
        `${n} + ${c} backup(s)`,
        `${n} + ${c}${i18nLocale.templateText_1db3b57}`,
      ],
    ],
    [
      new RegExp(i18nLocale.pattern_92a2a7d, ""),
      (a, b) => [
        `Market: ${t(a)} · Trades: ${t(b)}`,
        `${i18nLocale.templateText_a27a8c2}${t(a)}${i18nLocale.templateText_bc8e7d1}${t(b)}`,
      ],
    ],
  ];
  function t(value) {
    if (typeof value !== "string" || preferences.language === "ua")
      return value;
    const match = dictionary.get(value);
    if (match) return match[preferences.language] || value;
    for (const [re, format] of patterns) {
      const m = value.match(re);
      if (m)
        return format(...m.slice(1))[preferences.language === "en" ? 0 : 1];
    }
    return value.replace(
      new RegExp(i18nLocale.pattern_dc41bf7, "gu"),
      preferences.language === "en" ? " ms" : i18nLocale.message_5160aea,
    );
  }
  function paintTheme() {
    document.documentElement.dataset.theme = preferences.theme === "system"
      ? (systemColors?.matches ? "dark" : "light")
      : preferences.theme;
  }
  systemColors?.addEventListener("change", paintTheme);
  function languageChoice(value) {
    return value === "system"
      ? { language: systemLanguage, followSystemLanguage: true }
      : { language: value, followSystemLanguage: false };
  }
  function apply(next = {}) {
    Object.assign(preferences, appearanceKeys(next));
    if (preferences.followSystemLanguage) preferences.language = systemLanguage;
    document.documentElement.lang =
      preferences.language === "ua" ? "uk" : preferences.language;
    paintTheme();
    try {
      localStorage.setItem("smart-sda-appearance", JSON.stringify(preferences));
    } catch {}
  }
  apply(pendingPreferences);
  return {
    t,
    apply,
    languageChoice,
    setSystemLanguage(value) {
      if (!["ua", "en", "ru"].includes(value) || value === systemLanguage) return;
      systemLanguage = value;
      if (pendingPreferences.followSystemLanguage) {
        pendingPreferences.language = value;
        savePending();
      }
      apply();
    },
    choose(next) {
      Object.assign(pendingPreferences, appearanceKeys(next));
      savePending();
      apply(next);
    },
    acknowledge(saved) {
      for (const [key, value] of Object.entries(appearanceKeys(saved))) {
        if (pendingPreferences[key] === value) delete pendingPreferences[key];
      }
      savePending();
    },
    get pendingPreferences() {
      return { ...pendingPreferences };
    },
    get preferences() {
      return { ...preferences };
    },
    add: (ua, en, ru) => dictionary.set(ua, { ua, en, ru }),
  };
})();
// Main-process errors and public audit/status messages. Never translate secrets.
for (const line of `${i18nLocale.translationTable_519c236}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

window.SmartI18n.add(
  i18nLocale.importCancelledCorrectTheErrorsAndTryAgain,
  "Import cancelled. Correct the errors and try again.",
  i18nLocale.importCancelledCorrectTheErrorsAndTryAgain_2ae5df2,
);

for (const line of `${i18nLocale.translationTable_30c9806}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_eded315}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_55a1e26}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

window.SmartI18n.add(
  i18nLocale.openingVault,
  "Opening vault…",
  i18nLocale.openingVault_b401815,
);

for (const line of `${i18nLocale.translationTable_beb6e6e}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_6d25531}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_4b31784}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_eb61410}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_1fc32b4}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_d5b83cb}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_a406c6c}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_c062afd}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_1dbb694}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

window.SmartI18n.add(
  i18nLocale.cancelEntireImport,
  "Cancel entire import",
  i18nLocale.cancelEntireImport_49c6b00,
);

for (const line of `${i18nLocale.translationTable_117e707}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

window.SmartI18n.add(
  i18nLocale.marketPurchase,
  "Market purchase",
  i18nLocale.marketPurchase_f29cbb1,
);
window.SmartI18n.add(
  i18nLocale.listingsPurchasesTrades,
  "Listings: {sales} · Purchases: {purchases} · Trades: {trades}",
  i18nLocale.listingsPurchasesTrades_ab5be66,
);

window.SmartI18n.add(
  i18nLocale.setTheCheckIntervalInAccountSettingsOrForSelectedAccounts,
  "Set the check interval in account settings or for selected accounts.",
  i18nLocale.setTheCheckIntervalInAccountSettingsOrForSelectedAccounts_6467dc0,
);

window.SmartI18n.add(
  i18nLocale.tradeBotsSystemOneJSONMultipleFilesOrAPackageFolderWithManifestJson,
  "Trade Bots System: one JSON, multiple files, or a package folder with manifest.json. Proxies and assignments are imported from the verified package.",
  i18nLocale.tradeBotsSystemOneJSONMultipleFilesOrAPackageFolderWithManifestJson_6d11fe0,
);
window.SmartI18n.add(
  i18nLocale.reviewTradeBotsSystemImport,
  "Review Trade Bots System import",
  i18nLocale.reviewTradeBotsSystemImport_45c602d,
);
window.SmartI18n.add(
  i18nLocale.steamGuardSecretsAreMissingCodesAndConfirmationsAreUnavailable,
  "Steam Guard secrets are missing: codes and confirmations are unavailable.",
  i18nLocale.steamGuardSecretsAreMissingCodesAndConfirmationsAreUnavailable_1ab1a08,
);
window.SmartI18n.add(
  i18nLocale.externalTokenSavedASeparateLoginIsNeededForAMobileSession,
  "External token saved; a separate login is needed for a mobile session.",
  i18nLocale.externalTokenSavedASeparateLoginIsNeededForAMobileSession_860bd5e,
);
window.SmartI18n.add(
  i18nLocale.tokenSavedAsMetadataMobileLoginCompatibilityIsUnverified,
  "Token saved as metadata; mobile login compatibility is unverified.",
  i18nLocale.tokenSavedAsMetadataMobileLoginCompatibilityIsUnverified_f616c58,
);
window.SmartI18n.add(
  i18nLocale.noProxyAssignedCheckTheRouteBeforeSigningIn,
  "No proxy assigned. Check the route before signing in.",
  i18nLocale.noProxyAssignedCheckTheRouteBeforeSigningIn_8a590a9,
);
window.SmartI18n.add(
  i18nLocale.tradeBotsSystemTokenBelongsToAnotherAccount,
  "Trade Bots System token belongs to another account.",
  i18nLocale.tradeBotsSystemTokenBelongsToAnotherAccount_36a4426,
);
window.SmartI18n.add(
  i18nLocale.tradeBotsSystemLoginIsAlreadyLinkedToADifferentSteamID,
  "Trade Bots System login is already linked to a different SteamID.",
  i18nLocale.tradeBotsSystemLoginIsAlreadyLinkedToADifferentSteamID_8c3cde0,
);
window.SmartI18n.add(
  i18nLocale.tradeBotsSystemSteamIDIsAlreadyLinkedToADifferentLogin,
  "Trade Bots System SteamID is already linked to a different login.",
  i18nLocale.tradeBotsSystemSteamIDIsAlreadyLinkedToADifferentLogin_07a1c09,
);
window.SmartI18n.add(
  i18nLocale.enterAPasswordOf116384CharactersWithoutLineBreaks,
  "Enter a password of 1–16384 characters without line breaks.",
  i18nLocale.enterAPasswordOf116384CharactersWithoutLineBreaks_133fff1,
);
window.SmartI18n.add(
  i18nLocale.aTradeBotsSystemProxyExceedsTransportLimitsThePackageWasNotImported,
  "A Trade Bots System proxy exceeds transport limits. The package was not imported.",
  i18nLocale.aTradeBotsSystemProxyExceedsTransportLimitsThePackageWasNotImported_5aef52e,
);
window.SmartI18n.add(
  i18nLocale.invalidTradeBotsSystemV1PackageCheckItsSchemaIntegrityAndAssignments,
  "Invalid Trade Bots System v1 package. Check its schema, integrity and assignments.",
  i18nLocale.invalidTradeBotsSystemV1PackageCheckItsSchemaIntegrityAndAssignments_43a329a,
);

for (const line of `${i18nLocale.translationTable_74a25c3}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_f5ced0f}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_da1481d}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_37366ab}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
for (const line of `${i18nLocale.translationTable_8fd86e1}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
for (const line of `${i18nLocale.translationTable_9f08c30}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
for (const line of `${i18nLocale.translationTable_19c1b56}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
for (const line of `${i18nLocale.translationTable_7a1f6ed}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
for (const line of `${i18nLocale.translationTable_257c114}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
window.SmartI18n.add(
  i18nLocale.keepImportedFolders,
  "Keep imported folders",
  i18nLocale.keepImportedFolders_06042ca,
);
for (const line of `${i18nLocale.translationTable_88b587b}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
for (const line of `${i18nLocale.translationTable_c147bf0}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
window.SmartI18n.add(
  i18nLocale.couldNotSaveBruteForceProtectionCheckFilePermissions,
  "Could not save brute-force protection. Check file permissions.",
  i18nLocale.couldNotSaveBruteForceProtectionCheckFilePermissions_d06195b,
);

for (const line of `${i18nLocale.translationTable_f80ecba}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_fb698e4}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_666490e}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

window.SmartI18n.add(
  i18nLocale.chooseAction,
  "Choose action",
  i18nLocale.chooseAction_2c74cda,
);
window.SmartI18n.add(i18nLocale.run, "Run", i18nLocale.run_224c8e9);
window.SmartI18n.add(
  i18nLocale.bulkAction,
  "Bulk action",
  i18nLocale.bulkAction_499b293,
);
window.SmartI18n.add(i18nLocale.failed, "Error", i18nLocale.failed_72aecd9);
window.SmartI18n.add(i18nLocale.general, "General", i18nLocale.general_fdd17d1);
window.SmartI18n.add(i18nLocale.lists, "Lists", i18nLocale.lists);

window.SmartI18n.add(
  i18nLocale.sendingConfirmations,
  "Sending confirmations",
  i18nLocale.sendingConfirmations_105de49,
);
for (const line of `${i18nLocale.translationTable_058b212}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
for (const line of `${i18nLocale.translationTable_510e1d6}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
window.SmartI18n.add(
  i18nLocale.invalidBrowserProfileFields,
  "Invalid browser profile fields.",
  i18nLocale.invalidBrowserProfileFields_8489fc2,
);
window.SmartI18n.add(
  i18nLocale.invalidBrowserProfile,
  "Invalid browser profile.",
  i18nLocale.invalidBrowserProfile_d31a1b8,
);
window.SmartI18n.add(
  i18nLocale.browserProfileGenerationExhausted,
  "Browser profile generation exhausted.",
  i18nLocale.browserProfileGenerationExhausted_a7d74e2,
);
for (const line of `${i18nLocale.translationTable_8578ae2}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
window.SmartI18n.add(
  i18nLocale.newFingerprint,
  "New fingerprint",
  i18nLocale.newFingerprint_249c189,
);
window.SmartI18n.add(
  i18nLocale.newFingerprintForEach,
  "New fingerprint for each",
  i18nLocale.newFingerprintForEach_7adf5f7,
);
window.SmartI18n.add(
  i18nLocale.stockChromiumPageLevelChangesFullFingerprintIsolationIsNotGuaranteedNativeUAAnd,
  "Stock Chromium; page-level changes. Full fingerprint isolation is not guaranteed. Native UA and OS retained; language and timezone are manual or system; geolocation is not randomized.",
  i18nLocale.stockChromiumPageLevelChangesFullFingerprintIsolationIsNotGuaranteedNativeUAAnd_af65c61,
);

for (const line of `${i18nLocale.translationTable_7725c7e}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_212034c}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_14196c3}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_88925a0}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

window.SmartI18n.add(
  i18nLocale.someImagesAreUnavailableAllItemsAndQuantitiesAreShownBelow,
  "Some images are unavailable. All items and quantities are shown below.",
  i18nLocale.someImagesAreUnavailableAllItemsAndQuantitiesAreShownBelow_1beda8e,
);

window.SmartI18n.add(
  i18nLocale.periodicCheckingControlsConfirmationsAndNotificationsIncomingOffersAndGiftsHaveSeparateRules,
  "Periodic checking controls confirmations and notifications. Incoming offers and gifts have separate rules.",
  i18nLocale.periodicCheckingControlsConfirmationsAndNotificationsIncomingOffersAndGiftsHaveSeparateRules_e47c20e,
);

for (const line of `${i18nLocale.translationTable_3abb087}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}

for (const line of `${i18nLocale.translationTable_c4c42b6}`.split("\n")) {
  const [ua, en, ru] = line.split("|");
  window.SmartI18n.add(ua, en, ru);
}
