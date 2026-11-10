"use strict";
const windowLockLocale = window.SmartLocaleData;
(() => {
  const api = window.lootApi || window.passwordManager || window.authenticator;
  let locked = false;
  const listeners = new Set();
  function lock(uiGeneration) {
    const acknowledge = () => {
      if (Number.isSafeInteger(uiGeneration))
        void api.call("lockedReady", { uiGeneration }).catch(() => {});
    };
    if (locked) {
      acknowledge();
      return;
    }
    locked = true;
    document.body.classList.add("window-locked");
    for (const dialog of document.querySelectorAll("dialog")) {
      dialog.close();
      dialog.replaceChildren();
    }
    for (const input of document.querySelectorAll("input,textarea"))
      input.value = "";
    const mask = document.createElement("main");
    mask.id = "window-lock-mask";
    const locale =
      window.PasswordManagerI18n?.locale ||
      window.AuthenticatorI18n?.locale ||
      document.documentElement.lang ||
      "ua";
    const language = locale.startsWith("en")
      ? "en"
      : locale.startsWith("ru")
        ? "ru"
        : "ua";
    const words = {
      ua: [windowLockLocale.unlockTheAppToView, windowLockLocale.unlock],
      en: ["Unlock the app to view", "Unlock"],
      ru: [
        windowLockLocale.unlockTheAppToView_5170939,
        windowLockLocale.unlock_d4ab263,
      ],
    }[language];
    const text = document.createElement("p");
    text.textContent = words[0];
    const button = document.createElement("button");
    button.textContent = words[1];
    button.addEventListener("click", () => {
      void api.call("showUnlock").catch(() => {});
    });
    mask.append(text, button);
    document.body.append(mask);
    for (const listener of listeners) listener();
    button.focus();
    acknowledge();
  }
  window.SmartWindowLock = {
    lock,
    get locked() {
      return locked;
    },
    onLock(fn) {
      listeners.add(fn);
    },
  };
  api?.onChanged?.((change) => {
    if (change?.locked === true) lock(change.uiGeneration);
    else if (change?.locked === false && locked) location.reload();
  });
})();
