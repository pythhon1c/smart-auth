"use strict";
const localeText = require("../locales/application.json");

const labels = {
  en: [
    "Show smart-auth",
    "Unlock",
    "Lock vault",
    "Password manager",
    "2FA",
    "Exit",
    "Review confirmations",
    "Copy Steam Guard code",
    "Review market sales",
    "Review market purchases",
    "Review trades",
    "Selected accounts",
  ],
  ua: [
    localeText.message_8fd82a1,
    localeText.unlock,
    localeText.message_aac6795,
    localeText.passwordManager,
    "2FA",
    localeText.message_cc3b5e9,
    localeText.message_da211c8,
    localeText.copySteamGuardCode,
    localeText.message_3a29abf,
    localeText.message_31863fc,
    localeText.message_38150c7,
    localeText.message_b5be3e5,
  ],
  ru: [
    localeText.message_4525ce7,
    localeText.unlock_d4ab263,
    localeText.message_e097472,
    localeText.passwordManager_99f313e,
    "2FA",
    localeText.message_026abb1,
    localeText.message_615ae5f,
    localeText.copySteamGuardCode_6170fc1,
    localeText.message_dcf02c5,
    localeText.message_9574d6d,
    localeText.message_8c6d149,
    localeText.message_fccf4c1,
  ],
};

function createTrayController({ createTray, buildMenu, icon, callbacks }) {
  let tray = null,
    signature = "",
    disposed = false;
  let current = { locked: true, settings: {}, accounts: [] };
  const invoke =
    (name, ...args) =>
    () => {
      if (disposed) return;
      if (
        ["review", "copyCode", "openTool", "lock"].includes(name) &&
        current.locked !== false
      )
        return;
      if (name === "review" || name === "copyCode") {
        const ids = name === "review" ? args[0].ids : [args[0]];
        const selected = new Set(current.settings?.trayAccountIds || []);
        if (
          ids.some(
            (id) =>
              !selected.has(id) ||
              !(current.accounts || []).some((account) => account.id === id),
          )
        )
          return;
      }
      return callbacks[name]?.(...args);
    };
  function update(state) {
    if (disposed) return;
    current = state;
    const settings = state.settings || {};
    if (settings.trayEnabled === false) {
      if (tray) {
        callbacks.show?.();
        tray.destroy();
        tray = null;
      }
      signature = "";
      return;
    }
    const locked = state.locked !== false;
    const available = new Map(
      (state.accounts || []).map((account) => [account.id, account]),
    );
    const accounts = locked
      ? []
      : [...new Set(settings.trayAccountIds || [])]
          .slice(0, 10)
          .map((id) => available.get(id))
          .filter(Boolean);
    const language = labels[settings.language] ? settings.language : "ua";
    const nextSignature = JSON.stringify([
      locked,
      language,
      accounts.map(({ id, name, hasSharedSecret }) => [
        id,
        name,
        hasSharedSecret === true,
      ]),
    ]);
    if (!tray) {
      tray = createTray(icon);
      tray.setToolTip("smart-auth");
      tray.on("double-click", invoke("show"));
    }
    if (signature === nextSignature) return;
    const t = labels[language];
    const menu = [{ label: t[0], click: invoke("show") }];
    if (locked) menu.push({ label: t[1], click: invoke("unlock") });
    else {
      const ids = accounts.map((account) => account.id);
      if (accounts.length) {
        menu.push({ type: "separator" });
        for (const account of accounts) {
          const submenu = [
            {
              label: t[6],
              click: invoke("review", { ids: [account.id], kind: "all" }),
            },
          ];
          if (account.hasSharedSecret === true)
            submenu.push({
              label: t[7],
              click: invoke("copyCode", account.id),
            });
          menu.push({
            label: String(account.name || account.id)
              .replace(/[\r\n\t]/g, " ")
              .replace(/&/g, "&&")
              .slice(0, 100),
            submenu,
          });
        }
        menu.push({
          label: t[11],
          submenu: [
            { label: t[8], click: invoke("review", { ids, kind: "market" }) },
            { label: t[9], click: invoke("review", { ids, kind: "purchase" }) },
            { label: t[10], click: invoke("review", { ids, kind: "trade" }) },
          ],
        });
      }
      menu.push(
        { type: "separator" },
        { label: t[3], click: invoke("openTool", "password-manager") },
        { label: t[4], click: invoke("openTool", "authenticator") },
        { label: t[2], click: invoke("lock") },
      );
    }
    menu.push({ type: "separator" }, { label: t[5], click: invoke("exit") });
    tray.setContextMenu(buildMenu(menu));
    signature = nextSignature;
  }
  function dispose() {
    disposed = true;
    tray?.destroy();
    tray = null;
  }
  return {
    update,
    dispose,
    shouldHideOnMinimize: () =>
      !!tray && current.settings?.trayMinimizeToTray === true,
    shouldHideOnClose: () =>
      !!tray && current.settings?.trayCloseToTray === true,
  };
}
module.exports = { createTrayController };
