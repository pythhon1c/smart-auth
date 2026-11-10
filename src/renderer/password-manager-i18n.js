"use strict";
const passwordManagerI18nLocale = window.SmartLocaleData;
window.PasswordManagerI18n = (() => {
  let language = "en";
  const entries = `${passwordManagerI18nLocale.translationTable_5bd4ee1}`.split(
    "\n",
  );
  const dictionaries = { en: new Map(), ua: new Map(), ru: new Map() };
  for (const line of entries) {
    const [en, ua, ru] = line.split("|");
    dictionaries.en.set(en, en);
    dictionaries.ua.set(en, ua);
    dictionaries.ru.set(en, ru);
  }
  return {
    set(locale) {
      language =
        locale === "ua" || locale.startsWith?.("uk")
          ? "ua"
          : locale === "ru" || locale.startsWith?.("ru-")
            ? "ru"
            : "en";
      document.documentElement.lang = { ua: "uk", en: "en", ru: "ru" }[
        language
      ];
    },
    t(key) {
      return dictionaries[language].get(key) || key;
    },
    get locale() {
      return language;
    },
  };
})();
