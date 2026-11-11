"use strict";
const appLocale = window.SmartLocaleData;
const root = document.getElementById("app"),
  modal = document.getElementById("modal"),
  content = document.getElementById("modal-content");
const t = window.SmartI18n.t;
let lockGeneration = 0;
let lockUiGeneration;
let bulkMode = false;
let bulkAction = "";
let accountPage = 0;
const accountFilters = {
  session: "all",
  proxy: "all",
  automation: "all",
  vac: "all",
  game: "all",
  community: "all",
};
let snapshotReady = false;
let refreshTail = Promise.resolve();
let queuedForcedRefresh = null;
let sensitiveAccountId = null;
let sensitiveDialogGeneration = 0;
let appearanceSaveFailed = false;
const proxyDetailsCache = new Map();
const confirmationRequests = new WeakMap();
function visibleCodeAccountId() {
  return selected &&
    view === "accounts" &&
    root.querySelector(".detail-code")?.dataset.code === String(selected)
    ? selected
    : null;
}
function accountPageSize() {
  return [10, 25, 50, 100, 200].includes(data.settings.accountsPerPage)
    ? data.settings.accountsPerPage
    : 50;
}
const bulkSelected = new Set();
let data = {
    accounts: [],
    groups: [],
    proxies: [],
    proxyLists: [],
    settings: {},
    audit: [],
    security: {},
  },
  codes = [],
  view = "accounts",
  group = null,
  selected = null,
  search = "",
  locked = true,
  refreshing = false;
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = t(text);
  return n;
};
const append = (n, ...children) => {
  children.filter(Boolean).forEach((c) => n.append(c));
  return n;
};
const btn = (text, fn, cls = "") => {
  const b = el("button", cls, text);
  b.type = "button";
  b.onclick = async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      toast(e.message || String(e));
    } finally {
      if (b.syncDisabled) b.syncDisabled();
      else b.disabled = false;
    }
  };
  return b;
};
const call = async (action, payload = {}) => {
  const generation = lockGeneration;
  let result = await window.smartSda.call(action, payload);
  if (
    Array.isArray(result?.warehouseConflict) &&
    result.warehouseConflict.length
  ) {
    if (locked || generation !== lockGeneration || cancelWarehouseChoice)
      throw Error(t(appLocale.changesCancelled));
    const warehouseAction = await warehouseConflictChoice(
      result.warehouseConflict,
    );
    if (locked || generation !== lockGeneration)
      throw Error(t(appLocale.changesCancelled));
    const retry =
      action === "prepareProxyAllocation"
        ? { ...payload, payload: { ...payload.payload, warehouseAction } }
        : { ...payload, warehouseAction };
    result = await window.smartSda.call(action, retry);
    if (result?.warehouseConflict?.length)
      throw Error(t(appLocale.refreshAndTryAgain));
  }
  return result;
};
let cancelWarehouseChoice = null;
function warehouseConflictChoice(accounts) {
  return new Promise((resolve, reject) => {
    const warning = el("dialog", "warehouse-warning"),
      heading = el("h2", "", appLocale.accountIsUsedAsALootWarehouse),
      choices = el("div", "actions");
    heading.id = "warehouse-warning-title";
    warning.setAttribute("aria-labelledby", heading.id);
    const finish = (value) => {
      cancelWarehouseChoice = null;
      warning.close();
      warning.remove();
      if (value) resolve(value);
      else reject(Error(t(appLocale.changesCancelled)));
    };
    warning.append(
      heading,
      el(
        "p",
        "",
        appLocale.disablingGiftAcceptanceMayInterruptAutomaticLootChooseAnActionForTheseWarehouses,
      ),
      el(
        "p",
        "warehouse-conflict-names",
        accounts.map((a) => a.name || a.steamId).join(", "),
      ),
      choices,
    );
    choices.append(
      btn(appLocale.removeFromWarehousesAndDisable, () => finish("remove")),
      btn(appLocale.keepAsWarehouseAndDisable, () => finish("disable")),
      btn(appLocale.cancel, () => finish(null)),
    );
    warning.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    cancelWarehouseChoice = () => finish(null);
    document.body.append(warning);
    warning.showModal();
    choices.lastElementChild.focus();
  });
}
function notificationToastText(event) {
  const title = t(
    event.kind === "pending"
      ? appLocale.newSteamConfirmationsAreWaiting
      : event.kind === "incoming"
        ? appLocale.newIncomingTradeOffers
        : event.kind === "error"
          ? appLocale.attentionNeededCheckAccountStatus
          : appLocale.testNotificationSent,
  );
  if (!Array.isArray(event.stacks?.items)) return title;
  const rows = event.stacks.items
    .slice(0, 4)
    .map((item) => {
      const name = String(item.name ?? "")
        .replace(/[\p{Cc}\p{Cf}]/gu, " ")
        .slice(0, 120);
      const quantity = String(item.exactQuantity ?? item.quantity ?? 1);
      const arrow =
        item.direction === "outgoing"
          ? "↑ " + t(appLocale.give) + " "
          : item.direction === "incoming"
            ? "↓ " + t(appLocale.receive) + " "
            : "";
      return name
        ? arrow +
            name +
            " × " +
            (/^[1-9]\d{0,40}$/.test(quantity) ? quantity : "1")
        : "";
    })
    .filter(Boolean);
  if (Number.isSafeInteger(event.stacks.omitted) && event.stacks.omitted > 0)
    rows.push(t(appLocale.moreStacks).replace("{count}", event.stacks.omitted));
  if (event.stacks.incomplete) rows.push(t(appLocale.viewAllItemsInSmartSDA));
  return (title + " · " + rows.join(" · ")).slice(0, 700);
}
function toast(t) {
  const n = document.getElementById("toast");
  n.textContent = window.SmartI18n.t(t);
  n.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (n.style.display = "none"), 5000);
}
function input(type = "text", value = "", placeholder = "") {
  const n = el("input");
  n.type = type;
  n.value = value ?? "";
  n.placeholder = t(placeholder);
  return n;
}
let fieldCounter = 0;
function field(parent, label, node) {
  const caption = el("label", "", label);
  if (node.matches("input,select,textarea")) {
    node.id ||= "field-" + ++fieldCounter;
    caption.htmlFor = node.id;
  }
  append(parent, caption, node);
  return node;
}
function select(items, value) {
  const n = el("select");
  items.forEach(([v, t]) => {
    const o = el("option", "", t);
    o.value = v ?? "";
    n.append(o);
  });
  n.value = value ?? "";
  return n;
}
function checkbox(label, value) {
  const n = el("label", "check"),
    i = input("checkbox");
  i.checked = !!value;
  append(n, i, el("span", "", label));
  return { node: n, input: i };
}
function dialog(title, build) {
  if (locked) return;
  window.SmartAccountMenu?.close({ restoreFocus: false });
  clearModalInputs();
  const heading = el("h2", "modal-title", title);
  heading.id = "modal-title";
  heading.tabIndex = -1;
  const close = btn("×", () => modal.close(), "modal-close");
  close.setAttribute("aria-label", t(appLocale.closeDialog));
  close.title = t(appLocale.closeDialog);
  content.replaceChildren(append(el("header", "modal-header"), heading, close));
  modal.setAttribute("aria-labelledby", heading.id);
  const form = el("form", "modal-form"),
    body = el("div", "modal-body");
  form.onsubmit = (e) => e.preventDefault();
  content.append(append(form, body));
  build(body);
  for (const controls of [...body.children].filter((node) =>
    node.classList.contains("modal-footer"),
  ))
    form.append(controls);
  if (!modal.open) modal.showModal();
  body.scrollTop = 0;
  heading.focus({ preventScroll: true });
}
function footer(form, save, label = appLocale.save) {
  const submit = btn(label, save, "primary");
  submit.type = "submit";
  append(
    form,
    append(
      el("div", "modal-footer"),
      btn(appLocale.cancel, () => modal.close()),
      submit,
    ),
  );
  return submit;
}

function authFeedback(form, submit, initialStatus = {}) {
  let busy = false,
    latestStatus = initialStatus,
    serverPending = initialStatus.authPending === true,
    until = Date.now() + Math.max(0, Number(initialStatus.retryAfterMs) || 0),
    polling = false;
  const progress = el("p", "auth-progress");
  progress.setAttribute("role", "status");
  progress.setAttribute("aria-live", "polite");
  progress.dataset.authProgress = "true";
  submit.dataset.authSubmit = "true";
  form.append(progress);
  const sync = () => {
    const waiting = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    submit.disabled = busy || serverPending || waiting > 0;
    form.setAttribute("aria-busy", String(busy || serverPending));
    form
      .closest(".auth-card")
      ?.querySelectorAll(".appearance-controls select")
      .forEach((control) => {
        control.disabled = busy || serverPending;
      });
    const message =
      busy || serverPending
        ? t(appLocale.checkingVaultProtectionThisMayTakeAFewSeconds)
        : waiting
          ? t(appLocale.tooManyAttemptsTryAgainInSeconds).replace(
              "{seconds}",
              waiting,
            )
          : "";
    if (progress.textContent !== message) progress.textContent = message;
  };
  const update = (status) => {
    latestStatus = status;
    until = Date.now() + Math.max(0, Number(status.retryAfterMs) || 0);
    serverPending = status.authPending === true;
    sync();
  };
  const refreshStatus = async () => {
    if (polling || !form.isConnected) return;
    polling = true;
    try {
      const status = await call("status");
      if (form.isConnected) update(status);
    } catch {
    } finally {
      polling = false;
    }
  };
  let timer = setInterval(() => {
    if (!form.isConnected) {
      clearInterval(timer);
      return;
    }
    sync();
    if (until > Date.now() || busy || serverPending) void refreshStatus();
  }, 1000);
  submit.syncDisabled = sync;
  sync();
  return {
    get status() {
      return {
        ...latestStatus,
        retryAfterMs: Math.max(0, until - Date.now()),
        authPending: serverPending,
      };
    },
    get isBusy() {
      return busy || serverPending;
    },
    begin() {
      if (busy || serverPending || until > Date.now()) return false;
      busy = true;
      sync();
      return true;
    },
    finish() {
      busy = false;
      sync();
    },
    refresh: refreshStatus,
    dispose() {
      clearInterval(timer);
    },
  };
}

function authMutationFooter(form, action, payload, message, label) {
  const error = el("p", "error");
  error.setAttribute("role", "alert");
  form.append(error);
  let feedback;
  const submit = footer(
    form,
    async () => {
      if (!feedback.begin()) return;
      error.textContent = "";
      try {
        await mutate(action, payload(), message);
      } catch (failure) {
        if (form.isConnected) error.textContent = t(failure.message);
        await feedback.refresh();
      } finally {
        feedback.finish();
      }
    },
    label,
  );
  feedback = authFeedback(form, submit, data.security);
}

async function mutate(action, payload, message) {
  await call(action, payload);
  modal.close();
  await refresh();
  if (message) toast(message);
}
function enterLocked(status) {
  if (
    locked &&
    root.querySelector(".auth") &&
    status.uiGeneration !== undefined &&
    status.uiGeneration === lockUiGeneration
  )
    return;
  lockUiGeneration = status.uiGeneration;
  cancelWarehouseChoice?.();
  window.SmartAccountMenu?.close({ restoreFocus: false });
  proxyDetailsCache.clear();
  lockGeneration++;
  locked = true;
  snapshotReady = false;
  clearTimeout(toast.timer);
  document.getElementById("toast").textContent = "";
  document.getElementById("toast").style.display = "none";
  modal.close();
  clearModalInputs();
  content.replaceChildren();
  data = {
    accounts: [],
    groups: [],
    proxies: [],
    proxyLists: [],
    settings: {},
    audit: [],
    security: {},
  };
  codes = [];
  selected = null;
  bulkSelected.clear();
  Object.assign(accountFilters, {
    session: "all",
    proxy: "all",
    automation: "all",
    vac: "all",
    game: "all",
    community: "all",
  });
  auth(status);
  if (Number.isSafeInteger(status.uiGeneration))
    void call("lockedReady", { uiGeneration: status.uiGeneration }).catch(
      () => {},
    );
}
async function changed() {
  const generation = lockGeneration;
  const status = await call("status");
  if (generation !== lockGeneration) return;
  if (status.locked || !status.exists) {
    if (
      locked &&
      ((status.uiGeneration !== undefined &&
        status.uiGeneration === lockUiGeneration &&
        root.querySelector(".auth")) ||
        (status.uiGeneration === undefined &&
          status.lockMode === "pin" &&
          root.querySelector("[data-pin-lock]")))
    )
      return;
    enterLocked(status);
  } else if (!locked) await refresh(true);
}
function refresh(preserveDetail = false) {
  if (locked) return Promise.resolve();
  // Background notifications coalesce into the active read. The periodic poll
  // will observe any later changes; authentication and mutations still force
  // one fresh read after an active read completes.
  if (preserveDetail && refreshing) return refreshTail.catch(() => {});
  // Authentication must enqueue a fresh read behind any older, cancelled read.
  // Retire status replies captured while the authentication screen was locked.
  if (
    !snapshotReady &&
    !preserveDetail &&
    root.querySelector(".auth:not([data-loading-vault])")
  )
    lockGeneration++;
  const generation = lockGeneration;
  if (!preserveDetail && queuedForcedRefresh?.generation === generation)
    return queuedForcedRefresh.promise;
  if (!snapshotReady) renderVaultLoading();
  refreshing = true;
  const request = { generation, promise: null };
  const pending = refreshTail
    .catch(() => {})
    .then(() => {
      if (queuedForcedRefresh === request) queuedForcedRefresh = null;
      return readSnapshot(generation, preserveDetail);
    });
  refreshTail = pending;
  request.promise = pending.finally(() => {
    if (refreshTail === pending) refreshing = false;
  });
  if (!preserveDetail) queuedForcedRefresh = request;
  return request.promise;
}
async function readSnapshot(generation, preserveDetail) {
  if (locked || generation !== lockGeneration) return;
  try {
    const snapshot = await call("snapshot");
    if (locked || generation !== lockGeneration) return;
    const codeAccountId = visibleCodeAccountId();
    const freshCodes = codeAccountId
      ? await call("codes", { ids: [codeAccountId] })
      : [];
    if (locked || generation !== lockGeneration) return;
    if (
      !snapshot ||
      !Array.isArray(snapshot.accounts) ||
      !snapshot.security ||
      typeof snapshot.security.passwordEnabled !== "boolean"
    )
      throw Error(t(appLocale.couldNotConnectToTheVault));
    const appearanceChanges = window.SmartI18n.pendingPreferences;
    if (Object.keys(appearanceChanges).length) {
      try {
        await call("settings", appearanceChanges);
        if (locked || generation !== lockGeneration) return;
        window.SmartI18n.acknowledge(appearanceChanges);
        appearanceSaveFailed = false;
      } catch {
        if (locked || generation !== lockGeneration) return;
        if (!appearanceSaveFailed)
          toast(
            appLocale.couldNotSaveTheThemeAndLanguageYourChoicesAreAppliedSavingWillBe,
          );
        appearanceSaveFailed = true;
      }
      snapshot.settings = { ...snapshot.settings, ...appearanceChanges };
    }
    data = snapshot;
    if (data.settings?.showProxyCredentials !== true) {
      proxyDetailsCache.clear();
      root.querySelectorAll("[data-proxy-detail]").forEach((node) => {
        node.textContent = displayProxyAddress(node.textContent);
      });
    }
    const accountIds = new Set(data.accounts.map((account) => account.id));
    for (const id of bulkSelected)
      if (!accountIds.has(id)) bulkSelected.delete(id);
    data.proxyLists ||= [];
    snapshotReady = true;
    window.SmartI18n.apply(data.settings);
    codes = visibleCodeAccountId() === codeAccountId ? freshCodes : [];
    const dashboardVisible = !!root.querySelector(".shell");
    if (
      preserveDetail &&
      dashboardVisible &&
      (selected ||
        // Settings controls own unsaved drafts. Checkbox pickers can replace a
        // focused row, so focus alone cannot identify an active settings edit.
        root.querySelector(".settings-grid") ||
        modal.open ||
        window.SmartAccountMenu?.isOpen() ||
        root.querySelector(
          "input:focus, textarea:focus, select:focus, [contenteditable=true]:focus",
        ))
    ) {
      paintCodes();
      paintStatuses();
      window.SmartAccountMenu?.refresh();
    } else render({ preserveViewport: preserveDetail && dashboardVisible });
  } catch (e) {
    if (locked || generation !== lockGeneration) return;
    const status = await call("status").catch(() => ({ locked: true }));
    if (locked || generation !== lockGeneration) return;
    if (status.locked) enterLocked(status);
    else if (!snapshotReady) renderVaultLoading(e.message);
    else toast(e.message);
  }
}
function renderVaultLoading(error = "") {
  if (locked) return;
  root.querySelectorAll("input[type=password]").forEach((n) => (n.value = ""));
  const frame = el("main", "auth"),
    card = el("section", "auth-card");
  frame.dataset.loadingVault = "true";
  const message = t(appLocale.openingVault);
  append(card, el("div", "brand", "◈ smart-auth"), el("h1", "", message));
  card.setAttribute("role", "status");
  if (error)
    append(
      card,
      el("p", "error", error),
      btn(appLocale.refresh, () => refresh(false), "primary"),
    );
  frame.append(card);
  root.replaceChildren(frame);
}

async function boot() {
  const generation = lockGeneration;
  try {
    const s = await call("status");
    if (generation !== lockGeneration) return;
    window.SmartI18n.setSystemLanguage(s.systemLanguage);
    locked = s.locked || !s.exists;
    if (locked) auth(s);
    else await refresh();
  } catch (e) {
    if (generation !== lockGeneration) return;
    root.replaceChildren(
      el("div", "empty", e.message || appLocale.couldNotConnectToTheVault),
    );
  }
}
function betaStartupNotice(status) {
  if (status.beta !== true) return;
  const card = root.querySelector(".auth-card");
  if (!card) return;
  const notice = el("p", "secure-note", appLocale.betaWarning);
  notice.dataset.betaNotice = "true";
  card.prepend(notice);
}
function auth(status) {
  if (status.lockMode === "pin") {
    pinAuth(status);
    betaStartupNotice(status);
    return;
  }
  root.replaceChildren();
  const frame = el("main", "auth"),
    card = el("section", "auth-card");
  append(
    card,
    append(
      el("div", "brand"),
      el("span", "", "◈ "),
      el("span", "", "smart-auth"),
    ),
    el("div", "eyebrow", appLocale.privateVAULT),
    el(
      "h1",
      "",
      status.exists ? appLocale.welcomeBack : appLocale.yourAccountsProtected,
    ),
    el(
      "p",
      "",
      status.exists
        ? appLocale.unlockTheAppToView
        : appLocale.createAPasswordForYourEncryptedSteamGuardVault,
    ),
  );
  const f = el("form");
  const pass =
    !status.exists || status.passwordEnabled
      ? field(f, appLocale.password, input("password"))
      : null;
  if (pass) {
    pass.autocomplete = status.exists ? "current-password" : "new-password";
    if (!status.exists) {
      pass.minLength = 15;
      pass.placeholder = t(appLocale.atLeast15Characters);
    }
  }
  let repeat, otp;
  if (!status.exists) {
    repeat = field(f, appLocale.confirmPassword, input("password"));
    repeat.minLength = 15;
    repeat.autocomplete = "new-password";
  }
  if (status.totpEnabled)
    otp = field(
      f,
      appLocale.googleAuthenticatorCode,
      input("text", "", "000000"),
    );
  const error = el("div", "error");
  error.setAttribute("role", "alert");
  let feedback;
  const submit = btn(
    status.exists ? appLocale.unlock : appLocale.createVault,
    async () => {
      if (!feedback.begin()) return;
      error.textContent = "";
      const generation = ++lockGeneration;
      try {
        if (!status.exists && [...pass.value].length < 15)
          throw Error(appLocale.useAPasswordWithAtLeast15Characters);
        if (repeat && pass?.value !== repeat.value)
          throw Error(appLocale.passwordsDoNotMatch);
        await call(
          status.exists ? "unlock" : "createVault",
          status.exists
            ? { password: pass?.value || "", code: otp?.value || "" }
            : { password: pass.value },
        );
        if (pass) pass.value = "";
        if (otp) otp.value = "";
        if (generation !== lockGeneration) return;
        locked = false;
        await refresh();
      } catch (e) {
        if (generation === lockGeneration && f.isConnected)
          error.textContent = t(e.message);
        await feedback.refresh();
      } finally {
        feedback.finish();
      }
    },
    "primary",
  );
  f.onsubmit = (e) => {
    e.preventDefault();
    submit.click();
  };
  append(f, submit, error);
  feedback = authFeedback(f, submit, status);
  append(card, f, el("p", "secure-note", appLocale.aes256GCMLocalStorage));
  const appearance = appearanceControls(() => {
    if (!feedback.isBusy) {
      feedback.dispose();
      auth(feedback.status);
    }
  }, feedback.isBusy);
  card.append(appearance);
  frame.append(card);
  root.append(frame);
  betaStartupNotice(status);
  (pass || otp || submit).focus();
}
function navigate(v, g = null) {
  window.SmartAccountMenu?.close({ restoreFocus: false });
  if (v !== "proxies") proxyDetailsCache.clear();
  view = v;
  group = g;
  accountPage = 0;
  selected = null;
  render();
}
function captureDashboardViewport() {
  const scroll = [".main", ".folder-list", ".sidebar"].map((selector) => {
    const node = root.querySelector(selector);
    return { selector, top: node?.scrollTop || 0, left: node?.scrollLeft || 0 };
  });
  const active = document.activeElement;
  let focus = null;
  if (active && root.contains(active)) {
    const key = ["nav", "groupId", "accountSelect", "action", "accountId"].find(
      (name) => active.dataset[name] !== undefined,
    );
    focus = key
      ? { key, value: active.dataset[key] }
      : {
          tag: active.tagName,
          text: active.textContent,
          scope: active.closest(".sidebar") ? ".sidebar" : ".main",
          accountId: active.closest("[data-account-id]")?.dataset.accountId,
        };
  }
  return () => {
    if (focus) {
      let target;
      if (focus.key) {
        const attribute =
          "data-" +
          focus.key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
        target = [...root.querySelectorAll("[" + attribute + "]")].find(
          (node) => node.dataset[focus.key] === focus.value,
        );
      } else {
        const scope =
          focus.accountId === undefined
            ? root.querySelector(focus.scope)
            : [...root.querySelectorAll("[data-account-id]")].find(
                (node) => node.dataset.accountId === focus.accountId,
              );
        const candidates = [
          ...(scope?.querySelectorAll("button") || []),
        ].filter(
          (node) =>
            node.tagName === focus.tag && node.textContent === focus.text,
        );
        if (candidates.length === 1) target = candidates[0];
      }
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
    for (const { selector, top, left } of scroll) {
      const node = root.querySelector(selector);
      if (node) {
        node.scrollTop = top;
        node.scrollLeft = left;
      }
    }
  };
}
function render({ preserveViewport = false } = {}) {
  if (locked) return;
  window.SmartAccountMenu?.close({ restoreFocus: false });
  if (sensitiveAccountId && sensitiveAccountId !== selected) {
    modal.close();
    clearModalInputs();
  }
  if (!snapshotReady) {
    renderVaultLoading();
    return;
  }
  const restoreViewport =
    preserveViewport && root.querySelector(".shell")
      ? captureDashboardViewport()
      : null;
  root.replaceChildren();
  const shell = el("div", "shell"),
    side = el("aside", "sidebar");
  side.setAttribute("aria-label", t(appLocale.navigation));
  const sideHeader = el("div", "sidebar-header"),
    sideFolders = el("div", "sidebar-folders"),
    folderList = el("div", "folder-list"),
    sideTools = el("div", "sidebar-tools");
  const importButton = btn(
    appLocale.import,
    () => importAccountsDialog(),
    "nav primary sidebar-import",
  );
  importButton.dataset.action = "import-accounts";
  sideHeader.append(importButton);
  for (const [destination, label] of [
    ["accounts", appLocale.allAccounts],
    ["proxies", appLocale.proxies],
  ]) {
    const navigation = btn(
      label,
      () => navigate(destination),
      "nav " +
        (view === destination && (destination !== "accounts" || !group)
          ? "active"
          : ""),
    );
    navigation.dataset.nav = destination;
    navigation.classList.add("nav-overview");
    navigation.setAttribute("aria-label", t(label));
    const labelNode = el("span", "nav-label", label),
      primary = append(el("span", "nav-primary"), labelNode);
    navigation.replaceChildren(primary);
    if (destination === "accounts") {
      navigation.classList.add("accounts-nav");
      navigation.dataset.accountScope = "";
      const count = el("span", "folder-count", String(data.accounts.length));
      count.dataset.accountCount = "true";
      count.setAttribute("aria-hidden", "true");
      primary.append(count);
      sideHeader.append(navigation);
    } else {
      const metrics = el("span", "nav-metrics");
      metrics.setAttribute("aria-hidden", "true");
      for (const [key, label] of [
        ["lists", appLocale.lists],
        ["individual", appLocale.proxies_f1fa83d],
      ]) {
        const item = append(
          el("span", "nav-metric"),
          el("span", "", label),
          el("strong"),
        );
        item.dataset.proxyStat = key;
        metrics.append(item);
      }
      navigation.append(metrics);
      sideTools.append(navigation);
    }
  }
  const passwordManager = btn(
    appLocale.passwordManager,
    () => call("openPasswordManager"),
    "nav",
  );
  passwordManager.dataset.action = "password-manager";
  passwordManager.replaceChildren(
    el("span", "nav-label", appLocale.passwordManager),
  );
  passwordManager.title = t(appLocale.passwordManager);
  passwordManager.prepend(navigationIcon("password"));
  passwordManager.classList.add("nav-with-icon");
  sideTools.append(passwordManager);
  const authenticator = btn(
    "2fa (not steam)",
    () => call("openAuthenticator"),
    "nav",
  );
  authenticator.dataset.action = "authenticator";
  authenticator.prepend(navigationIcon("authenticator"));
  authenticator.classList.add("nav-with-icon");
  sideTools.append(authenticator);
  const lootButton = btn(
    "Loot",
    () => navigate("loot"),
    "nav nav-with-icon " + (view === "loot" ? "active" : ""),
  );
  lootButton.dataset.action = "loot";
  lootButton.dataset.nav = "loot";
  lootButton.prepend(navigationIcon("loot"));
  sideTools.append(lootButton);
  sideFolders.append(folderList);
  const counts = new Map();
  for (const account of data.accounts)
    counts.set(account.groupId, (counts.get(account.groupId) || 0) + 1);
  const visited = new Set();
  function folderButton(folder, depth = 0) {
    const count = counts.get(folder.id) || 0;
    const button = btn(
      "",
      () => navigate("accounts", folder.id),
      "nav folder-nav nav-overview " +
        (view === "accounts" && group === folder.id ? "active" : ""),
    );
    button.dataset.groupId = folder.id;
    button.dataset.accountScope = folder.id;
    button.style.paddingLeft = 12 + Math.min(depth, 3) * 12 + "px";
    button.title =
      folder.name +
      " · " +
      t(appLocale.accountsInFolder).replace("{count}", count);
    button.setAttribute("aria-label", button.title);
    const name = el("span", "folder-name");
    name.textContent = "▱  " + folder.name;
    const quantity = el("span", "folder-count", String(count));
    quantity.dataset.groupCount = folder.id;
    quantity.setAttribute("aria-hidden", "true");
    append(button, append(el("span", "nav-primary"), name, quantity));
    return button;
  }
  function folders(parent, depth) {
    data.groups
      .filter((folder) => (folder.parentId || null) === parent)
      .forEach((folder) => {
        if (visited.has(folder.id)) return;
        visited.add(folder.id);
        folderList.append(folderButton(folder, depth));
        folders(folder.id, depth + 1);
      });
  }
  folders(null, 0);
  data.groups
    .filter((folder) => !visited.has(folder.id))
    .forEach((folder) => folderList.append(folderButton(folder)));
  const newFolder = btn(appLocale.newFolder, () => editGroup(), "nav");
  newFolder.dataset.action = "new-folder";
  folderList.append(newFolder);
  const settingsActive = ["settings", "security", "activity"].includes(view),
    settingsMenu = el("div", "settings-menu"),
    settingsButton = btn(appLocale.settings, () => navigate("settings"), "nav"),
    settingsSubmenu = el("div", "settings-submenu");
  settingsButton.dataset.nav = "settings";
  settingsButton.setAttribute("aria-expanded", String(settingsActive));
  settingsButton.setAttribute("aria-controls", "settings-submenu");
  settingsSubmenu.id = "settings-submenu";
  settingsSubmenu.hidden = !settingsActive;
  for (const [destination, label] of [
    ["settings", appLocale.general],
    ["security", appLocale.security],
    ["activity", appLocale.recentActivity],
  ]) {
    const item = btn(
      label,
      () => navigate(destination),
      "nav " + (view === destination ? "active" : ""),
    );
    item.dataset.nav = destination === "settings" ? "general" : destination;
    settingsSubmenu.append(item);
  }
  append(settingsMenu, settingsButton, settingsSubmenu);
  append(
    side,
    sideHeader,
    sideFolders,
    sideTools,
    append(
      el("div", "sidebar-bottom"),
      settingsMenu,
      data.security.pinEnabled
        ? btn(
            appLocale.lockWithPIN,
            async () => {
              await call("pinLock");
              enterLocked(await call("status"));
            },
            "nav",
          )
        : null,
      btn(
        appLocale.lockVault,
        async () => {
          await call("lock");
          enterLocked(await call("status"));
        },
        "nav",
      ),
      el("div", "secure-note", appLocale.vaultEncrypted),
    ),
  );
  const main = el("main", "main");
  if (view === "loot") shell.classList.add("shell-loot");
  side
    .querySelectorAll(".nav.active")
    .forEach((node) => node.setAttribute("aria-current", "page"));
  shell.append(accountStats(), side, main);
  root.append(shell);
  paintNavigationCounts();
  paintAccountStats();
  if (selected && view === "accounts") accountDetail(main);
  else if (view === "accounts") accounts(main);
  else if (view === "proxies") proxyPage(main);
  else if (view === "security") security(main);
  else if (view === "activity") activityPage(main);
  else if (view === "loot") lootPage(main);
  else settingsPage(main);
  restoreViewport?.();
}
function header(main, title, description, action) {
  const heading = append(
    el("div", "topbar"),
    append(el("div"), el("h1", "", title), el("p", "", description)),
    action,
  );
  main.append(heading);
  return heading;
}
function lootPage(main) {
  main.classList.add("loot-home");
  const create = btn(appLocale.newScheme, () => call("openLoot"), "primary");
  create.dataset.action = "loot-create";
  header(
    main,
    appLocale.lootSchemes,
    appLocale.createSeparateCollectionRoutesAndRunMultipleSchemesAtOnce,
    create,
  );
  const schemes = data.loot?.schemes || [];
  if (!schemes.length) {
    main.append(
      append(
        el("section", "panel loot-empty"),
        el("h2", "", appLocale.noSchemesYet),
        el(
          "p",
          "muted",
          appLocale.addSourcesWarehousesAndSenderRulesInANewWindow,
        ),
      ),
    );
    return;
  }
  const list = el("div", "loot-scheme-list");
  for (const scheme of schemes) {
    const status =
      data.lootStatuses?.find((s) => s.schemeId === scheme.id) || {};
    const card = el("section", "panel loot-scheme-card");
    card.dataset.schemeId = scheme.id;
    const heading = el("div", "loot-scheme-heading");
    heading.append(el("h2", "", scheme.name));
    const state = status.preparing
      ? appLocale.message
      : status.running
        ? appLocale.running
        : scheme.settings.enabled
          ? appLocale.scheduled
          : appLocale.manualStart;
    heading.append(el("span", "badge", state));
    card.append(heading);
    const details = el("div", "loot-scheme-details");
    for (const [label, value] of [
      [appLocale.sources, status.coverage?.sourceIds.length || 0],
      [appLocale.warehouses, scheme.settings.warehouses.length],
      [appLocale.concurrentAccounts, scheme.settings.concurrency],
      [appLocale.intervalHours, scheme.settings.intervalHours],
    ])
      details.append(
        append(
          el("div"),
          el("small", "muted", label),
          el("strong", "", String(value)),
        ),
      );
    card.append(details);
    if (status.job) {
      const job = status.job;
      const progress = el("progress");
      progress.max = Math.max(1, job.totalOffers || 1);
      progress.value = Math.min(progress.max, job.completedOffers || 0);
      progress.setAttribute("aria-label", t(appLocale.message_5fa7165));
      card.append(
        progress,
        el(
          "p",
          "muted loot-scheme-progress",
          t(appLocale.offersSent).replace("{count}", job.completedOffers || 0),
        ),
      );
    }
    const uncovered = status.coverage?.unassignedAccounts || [];
    if (uncovered.length) {
      const warning = el("details", "loot-coverage-warning");
      warning.append(
        el(
          "summary",
          "",
          t(appLocale.withoutAnAllowedWarehouse).replace(
            "{count}",
            uncovered.length,
          ),
        ),
      );
      const names = el("ul");
      for (const account of uncovered)
        names.append(
          el(
            "li",
            "",
            (account.name || account.login || account.steamId) +
              " · " +
              account.steamId,
          ),
        );
      warning.append(names);
      card.append(warning);
    }
    const actions = el("div", "loot-scheme-actions");
    const open = btn(
      appLocale.openScheme,
      () => call("openLoot", { schemeId: scheme.id }),
      "primary",
    );
    open.dataset.action = "loot-open";
    actions.append(open);
    if (status.running || status.preparing) {
      const stop = btn(appLocale.stop, () =>
        mutate("cancelLootScheme", { schemeId: scheme.id }),
      );
      stop.dataset.action = "loot-stop";
      actions.append(stop);
    }
    const remove = btn(
      appLocale.remove,
      () =>
        confirmDelete(appLocale.deleteLootScheme, () =>
          mutate("deleteLootScheme", { schemeId: scheme.id }),
        ),
      "danger",
    );
    remove.dataset.action = "loot-delete";
    remove.disabled =
      !!status.pendingCount || !!status.running || !!status.preparing;
    if (remove.disabled)
      remove.title = t(appLocale.stopTheSchemeAndCheckItsPendingOffersFirst);
    actions.append(remove);
    card.append(actions);
    list.append(card);
  }
  main.append(list);
}
function accounts(main) {
  if (!data.security.totpEnabled && data.settings.hideSecurityNotice !== true) {
    const notice = el("section", "security-notice");
    const dismiss = btn(
      "×",
      async () => {
        await call("settings", { hideSecurityNotice: true });
        await refresh();
      },
      "notice-dismiss",
    );
    dismiss.setAttribute(
      "aria-label",
      t(appLocale.dismissTheAuthenticatorReminder),
    );
    dismiss.title = t(appLocale.dismissTheAuthenticatorReminder);
    append(
      notice,
      append(
        el("div"),
        el("strong", "", appLocale.addASecondLayerOfProtection),
        el(
          "p",
          "",
          appLocale.connectGoogleAuthenticatorToProtectAccessWithAOneTimeCode,
        ),
      ),
      btn(appLocale.setUpAuthenticator, () => enrollTotp(), "primary"),
      dismiss,
    );
    main.append(notice);
  }
  const folder = data.groups.find((g) => g.id === group);
  if (folder)
    main.append(
      append(
        el("div", "account-folder-tools"),
        btn(appLocale.folder, () => editGroup(folder)),
      ),
    );
  const list = filteredAccounts();
  main.append(bulkToolbar());
  const s = input("search", search, appLocale.searchByNameOrSteamID);
  s.setAttribute("aria-label", t(appLocale.searchByNameOrSteamID));
  s.oninput = () => {
    search = s.value;
    accountPage = 0;
    const pos = s.selectionStart;
    render();
    const next = root.querySelector("input[type=search]");
    next.focus();
    next.setSelectionRange(pos, pos);
  };
  append(
    main,
    append(
      el("div", "toolbar"),
      s,
      el("span", "badge", `${list.length}${appLocale.templateText}`),
    ),
  );
  main.append(accountFilterControls());
  if (!list.length) {
    append(
      main,
      append(
        el("section", "empty"),
        el("div", "empty-symbol", "◈"),
        el(
          "h2",
          "",
          search || accountFiltersActive()
            ? appLocale.noResults
            : appLocale.addYourFirstAccount,
        ),
        el(
          "p",
          "",
          search || accountFiltersActive()
            ? appLocale.changeTheSearchOrFilters
            : appLocale.importAMaFileUsingTheSystemDialogSecretsStayInTheEncryptedVault,
        ),
      ),
    );
    return;
  }
  const grid = el("div", "accounts");
  accountPage = Math.min(
    accountPage,
    Math.max(0, Math.ceil(list.length / accountPageSize()) - 1),
  );
  grid.append(accountListHeader());
  list
    .slice(
      accountPage * accountPageSize(),
      (accountPage + 1) * accountPageSize(),
    )
    .forEach((a) => {
      const c = el("article", "card account" + (bulkMode ? " selecting" : ""));
      c.tabIndex = 0;
      c.setAttribute("aria-label", a.name);
      c.dataset.accountId = a.id;
      c.classList.toggle("selected", bulkSelected.has(a.id));
      const pick = checkbox(a.name, bulkSelected.has(a.id));
      pick.node.classList.add("account-select");
      pick.node.querySelector("span").textContent = a.name;
      pick.node.onclick = (event) => event.stopPropagation();
      pick.node.onkeydown = (event) => event.stopPropagation();
      pick.node.onkeyup = (event) => event.stopPropagation();
      pick.input.dataset.accountSelect = a.id;
      pick.input.setAttribute("aria-label", a.name);
      pick.input.onchange = () => {
        if (pick.input.checked) bulkSelected.add(a.id);
        else bulkSelected.delete(a.id);
        c.classList.toggle("selected", pick.input.checked);
        if (!bulkMode) {
          bulkMode = true;
          root.querySelector(".bulk-toolbar")?.replaceWith(bulkToolbar());
        }
        updateBulkSelectionControls();
      };
      c.append(pick.node);
      c.onclick = () => openFilteredAccount(a);
      c.oncontextmenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.SmartAccountMenu?.open(a, event);
      };
      c.onkeydown = (e) => {
        if (
          (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) &&
          e.target === c
        ) {
          e.preventDefault();
          window.SmartAccountMenu?.open(a, e);
          return;
        }
        if (e.key === "Enter" && e.target === c) {
          openFilteredAccount(a);
        }
      };
      const name = el("strong", "account-name", a.name),
        steamId = el("p", "muted", a.steamId || "Steam"),
        session = sessionIndicator(a),
        policy = el(
          "span",
          "account-policy",
          confirmationPolicyActive(a) ? appLocale.auto : appLocale.manual,
        );
      steamId.classList.toggle(
        "community-banned-steamid",
        a.bans?.community === true,
      );
      policy.dataset.policySymbol = confirmationPolicyActive(a) ? "⚡" : "—";
      for (const node of [name, steamId, policy]) node.title = node.textContent;
      append(
        c,
        append(
          el("div", "heading"),
          append(
            el("div", "row"),
            accountAvatar(a),
            append(el("div"), name, steamId),
          ),
          session,
          routeBadge(a, true),
          policy,
        ),
      );
      c.append(accountBanBadges(a));
      grid.append(c);
    });
  main.append(grid);
  if (list.length > accountPageSize())
    main.append(accountPagination(list.length));
  paintCodes();
}
function accountFiltersActive() {
  return Object.values(accountFilters).some((value) => value !== "all");
}
function accountProxyState(account) {
  const state = account.status?.state;
  if (state === "connected") return "healthy";
  if (["failed", "error", "bad"].includes(state)) return "failed";
  if (["checking", "blocked", "direct"].includes(state)) return state;
  return "unchecked";
}
function accountBanState(account, key) {
  const value = account.bans?.[key];
  return value === true ? "banned" : value === false ? "clear" : "unknown";
}
function accountBanBadges(account) {
  const row = el("div", "account-ban-status");
  for (const [key, label] of [
    ["vac", "VAC"],
    ["game", appLocale.game],
    ["community", "Community"],
  ]) {
    const state = accountBanState(account, key);
    const text = t(
      state === "banned"
        ? appLocale.banned
        : state === "clear"
          ? appLocale.noBan
          : appLocale.unknown,
    );
    const badge = el("span", "ban-badge ban-" + state, t(label) + ": " + text);
    badge.dataset.banKind = key;
    if (account.bans?.checkedAt)
      badge.title =
        t(appLocale.checked) +
        ": " +
        new Date(account.bans.checkedAt).toLocaleString();
    row.append(badge);
  }
  return row;
}
function accountMatchesFilters(account) {
  for (const key of ["vac", "game", "community"])
    if (
      accountFilters[key] !== "all" &&
      accountFilters[key] !== accountBanState(account, key)
    )
      return false;
  const active = confirmationPolicyActive(account);
  if (accountFilters.session === "saved" && !account.sessionReady) return false;
  if (accountFilters.session === "missing" && account.sessionReady)
    return false;
  if (
    accountFilters.proxy !== "all" &&
    accountFilters.proxy !== accountProxyState(account)
  )
    return false;
  switch (accountFilters.automation) {
    case "actions-needed":
      return accountNeedsAction(account);
    case "watchIncomingTrades":
      return account.watchIncomingTrades === true;
    case "autoAcceptGifts":
      return account.autoAcceptGifts === true;
    case "manual":
      return !active;
    case "any":
      return active;
    case "market-sales":
      return active && account.autoMarket === true;
    case "market-purchases":
      return active && account.autoMarketPurchases === true;
    case "trades":
      return active && account.autoTrades === true;
    default:
      return true;
  }
}
function accountFilterControls() {
  const filters = el("div", "account-filters");
  for (const [key, label, options] of [
    ...["vac", "game", "community"].map((key) => [
      key,
      key === "vac"
        ? appLocale.vacBan
        : key === "game"
          ? appLocale.gameBans
          : appLocale.communityBan,
      [
        ["all", appLocale.allBanStates],
        ["banned", appLocale.banned],
        ["clear", appLocale.noBan],
        ["unknown", appLocale.unknown],
      ],
    ]),
    [
      "session",
      appLocale.sessionStatus,
      [
        ["all", appLocale.allSessions],
        ["saved", appLocale.sessionSaved],
        ["missing", appLocale.loginNeeded],
      ],
    ],
    [
      "proxy",
      appLocale.proxyStatus,
      [
        ["all", appLocale.allProxyStatuses],
        ["healthy", appLocale.proxyConnected],
        ["unchecked", appLocale.unchecked],
        ["checking", appLocale.checking],
        ["failed", appLocale.proxyUnavailable],
        ["blocked", appLocale.blocked],
        ["direct", appLocale.directConnection],
      ],
    ],
    [
      "automation",
      appLocale.autoConfirmationMode,
      [
        ["all", appLocale.allModes],
        ["manual", appLocale.manual],
        ["any", appLocale.anyAutoConfirmation],
        ["market-sales", appLocale.marketSales],
        ["market-purchases", appLocale.marketPurchases],
        ["trades", appLocale.trades],
        ["watchIncomingTrades", appLocale.watchingIncomingOffers],
        ["autoAcceptGifts", appLocale.acceptingGifts],
        ["actions-needed", appLocale.actionNeeded],
      ],
    ],
  ]) {
    const wrapper = el("div", "account-filter"),
      control = select(options, accountFilters[key]);
    control.dataset.accountFilter = key;
    field(wrapper, label, control);
    control.onchange = () => {
      accountFilters[key] = control.value;
      accountPage = 0;
      render();
      root
        .querySelector(`[data-account-filter="${key}"]`)
        ?.focus({ preventScroll: true });
    };
    filters.append(wrapper);
  }
  if (accountFiltersActive())
    filters.append(
      btn(
        appLocale.resetFilters,
        () => {
          Object.assign(accountFilters, {
            session: "all",
            proxy: "all",
            automation: "all",
            vac: "all",
            game: "all",
            community: "all",
          });
          accountPage = 0;
          render();
        },
        "filter-reset",
      ),
    );
  return filters;
}
function accountListHeader() {
  const row = el("div", "accounts-header"),
    selectAll = checkbox(appLocale.selectAllFilteredAccountsAllPages, false),
    matches = filteredAccounts(),
    count = matches.filter((account) => bulkSelected.has(account.id)).length;
  selectAll.node.classList.add("account-select");
  selectAll.node.title = t(appLocale.selectAllFilteredAccountsAllPages);
  selectAll.input.dataset.selectAllAccounts = "true";
  selectAll.input.checked = matches.length > 0 && count === matches.length;
  selectAll.input.indeterminate = count > 0 && count < matches.length;
  selectAll.input.disabled = matches.length === 0;
  selectAll.input.onchange = () => {
    for (const account of filteredAccounts()) {
      if (selectAll.input.checked) bulkSelected.add(account.id);
      else bulkSelected.delete(account.id);
    }
    bulkMode = true;
    root.querySelector(".bulk-toolbar")?.replaceWith(bulkToolbar());
    updateBulkSelectionControls();
  };
  const columns = el("div", "heading");
  for (const [key, label] of [
    ["identity", appLocale.account],
    ["session", appLocale.session],
    ["proxy", appLocale.proxies_f1fa83d],
    ["policy", ""],
  ]) {
    const heading = el("span", "account-column", label);
    heading.dataset.accountColumn = key;
    if (!label) heading.setAttribute("aria-hidden", "true");
    columns.append(heading);
  }
  return append(row, selectAll.node, columns);
}
function sessionIndicator(account) {
  const node = el("span", "account-session");
  node.dataset.session = account.id;
  setSessionIndicator(node, account);
  return node;
}
function setSessionIndicator(node, account) {
  const description = t(
    account.sessionReady ? appLocale.sessionSaved : appLocale.loginNeeded,
  );
  node.textContent = account.sessionReady ? "✓" : "—";
  node.classList.toggle("is-ready", account.sessionReady === true);
  node.title = description;
  node.setAttribute("aria-label", `${account.name}: ${description}`);
}
function paintCodes() {
  const map = new Map(codes.map((c) => [String(c.id), c]));
  root.querySelectorAll("[data-code]").forEach((n) => {
    const c = map.get(n.dataset.code);
    n.textContent = c?.code || "—————";
  });
  root.querySelectorAll("[data-timer]").forEach((n) => {
    n.value = map.get(n.dataset.timer)?.remainingSeconds || 0;
  });
}

function routePicker(form, ids = []) {
  return orderedPicker(form, appLocale.individualProxies, data.proxies, ids);
}

function editGroup(g) {
  dialog(g ? appLocale.editFolder : appLocale.newFolder_09d9d8e, (f) => {
    const name = field(f, appLocale.title, input("text", g?.name));
    const parent = field(
      f,
      appLocale.parentFolder,
      select(
        [
          ["", appLocale.noParentFolder],
          ...data.groups
            .filter((x) => x.id !== g?.id)
            .map((x) => [x.id, x.name]),
        ],
        g?.parentId,
      ),
    );
    const listRoutes = listPicker(f, g?.proxyListIds);
    const routes = routePicker(f, g?.proxyIds);
    const values = () => ({
      ...(g ? { id: g.id } : {}),
      name: name.value,
      parentId: parent.value || null,
      proxyListIds: listRoutes(),
      proxyIds: routes(),
    });
    footer(f, () => {
      const payload = values();
      if (
        payload.proxyListIds.length ||
        g?.proxyListIds?.length ||
        payload.parentId
      )
        return prepareProxyAllocationReview(
          g ? "updateGroup" : "addGroup",
          payload,
          { message: appLocale.folderSaved },
        );
      return mutate(
        g ? "updateGroup" : "addGroup",
        payload,
        appLocale.folderSaved,
      );
    });
    if (g)
      f.append(
        btn(appLocale.saveAndRedistributeProxies, () =>
          prepareProxyAllocationReview(
            "updateGroup",
            { ...values(), redistribute: true },
            { message: appLocale.folderSaved },
          ),
        ),
      );
    if (g)
      f.append(
        btn(
          appLocale.deleteFolder,
          () =>
            confirmDelete(appLocale.deleteFolder_0595a9b, () =>
              mutate("deleteGroup", { id: g.id }),
            ),
          "danger",
        ),
      );
  });
}
function confirmDelete(title, action) {
  dialog(title, (f) => {
    f.append(el("p", "", appLocale.confirmDeletionThisActionCannotBeUndone));
    footer(f, action, appLocale.remove);
  });
}
function accountDetail(main) {
  const a = data.accounts.find((x) => x.id === selected);
  if (!a) {
    selected = null;
    accounts(main);
    return;
  }
  const confirmationsButton = btn(
    t(appLocale.confirming) + " (" + confirmationCountLabel(a) + ")",
    () => openAccountConfirmations(a),
    "primary",
  );
  confirmationsButton.dataset.action = "account-confirmations";
  confirmationsButton.disabled = a.hasIdentitySecret === false;
  main.append(
    append(
      el("div", "account-profile-toolbar"),
      btn(
        appLocale.allAccounts_1fa9847,
        () => {
          selected = null;
          render();
        },
        "nav",
      ),
      confirmationsButton,
    ),
  );
  main.classList.add("account-detail");
  const profileHeading = header(
    main,
    a.name,
    a.steamId || "Steam",
    append(
      el("div", "actions"),
      btn(appLocale.checkBans, async () => {
        const previous = a.bans?.checkedAt;
        const result = await call("refreshAccountBans", { ids: [a.id] });
        await refresh();
        render();
        if (!result.bans?.checkedAt || result.bans.checkedAt === previous)
          toast(appLocale.noNewBanDataIsAvailableThePreviousStatusIsPreserved);
        else if (
          result.bans.vac == null ||
          result.bans.game == null ||
          result.bans.community == null
        )
          toast(appLocale.checkFinishedSomeBanStatusesRemainUnknown);
      }),
      btn(appLocale.edit, () => editAccount(a)),
      btn(appLocale.exportAccount, () => exportAccountsDialog([a.id])),
      btn(appLocale.openInBrowser, () => openBrowsersDialog([a.id])),
      btn(appLocale.browserProfile, () => browserProfilesDialog([a.id])),
      (data.browsers || []).some((b) => b.accountId === a.id)
        ? btn(appLocale.closeBrowser, async () => {
            await call("closeBrowsers", { ids: [a.id] });
            await refresh();
          })
        : null,
    ),
  );
  profileHeading.classList.add("account-profile-heading");
  profileHeading.firstElementChild.prepend(accountAvatar(a));
  profileHeading.firstElementChild.append(accountBanBadges(a));
  if (a.bans?.community === true)
    profileHeading.firstElementChild
      .querySelector("p")
      ?.classList.add("community-banned-steamid");
  const hasNote = Boolean(a.note?.trim());
  const noteText = el("p", "account-note-text", a.note || "");
  noteText.hidden = !hasNote;
  profileHeading.firstElementChild.append(noteText);
  const noteButton = btn(hasNote ? appLocale.edit : appLocale.addNote, () =>
    editAccountNote(a),
  );
  noteButton.dataset.action = "account-note";
  noteButton.setAttribute(
    "aria-label",
    t(hasNote ? appLocale.editNote : appLocale.addNote),
  );
  const accountActions = savedPasswordActions(a);
  accountActions.classList.add("account-profile-actions");
  append(
    accountActions,
    btn(appLocale.syncTime, async () => {
      await call("syncTime", { id: a.id });
      await refresh();
      toast(appLocale.timeSynchronized);
    }),
    btn(appLocale.logInToSteam, () => loginDialog(a)),
    noteButton,
  );
  const split = el("div", "split"),
    left = el("div", "stack"),
    right = el("div", "stack");
  const code = btn(
    "—————",
    async () => {
      const current = codes.find((c) => String(c.id) === String(a.id));
      if (!current?.code) throw Error(t(appLocale.theCodeIsNotReadyYet));
      await call("copyCode", { id: a.id });
      toast(appLocale.codeCopied);
    },
    "detail-code",
  );
  code.setAttribute("aria-label", t(appLocale.copySteamGuardCode));
  code.dataset.code = a.id;
  code.disabled = a.hasSharedSecret === false;
  const progress = el("progress");
  progress.max = 30;
  progress.dataset.timer = a.id;
  append(
    left,
    append(
      el("section", "card account-guard-card"),
      el("small", "", "STEAM GUARD"),
      code,
      a.hasSharedSecret === false
        ? el(
            "p",
            "warn",
            appLocale.steamGuardSecretsAreMissingCodesAndConfirmationsAreUnavailable,
          )
        : null,
      append(el("div", "countdown"), progress),
      el("p", "", a.deviceName || appLocale.mobileDevice),
      el(
        "p",
        "",
        a.hasPassword
          ? appLocale.steamPasswordSaved
          : appLocale.noSteamPasswordSaved,
      ),
      accountActions,
    ),
  );
  append(
    right,
    accountConfirmationCard(a),
    append(
      el("section", "card account-route-card"),
      el("h2", "", appLocale.networkRoute),
      routeBadge(a),
      el(
        "p",
        "",
        displayProxyAddress(
          a.status?.message ||
            a.routeLabel ||
            appLocale.unassignedNetworkRequestsBlocked,
        ),
      ),
      append(
        el("div", "actions account-route-actions"),
        btn(appLocale.assignProxy, () => accountProxyDialog(a)),
        btn(appLocale.checkProxies, async () => {
          const r = await call("checkProxy", { id: a.id });
          showProxyResult(r);
        }),
      ),
    ),
  );
  split.append(left, right);
  main.append(split);
  paintCodes();
}
async function accountProxyDialog(a) {
  const generation = lockGeneration,
    dialogGeneration = sensitiveDialogGeneration;
  const hadModal = modal.open;
  const options = await call("accountProxyOptions", { id: a.id });
  if (
    locked ||
    generation !== lockGeneration ||
    dialogGeneration !== sensitiveDialogGeneration ||
    (hadModal && !modal.open)
  )
    return;
  dialog(appLocale.assignProxy, (form) => {
    const assigned = el("ol", "account-proxy-route secret");
    for (const item of options.assigned || []) {
      const row = el("li");
      row.textContent =
        displayProxyAddress(item.name) +
        (item.url ? " · " + displayProxyAddress(item.url) : "");
      assigned.append(row);
    }
    if (assigned.children.length)
      form.append(el("h3", "", appLocale.currentRoute), assigned);
    const mode = field(
      form,
      appLocale.proxySource,
      select(
        [
          ["manual", appLocale.enterManually],
          ["list", appLocale.freeProxyFromAList],
        ],
        "manual",
      ),
    );
    const position = field(
      form,
      appLocale.routePosition,
      select(
        [
          ["primary", appLocale.primaryProxy],
          ["backup", appLocale.backupProxy],
        ],
        "primary",
      ),
    );
    form.append(
      el(
        "p",
        "muted",
        appLocale.thisAccountWillUseItsOwnRouteExistingProxiesRemainAsBackupsANew,
      ),
    );
    const manual = el("section"),
      pool = el("section");
    const url = field(
      manual,
      appLocale.proxyURL,
      input(
        data.settings.showProxyCredentials === true ? "text" : "password",
        "",
        appLocale.httpHostPortOrHostPortLoginPassword,
      ),
    );
    url.autocomplete = "off";
    url.dataset.sensitive = "proxy";
    url.spellcheck = false;
    const list = field(
      pool,
      appLocale.proxyList,
      select(
        [
          ["", appLocale.chooseAList],
          ...(options.lists || []).map((item) => [
            item.id,
            displayProxyAddress(item.name) + " (" + item.available + ")",
          ]),
        ],
        "",
      ),
    );
    const proxy = field(pool, appLocale.freeProxy, select([], ""));
    proxy.classList.add("account-proxy-select", "secret");
    const status = el("p", "muted");
    status.setAttribute("role", "status");
    pool.append(status);
    form.append(manual, pool);
    let request = 0,
      loading = false;
    const error = el("p", "error");
    error.setAttribute("role", "alert");
    form.append(error);
    const save = footer(form, async () => {
      error.textContent = "";
      if (loading || (mode.value === "list" && !proxy.value)) return;
      try {
        await call("assignAccountProxy", {
          id: a.id,
          mode: mode.value,
          position: position.value,
          ...(mode.value === "manual"
            ? { url: url.value }
            : { listId: list.value, proxyId: proxy.value }),
        });
        if (locked || generation !== lockGeneration || !form.isConnected)
          return;
        modal.close();
        await refresh();
        toast(appLocale.proxyAssigned);
      } catch (failure) {
        if (!locked && generation === lockGeneration && form.isConnected) {
          error.textContent = t(failure.message);
          if (mode.value === "list") await load();
        }
      }
    });
    const sync = () => {
      manual.hidden = mode.value !== "manual";
      pool.hidden = mode.value !== "list";
      save.disabled =
        loading || (mode.value === "list" ? !proxy.value : !url.value.trim());
    };
    save.syncDisabled = sync;
    const load = async () => {
      const current = ++request;
      loading = true;
      proxy.replaceChildren();
      status.textContent = t(appLocale.loading);
      sync();
      try {
        const result = await call("accountProxyOptions", {
          id: a.id,
          listId: list.value,
        });
        if (
          current !== request ||
          locked ||
          generation !== lockGeneration ||
          !form.isConnected
        )
          return;
        for (const item of result.proxies || []) {
          const option = el("option");
          option.value = item.id;
          option.textContent =
            displayProxyAddress(item.name) +
            (item.url ? " · " + displayProxyAddress(item.url) : "");
          proxy.append(option);
        }
        status.textContent = proxy.options.length
          ? ""
          : t(appLocale.thisListHasNoFreeProxies);
      } catch (failure) {
        if (current === request && !locked && form.isConnected)
          error.textContent = t(failure.message);
      } finally {
        if (current === request) {
          loading = false;
          sync();
        }
      }
    };
    mode.onchange = () => {
      sync();
      if (mode.value === "list") load();
    };
    list.onchange = load;
    proxy.onchange = sync;
    url.oninput = sync;
    sync();
  });
}
function editAccount(a) {
  dialog(appLocale.accountSettings, (f) => {
    f.classList.add("account-settings-form");
    const name = field(f, appLocale.title, input("text", a.name));
    const note = field(f, appLocale.note, el("textarea"));
    note.value = a.note || "";
    note.maxLength = 2000;
    const folder = field(
      f,
      appLocale.folder,
      select(
        [["", appLocale.noFolder], ...data.groups.map((g) => [g.id, g.name])],
        a.groupId,
      ),
    );
    const inherit = checkbox(appLocale.inheritFolderProxies, a.inheritProxy);
    f.append(inherit.node);
    const listRoutes = listPicker(f, a.proxyListIds);
    const routes = routePicker(
      f,
      (a.proxyIds || []).filter(
        (id) =>
          !a.proxyAllocation?.proxyIds.includes(id) &&
          !a.proxyAllocation?.backupProxyIds?.includes(id),
      ),
    );
    const editState = () =>
      JSON.stringify(
        [...f.querySelectorAll("input,select,textarea")].map((node) => [
          node.value,
          node.checked,
        ]),
      );
    const initialEditState = editState();
    const accountActions = append(
      el("div", "actions account-settings-actions"),
      btn(appLocale.assignProxy, () => {
        if (editState() !== initialEditState) {
          toast(appLocale.saveYourAccountSettingsChangesFirst);
          return;
        }
        return accountProxyDialog(a);
      }),
      btn(
        appLocale.deleteAccount,
        () =>
          confirmDelete(appLocale.deleteAccountFromVault, () =>
            mutate("deleteAccount", { id: a.id }),
          ),
        "danger",
      ),
    );
    f.append(accountActions);
    footer(f, () => {
      const payload = {
        id: a.id,
        name: name.value,
        note: note.value,
        groupId: folder.value || null,
        inheritProxy: inherit.input.checked,
        proxyListIds: listRoutes(),
        proxyIds: routes(),
      };
      if (
        payload.proxyListIds.length ||
        a.proxyListIds?.length ||
        (payload.inheritProxy && data.proxyLists.length)
      )
        return prepareProxyAllocationReview("updateAccount", payload);
      return mutate("updateAccount", payload);
    });
  });
}
function loginDialog(a) {
  dialog(appLocale.signingInToSteam, (f) => {
    f.append(el("p", "", a.name));
    const useSaved = a.hasPassword
      ? checkbox(appLocale.useSavedPassword, true)
      : null;
    if (useSaved) f.append(useSaved.node);
    const pass = field(f, appLocale.steamPassword, input("password"));
    pass.autocomplete = "current-password";
    if (useSaved) {
      pass.disabled = true;
      pass.placeholder = t(
        appLocale.theSavedPasswordWillBeUsedLocallyWithoutDisplayingIt,
      );
      useSaved.input.onchange = () => {
        pass.disabled = useSaved.input.checked;
        pass.value = "";
        pass.placeholder = useSaved.input.checked
          ? t(appLocale.theSavedPasswordWillBeUsedLocallyWithoutDisplayingIt)
          : "";
      };
      f.append(savedPasswordActions(a));
    }
    const guard = field(f, appLocale.confirmationCodeIfNeeded, input());
    footer(
      f,
      async () => {
        let result;
        try {
          result = await call("login", {
            id: a.id,
            password: useSaved?.input.checked ? "" : pass.value,
            useSavedPassword: useSaved?.input.checked === true,
            guardCode: guard.value,
          });
        } finally {
          pass.value = "";
        }
        await refresh();
        if (
          result &&
          (result.pending ||
            result.status === "pending" ||
            result.requiresGuard)
        ) {
          if (result.actionRequired || result.requiresGuard)
            guardDialog(a, result);
          else {
            modal.close();
            toast(
              appLocale.waitingForSteamLoginTheSessionWillAppearAutomatically,
            );
          }
        } else {
          modal.close();
          toast(appLocale.loginComplete);
        }
      },
      appLocale.logIn,
    );
  });
}
function guardDialog(a, result) {
  dialog(appLocale.confirmLogin, (f) => {
    f.append(
      el(
        "p",
        "",
        result.message || appLocale.enterTheCodeFromEmailOrSteamGuard,
      ),
    );
    const code = field(f, appLocale.code, input());
    footer(
      f,
      async () => {
        const r = await call("submitGuard", { id: a.id, code: code.value });
        if (r?.pending || r?.status === "pending") {
          if (!r.actionRequired) {
            modal.close();
            toast(r.message || appLocale.waitingForSteamLogin);
          } else
            toast(
              r.message ||
                appLocale.steamIsAwaitingConfirmationCheckTheCodeOrInstructions,
            );
        } else {
          modal.close();
          await refresh();
          toast(appLocale.loginComplete);
        }
      },
      appLocale.confirm,
    );
  });
}
function openAccountConfirmations(a) {
  if (
    locked ||
    selected !== a.id ||
    a.hasIdentitySecret === false ||
    !data.accounts.some((account) => account.id === a.id)
  )
    return;
  let startLoading;
  dialog(appLocale.confirming, (form) => {
    const section = el("section", "account-confirmations"),
      generation = lockGeneration,
      dialogGeneration = sensitiveDialogGeneration;
    form.append(el("p", "muted confirmation-owner", a.name), section);
    const active = () =>
      !locked &&
      generation === lockGeneration &&
      dialogGeneration === sensitiveDialogGeneration &&
      modal.open &&
      section.isConnected &&
      selected === a.id;
    const load = async () => {
      if (!active()) return;
      section.setAttribute("aria-busy", "true");
      section.replaceChildren(el("p", "muted", appLocale.loading));
      try {
        await loadConfirmations(a, section);
      } catch (error) {
        if (!active()) return;
        const message = el("p", "error", error.message);
        message.setAttribute("role", "alert");
        section.replaceChildren(message, btn(appLocale.refresh, load));
      } finally {
        if (active()) section.removeAttribute("aria-busy");
      }
    };
    startLoading = load;
  });
  return startLoading?.();
}
async function loadConfirmations(a, section) {
  const generation = lockGeneration;
  const dialogGeneration = sensitiveDialogGeneration;
  const inDialog = modal.contains(section);
  const request = (confirmationRequests.get(section) || 0) + 1;
  confirmationRequests.set(section, request);
  const active = () =>
    !locked &&
    generation === lockGeneration &&
    (!inDialog || dialogGeneration === sensitiveDialogGeneration) &&
    selected === a.id &&
    data.accounts.some((account) => account.id === a.id) &&
    section.isConnected &&
    confirmationRequests.get(section) === request;
  if (!active()) return;
  const response = await call("confirmations", { id: a.id });
  if (!active()) return;
  const list = Array.isArray(response)
    ? response
    : response?.confirmations || [];
  section.replaceChildren(
    append(
      el("div", "heading"),
      inDialog ? null : el("h2", "", appLocale.confirming),
      btn(appLocale.refresh, () => loadConfirmations(a, section)),
    ),
  );
  if (!list.length)
    section.append(el("p", "", appLocale.noPendingConfirmations));
  list.forEach((c) => {
    const row = el("div", "table-row");
    row.classList.add("confirmation-row");
    row.append(
      append(
        el("div", "confirmation-owner"),
        accountAvatar(a),
        el("span", "", a.name),
      ),
    );
    row.append(renderConfirmationStackPreview(c));
    if ([2, 3, 12].includes(Number(c.type)))
      row.append(
        btn(appLocale.viewActionInBrowser, () =>
          openBrowserAction(
            a,
            Number(c.type) === 2 ? "outgoing" : "market",
            c.offerId ||
              c.tradeOfferId ||
              (Number(c.type) === 2 ? c.creatorId : undefined),
          ),
        ),
      );
    if (c.held || ["dispatching", "acknowledged"].includes(c.decisionState)) {
      append(
        row,
        append(
          el("div"),
          el("strong", "", c.title || c.headline || appLocale.steamRequest),
          el(
            "p",
            "",
            appLocale.thePreviousActionWasSentAutomaticRetriesAreBlockedCheckTheResultInSteam,
          ),
          c.decisionState === "acknowledged"
            ? el(
                "p",
                "",
                appLocale.steamAcknowledgedTheRequestTradeCompletionIsUnverified,
              )
            : el("span", "badge warn", appLocale.resultNeedsVerification),
        ),
      );
      row.append(createConfirmationDetails(a, c, active));
      section.append(row);
      return;
    }
    append(
      row,
      append(
        el("div"),
        el(
          "strong",
          "",
          c.title || c.headline || c.typeName || appLocale.steamRequest,
        ),
        el(
          "span",
          "badge",
          {
            2: appLocale.message_9f287fe,
            3: appLocale.message_acde1a1,
            6: appLocale.accountRecovery,
            9: appLocale.apiKeyCreation,
            12: appLocale.marketPurchase,
          }[c.type] ||
            t(appLocale.otherSteamConfirmationType).replace("{type}", c.type),
        ),
        ![2, 3, 12].includes(c.type)
          ? el("span", "badge warn", appLocale.manualConfirmationOnly)
          : null,
        el(
          "p",
          "",
          Array.isArray(c.summary)
            ? c.summary.join(" · ")
            : c.summary || c.description || String(c.id),
        ),
      ),
      append(
        el("div", "actions"),
        btn(
          appLocale.reject,
          async () => {
            if (!active()) return;
            await call("respond", {
              id: a.id,
              confirmationId: c.id,
              accept: false,
            });
            if (active()) await loadConfirmations(a, section);
          },
          "danger",
        ),
        btn(
          appLocale.confirm,
          async () => {
            if (!active()) return;
            await call("respond", {
              id: a.id,
              confirmationId: c.id,
              accept: true,
            });
            if (active()) await loadConfirmations(a, section);
          },
          "primary",
        ),
      ),
    );
    row.append(createConfirmationDetails(a, c, active));
    section.append(row);
  });
}
function showResult(title, value) {
  dialog(title, (f) => {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const pre = el("pre", "secret", text);
    pre.style.whiteSpace = "pre-wrap";
    append(
      f,
      pre,
      btn(appLocale.done, () => modal.close(), "primary"),
    );
  });
}
function proxies(main) {
  header(
    main,
    appLocale.proxies_f1fa83d,
    appLocale.separateAccountAndFolderRoutesBackupsFollowTheSelectedOrder,
    btn(appLocale.addProxy, () => editProxy(), "primary"),
  );
  append(
    main,
    el(
      "p",
      "",
      appLocale.withoutAssignedProxiesNetworkOperationsAreBlockedDirectModeIsDisabledByDefault,
    ),
  );
  const card = el("section", "card");
  if (!data.proxies.length)
    append(
      card,
      el("h2", "", appLocale.noRoutesYet),
      el(
        "p",
        "",
        appLocale.addHTTPHTTPSOrSOCKS5HProxiesThenAssignThemToAnAccountOrFolder,
      ),
    );
  data.proxies.forEach((p) =>
    append(
      card,
      append(
        el("div", "table-row"),
        append(
          el("div"),
          el("strong", "", displayProxyAddress(p.name)),
          el("p", "", displayProxyAddress(p.endpoint)),
        ),
        append(
          el("div", "actions"),
          btn(appLocale.edit, () => editProxy(p)),
          btn(
            appLocale.remove,
            () =>
              confirmDelete(appLocale.deleteProxy, () =>
                mutate("deleteProxy", { id: p.id }),
              ),
            "danger",
          ),
        ),
      ),
    ),
  );
  main.append(card);
}
function editProxy(p) {
  dialog(p ? appLocale.editProxy : appLocale.newProxy, (f) => {
    const generation = lockGeneration,
      dialogGeneration = sensitiveDialogGeneration;
    const active = () =>
      !locked &&
      generation === lockGeneration &&
      dialogGeneration === sensitiveDialogGeneration &&
      modal.open &&
      f.isConnected;
    const name = field(
      f,
      appLocale.title,
      input(
        displayProxyAddress(p?.name) !== String(p?.name || "")
          ? "password"
          : "text",
        p?.name,
        appLocale.forExampleWarsaw01,
      ),
    );
    const url = field(
      f,
      appLocale.proxyURL,
      input(
        p || data.settings.showProxyCredentials === true ? "text" : "password",
        "",
        "socks5h://user:password@host:port",
      ),
    );
    url.dataset.sensitive = "true";
    url.dataset.proxyUrl = "true";
    url.autocomplete = "off";
    url.spellcheck = false;
    url.disabled = !!p;
    f.append(
      el(
        "p",
        "",
        appLocale.supportsHttpHttpsAndSocks5hCredentialsAreStoredInTheEncryptedVault,
      ),
    );
    const save = footer(f, () => {
      if (url.disabled || !active()) return;
      return mutate(
        p ? "updateProxy" : "addProxy",
        { ...(p ? { id: p.id } : {}), name: name.value, url: url.value },
        appLocale.proxySaved,
      );
    });
    save.disabled = !!p;
    if (p) {
      const error = el("p", "error");
      f.append(error);
      void call("proxyDetails", { id: p.id })
        .then((details) => {
          if (!active()) return;
          const detail = details.find((proxy) => proxy.id === p.id);
          if (!detail || typeof detail.url !== "string")
            throw Error(t(appLocale.proxyNotFound));
          url.value = detail.url;
          url.disabled = false;
          save.disabled = false;
        })
        .catch((cause) => {
          if (active()) error.textContent = cause.message;
        });
    }
  });
}
function security(main) {
  header(main, appLocale.vaultSecurity, appLocale.manageAccessAndBackups);
  const grid = el("div", "security-grid");
  append(
    grid,
    append(
      el("section", "card"),
      el(
        "span",
        "badge",
        data.security.passwordEnabled ? appLocale.enabled : appLocale.disabled,
      ),
      el("div", "spacer"),
      el("h2", "", appLocale.accessPassword),
      el("p", "", appLocale.yourPasswordProtectsAccessToTheLocalVault),
      btn(appLocale.changePassword, () => passwordDialog()),
      data.security.passwordEnabled
        ? btn(appLocale.disablePassword, () => passwordDialog(true), "danger")
        : null,
    ),
    append(
      el("section", "card"),
      el(
        "span",
        "badge",
        data.security.totpEnabled ? appLocale.enabled : appLocale.notConfigured,
      ),
      el("div", "spacer"),
      el("h2", "", appLocale.twoStepVerification),
      el(
        "p",
        "",
        appLocale.aCodeFromGoogleAuthenticatorOrACompatibleAppWhenUnlocking,
      ),
      btn(
        data.security.totpEnabled ? appLocale.disableTOTP : appLocale.setUpTOTP,
        () => (data.security.totpEnabled ? disableTotp() : enrollTotp()),
        data.security.totpEnabled ? "" : "primary",
      ),
    ),
    append(
      el("section", "card"),
      el("h2", "", appLocale.encryptedBackup),
      el(
        "p",
        "",
        appLocale.saveAVaultCopyToAChosenLocationYourAccessFactorsAreNeededTo,
      ),
      btn(appLocale.saveBackup, async () => {
        await call("backup");
        toast(appLocale.backupOperationComplete);
      }),
    ),
  );
  grid.append(securitySettingsCard(false));
  main.append(grid);
}
function passwordDialog(disable = false) {
  dialog(
    disable
      ? appLocale.disablePassword_b7ad7b5
      : appLocale.changePassword_34f113e,
    (f) => {
      const current = data.security.passwordEnabled
        ? field(f, appLocale.currentPassword, input("password"))
        : null;
      const otp = data.security.totpEnabled
        ? field(f, appLocale.authenticatorCode, input())
        : null;
      const next = disable
          ? null
          : field(f, appLocale.newPassword, input("password")),
        repeat = disable
          ? null
          : field(f, appLocale.confirmNewPassword, input("password"));
      if (current) current.autocomplete = "current-password";
      if (next) {
        next.autocomplete = "new-password";
        next.minLength = 15;
        repeat.autocomplete = "new-password";
        repeat.minLength = 15;
        next.placeholder = t(appLocale.atLeast15Characters);
      }
      const error = el("p", "error");
      f.append(error);
      let feedback;
      const submit = footer(f, async () => {
        if (!feedback.begin()) return;
        error.textContent = "";
        try {
          if (next && [...next.value].length < 15)
            throw Error(appLocale.newPasswordMustContainAtLeast15Characters);
          if (next && next.value !== repeat.value)
            throw Error(appLocale.newPasswordsDoNotMatch);
          await mutate(
            "changePassword",
            {
              currentPassword: current?.value || "",
              code: otp?.value || "",
              newPassword: next?.value || "",
            },
            appLocale.passwordSettingsUpdated,
          );
        } catch (e) {
          error.textContent = t(e.message);
          await feedback.refresh();
        } finally {
          feedback.finish();
          for (const n of [current, otp, next, repeat]) if (n) n.value = "";
        }
      });
      feedback = authFeedback(f, submit, data.security);
    },
  );
}

async function enrollTotp() {
  await enrollTotp.cancelActive?.();
  if (locked) return;
  const generation = lockGeneration,
    origin = root.firstElementChild;
  let host,
    feedback,
    passwordInput,
    cancelled = false;
  const active = () =>
    !cancelled &&
    !locked &&
    generation === lockGeneration &&
    root.firstElementChild === origin &&
    modal.open &&
    host?.isConnected;
  const observer = new MutationObserver(() => {
    if (!active()) void cancel();
  });
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    observer.disconnect();
    feedback?.dispose();
    if (passwordInput) passwordInput.value = "";
    if (enrollTotp.cancelActive === cancel) enrollTotp.cancelActive = null;
    if (host?.isConnected && modal.open) modal.close();
    if (!locked && generation === lockGeneration)
      return call("cancelTotpEnrollment").catch(() => {});
  };
  enrollTotp.cancelActive = cancel;
  const showEnrollment = (enrollment) => {
    if (!active()) return;
    feedback?.dispose();
    dialog(appLocale.authenticatorSetup, (f) => {
      host = f;
      f.append(
        el(
          "p",
          "",
          appLocale.scanTheQRCodeInGoogleAuthenticatorOrEnterTheKeyManuallyThenEnter,
        ),
      );
      const qr = enrollment.qr || enrollment.qrDataUrl || enrollment.qrDataUri;
      if (qr?.startsWith("data:image/")) {
        const image = el("img", "qr");
        image.src = qr;
        image.alt = t(appLocale.authenticatorSetupQR);
        f.append(image);
      }
      f.append(el("div", "secret", enrollment.secret));
      const code = field(
        f,
        appLocale.authenticatorCode,
        input("text", "", "000000"),
      );
      code.dataset.sensitive = "true";
      code.inputMode = "numeric";
      code.autocomplete = "one-time-code";
      authMutationFooter(
        f,
        "enableTotp",
        () => ({ code: code.value }),
        appLocale.twoStepVerificationEnabled,
        appLocale.activate,
      );
    });
  };
  dialog(appLocale.authenticatorSetup, (f) => {
    host = f;
    const protectedVault = data.security.passwordEnabled;
    f.append(
      el(
        "p",
        "",
        protectedVault
          ? appLocale.confirmYourCurrentVaultPasswordBeforeViewingTheAuthenticatorQRAndSecretKey
          : appLocale.theVaultPasswordIsDisabledAuthenticatorSetupUsesTheCurrentUnlockedSessionOnThis,
      ),
    );
    passwordInput = protectedVault
      ? field(f, appLocale.currentPassword, input("password"))
      : null;
    if (passwordInput) passwordInput.autocomplete = "current-password";
    const error = el("p", "error");
    error.setAttribute("role", "alert");
    f.append(error);
    const begin = async () => {
      if (!active() || !feedback.begin()) return;
      error.textContent = "";
      const password = passwordInput?.value || "";
      if (passwordInput) passwordInput.value = "";
      try {
        const enrollment = await call("beginTotp", { password });
        if (active()) showEnrollment(enrollment);
      } catch (failure) {
        if (active()) {
          error.textContent = t(failure.message);
          await feedback.refresh();
        }
      } finally {
        if (passwordInput) passwordInput.value = "";
        feedback.finish();
      }
    };
    const submit = footer(f, begin, appLocale.continue);
    feedback = authFeedback(f, submit, data.security);
  });
  afterDialogCloses(() => {
    void cancel();
  });
  observer.observe(root, { childList: true });
  observer.observe(content, { childList: true, subtree: true });
}
function disableTotp() {
  dialog(appLocale.disableAuthenticator, (f) => {
    const pass = field(f, appLocale.vaultPassword, input("password"));
    const code = field(f, appLocale.currentAuthenticatorCode, input());
    authMutationFooter(
      f,
      "disableTotp",
      () => ({ password: pass.value, code: code.value }),
      appLocale.twoStepVerificationDisabled,
      appLocale.disable,
    );
  });
}
function settings(main) {
  header(main, appLocale.settings_2aac460, appLocale.message_6e800d7);
  const card = el("section", "card");
  const lock = field(
    card,
    appLocale.autoLockMinutes,
    input("number", data.settings.autoLockMinutes ?? 10),
  );
  lock.min = 0;
  const poll = field(
    card,
    appLocale.autoConfirmationIntervalSeconds,
    input("number", data.settings.pollSeconds ?? 60),
  );
  poll.min = 15;
  append(
    card,
    el("div", "spacer"),
    btn(
      appLocale.saveSettings,
      async () => {
        await call("settings", {
          autoLockMinutes: Number(lock.value),
          pollSeconds: Number(poll.value),
        });
        await refresh();
        toast(appLocale.settingsSaved);
      },
      "primary",
    ),
  );
  main.append(card);
  const log = el("section", "card");
  log.style.marginTop = "20px";
  log.append(el("h2", "", appLocale.recentActivity_189c85b));
  const events = (data.audit || []).slice(-20).reverse();
  if (!events.length) log.append(el("p", "", appLocale.noEventsYet));
  events.forEach((e) =>
    log.append(
      append(
        el("div", "table-row"),
        el("span", "", e.message || e.action || e.type || appLocale.event),
        el("small", "", e.time || e.timestamp || ""),
      ),
    ),
  );
  main.append(log);
}
modal.addEventListener("close", () => {
  if (modal.open) return; // A queued close event must not erase a newly opened dialog.
  clearModalInputs();
  content.replaceChildren();
});
setInterval(async () => {
  if (locked) return;
  const generation = lockGeneration;
  try {
    const accountId = visibleCodeAccountId();
    if (!accountId) {
      codes = [];
      return;
    }
    const next = await call("codes", { ids: [accountId] });
    if (
      !locked &&
      generation === lockGeneration &&
      visibleCodeAccountId() === accountId
    ) {
      codes = next;
      paintCodes();
    }
  } catch {
    changed().catch(() => {});
  }
}, 1000);
setInterval(() => {
  if (!locked && !modal.open) refresh(true);
}, 10000);
if (window.smartSda.onChanged)
  window.smartSda.onChanged((change) => {
    if (change?.locked === true) enterLocked({ exists: true, ...change });
    changed().catch((e) => {
      if (!locked) toast(e.message);
    });
  });
window.smartSda.onAccountNavigation?.(({ accountId }) => {
  void (async () => {
    if (locked) return;
    const generation = lockGeneration;
    await refresh();
    if (locked || generation !== lockGeneration) return;
    const account = data.accounts.find((entry) => entry.id === accountId);
    if (!account) return;
    modal.close();
    window.SmartAccountMenu?.close({ restoreFocus: false });
    view = "accounts";
    group = account.groupId || null;
    selected = account.id;
    accountPage = 0;
    render();
  })().catch((error) => toast(error.message));
});
window.smartSda.onTrayAction?.(() => {
  void (async () => {
    if (locked) return;
    const generation = lockGeneration;
    const action = await call("takeTrayReview");
    if (!action || locked || generation !== lockGeneration) return;
    await refresh();
    if (!locked && generation === lockGeneration)
      await bulkConfirmationReview(action.kind, action.ids);
  })().catch((error) => toast(error.message));
});
boot();

function routeBadge(a, compact = false) {
  const n = el("span", "badge");
  n.dataset.route = a.id;
  if (compact) n.dataset.routeCompact = "true";
  setRouteBadge(n, a);
  return n;
}
function setRouteBadge(n, a) {
  const state = a.status?.state;
  const direct = state === "direct";
  const healthy = state === "connected" || direct;
  const compact = n.dataset.routeCompact === "true";
  const failed = ["failed", "error", "bad"].includes(state);
  n.dataset.routeState = failed
    ? "failed"
    : ["connected", "direct", "blocked", "checking"].includes(state)
      ? state
      : "unchecked";
  n.dataset.routeTone =
    state === "connected"
      ? "healthy"
      : failed || state === "blocked"
        ? "danger"
        : "warning";
  n.className = compact
    ? "route-indicator"
    : "badge " + (healthy ? "healthy" : "warn");
  const description = t(
    direct
      ? appLocale.directConnection_8593d25
      : healthy
        ? appLocale.proxyConnected_8390885
        : state === "blocked"
          ? appLocale.blocked_8ee55d7
          : ["failed", "error", "bad"].includes(state)
            ? appLocale.proxyUnavailable_3d6fe2f
            : state === "checking"
              ? appLocale.checkingProxy
              : appLocale.unchecked_839e0f8,
  );
  n.textContent = compact ? "●" : description;
  n.title =
    description +
    " · " +
    displayProxyAddress(
      t(
        a.status?.message ||
          a.routeLabel ||
          appLocale.checkTheAssignedProxiesFirst,
      ),
    );
  n.setAttribute("aria-label", `${a.name}: ${description}`);
  if (a.status?.checkedAt) n.title += ` · ${a.status.checkedAt}`;
}

function paintStatuses() {
  root
    .querySelectorAll("[data-steam-admins]")
    .forEach((node) => node.syncSteamAdmins?.());
  root.querySelectorAll("[data-session]").forEach((node) => {
    const account = data.accounts.find(
      (account) => account.id === node.dataset.session,
    );
    if (account) setSessionIndicator(node, account);
  });
  paintNavigationCounts();
  paintAccountStats();
  root.querySelectorAll("[data-route]").forEach((n) => {
    const a = data.accounts.find((a) => a.id === n.dataset.route);
    if (a) setRouteBadge(n, a);
  });
  root.querySelectorAll("[data-automation-error]").forEach((n) => {
    const a = data.accounts.find((a) => a.id === n.dataset.automationError);
    n.textContent = t(a?.status?.automationError || "");
    n.hidden = !n.textContent;
  });
}
function showProxyResult(result) {
  dialog(appLocale.routeCheck, (f) => {
    f.append(
      el(
        "p",
        "",
        result.direct
          ? appLocale.directConnectionIsAllowedForAccountsWithoutARoute
          : result.blocked
            ? appLocale.networkOperationsBlockedNoProxyIsAvailable
            : appLocale.routeReadySteamWillUseTheAvailableProxy,
      ),
    );
    if (result.untestedCount)
      f.append(
        el(
          "p",
          "",
          t(appLocale.uncheckedProxiesCheckAgainToContinue).replace(
            "{count}",
            result.untestedCount,
          ),
        ),
      );
    const items = Array.isArray(result.results) ? result.results : [];
    if (!items.length)
      f.append(
        el(
          "p",
          "",
          appLocale.assignPrimaryAndBackupProxiesInAccountOrFolderSettings,
        ),
      );
    items.forEach((r, i) => {
      const row = el("div", "table-row");
      append(
        row,
        append(
          el("div"),
          el(
            "strong",
            "",
            r.skipped
              ? t(appLocale.deferredProxies)
              : r.direct
                ? t(appLocale.directConnectionNoProxy)
                : (i === 0
                    ? t(appLocale.primary)
                    : t(appLocale.message_6af24b8 + i)) +
                  " · " +
                  displayProxyAddress(r.name || t(appLocale.proxies_f1fa83d)),
          ),
          el(
            "p",
            "",
            r.ok
              ? "IP: " +
                  (r.ip || "—") +
                  " · " +
                  (r.latencyMs ?? "—") +
                  (window.SmartI18n.preferences.language === "en"
                    ? " ms"
                    : appLocale.message_5160aea)
              : displayProxyAddress(
                  r.error || r.message || appLocale.connectionFailed,
                ),
          ),
        ),
        el(
          "span",
          "badge " + (r.ok ? "healthy" : "warn"),
          r.skipped
            ? appLocale.deferred
            : r.ok && (r.direct || r.proxyId === result.activeProxyId)
              ? appLocale.active
              : r.ok
                ? appLocale.available
                : appLocale.unavailable,
        ),
      );
      f.append(row);
    });
    append(
      f,
      el("div", "spacer"),
      btn(appLocale.done, () => modal.close(), "primary"),
    );
  });
}

let lastTouch = 0;
function touch(event) {
  if (!event.isTrusted || locked || Date.now() - lastTouch < 15000) return;
  lastTouch = Date.now();
  call("touch").catch(() => {});
}
document.addEventListener("pointerdown", touch, { passive: true });
document.addEventListener("keydown", touch, { passive: true });

function automationError(a) {
  const n = el("p", "error", a.status?.automationError || "");
  n.dataset.automationError = a.id;
  n.hidden = !n.textContent;
  return n;
}

function clearModalInputs() {
  sensitiveDialogGeneration++;
  sensitiveAccountId = null;
  content
    .querySelectorAll("input[type=password],textarea,[data-sensitive]")
    .forEach((n) => {
      n.value = "";
      if (n.dataset.sensitive) n.type = "password";
    });
  content.querySelectorAll(".secret").forEach((n) => (n.textContent = ""));
}

function navigationIcon(name) {
  const paths = {
    password: [
      "M11 8 2 17v4h4v-3h3v-3l4-4",
      "M22 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
      "M17 7h.01",
    ],
    authenticator: [
      "M12 3 21 6v6c0 5-9 10-9 10S3 17 3 12V6Z",
      "M16 11a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
      "M12 8.5V11l1.5 1",
    ],
    loot: ["M3 8h18v13H3Z", "M2 4h20v4H2Z", "M12 4v17", "M8 12h8"],
    sessions: ["M20 12a8 8 0 1 1-4-6.93", "m8 11 4 4 9-11"],
    automation: [
      "M20 7v5h-5",
      "M4 17v-5h5",
      "M6 6a8 8 0 0 1 13 3l1 3",
      "M18 18a8 8 0 0 1-13-3l-1-3",
    ],
  };
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "nav-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.7");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  for (const shape of paths[name]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", shape);
    icon.append(path);
  }
  return icon;
}
function confirmationCountLabel(account) {
  return Number.isInteger(account.confirmationCount) &&
    account.confirmationCount >= 0
    ? String(account.confirmationCount)
    : "?";
}
function accountNeedsAction(account) {
  return (
    account.confirmationCount > 0 ||
    (account.watchIncomingTrades === true &&
      account.incomingTradeOffersCount > 0)
  );
}
function applyStatFilter(key) {
  view = "accounts";
  selected = null;
  group = null;
  search = "";
  accountPage = 0;
  Object.keys(accountFilters).forEach((filter) => {
    accountFilters[filter] = "all";
  });
  if (key === "sessions") accountFilters.session = "saved";
  else
    accountFilters.automation =
      {
        automation: "any",
        autoMarket: "market-sales",
        autoMarketPurchases: "market-purchases",
        autoTrades: "trades",
      }[key] || key;
  render();
}
function openFilteredAccount(account) {
  selected = account.id;
  if (accountFilters.automation === "actions-needed") {
    if (account.confirmationCount > 0) return openAccountConfirmations(account);
    return openBrowserAction(account, "incoming");
  }
  render();
}
function accountStats() {
  const header = el("header", "dashboard-header"),
    stats = el("div", "stats");
  const scope = el("div", "stats-scope");
  scope.dataset.statsScope = "true";
  for (const [key, label] of [
    ["sessions", appLocale.savedSessions],
    ["automation", appLocale.automaticConfirmations],
    ["autoMarket", appLocale.autoMarketSales],
    ["autoMarketPurchases", appLocale.autoMarketPurchases],
    ["autoTrades", appLocale.autoTrades],
    ["watchIncomingTrades", appLocale.watchingIncomingOffers],
    ["autoAcceptGifts", appLocale.acceptingGifts],
    ["actions-needed", appLocale.actionNeeded],
  ]) {
    const card = append(
      btn("", () => applyStatFilter(key), "stat"),
      el("small", "", label),
      el("strong", "", "0"),
    );
    card.dataset.stat = key;
    stats.append(card);
  }
  return append(header, scope, stats);
}
function paintAccountStats() {
  const folder =
      view === "accounts" && group
        ? data.groups.find((item) => item.id === group)
        : null,
    accounts =
      view === "accounts" && group
        ? data.accounts.filter((account) => account.groupId === group)
        : data.accounts,
    counts = {
      sessions: 0,
      automation: 0,
      autoMarket: 0,
      autoMarketPurchases: 0,
      autoTrades: 0,
      watchIncomingTrades: 0,
      autoAcceptGifts: 0,
      "actions-needed": 0,
    };
  for (const account of accounts) {
    if (account.sessionReady) counts.sessions++;
    if (account.watchIncomingTrades) counts.watchIncomingTrades++;
    if (account.autoAcceptGifts) counts.autoAcceptGifts++;
    if (accountNeedsAction(account)) counts["actions-needed"]++;
    if (!confirmationPolicyActive(account)) continue;
    counts.automation++;
    for (const key of ["autoMarket", "autoMarketPurchases", "autoTrades"])
      if (account[key]) counts[key]++;
  }
  root.querySelectorAll("[data-stats-scope]").forEach((node) => {
    node.textContent = folder?.name || t(appLocale.allAccounts_f69787c);
  });
  root.querySelectorAll(".dashboard-header [data-stat]").forEach((node) => {
    node.querySelector("strong").textContent = String(
      counts[node.dataset.stat] ?? 0,
    );
  });
}
function paintNavigationCounts() {
  const empty = () => ({ accounts: 0, sessions: 0, automation: 0 }),
    all = empty(),
    groups = new Map();
  for (const account of data.accounts) {
    if (!groups.has(account.groupId)) groups.set(account.groupId, empty());
    for (const counts of [all, groups.get(account.groupId)]) {
      counts.accounts++;
      if (account.sessionReady) counts.sessions++;
      if (confirmationPolicyActive(account)) counts.automation++;
    }
  }
  root.querySelectorAll("[data-account-scope]").forEach((navigation) => {
    const id = navigation.dataset.accountScope,
      counts = id ? groups.get(id) || empty() : all,
      quantity = navigation.querySelector(".folder-count");
    quantity.textContent = String(counts.accounts);
    if (id) {
      const folder = data.groups.find((folder) => folder.id === id);
      if (folder) {
        navigation.title =
          folder.name +
          " · " +
          t(appLocale.accountsInFolder).replace("{count}", counts.accounts);
        navigation.setAttribute("aria-label", navigation.title);
      }
    }
  });
  const proxyNavigation = root.querySelector('[data-nav="proxies"]');
  if (proxyNavigation) {
    const descriptions = [];
    for (const [key, label, count] of [
      ["lists", appLocale.proxyLists, data.proxyLists.length],
      ["individual", appLocale.individualProxies, data.proxies.length],
    ]) {
      const metric = proxyNavigation.querySelector(
          `[data-proxy-stat="${key}"]`,
        ),
        description = t(label) + ": " + count;
      metric.querySelector("strong").textContent = String(count);
      metric.title = description;
      descriptions.push(description);
    }
    proxyNavigation.setAttribute("aria-description", descriptions.join(". "));
  }
}

function confirmationPolicyActive(account) {
  const automatic = Boolean(
    account.autoMarket || account.autoMarketPurchases || account.autoTrades,
  );
  return (account.checkConfirmations ?? automatic) && automatic;
}
