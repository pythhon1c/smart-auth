"use strict";
const accountContextLocale = window.SmartLocaleData;
// Loaded before app.js: application bindings are read only when the menu opens.
(() => {
  let host = null,
    accountId = null,
    epoch = 0,
    timer = null,
    origin = null;
  let codeNode,
    progress,
    pending = false,
    codeUntil = 0,
    nextFetch = 0;
  const listeners = [];
  let modalLease = null;
  const listen = (node, type, fn, options) => {
    node.addEventListener(type, fn, options);
    listeners.push(() => node.removeEventListener(type, fn, options));
  };
  const current = () =>
    !locked && data.accounts.find((a) => String(a.id) === String(accountId));
  async function accountModal(account, action) {
    const previous = modalLease ? modalLease.previous : selected,
      generation = lockGeneration;
    const lease = { previous };
    modalLease = lease;
    selected = account.id;
    const restore = () => {
      if (modalLease !== lease) {
        modal.removeEventListener("close", restore);
        return;
      }
      // A queued close event may arrive after another dialog has opened.
      if (modal.open) return;
      modal.removeEventListener("close", restore);
      modalLease = null;
      if (!locked && generation === lockGeneration && selected === account.id)
        selected = previous;
    };
    modal.addEventListener("close", restore);
    try {
      await action(account);
    } finally {
      if (!modal.open) restore();
    }
  }
  function close({ restoreFocus = false } = {}) {
    epoch++;
    clearInterval(timer);
    timer = null;
    listeners.splice(0).forEach((remove) => remove());
    if (codeNode) codeNode.textContent = "";
    host?.replaceChildren();
    host?.remove();
    host = null;
    accountId = null;
    pending = false;
    codeUntil = 0;
    nextFetch = 0;
    if (restoreFocus && origin?.isConnected) origin.focus();
    origin = null;
  }
  function refreshMenu() {
    if (!host) return;
    if (!current()) return close();
    if (codeUntil && Date.now() >= codeUntil) {
      codeNode.textContent = t(accountContextLocale.loading);
      codeUntil = 0;
    }
    progress.value = Math.max(0, (codeUntil - Date.now()) / 1000);
    if (
      !pending &&
      Date.now() >= nextFetch &&
      current().hasSharedSecret !== false
    )
      fetchCode();
  }
  async function fetchCode() {
    const token = epoch,
      id = accountId,
      generation = lockGeneration;
    pending = true;
    nextFetch = Date.now() + 1000;
    try {
      const result = await call("codes", { ids: [id] });
      if (
        !host ||
        token !== epoch ||
        generation !== lockGeneration ||
        !current()
      )
        return;
      const value = (Array.isArray(result) ? result : result?.codes || []).find(
        (c) => String(c.id) === String(id),
      );
      codeNode.textContent =
        value?.code || t(accountContextLocale.theCodeIsNotReadyYet);
      codeUntil = value?.code
        ? Date.now() + Math.max(0, Number(value.remainingSeconds) || 0) * 1000
        : 0;
      nextFetch = codeUntil || Date.now() + 1000;
      progress.value = Math.max(0, (codeUntil - Date.now()) / 1000);
    } catch (error) {
      if (host && token === epoch)
        codeNode.textContent = t(accountContextLocale.theCodeIsNotReadyYet);
    } finally {
      if (token === epoch) pending = false;
    }
  }
  function open(account, event = {}) {
    close();
    if (locked) return;
    accountId = account.id;
    const a = current();
    if (!a) return close();
    event.preventDefault?.();
    event.stopPropagation?.();
    origin =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : document.activeElement;
    host = document.createElement("div");
    host.className = "account-context-menu";
    host.setAttribute("role", "menu");
    host.setAttribute("aria-label", a.name);
    const item = (
      label,
      action,
      { disabled = false, keep = false, danger = false } = {},
    ) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = t(label);
      button.disabled = disabled;
      if (danger) button.className = "danger";
      button.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fresh = current(),
          generation = lockGeneration;
        if (!fresh) return close();
        button.disabled = true;
        if (!keep) close();
        try {
          await action(fresh);
        } catch (error) {
          if (!locked && generation === lockGeneration)
            toast(error.message || String(error));
        } finally {
          if (button.isConnected) button.disabled = disabled;
        }
      };
      host.append(button);
      return button;
    };
    const confirmationsButton = item(
      accountContextLocale.confirming,
      (fresh) => accountModal(fresh, openAccountConfirmations),
      { disabled: a.hasIdentitySecret === false },
    );
    confirmationsButton.className = "account-context-confirmations";
    confirmationsButton.textContent =
      t(accountContextLocale.confirming) +
      " (" +
      (Number.isInteger(a.confirmationCount) && a.confirmationCount >= 0
        ? String(a.confirmationCount)
        : "?") +
      ")";
    const codeButton = item(
      accountContextLocale.copySteamGuardCode,
      async (fresh) => {
        await call("copyCode", { id: fresh.id });
        if (!locked && current()?.id === fresh.id)
          toast(accountContextLocale.codeCopied);
      },
      { disabled: a.hasSharedSecret === false, keep: true },
    );
    codeButton.className = "account-context-code";
    const label = document.createElement("small");
    label.textContent = "STEAM GUARD";
    codeNode = document.createElement("strong");
    codeNode.textContent = t(
      a.hasSharedSecret === false
        ? accountContextLocale.codeUnavailable
        : accountContextLocale.loading,
    );
    progress = document.createElement("progress");
    progress.max = 30;
    progress.value = 0;
    codeButton.replaceChildren(label, codeNode, progress);
    item(accountContextLocale.openProfile, (fresh) => {
      selected = fresh.id;
      render();
    });
    item(accountContextLocale.edit, editAccount);
    item(accountContextLocale.moveToFolder, (fresh) =>
      bulkMoveAccountsDialog([fresh.id]),
    );
    item(accountContextLocale.exportAccount, (fresh) =>
      exportAccountsDialog([fresh.id]),
    );
    item(accountContextLocale.openInBrowser, (fresh) =>
      openBrowsersDialog([fresh.id]),
    );
    item(accountContextLocale.browserProfile, (fresh) =>
      browserProfilesDialog([fresh.id]),
    );
    item(
      accountContextLocale.closeBrowser,
      async (fresh) => {
        await call("closeBrowsers", { ids: [fresh.id] });
        await refresh();
      },
      { disabled: !(data.browsers || []).some((b) => b.accountId === a.id) },
    );
    item(
      accountContextLocale.viewPassword,
      (fresh) => accountModal(fresh, showSavedPassword),
      { disabled: !a.hasPassword },
    );
    item(
      accountContextLocale.copyPassword,
      async (fresh) => {
        await call("copyAccountPassword", { id: fresh.id });
        if (!locked) toast(accountContextLocale.passwordCopied);
      },
      { disabled: !a.hasPassword },
    );
    item(
      a.hasPassword
        ? accountContextLocale.editSavedPassword
        : accountContextLocale.addSavedPassword,
      (fresh) => accountModal(fresh, editSavedPassword),
    );
    item(accountContextLocale.logInToSteam, loginDialog);
    item(accountContextLocale.syncTime, async (fresh) => {
      await call("syncTime", { id: fresh.id });
      if (!locked) toast(accountContextLocale.timeSynchronized);
    });
    item(accountContextLocale.note, editAccountNote);
    item(accountContextLocale.assignProxy, accountProxyDialog);
    item(accountContextLocale.checkProxies, async (fresh) => {
      const generation = lockGeneration,
        result = await call("checkProxy", { id: fresh.id });
      if (!locked && generation === lockGeneration) showProxyResult(result);
    });
    item(accountContextLocale.editRules, editAccountConfirmationPolicy);
    item(
      accountContextLocale.deleteAccount,
      (fresh) =>
        confirmDelete(accountContextLocale.deleteAccountFromVault, () => {
          if (!locked && data.accounts.some((value) => value.id === fresh.id))
            return mutate("deleteAccount", { id: fresh.id });
        }),
      { danger: true },
    );
    document.body.append(host);
    const bounds = origin?.getBoundingClientRect();
    host.style.left = `${Math.max(4, Math.min(event.clientX ?? bounds?.left ?? 4, innerWidth - host.offsetWidth - 4))}px`;
    host.style.top = `${Math.max(4, Math.min(event.clientY ?? bounds?.bottom ?? 4, innerHeight - host.offsetHeight - 4))}px`;
    // Focusing the account before contextmenu can scroll its ancestors. Chromium
    // delivers that scroll event later, after this menu has opened. Only close
    // for movement that happened after opening, not the queued earlier event.
    const scrollPositions = new WeakMap();
    for (let node = origin; node; node = node.parentElement)
      scrollPositions.set(node, { top: node.scrollTop, left: node.scrollLeft });
    if (document.scrollingElement)
      scrollPositions.set(document, {
        top: document.scrollingElement.scrollTop,
        left: document.scrollingElement.scrollLeft,
      });
    listen(
      document,
      "pointerdown",
      (e) => {
        if (!host?.contains(e.target)) close();
      },
      true,
    );
    listen(
      document,
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          return close({ restoreFocus: true });
        }
        if (e.key === "Tab") return close();
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const buttons = [...host.querySelectorAll("button:not(:disabled)")],
          index = buttons.indexOf(document.activeElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      },
      true,
    );
    listen(
      document,
      "scroll",
      (e) => {
        if (host?.contains(e.target)) return;
        const before = scrollPositions.get(e.target),
          node = e.target === document ? document.scrollingElement : e.target;
        if (
          before &&
          node?.scrollTop === before.top &&
          node?.scrollLeft === before.left
        )
          return;
        close();
      },
      true,
    );
    listen(window, "resize", () => close());
    timer = setInterval(refreshMenu, 200);
    refreshMenu();
    host.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  }
  window.SmartAccountMenu = {
    open,
    close,
    isOpen: () => !!host,
    refresh: refreshMenu,
    cleanup: close,
  };
})();
